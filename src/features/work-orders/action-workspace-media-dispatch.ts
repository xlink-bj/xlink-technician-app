import type { LocationPort, MediaUploadQueuePort, UploadPort } from '@shared/ports'
import {
  createOperationError, type LocalMedia, type MediaEvidenceContext, type MediaUploadTask,
  type OperationError, type OperationSnapshot, type UploadedMediaRef,
} from '@shared/types'

export type DispatchSelectedActionMediaResult =
  | { readonly state: 'uploaded'; readonly uploaded: UploadedMediaRef }
  | { readonly state: 'stale' }
  | {
      readonly state: 'failed'
      readonly source: 'queue' | 'direct'
      readonly error: OperationError
      readonly result: OperationSnapshot<void>
      readonly retryable: boolean
    }

/** Transport-only, single-media dispatcher. The Store owns authorization,
 * picker state, business-field writes, drafts and mutation of UI error state.
 * No automatic retry occurs at this boundary. */
export async function dispatchSelectedActionMedia(input: {
  readonly media: LocalMedia
  readonly policy: MediaEvidenceContext['postUploadPolicy']
  readonly scope: Parameters<MediaUploadQueuePort['enqueue']>[0]['scope']
  readonly queue?: MediaUploadQueuePort
  readonly upload?: UploadPort
  readonly location?: LocationPort
  readonly stillCurrent: () => boolean
  readonly onTask: (task: MediaUploadTask) => void
}): Promise<DispatchSelectedActionMediaResult> {
  if (!input.stillCurrent()) return { state: 'stale' }
  let location: MediaEvidenceContext['location'] | undefined
  if (input.policy === 'remote_location_watermark' && input.location) {
    const captured = await input.location.captureCurrentLocation()
    if (!input.stillCurrent()) return { state: 'stale' }
    if (captured.state === 'granted' && captured.value) location = captured.value
  }
  const evidence: MediaEvidenceContext = {
    ...(input.media.capturedAt ? { capturedAt: input.media.capturedAt } : {}),
    postUploadPolicy: input.policy,
    ...(location ? { location } : {}),
  }
  if (input.queue) {
    const failQueue = (result: OperationSnapshot<MediaUploadTask>): DispatchSelectedActionMediaResult => {
      if (result.data) input.onTask(result.data)
      const error = result.error ?? createOperationError('network_retryable', 'Media upload failed')
      return { state: 'failed', source: 'queue', error, retryable: Boolean(error.retryable),
        result: result.state === 'succeeded'
          ? { state: 'failed_terminal', error }
          : result as OperationSnapshot<void> }
    }
    const queued = await input.queue.enqueue({ scope: input.scope, media: input.media, evidence })
    if (!input.stillCurrent()) return { state: 'stale' }
    if (queued.state !== 'succeeded' || !queued.data) return failQueue(queued)
    input.onTask(queued.data)
    const processed = await input.queue.process(queued.data.taskId)
    if (!input.stillCurrent()) return { state: 'stale' }
    if (processed.data) input.onTask(processed.data)
    if (processed.state !== 'succeeded' || !processed.data?.uploadedRef) return failQueue(processed)
    return { state: 'uploaded', uploaded: processed.data.uploadedRef }
  }
  if (!input.upload) {
    const error = createOperationError('unsupported_capability', 'Media upload is unavailable')
    return { state: 'failed', source: 'direct', error, retryable: false,
      result: { state: 'failed_terminal', error } }
  }
  const result = await input.upload.upload(input.media)
  if (!input.stillCurrent()) return { state: 'stale' }
  if (result.state !== 'succeeded' || !result.data) {
    const error = result.error ?? createOperationError('network_retryable', 'Media upload failed')
    return { state: 'failed', source: 'direct', error,
      // Preserve the old Store UX: use transport retryability, not the fallback.
      retryable: Boolean(result.error?.retryable),
      result: result.state === 'succeeded'
        ? { state: 'failed_terminal', error }
        : result as OperationSnapshot<void> }
  }
  return { state: 'uploaded', uploaded: result.data }
}
