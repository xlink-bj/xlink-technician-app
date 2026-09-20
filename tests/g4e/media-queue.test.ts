import { describe, expect, it, vi } from 'vitest'

import { createDisabledRealMediaPostUploadProcessor } from '@adapters/upload/uni-media-post-upload-processor'
import { createMediaQueueRepository, createMediaUploadQueue, InMemoryDurableMediaStore, type MediaUploadQueueOptions } from '@runtimes/media'
import type { StorageKey, StoragePort, UploadPort } from '@shared/ports'
import { asOpaqueId, createOperationError, type LocalMedia, type MediaUploadTask, type OperationSnapshot, type UploadedMediaRef } from '@shared/types'

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function storageFor() {
  const values = new Map<string, unknown>()
  const storage: StoragePort = {
    read: async <T>(key: StorageKey) => succeeded((values.get(`${key.namespace}:${key.key}`) ?? null) as T | null),
    write: vi.fn(async (key: StorageKey, value: unknown) => {
      values.set(`${key.namespace}:${key.key}`, value)
      return succeeded(undefined)
    }),
    remove: vi.fn(async (key: StorageKey) => {
      values.delete(`${key.namespace}:${key.key}`)
      return succeeded(undefined)
    }),
    listKeys: vi.fn(async ({ namespace, prefix }: { namespace: string; prefix?: string }) => succeeded(
      [...values.keys()]
        .filter((key) => key.startsWith(`${namespace}:`))
        .map((key) => key.slice(namespace.length + 1))
        .filter((key) => !prefix || key.startsWith(prefix)),
    )),
  }
  return { storage, values }
}

