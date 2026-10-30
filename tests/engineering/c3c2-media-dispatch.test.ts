import { describe, expect, it, vi } from 'vitest'
import type { LocationPort, MediaUploadQueuePort, UploadPort } from '@shared/ports'
import {
  asOpaqueId, createOperationError, type LocalMedia, type MediaUploadTask,
  type OperationSnapshot, type UploadedMediaRef,
} from '@shared/types'
import { dispatchSelectedActionMedia } from '@features/work-orders/action-workspace-media-dispatch'

const succeed = <T>(data: T): OperationSnapshot<T> => ({ state: 'succeeded', data })
const media: LocalMedia = {
  ref: asOpaqueId<'LocalMediaRef'>('media-c3c2'), source: 'library', mimeType: 'image/jpeg',
  localPath: '/durable/media-c3c2.jpg', capturedAt: '2026-10-30T10:00:00Z',
}
const scope = {
  userId: asOpaqueId<'UserId'>('actor-c3c2'),
  workOrderId: asOpaqueId<'WorkOrderId'>('order-c3c2'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('node-c3c2'),
  fieldId: 'photos', valueKey: 'images1',
}
const uploaded: UploadedMediaRef = {
  url: 'https://upload.invalid/c3c2.jpg', source: 'library', uploadState: 'uploaded',
}
function task(state: MediaUploadTask['state'], ref: string): MediaUploadTask {
  return {
    schemaVersion: 1, taskId: asOpaqueId<'MediaUploadTaskId'>(ref),
    scope: { ...scope, localAssetId: media.ref },
    state, attempts: 1, createdAt: '2026-10-30T10:00:00Z',
    updatedAt: '2026-10-30T10:00:00Z',
    ...(state === 'uploaded' ? { uploadedRef: uploaded } : {}),
  }
}
function queueFixture() {
  return {
    enqueue: vi.fn(async () => succeed(task('queued', 'task-c3c2'))),
    process: vi.fn(async () => succeed(task('uploaded', 'task-c3c2'))),
  } as unknown as MediaUploadQueuePort
}
function args(overrides: Partial<Parameters<typeof dispatchSelectedActionMedia>[0]> = {}) {
  return { media, scope, policy: 'none' as const, stillCurrent: () => true, onTask: vi.fn(), ...overrides }
}

describe('C3-C2 single-media upload dispatch boundary', () => {
  it('enqueues with actor/form/field scope and confirmed evidence, then processes once', async () => {
    const queue = queueFixture()
    const capturedAt = '2026-10-30T10:01:00Z'
    const location = {
      captureCurrentLocation: vi.fn(async () => ({ state: 'granted' as const, value: {
        latitude: 39.9, longitude: 116.4, coordinateSystem: 'gcj02' as const, capturedAt,
      } })),
    } as unknown as LocationPort
    const onTask = vi.fn()
    const result = await dispatchSelectedActionMedia(args({
      queue, location, onTask, policy: 'remote_location_watermark',
    }))
    expect(result).toEqual({ state: 'uploaded', uploaded })
    expect(queue.enqueue).toHaveBeenCalledWith({ scope, media, evidence: {
      capturedAt: media.capturedAt, postUploadPolicy: 'remote_location_watermark',
      location: { latitude: 39.9, longitude: 116.4, coordinateSystem: 'gcj02', capturedAt },
    } })
    expect(queue.process).toHaveBeenCalledTimes(1)
    expect(onTask).toHaveBeenCalledTimes(2)
  })

  it('does not enqueue when the role expires while GPS capability is pending', async () => {
    let current = true
    const queue = queueFixture()
    const location = { captureCurrentLocation: vi.fn(async () => {
      current = false
      return { state: 'denied' as const }
    }) } as unknown as LocationPort
    const result = await dispatchSelectedActionMedia(args({
      queue, location, policy: 'remote_location_watermark', stillCurrent: () => current,
    }))
    expect(result.state).toBe('stale')
    expect(queue.enqueue).not.toHaveBeenCalled()
    expect(queue.process).not.toHaveBeenCalled()
  })

  it('never processes a queue task after its enqueue reply becomes stale', async () => {
    let current = true
    const queue = queueFixture()
    queue.enqueue = vi.fn(async () => {
      current = false
      return succeed(task('queued', 'task-c3c2'))
    }) as MediaUploadQueuePort['enqueue']
    const onTask = vi.fn()
    const result = await dispatchSelectedActionMedia(args({ queue, stillCurrent: () => current, onTask }))
    expect(result.state).toBe('stale')
    expect(queue.process).not.toHaveBeenCalled()
    expect(onTask).not.toHaveBeenCalled()
  })

  it('never applies a late process result after the actor scope changes', async () => {
    let current = true
    const queue = queueFixture()
    queue.process = vi.fn(async () => {
      current = false
      return succeed(task('uploaded', 'task-c3c2'))
    }) as MediaUploadQueuePort['process']
    const onTask = vi.fn()
    const result = await dispatchSelectedActionMedia(args({ queue, stillCurrent: () => current, onTask }))
    expect(result.state).toBe('stale')
    expect(onTask).toHaveBeenCalledTimes(1)
  })

  it('preserves failed queue checkpoints without inventing an uploaded reference', async () => {
    const queue = queueFixture()
    queue.process = vi.fn(async () => ({
      state: 'failed_retryable' as const, error: createOperationError('network_retryable','offline'),
      data: task('failed_retryable','task-c3c2'),
    })) as unknown as MediaUploadQueuePort['process']
    const onTask = vi.fn()
    const result = await dispatchSelectedActionMedia(args({ queue, onTask }))
    expect(result.state).toBe('failed')
    if (result.state === 'failed') {
      expect(result.source).toBe('queue')
      expect(result.result.state).toBe('failed_retryable')
    }
    expect(onTask).toHaveBeenCalled()
  })

  it('uses the existing direct-upload fallback only when no queue is configured', async () => {
    const upload = { upload: vi.fn(async () => succeed(uploaded)) } as UploadPort
    const result = await dispatchSelectedActionMedia(args({ upload }))
    expect(result).toEqual({ state: 'uploaded', uploaded })
    expect(upload.upload).toHaveBeenCalledOnce()
  })

  it('never fabricates a successful direct upload when its transport omits a result', async () => {
    const upload = { upload: vi.fn(async () => succeed(undefined)) } as unknown as UploadPort
    const result = await dispatchSelectedActionMedia(args({ upload }))
    expect(result.state).toBe('failed')
    if (result.state === 'failed') {
      expect(result.source).toBe('direct')
      expect(result.result.state).toBe('failed_terminal')
      expect(result.retryable).toBe(false)
    }
  })

  it('never sends a new request if the supplied scope is stale before dispatch', async () => {
    const queue = queueFixture()
    expect((await dispatchSelectedActionMedia(args({ queue, stillCurrent: () => false }))).state).toBe('stale')
    expect(queue.enqueue).not.toHaveBeenCalled()
  })
})
