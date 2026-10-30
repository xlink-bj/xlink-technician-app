import { describe, expect, it, vi } from 'vitest'
import type { ActionDescriptor } from '@runtimes/action'
import type { DynamicFormRead, MediaUploadQueuePort } from '@shared/ports'
import {
  asOpaqueId, createOperationError, type MediaUploadTask,
  type OperationSnapshot, type UploadedMediaRef,
} from '@shared/types'
import {
  restoreActionMediaQueue, resumableActionMediaTasks, retryActionMediaQueue,
} from '@features/work-orders/action-workspace-media-queue'

const succeeded = <T>(data: T): OperationSnapshot<T> => ({ state: 'succeeded', data })
const userId = asOpaqueId<'UserId'>('c3c-user')
const workOrderId = asOpaqueId<'WorkOrderId'>('c3c-order')
const workflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('c3c-node')
const definitionId = asOpaqueId<'FormDefinitionId'>('c3c-form')
const form: DynamicFormRead = {
  purpose: 'survey', definitionId,
  fields: [{ fieldId: 'photos', valueKey: 'images1', label: '现场照片', type: 'image', readOnly: false, required: false }],
  values: {},
}
const descriptor = {
  userId, workOrderId, workflowNodeId, contentIdentity: definitionId,
} as ActionDescriptor
const uploaded: UploadedMediaRef = {
  url: 'https://upload.invalid/c3c.jpg', source: 'library', uploadState: 'uploaded',
}
function mediaTask(state: MediaUploadTask['state'], id: string, extras: Partial<MediaUploadTask> = {}): MediaUploadTask {
  return {
    schemaVersion: 1, taskId: asOpaqueId<'MediaUploadTaskId'>(id),
    scope: {
      userId, workOrderId, workflowNodeId, formDefinitionId: definitionId,
      fieldId: 'photos', valueKey: 'images1', localAssetId: asOpaqueId<'LocalMediaRef'>(id),
    },
    state, attempts: 1, createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z',
    ...extras,
  }
}
function queue(stored: readonly MediaUploadTask[] = []) {
  return {
    listForAction: vi.fn(async () => succeeded(stored)),
    process: vi.fn(async (id: MediaUploadTask['taskId']) => succeeded(mediaTask('uploaded', String(id), { uploadedRef: uploaded }))),
    retry: vi.fn(async (id: MediaUploadTask['taskId']) => succeeded(mediaTask('uploaded', String(id), { uploadedRef: uploaded }))),
  } as unknown as MediaUploadQueuePort
}