const scope = {
  userId: asOpaqueId<'UserId'>('queue-user-a'),
  workOrderId: asOpaqueId<'WorkOrderId'>('queue-work-order'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('queue-node'),
  formDefinitionId: asOpaqueId<'FormDefinitionId'>('queue-definition'),
  fieldId: 'images1',
  valueKey: 'images1',
} as const

function media(ref = 'queue-photo'): LocalMedia {
  return {
    ref: asOpaqueId<'LocalMediaRef'>(ref),
    localPath: `/durable/${ref}.jpg`,
    mimeType: 'image/jpeg',
    source: 'library',
    capturedAt: '2026-09-20T10:00:00.000Z',
  }
}

function uploaded(mediaItem: LocalMedia): UploadedMediaRef {
  return {
    url: `https://upload.invalid/${String(mediaItem.ref)}`,
    source: mediaItem.source,
    mimeType: mediaItem.mimeType,
    uploadState: 'uploaded',
  }
}

function createQueue(upload: UploadPort, storage = storageFor(), options: MediaUploadQueueOptions = {}) {
  return {
    queue: createMediaUploadQueue(
      new InMemoryDurableMediaStore(),
      createMediaQueueRepository(storage.storage),
      upload,
      { now: () => '2026-09-20T10:00:00.000Z', ...options },
    ),
    storage,
  }
}

describe('G4-E shared durable media queue', () => {
  it('persists local media before upload and only exposes a remote ref after confirmed upload', async () => {
    const upload = { upload: vi.fn(async (item: LocalMedia) => succeeded(uploaded(item))) }
    const { queue } = createQueue(upload)
    const enqueued = await queue.enqueue({ scope, media: media() })

    expect(enqueued.state).toBe('succeeded')
    expect(upload.upload).not.toHaveBeenCalled()
    expect(enqueued.data?.state).toBe('queued')

    const processed = await queue.process(enqueued.data!.taskId)
    expect(processed.state).toBe('succeeded')
    expect(processed.data?.state).toBe('uploaded')
    expect(processed.data?.uploadedRef?.url).toContain('queue-photo')
  })

  it('persists a source checkpoint and resumes post-upload processing without re-uploading', async () => {
    const storage = storageFor()
    const durable = new InMemoryDurableMediaStore()
    const repository = createMediaQueueRepository(storage.storage)
    const upload = { upload: vi.fn(async (item: LocalMedia) => succeeded(uploaded(item))) }
    const firstProcessor = {
      process: vi.fn(async () => ({
        state: 'failed_retryable' as const,
        error: createOperationError('network_retryable', 'processor was not dispatched', { code: 'postprocess_not_dispatched' }),
      })),
    }
    const first = createMediaUploadQueue(durable, repository, upload, {
      now: () => '2026-09-20T10:00:00.000Z',
      postUploadProcessor: firstProcessor,
    })
    const enqueued = await first.enqueue({
      scope,
      media: media('camera-checkpoint'),
      evidence: {
        postUploadPolicy: 'remote_location_watermark',
        location: { latitude: 39.9, longitude: 116.4, coordinateSystem: 'gcj02', capturedAt: '2026-09-20T10:00:00.000Z' },
      },
    })
    const failed = await first.process(enqueued.data!.taskId)
    expect(failed.state).toBe('failed_retryable')
    expect(failed.data?.state).toBe('failed_retryable')
    expect(failed.data?.sourceUploadedRef?.url).toContain('camera-checkpoint')
    expect(upload.upload).toHaveBeenCalledTimes(1)

    const secondProcessor = {
      process: vi.fn(async ({ source }: { source: UploadedMediaRef }) => succeeded({
        ...source,
        url: `https://mock-watermarked.invalid/${String(source.key ?? source.url)}`,
      })),
    }
    const restarted = createMediaUploadQueue(durable, repository, upload, { postUploadProcessor: secondProcessor })
    const resumed = await restarted.retry(enqueued.data!.taskId)
    expect(resumed.state).toBe('succeeded')
    expect(resumed.data?.state).toBe('uploaded')
    expect(resumed.data?.sourceUploadedRef?.url).toContain('camera-checkpoint')
    expect(resumed.data?.uploadedRef?.url).toContain('mock-watermarked')
    expect(upload.upload).toHaveBeenCalledTimes(1)
    expect(secondProcessor.process).toHaveBeenCalledTimes(1)
  })

  it('never exposes a source ref as a final ref while postprocessing is pending', async () => {
    let resolveStarted: (() => void) | undefined
    const processorStarted = new Promise<void>((resolve) => { resolveStarted = resolve })
    let resolveProcessor: ((result: OperationSnapshot<UploadedMediaRef>) => void) | undefined
    const processor = {
      process: vi.fn(() => new Promise<OperationSnapshot<UploadedMediaRef>>((resolveResult) => {
        resolveProcessor = resolveResult
        resolveStarted!()
      })),
    }
    const { queue } = createQueue(
      { upload: vi.fn(async (item: LocalMedia) => succeeded(uploaded(item))) },
      storageFor(),
      { postUploadProcessor: processor },
    )
    const enqueued = await queue.enqueue({
      scope,
      media: media('pending-camera'),
      evidence: {
        postUploadPolicy: 'remote_location_watermark',
        location: { latitude: 39.9, longitude: 116.4, coordinateSystem: 'gcj02', capturedAt: '2026-09-20T10:00:00.000Z' },
      },
    })
    const processing = queue.process(enqueued.data!.taskId)
    await processorStarted
    const pending = await queue.listForAction(scope)
    expect(pending.data?.[0].state).toBe('postprocessing')
    expect(pending.data?.[0].sourceUploadedRef).toBeDefined()
    expect(pending.data?.[0].uploadedRef).toBeUndefined()
    resolveProcessor!(succeeded({
      ...pending.data![0].sourceUploadedRef!,
      url: 'https://mock-watermarked.invalid/pending-camera',
    }))
    const completed = await processing
    expect(completed.data?.uploadedRef?.url).toContain('mock-watermarked')
  })

  it('does not replay an ambiguous postprocess after restart or generic retry', async () => {
    const storage = storageFor()
    const durable = new InMemoryDurableMediaStore()
    const repository = createMediaQueueRepository(storage.storage)
    const item = media('ambiguous-postprocess')
    await durable.persist(item)
    const current = {
      schemaVersion: 1 as const,
      taskId: asOpaqueId<'MediaUploadTaskId'>('ambiguous-postprocess-task'),
      scope: { ...scope, localAssetId: item.ref },
      state: 'postprocessing' as const,
      attempts: 1,
      createdAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-20T10:00:00.000Z',
      evidence: {
        postUploadPolicy: 'remote_location_watermark' as const,
        location: { latitude: 39.9, longitude: 116.4, coordinateSystem: 'gcj02' as const, capturedAt: '2026-09-20T10:00:00.000Z' },
      },
      sourceUploadedRef: uploaded(item),
    }
    await repository.write(current)
    const processor = { process: vi.fn(async () => succeeded(uploaded(item))) }
    const queue = createMediaUploadQueue(durable, repository, { upload: vi.fn() }, { postUploadProcessor: processor })

    const interrupted = await queue.process(current.taskId)
    expect(interrupted.state).toBe('failed_retryable')
    expect(interrupted.error?.code).toBe('ambiguous_postprocess')
    expect(interrupted.data?.sourceUploadedRef?.url).toContain('ambiguous-postprocess')
    expect(processor.process).not.toHaveBeenCalled()

    const retried = await queue.retry(current.taskId)
    expect(retried.state).toBe('failed_retryable')
    expect(retried.error?.code).toBe('ambiguous_postprocess')
    expect(processor.process).not.toHaveBeenCalled()
  })

  it('retains the source checkpoint until final save cleanup', async () => {
    const durable = new InMemoryDurableMediaStore()
    const storage = storageFor()
    const processor = {
      process: vi.fn(async ({ source }: { source: UploadedMediaRef }) => succeeded({
        ...source,
        url: 'https://mock-watermarked.invalid/final-cleanup',
      })),
    }
    const queue = createMediaUploadQueue(
      durable,
      createMediaQueueRepository(storage.storage),
      { upload: vi.fn(async (item: LocalMedia) => succeeded(uploaded(item))) },
      { postUploadProcessor: processor },
    )
    const enqueued = await queue.enqueue({
      scope,
      media: media('final-checkpoint'),
      evidence: { postUploadPolicy: 'remote_location_watermark', location: { latitude: 39.9, longitude: 116.4, coordinateSystem: 'gcj02', capturedAt: '2026-09-20T10:00:00.000Z' } },
    })
    const completed = await queue.process(enqueued.data!.taskId)
    expect(completed.data?.sourceUploadedRef).toBeDefined()
    expect((await durable.exists(enqueued.data!.scope.localAssetId)).data).toBe(true)
    expect((await queue.finalizeAfterSave(enqueued.data!.taskId)).state).toBe('succeeded')
    expect((await durable.exists(enqueued.data!.scope.localAssetId)).data).toBe(false)
    expect((await queue.listForAction(scope)).data).toEqual([])
  })

  it('keeps the real watermark adapter disabled while coordinates are unresolved', async () => {
    const processor = createDisabledRealMediaPostUploadProcessor()
    const result = await processor.process({
      source: uploaded(media('real-disabled')),
      evidence: {
        postUploadPolicy: 'remote_location_watermark',
        location: { latitude: 39.9, longitude: 116.4, coordinateSystem: 'gcj02', capturedAt: '2026-09-20T10:00:00.000Z' },
      },
    })
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.code).toBe('coordinate_contract_conflict')
  })

  it('single-flights concurrent processing for one task', async () => {
    let resolveUpload: ((value: OperationSnapshot<UploadedMediaRef>) => void) | undefined
    let markUploadStarted: (() => void) | undefined
    const uploadStarted = new Promise<void>((resolve) => { markUploadStarted = resolve })
    const upload = {
      upload: vi.fn(() => new Promise<OperationSnapshot<UploadedMediaRef>>((resolve) => {
        resolveUpload = resolve
        markUploadStarted!()
      })),
    }
    const { queue } = createQueue(upload)
    const enqueued = await queue.enqueue({ scope, media: media() })
    const first = queue.process(enqueued.data!.taskId)
    await uploadStarted
    const second = queue.process(enqueued.data!.taskId)
    resolveUpload!(succeeded(uploaded(media())))

    const [left, right] = await Promise.all([first, second])
    expect(upload.upload).toHaveBeenCalledTimes(1)
    expect(left.data?.uploadedRef?.url).toBe(right.data?.uploadedRef?.url)
  })

  it('retains retryable failures across a new queue instance and retries only explicitly', async () => {
    const storage = storageFor()
    const durable = new InMemoryDurableMediaStore()
    const firstUpload: UploadPort = {
      upload: vi.fn(async () => ({
        state: 'failed_retryable' as const,
        error: createOperationError('network_retryable', 'offline'),
      })),
    }
    const first = {
      queue: createMediaUploadQueue(durable, createMediaQueueRepository(storage.storage), firstUpload),
      storage,
    }
    const enqueued = await first.queue.enqueue({ scope, media: media() })
    const failed = await first.queue.process(enqueued.data!.taskId)
    expect(failed.state).toBe('failed_retryable')
    expect(failed.data?.state).toBe('failed_retryable')

    const secondUpload = { upload: vi.fn(async (item: LocalMedia) => succeeded(uploaded(item))) }
    const second = createMediaUploadQueue(
      durable,
      createMediaQueueRepository(storage.storage),
      secondUpload,
    )
    const listed = await second.listForAction(scope)
    expect(listed.data?.[0].state).toBe('failed_retryable')
    expect(secondUpload.upload).not.toHaveBeenCalled()

    const retried = await second.retry(enqueued.data!.taskId)
    expect(retried.state).toBe('succeeded')
    expect(secondUpload.upload).toHaveBeenCalledTimes(1)
  })

  it('does not auto-resubmit an interrupted upload', async () => {
    const storage = storageFor()
    const durable = new InMemoryDurableMediaStore()
    const item = media('ambiguous-photo')
    const persisted = await durable.persist(item)
    const upload = { upload: vi.fn(async (value: LocalMedia) => succeeded(uploaded(value))) }
    const queue = createMediaUploadQueue(durable, createMediaQueueRepository(storage.storage), upload)
    const enqueued = await queue.enqueue({ scope, media: item })
    const current = enqueued.data!
    const interrupted: MediaUploadTask = { ...current, state: 'uploading' }
    await createMediaQueueRepository(storage.storage).write(interrupted)

    const result = await queue.process(current.taskId)
    expect(result.state).toBe('failed_retryable')
    expect(result.error?.code).toBe('ambiguous_upload')
    expect(upload.upload).not.toHaveBeenCalled()
    expect(persisted.state).toBe('succeeded')
  })

  it('keeps task identity scoped to user/work/node and isolates listings', async () => {
    const upload = { upload: vi.fn(async (item: LocalMedia) => succeeded(uploaded(item))) }
    const storage = storageFor()
    const first = createQueue(upload, storage)
    const secondScope = { ...scope, userId: asOpaqueId<'UserId'>('queue-user-b') }
    await first.queue.enqueue({ scope, media: media('user-a-photo') })
    await first.queue.enqueue({ scope: secondScope, media: media('user-b-photo') })

    const userA = await first.queue.listForAction(scope)
    const userB = await first.queue.listForAction(secondScope)
    expect(userA.data?.map((task) => String(task.scope.userId))).toEqual(['queue-user-a'])
    expect(userB.data?.map((task) => String(task.scope.userId))).toEqual(['queue-user-b'])
  })

  it('restores only the current form and field identity, with safe form-data compatibility', async () => {
    const upload = { upload: vi.fn(async (item: LocalMedia) => succeeded(uploaded(item))) }
    const { queue } = createQueue(upload)
    const otherForm = { ...scope, formDefinitionId: asOpaqueId<'FormDefinitionId'>('queue-other-definition'), fieldId: 'images2', valueKey: 'images2' }
    const savedRecord = { ...scope, formDataId: asOpaqueId<'FormDataId'>('queue-form-data') }
    const staleRecord = { ...scope, formDataId: asOpaqueId<'FormDataId'>('queue-stale-form-data') }
    await queue.enqueue({ scope, media: media('current-form-photo') })
    await queue.enqueue({ scope: otherForm, media: media('other-form-photo') })
    await queue.enqueue({ scope: savedRecord, media: media('saved-record-photo') })
    await queue.enqueue({ scope: staleRecord, media: media('stale-record-photo') })

    const current = await queue.listForAction(scope)
    expect(current.data?.map((task) => String(task.scope.localAssetId))).toEqual(['current-form-photo'])

    const saved = await queue.listForAction({ ...scope, formDataId: savedRecord.formDataId })
    expect(saved.data?.map((task) => String(task.scope.localAssetId))).toEqual(['current-form-photo', 'saved-record-photo'])

    const otherField = await queue.listForAction({
      ...scope,
      formDefinitionId: otherForm.formDefinitionId,
      fieldId: otherForm.fieldId,
      valueKey: otherForm.valueKey,
    })
    expect(otherField.data?.map((task) => String(task.scope.localAssetId))).toEqual(['other-form-photo'])
  })

  it('requires source-backed location before remote watermark processing and never fabricates it', async () => {
    const upload = { upload: vi.fn(async (item: LocalMedia) => succeeded(uploaded(item))) }
    const { queue } = createQueue(upload)
    const enqueued = await queue.enqueue({
      scope,
      media: { ...media('camera-photo'), source: 'camera' },
      evidence: { postUploadPolicy: 'remote_location_watermark' },
    })
    const result = await queue.process(enqueued.data!.taskId)
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.code).toBe('location_required')
    expect(upload.upload).not.toHaveBeenCalled()
  })

  it('cleans durable local media only after explicit finalize or discard', async () => {
    const upload = { upload: vi.fn(async (item: LocalMedia) => succeeded(uploaded(item))) }
    const durable = new InMemoryDurableMediaStore()
    const storage = storageFor()
    const repository = createMediaQueueRepository(storage.storage)
    const queue = createMediaUploadQueue(durable, repository, upload)
    const first = await queue.enqueue({ scope, media: media('finalize-photo') })
    await queue.process(first.data!.taskId)
    expect((await durable.exists(first.data!.scope.localAssetId)).data).toBe(true)
    expect((await queue.finalizeAfterSave(first.data!.taskId)).state).toBe('succeeded')
    expect((await durable.exists(first.data!.scope.localAssetId)).data).toBe(false)

    const second = await queue.enqueue({ scope, media: media('discard-photo') })
    expect((await queue.discard(second.data!.taskId)).state).toBe('succeeded')
    expect((await durable.exists(second.data!.scope.localAssetId)).data).toBe(false)
  })
})
