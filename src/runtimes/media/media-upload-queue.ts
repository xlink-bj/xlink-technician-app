import type {
  DurableMediaStorePort,
  MediaPreprocessorPort,
  MediaQueueRepository,
  MediaTaskLookupScope,
  MediaUploadQueuePort,
  UploadPort,
} from '@shared/ports'
import {
  asOpaqueId,
  createOperationError,
  type MediaEvidenceContext,
  type MediaTaskScope,
  type MediaUploadTask,
  type MediaUploadTaskId,
  type OperationSnapshot,
} from '@shared/types'

export interface MediaUploadQueueOptions {
  readonly now?: () => string
  readonly preprocessor?: MediaPreprocessorPort
}

function nowFor(options: MediaUploadQueueOptions): string {
  return options.now?.() ?? new Date().toISOString()
}

function taskIdFor(scope: Omit<MediaTaskScope, 'localAssetId'>, localAssetId: string): MediaUploadTaskId {
  const parts = [
    'media-upload-task',
    String(scope.userId),
    String(scope.workOrderId),
    String(scope.workflowNodeId),
    String(scope.formDefinitionId ?? ''),
    String(scope.formDataId ?? ''),
    scope.fieldId,
    scope.valueKey,
    localAssetId,
  ]
  return asOpaqueId<'MediaUploadTaskId'>(parts.map((part) => encodeURIComponent(part)).join(':'))
}

function operationFailure<T>(task: MediaUploadTask, error: ReturnType<typeof createOperationError>): OperationSnapshot<MediaUploadTask> {
  return { state: error.retryable ? 'failed_retryable' : 'failed_terminal', data: task, error }
}

export class MediaUploadQueue implements MediaUploadQueuePort {
  private readonly inFlight = new Map<string, Promise<OperationSnapshot<MediaUploadTask>>>()

  constructor(
    private readonly durableMediaStore: DurableMediaStorePort,
    private readonly repository: MediaQueueRepository,
    private readonly upload: UploadPort,
    private readonly options: MediaUploadQueueOptions = {},
  ) {}