describe('C3-C media queue recovery and user-directed retry', () => {
  it('restores current-scope uploaded media only, without uploading new media', async () => {
    const good = mediaTask('uploaded', 'task-good', { uploadedRef: uploaded })
    const foreign = mediaTask('uploaded', 'task-foreign', {
      scope: { ...good.scope, userId: asOpaqueId<'UserId'>('another-user') },
    })
    const q = queue([good, foreign])
    const onTask = vi.fn(), onUploaded = vi.fn(() => true), onReadFailure = vi.fn()
    const changed = await restoreActionMediaQueue({
      queue: q, descriptor, getForm: () => form, stillCurrent: () => true,
      onTask, onUploaded, onReadFailure,
    })
    expect(changed).toBe(true)
    expect(onTask).toHaveBeenCalledTimes(1)
    expect(onUploaded).toHaveBeenCalledWith('photos', uploaded)
    expect(onReadFailure).not.toHaveBeenCalled()
    expect(q.process).not.toHaveBeenCalled()
    expect(q.retry).not.toHaveBeenCalled()
  })

  it('only resumes a known postprocessing checkpoint and never retries ambiguous failures', async () => {
    const ambiguous = mediaTask('failed_retryable', 'ambiguous', {
      lastError: createOperationError('network_retryable', 'ambiguous', { reason: 'ambiguous_postprocess' }),
    })
    // Explicit code is the durable denial flag, not a human-readable message.
    const blocked = { ...ambiguous, lastError: { ...ambiguous.lastError!, code: 'ambiguous_postprocess' } }
    const resumed = resumableActionMediaTasks([blocked, mediaTask('source_uploaded', 'source'), mediaTask('failed_retryable','safe')])
    expect(resumed.map(x => String(x.taskId))).toEqual(['source', 'safe'])
    const q = queue([mediaTask('postprocessing', 'processing')])
    const onTask = vi.fn()
    const changed = await restoreActionMediaQueue({
      queue: q, descriptor, getForm: () => form, stillCurrent: () => true,
      onTask, onUploaded: () => true, onReadFailure: vi.fn(),
    })
    expect(changed).toBe(true)
    expect(q.process).toHaveBeenCalledTimes(1)
    expect(q.retry).not.toHaveBeenCalled()
  })

  it('does not apply stale queue reads after role or task change', async () => {
    let resolve!: (v: OperationSnapshot<readonly MediaUploadTask[]>) => void
    const gate = new Promise<OperationSnapshot<readonly MediaUploadTask[]>>(yes => { resolve = yes })
    const q = queue()
    q.listForAction = vi.fn(async () => gate) as MediaUploadQueuePort['listForAction']
    let current = true
    const onTask = vi.fn(), onUploaded = vi.fn(), onReadFailure = vi.fn()
    const pending = restoreActionMediaQueue({
      queue: q, descriptor, getForm: () => form, stillCurrent: () => current,
      onTask, onUploaded, onReadFailure,
    })
    current = false
    resolve(succeeded([mediaTask('uploaded', 'late', { uploadedRef: uploaded })]))
    expect(await pending).toBe(false)
    expect(onTask).not.toHaveBeenCalled()
    expect(onUploaded).not.toHaveBeenCalled()
    expect(onReadFailure).not.toHaveBeenCalled()
  })

  it('keeps business form unchanged if metadata read fails', async () => {
    const q = queue()
    q.listForAction = vi.fn(async () => ({
      state: 'failed_retryable' as const, error: createOperationError('network_retryable', 'read-failed'),
    })) as MediaUploadQueuePort['listForAction']
    const onTask = vi.fn(), onUploaded = vi.fn(), onReadFailure = vi.fn()
    expect(await restoreActionMediaQueue({
      queue: q, descriptor, getForm: () => form, stillCurrent: () => true,
      onTask, onUploaded, onReadFailure,
    })).toBe(false)
    expect(onTask).not.toHaveBeenCalled()
    expect(onUploaded).not.toHaveBeenCalled()
    expect(onReadFailure).toHaveBeenCalledTimes(1)
  })

  it('resumes source postprocessing via process and known retryable via retry', async () => {
    const q = queue()
    const onTask = vi.fn()
    const result = await retryActionMediaQueue({
      queue: q, tasks: [mediaTask('source_uploaded','source'), mediaTask('failed_retryable','retryable')],
      stillCurrent: () => true, onTask,
    })
    expect(result.state).toBe('succeeded')
    expect(q.process).toHaveBeenCalledTimes(1)
    expect(q.retry).toHaveBeenCalledTimes(1)
    expect(onTask).toHaveBeenCalledTimes(2)
    if (result.state === 'succeeded') expect(result.uploaded).toHaveLength(2)
  })

  it('blocks a late retry result after scope revocation without updating task state', async () => {
    const q = queue()
    let current = true
    q.process = vi.fn(async () => {
      current = false
      return succeeded(mediaTask('uploaded','late', { uploadedRef: uploaded }))
    }) as MediaUploadQueuePort['process']
    const onTask = vi.fn()
    const result = await retryActionMediaQueue({
      queue: q, tasks: [mediaTask('source_uploaded','late')], stillCurrent: () => current, onTask,
    })
    expect(result.state).toBe('stale')
    expect(onTask).not.toHaveBeenCalled()
    expect(q.retry).not.toHaveBeenCalled()
  })

  it('does not manufacture an uploaded ref when queue reports success without data', async () => {
    const q = queue()
    q.process = vi.fn(async () => succeeded(undefined)) as unknown as MediaUploadQueuePort['process']
    const result = await retryActionMediaQueue({
      queue: q, tasks: [mediaTask('source_uploaded','unknown')], stillCurrent: () => true, onTask: vi.fn(),
    })
    expect(result.state).toBe('failed')
    if (result.state === 'failed') expect(result.result.state).toBe('failed_terminal')
  })
})
