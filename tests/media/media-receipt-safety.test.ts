import { describe, expect, it, vi } from 'vitest'

import { createMediaQueueRepository, createMediaUploadQueue, InMemoryDurableMediaStore } from '@runtimes/media'
import type { StorageKey, StoragePort } from '@shared/ports'
import { asOpaqueId, createOperationError, type LocalMedia, type MediaUploadTask, type OperationSnapshot, type UploadedMediaRef } from '@shared/types'

const succeeded = <T>(data: T): OperationSnapshot<T> => ({ state: 'succeeded', data })
const scope = {
  userId: asOpaqueId<'UserId'>('receipt-user'),
  workOrderId: asOpaqueId<'WorkOrderId'>('receipt-order'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('receipt-node'),
  formDefinitionId: asOpaqueId<'FormDefinitionId'>('receipt-definition'),
  fieldId: 'photos', valueKey: 'images1',
}
const media: LocalMedia = {
  ref: asOpaqueId<'LocalMediaRef'>('receipt-photo'), localPath: '/durable/receipt.jpg',
  source: 'library', mimeType: 'image/jpeg',
}
const ref: UploadedMediaRef = {
  url: 'mock://receipt/photo', source: 'library', uploadState: 'uploaded',
}
const evidence = {
  postUploadPolicy: 'remote_location_watermark' as const,
  location: { latitude: 39.9, longitude: 116.4, coordinateSystem: 'gcj02' as const, capturedAt: '2026-11-07T00:00:00Z' },
}
const keyFor = (taskId: MediaUploadTask['taskId']) => `media-upload-queue:v1:${encodeURIComponent(String(taskId))}`

function setup() {
  const values = new Map<string, unknown>()
  const storage: StoragePort = {
    read: async <T>(key: StorageKey) => succeeded((values.get(key.key) ?? null) as T | null),
    write: vi.fn(async (key: StorageKey, value: unknown) => {
      values.set(key.key, value)
      return succeeded(undefined)
    }),
    remove: vi.fn(async (key: StorageKey) => {
      values.delete(key.key)
      return succeeded(undefined)
    }),
    listKeys: vi.fn(async () => succeeded([...values.keys()])),
  }
  const durable = new InMemoryDurableMediaStore()
  const removeAsset = vi.spyOn(durable, 'remove')
  const repository = createMediaQueueRepository(storage)
  const upload = { upload: vi.fn(async () => succeeded(ref)) }
  const processor = {
    preflight: vi.fn(async () => succeeded(undefined)),
    process: vi.fn(async () => succeeded({ ...ref, url: 'mock://receipt/final' })),
  }
  const newQueue = () => createMediaUploadQueue(durable, repository, upload, { postUploadProcessor: processor })
  return { values, storage, durable, removeAsset, repository, upload, processor, newQueue, queue: newQueue() }
}

const malformedRefs: readonly [string, unknown][] = [
  ['missing', undefined], ['null', null], ['array', []], ['empty object', {}],
  ['empty URL', { ...ref, url: ' ' }], ['non-string URL', { ...ref, url: 7 }],
  ['missing source', { url: ref.url, uploadState: 'uploaded' }],
  ['unknown source', { ...ref, source: 'remote' }],
  ['non-uploaded state', { ...ref, uploadState: 'pending' }],
  ['invalid optional key', { ...ref, key: {} }],
  ['empty optional filename', { ...ref, fileName: ' ' }],
]

describe('durable media receipt boundary', () => {
  it.each(malformedRefs)('rejects persisted uploaded task with %s receipt without exposing or cleaning it', async (_name, uploadedRef) => {
    const h = setup()
    const task = (await h.queue.enqueue({ scope, media })).data!
    const corrupted = { ...task, state: 'uploaded', uploadedRef }
    h.values.set(keyFor(task.taskId), corrupted)

    for (const result of [await h.repository.read(task.taskId), await h.queue.listForAction(scope), await h.queue.process(task.taskId)]) {
      expect(result.state).toBe('failed_terminal')
      expect(result.data).toBeUndefined()
    }
    expect((await h.queue.finalizeAfterSave(task.taskId)).state).toBe('failed_terminal')
    expect((await h.queue.discard(task.taskId)).state).toBe('failed_terminal')
    expect(h.removeAsset).not.toHaveBeenCalled()
    expect(h.storage.remove).not.toHaveBeenCalled()
    expect(h.upload.upload).not.toHaveBeenCalled()
    expect(h.values.get(keyFor(task.taskId))).toEqual(corrupted)
    expect((await h.durable.exists(media.ref)).data).toBe(true)
  })

  it.each([
    ['mismatched task ID', { taskId: 'foreign-task' }],
    ['unknown state', { state: 'upload_complete' }],
    ['negative attempts', { attempts: -1 }],
    ['fractional attempts', { attempts: 0.5 }],
    ['non-finite attempts', { attempts: Infinity }],
    ['array scope', { scope: [] }],
    ['empty scope', { scope: {} }],
    ['missing source checkpoint', { state: 'source_uploaded' }],
    ['malformed source checkpoint', { state: 'postprocessing', sourceUploadedRef: {} }],
    ['premature final receipt', { uploadedRef: ref }],
    ['premature source receipt', { sourceUploadedRef: ref }],
    ['empty timestamp', { updatedAt: '' }],
  ])('fails closed for %s persisted metadata', async (_name, patch) => {
    const h = setup()
    const task = (await h.queue.enqueue({ scope, media })).data!
    h.values.set(keyFor(task.taskId), { ...task, ...patch })
    expect((await h.repository.read(task.taskId)).state).toBe('failed_terminal')
    expect((await h.queue.listForAction(scope)).state).toBe('failed_terminal')
    expect((await h.queue.process(task.taskId)).state).toBe('failed_terminal')
    expect(h.upload.upload).not.toHaveBeenCalled()
    expect((await h.durable.exists(media.ref)).data).toBe(true)
  })

  it.each(['userId', 'workOrderId', 'workflowNodeId', 'fieldId', 'valueKey', 'localAssetId', 'formDefinitionId', 'formDataId'])(
    'validates semantic scope field %s without coercing it', async (field) => {
      const h = setup()
      const task = (await h.queue.enqueue({ scope, media })).data!
      h.values.set(keyFor(task.taskId), { ...task, scope: { ...task.scope, [field]: 12 } })
      expect((await h.queue.process(task.taskId)).state).toBe('failed_terminal')
      expect((await h.queue.listForAction(scope)).state).toBe('failed_terminal')
      expect(h.upload.upload).not.toHaveBeenCalled()
    },
  )

  it.each(['userId', 'workOrderId', 'workflowNodeId', 'fieldId', 'valueKey', 'localAssetId', 'formDefinitionId', 'formDataId'])(
    'rejects changed %s against the existing generated task identity', async (field) => {
      const h = setup()
      const task = (await h.queue.enqueue({ scope, media })).data!
      h.values.set(keyFor(task.taskId), { ...task, scope: { ...task.scope, [field]: 'another-valid-id' } })
      expect((await h.queue.process(task.taskId)).state).toBe('failed_terminal')
      expect((await h.queue.listForAction(scope)).state).toBe('failed_terminal')
      expect((await h.queue.discard(task.taskId)).state).toBe('failed_terminal')
      expect(h.upload.upload).not.toHaveBeenCalled()
      expect(h.removeAsset).not.toHaveBeenCalled()
    },
  )

  it('preserves opaque legacy task IDs with key binding and valid scope, without claiming ownership proof', async () => {
    const h = setup()
    const task = (await h.queue.enqueue({ scope, media })).data!
    const opaque = { ...task, taskId: asOpaqueId<'MediaUploadTaskId'>('opaque-legacy-task') }
    expect((await h.repository.write(opaque)).state).toBe('succeeded')
    expect((await h.repository.read(opaque.taskId)).data).toEqual(opaque)
    expect((await h.queue.process(opaque.taskId)).data?.uploadedRef).toEqual(ref)
    h.values.set(keyFor(task.taskId), opaque)
    expect((await h.repository.read(task.taskId)).state).toBe('failed_terminal')
  })

  it('refuses malformed writes and malformed lookup scopes without touching stored tasks', async () => {
    const h = setup()
    const task = (await h.queue.enqueue({ scope, media })).data!
    const writes = vi.mocked(h.storage.write).mock.calls.length
    expect((await h.repository.write({ ...task, state: 'uploaded' })).state).toBe('failed_terminal')
    expect(vi.mocked(h.storage.write).mock.calls.length).toBe(writes)
    expect((await h.queue.listForAction({ ...scope, userId: 12 as unknown as typeof scope.userId })).state).toBe('failed_terminal')
    expect((await h.repository.read(task.taskId)).data).toEqual(task)
  })

  it.each([
    ['retryable failure without an error', { state: 'failed_retryable' }],
    ['terminal failure without an error', { state: 'failed_terminal' }],
    ['terminal error in retryable state', { state: 'failed_retryable', lastError: createOperationError('server_terminal', 'terminal') }],
    ['retryable error in terminal state', { state: 'failed_terminal', lastError: createOperationError('network_retryable', 'retryable') }],
    ['forged retryable flag', { state: 'failed_retryable', lastError: { ...createOperationError('server_terminal', 'terminal'), retryable: true } }],
    ['forged terminal flag', { state: 'failed_terminal', lastError: { ...createOperationError('network_retryable', 'retryable'), retryable: false } }],
  ])('refuses %s rather than treating malformed failure metadata as permission to resend', async (_name, patch) => {
    const h = setup()
    const task = (await h.queue.enqueue({ scope, media })).data!
    h.values.set(keyFor(task.taskId), { ...task, ...patch })
    for (const result of [await h.repository.read(task.taskId), await h.queue.process(task.taskId), await h.queue.retry(task.taskId)]) {
      expect(result.state).toBe('failed_terminal')
      expect(result.data).toBeUndefined()
    }
    expect(h.upload.upload).not.toHaveBeenCalled()
    expect(h.removeAsset).not.toHaveBeenCalled()
  })

  it.each(['queued', 'preprocessing', 'ready_to_upload', 'uploading', 'source_uploaded', 'postprocessing', 'uploaded'] as const)(
    'rejects contradictory %s metadata retaining an error instead of replaying or cleaning it', async (state) => {
      const h = setup()
      const task = (await h.queue.enqueue({ scope, media })).data!
      const hasSource = state === 'source_uploaded' || state === 'postprocessing'
      const corrupted = {
        ...task, state, attempts: 1,
        ...(hasSource ? { sourceUploadedRef: ref, evidence } : {}),
        ...(state === 'uploaded' ? { uploadedRef: ref } : {}),
        lastError: createOperationError('network_retryable', 'remote outcome unknown', {
          code: hasSource ? 'ambiguous_postprocess' : 'ambiguous_upload',
        }),
      }
      h.values.set(keyFor(task.taskId), corrupted)
      for (const result of [await h.repository.read(task.taskId), await h.queue.listForAction(scope),
        await h.queue.process(task.taskId), await h.queue.retry(task.taskId)]) {
        expect(result.state).toBe('failed_terminal')
        expect(result.data).toBeUndefined()
      }
      expect((await h.queue.finalizeAfterSave(task.taskId)).state).toBe('failed_terminal')
      expect((await h.queue.discard(task.taskId)).state).toBe('failed_terminal')
      expect(h.upload.upload).not.toHaveBeenCalled()
      expect(h.processor.process).not.toHaveBeenCalled()
      expect(h.removeAsset).not.toHaveBeenCalled()
      expect(h.storage.remove).not.toHaveBeenCalled()
      expect(h.values.get(keyFor(task.taskId))).toEqual(corrupted)
      expect((await h.durable.exists(media.ref)).data).toBe(true)
    },
  )

  it.each(['source_uploaded', 'postprocessing', 'uploaded', 'failed_retryable', 'failed_terminal'] as const)(
    'rejects %s source checkpoint without its required post-upload policy and location evidence', async (state) => {
      for (const corruptedEvidence of [undefined, { ...evidence, postUploadPolicy: 'none' },
        { postUploadPolicy: 'remote_location_watermark' }]) {
        const h = setup()
        const task = (await h.queue.enqueue({ scope, media, evidence })).data!
        const corrupted = {
          ...task, state, attempts: 1, sourceUploadedRef: ref, evidence: corruptedEvidence,
          ...(state === 'uploaded' ? { uploadedRef: ref } : {}),
          ...(state === 'failed_retryable'
            ? { lastError: createOperationError('network_retryable', 'not dispatched', { code: 'postprocess_not_dispatched' }) } : {}),
          ...(state === 'failed_terminal' ? { lastError: createOperationError('server_terminal', 'failed') } : {}),
        }
        h.values.set(keyFor(task.taskId), corrupted)
        for (const result of [await h.repository.read(task.taskId), await h.queue.listForAction(scope),
          await h.queue.process(task.taskId), await h.queue.retry(task.taskId)]) {
          expect(result.state).toBe('failed_terminal')
          expect(result.data).toBeUndefined()
        }
        expect((await h.queue.finalizeAfterSave(task.taskId)).state).toBe('failed_terminal')
        expect((await h.queue.discard(task.taskId)).state).toBe('failed_terminal')
        expect(h.upload.upload).not.toHaveBeenCalled()
        expect(h.processor.process).not.toHaveBeenCalled()
        expect(h.removeAsset).not.toHaveBeenCalled()
        expect(h.storage.remove).not.toHaveBeenCalled()
        expect(h.values.get(keyFor(task.taskId))).toEqual(corrupted)
        expect((await h.durable.exists(media.ref)).data).toBe(true)
      }
    },
  )

  it.each(['media-upload-queue:v1:%E0%A4%A', 'media-upload-queue:v1:', 'unrelated-key'])(
    'returns a failure rather than throwing or silently skipping malformed list key %s', async (key) => {
      const h = setup()
      await h.queue.enqueue({ scope, media })
      h.values.set(key, {})
      const result = await h.queue.listForAction(scope)
      expect(result.state).toBe('failed_terminal')
      expect(result.data).toBeUndefined()
      expect(h.storage.remove).not.toHaveBeenCalled()
    },
  )

  it.each([undefined, null, {}, [17]])('fails closed when successful key listing has malformed payload %j', async (data) => {
    const h = setup()
    vi.mocked(h.storage.listKeys).mockResolvedValue(succeeded(data) as unknown as OperationSnapshot<readonly string[]>)
    const result = await h.queue.listForAction(scope)
    expect(result.state).toBe('failed_terminal')
    expect(result.data).toBeUndefined()
  })

  it.each(malformedRefs)('quarantines successful upload ACK with %s receipt across restart and explicit retry', async (_name, ack) => {
    const h = setup()
    h.upload.upload.mockResolvedValue(succeeded(ack) as OperationSnapshot<UploadedMediaRef>)
    const task = (await h.queue.enqueue({ scope, media })).data!
    const result = await h.queue.process(task.taskId)
    expect(result.state).toBe('failed_retryable')
    expect(result.error?.code).toBe('ambiguous_upload')
    expect(result.data?.uploadedRef).toBeUndefined()
    expect((await h.queue.finalizeAfterSave(task.taskId)).state).toBe('failed_terminal')
    const restarted = h.newQueue()
    expect((await restarted.process(task.taskId)).error?.code).toBe('ambiguous_upload')
    expect((await restarted.retry(task.taskId)).error?.code).toBe('ambiguous_upload')
    expect(h.upload.upload).toHaveBeenCalledTimes(1)
    expect(h.processor.process).not.toHaveBeenCalled()
    expect(h.removeAsset).not.toHaveBeenCalled()
    expect((await h.durable.exists(media.ref)).data).toBe(true)
  })

  it.each(malformedRefs)('quarantines successful postprocess ACK with %s receipt and retains original checkpoint', async (_name, ack) => {
    const h = setup()
    h.processor.process.mockResolvedValue(succeeded(ack) as OperationSnapshot<UploadedMediaRef>)
    const task = (await h.queue.enqueue({ scope, media, evidence })).data!
    const result = await h.queue.process(task.taskId)
    expect(result.state).toBe('failed_retryable')
    expect(result.error?.code).toBe('ambiguous_postprocess')
    expect(result.data?.uploadedRef).toBeUndefined()
    expect(result.data?.sourceUploadedRef).toEqual(ref)
    const restarted = h.newQueue()
    expect((await restarted.process(task.taskId)).error?.code).toBe('ambiguous_postprocess')
    expect((await restarted.retry(task.taskId)).error?.code).toBe('ambiguous_postprocess')
    expect((await restarted.finalizeAfterSave(task.taskId)).state).toBe('failed_terminal')
    expect(h.upload.upload).toHaveBeenCalledTimes(1)
    expect(h.processor.process).toHaveBeenCalledTimes(1)
    expect(h.removeAsset).not.toHaveBeenCalled()
    expect((await h.durable.exists(media.ref)).data).toBe(true)
  })

  it.each(['upload', 'source', 'postprocess', 'malformed-upload', 'malformed-postprocess'])(
    'does not replay %s ACK when its following checkpoint write fails', async (stage) => {
      const h = setup()
      const useProcessor = stage === 'source' || stage.includes('postprocess')
      if (stage === 'malformed-upload') h.upload.upload.mockResolvedValue(succeeded({}) as OperationSnapshot<UploadedMediaRef>)
      if (stage === 'malformed-postprocess') h.processor.process.mockResolvedValue(succeeded({}) as OperationSnapshot<UploadedMediaRef>)
      const task = (await h.queue.enqueue({ scope, media, ...(useProcessor ? { evidence } : {}) })).data!
      const write = h.storage.write
      vi.mocked(h.storage.write).mockImplementation(async (key, value) => {
        const state = (value as MediaUploadTask).state
        if (state === 'uploaded' || (stage === 'source' && state === 'source_uploaded') || state === 'failed_retryable') {
          return { state: 'failed_retryable', error: createOperationError('network_retryable', 'checkpoint disk failure') }
        }
        h.values.set(key.key, value)
        return succeeded(undefined)
      })
      expect((await h.queue.process(task.taskId)).state).not.toBe('succeeded')
      const stored = (await h.repository.read(task.taskId)).data!
      expect(stored.state).toBe(stage.includes('postprocess') ? 'postprocessing' : 'uploading')
      // Storage recovers, but a new queue cannot assume the remote mutation failed.
      vi.mocked(write).mockImplementation(async (key, value) => {
        h.values.set(key.key, value)
        return succeeded(undefined)
      })
      const restarted = h.newQueue()
      await restarted.process(task.taskId)
      await restarted.retry(task.taskId)
      expect(h.upload.upload).toHaveBeenCalledTimes(1)
      expect(h.processor.process).toHaveBeenCalledTimes(stage.includes('postprocess') ? 1 : 0)
      expect((await restarted.finalizeAfterSave(task.taskId)).state).toBe('failed_terminal')
      expect(h.removeAsset).not.toHaveBeenCalled()
      expect((await h.durable.exists(media.ref)).data).toBe(true)
    },
  )

  it('accepts the neutral receipt contract and preserves pre-save/adopted form-data recovery', async () => {
    const h = setup()
    const task = (await h.queue.enqueue({ scope, media })).data!
    expect((await h.queue.process(task.taskId)).data?.uploadedRef).toEqual(ref)
    const savedScope = { ...scope, formDataId: asOpaqueId<'FormDataId'>('saved-record') }
    expect((await h.queue.listForAction(savedScope)).data?.map(task => task.taskId)).toEqual([task.taskId])
    const savedTask = (await h.queue.enqueue({ scope: savedScope, media: { ...media, ref: asOpaqueId<'LocalMediaRef'>('saved-photo') } })).data!
    expect((await h.queue.listForAction(scope)).data?.map(task => task.taskId)).toEqual([task.taskId])
    expect((await h.queue.listForAction(savedScope)).data?.map(task => task.taskId)).toEqual([task.taskId, savedTask.taskId])
    expect((await h.queue.listForAction({ ...scope, userId: asOpaqueId<'UserId'>('other-user') })).data).toEqual([])
    expect((await h.queue.finalizeAfterSave(task.taskId)).state).toBe('succeeded')
  })
})