  async enqueue(input: {
    readonly scope: Omit<MediaTaskScope, 'localAssetId'>
    readonly media: import('@shared/types').LocalMedia
    readonly evidence?: MediaEvidenceContext
  }): Promise<OperationSnapshot<MediaUploadTask>> {
    const persisted = await this.durableMediaStore.persist(input.media)
    if (persisted.state !== 'succeeded' || !persisted.data) return persisted.state === 'succeeded'
      ? { state: 'failed_terminal', error: createOperationError('server_terminal', 'Durable media asset was not created') }
      : persisted as unknown as OperationSnapshot<MediaUploadTask>
    const taskId = taskIdFor(input.scope, String(persisted.data.assetId))
    const existing = await this.repository.read(taskId)
    if (existing.state !== 'succeeded') return existing as unknown as OperationSnapshot<MediaUploadTask>
    if (existing.data) return { state: 'succeeded', data: existing.data }

    const timestamp = nowFor(this.options)
    const task: MediaUploadTask = {
      schemaVersion: 1,
      taskId,
      scope: { ...input.scope, localAssetId: persisted.data.assetId },
      state: 'queued',
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.evidence ? { evidence: input.evidence } : {}),
    }
    const saved = await this.repository.write(task)
    return saved.state === 'succeeded' ? { state: 'succeeded', data: task } : saved as OperationSnapshot<MediaUploadTask>
  }

  process(taskId: MediaUploadTaskId): Promise<OperationSnapshot<MediaUploadTask>> {
    const existing = this.inFlight.get(String(taskId))
    if (existing) return existing
    const work = this.processExclusive(taskId).finally(() => {
      if (this.inFlight.get(String(taskId)) === work) this.inFlight.delete(String(taskId))
    })
    this.inFlight.set(String(taskId), work)
    return work
  }

  async retry(taskId: MediaUploadTaskId): Promise<OperationSnapshot<MediaUploadTask>> {
    const current = await this.repository.read(taskId)
    if (current.state !== 'succeeded' || !current.data) {
      return current.state === 'succeeded'
        ? { state: 'failed_terminal', error: createOperationError('validation', 'Media upload task is unavailable') }
        : current as unknown as OperationSnapshot<MediaUploadTask>
    }
    if (current.data.state !== 'failed_retryable') {
      return operationFailure(current.data, createOperationError('validation', 'Only retryable media failures can be retried'))
    }
    const queued = await this.update(current.data, { state: 'queued', lastError: undefined })
    if (queued.state !== 'succeeded' || !queued.data) return queued
    return this.process(taskId)
  }

  async discard(taskId: MediaUploadTaskId): Promise<OperationSnapshot<void>> {
    if (this.inFlight.has(String(taskId))) {
      return { state: 'failed_retryable', error: createOperationError('network_retryable', 'Media upload is still in progress') }
    }
    const current = await this.repository.read(taskId)
    if (current.state !== 'succeeded') return current as unknown as OperationSnapshot<void>
    if (!current.data) return { state: 'succeeded', data: undefined }
    const removedAsset = await this.durableMediaStore.remove(current.data.scope.localAssetId)
    if (removedAsset.state !== 'succeeded') return removedAsset
    return this.repository.remove(taskId)
  }

  async finalizeAfterSave(taskId: MediaUploadTaskId): Promise<OperationSnapshot<void>> {
    const current = await this.repository.read(taskId)
    if (current.state !== 'succeeded') return current as unknown as OperationSnapshot<void>
    if (!current.data) return { state: 'succeeded', data: undefined }
    if (current.data.state !== 'uploaded' || !current.data.uploadedRef) {
      return { state: 'failed_terminal', error: createOperationError('validation', 'Only uploaded media can be finalized after save') }
    }
    const removedAsset = await this.durableMediaStore.remove(current.data.scope.localAssetId)
    if (removedAsset.state !== 'succeeded') return removedAsset
    return this.repository.remove(taskId)
  }

  listForAction(scope: MediaTaskLookupScope) {
    return this.repository.list(scope)
  }

  private async processExclusive(taskId: MediaUploadTaskId): Promise<OperationSnapshot<MediaUploadTask>> {
    const current = await this.repository.read(taskId)
    if (current.state !== 'succeeded' || !current.data) {
      return current.state === 'succeeded'
        ? { state: 'failed_terminal', error: createOperationError('validation', 'Media upload task is unavailable') }
        : current as unknown as OperationSnapshot<MediaUploadTask>
    }
    const task = current.data
    if (task.state === 'uploaded') return { state: 'succeeded', data: task }
    if (task.state === 'failed_terminal') return operationFailure(task, task.lastError ?? createOperationError('server_terminal', 'Media upload task is terminal'))
    if (task.state === 'uploading') {
      const interrupted = createOperationError('network_retryable', 'Previous media upload was interrupted; manual retry is required', { code: 'ambiguous_upload' })
      const marked = await this.update(task, { state: 'failed_retryable', lastError: interrupted })
      return marked.state === 'succeeded' && marked.data ? operationFailure(marked.data, interrupted) : marked
    }

    const asset = await this.durableMediaStore.resolve(task.scope.localAssetId)
    if (asset.state !== 'succeeded' || !asset.data) {
      const missing = createOperationError('server_terminal', 'Durable local media is unavailable', { code: 'missing_local_asset' })
      const marked = await this.update(task, { state: 'failed_terminal', lastError: missing })
      return marked.state === 'succeeded' && marked.data ? operationFailure(marked.data, missing) : marked
    }

    let media = asset.data.media
    if (task.evidence?.preprocessPolicy === 'location_watermark') {
      if (!task.evidence.location) {
        const missingLocation = createOperationError('authorization_denied', 'Location evidence is required before this photo can upload', { code: 'location_required' })
        const marked = await this.update(task, { state: 'failed_terminal', lastError: missingLocation })
        return marked.state === 'succeeded' && marked.data ? operationFailure(marked.data, missingLocation) : marked
      }
      if (!this.options.preprocessor) {
        const unsupported = createOperationError('unsupported_capability', 'Location watermark preprocessing is not configured', { code: 'watermark_unavailable' })
        const marked = await this.update(task, { state: 'failed_terminal', lastError: unsupported })
        return marked.state === 'succeeded' && marked.data ? operationFailure(marked.data, unsupported) : marked
      }
      const preprocessing = await this.update(task, { state: 'preprocessing' })
      if (preprocessing.state !== 'succeeded' || !preprocessing.data) return preprocessing
      const processed = await this.options.preprocessor.preprocess({ media, evidence: task.evidence })
      if (processed.state !== 'succeeded' || !processed.data) {
        const error = processed.error ?? createOperationError('server_terminal', 'Media preprocessing failed')
        const marked = await this.update(preprocessing.data, {
          state: error.retryable ? 'failed_retryable' : 'failed_terminal',
          lastError: error,
        })
        return marked.state === 'succeeded' && marked.data ? operationFailure(marked.data, error) : marked
      }
      media = processed.data
    }

    const ready = await this.update(task, { state: 'ready_to_upload' })
    if (ready.state !== 'succeeded' || !ready.data) return ready
    const uploading = await this.update(ready.data, {
      state: 'uploading',
      attempts: ready.data.attempts + 1,
    })
    if (uploading.state !== 'succeeded' || !uploading.data) return uploading

    const result = await this.upload.upload(media)
    if (result.state !== 'succeeded' || !result.data) {
      const error = result.error ?? createOperationError('network_retryable', 'Media upload failed')
      const marked = await this.update(uploading.data, {
        state: error.retryable ? 'failed_retryable' : 'failed_terminal',
        lastError: error,
      })
      return marked.state === 'succeeded' && marked.data ? operationFailure(marked.data, error) : marked
    }

    const completed = await this.update(uploading.data, {
      state: 'uploaded',
      uploadedRef: result.data,
      lastError: undefined,
    })
    return completed.state === 'succeeded' && completed.data
      ? { state: 'succeeded', data: completed.data }
      : completed
  }

  private async update(
    task: MediaUploadTask,
    patch: Partial<Pick<MediaUploadTask, 'state' | 'attempts' | 'uploadedRef' | 'lastError'>>,
  ): Promise<OperationSnapshot<MediaUploadTask>> {
    const next: MediaUploadTask = {
      ...task,
      ...patch,
      updatedAt: nowFor(this.options),
    }
    const saved = await this.repository.write(next)
    return saved.state === 'succeeded' ? { state: 'succeeded', data: next } : saved as OperationSnapshot<MediaUploadTask>
  }
}

export function createMediaUploadQueue(
  durableMediaStore: DurableMediaStorePort,
  repository: MediaQueueRepository,
  upload: UploadPort,
  options: MediaUploadQueueOptions = {},
): MediaUploadQueuePort {
  return new MediaUploadQueue(durableMediaStore, repository, upload, options)
}
