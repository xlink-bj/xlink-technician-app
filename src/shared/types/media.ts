import type { LocalMediaRef } from './identifiers'

export type MediaSource = 'camera' | 'library' | 'file'
export type UploadState = 'pending' | 'uploading' | 'uploaded' | 'failed'

export interface LocalMedia {
  readonly ref: LocalMediaRef
  readonly mimeType: string
  readonly source: MediaSource
  /** Platform file path; a DurableMediaStorePort must persist it before queue upload. */
  readonly localPath?: string
  readonly name?: string
  readonly size?: number
  readonly capturedAt?: string
}

/** Location/evidence context is generic; business policies decide whether it is required. */
export interface MediaEvidenceContext {
  readonly capturedAt?: string
  readonly location?: {
    readonly latitude: number
    readonly longitude: number
    readonly coordinateSystem: 'gcj02'
    readonly capturedAt: string
    readonly accuracy?: number
    readonly address?: string
  }
  readonly preprocessPolicy?: 'none' | 'location_watermark'
}

export type MediaUploadTaskState =
  | 'queued'
  | 'preprocessing'
  | 'ready_to_upload'
  | 'uploading'
  | 'uploaded'
  | 'failed_retryable'
  | 'failed_terminal'

export interface MediaTaskScope {
  readonly userId: import('./identifiers').UserId
  readonly workOrderId: import('./identifiers').WorkOrderId
  readonly workflowNodeId: import('./identifiers').WorkflowNodeRuntimeId
  readonly formDefinitionId?: import('./identifiers').FormDefinitionId
  readonly formDataId?: import('./identifiers').FormDataId
  readonly fieldId: string
  readonly valueKey: string
  readonly localAssetId: LocalMediaRef
}

export interface DurableMediaAsset {
  readonly assetId: LocalMediaRef
  readonly media: LocalMedia
  readonly persistedAt: string
}

export interface MediaUploadTask {
  readonly schemaVersion: 1
  readonly taskId: import('./identifiers').MediaUploadTaskId
  readonly scope: MediaTaskScope
  readonly state: MediaUploadTaskState
  readonly attempts: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly evidence?: MediaEvidenceContext
  readonly uploadedRef?: UploadedMediaRef
  readonly lastError?: import('./operation').OperationError
}

export interface UploadedMediaRef {
  readonly url: string
  readonly key?: string
  readonly fileName?: string
  readonly extension?: string
  readonly mimeType?: string
  readonly source: MediaSource
  readonly uploadState: Extract<UploadState, 'uploaded'>
}

/**
 * Neutral media value carried by a form runtime. Business/form wire codecs
 * decide how this value is persisted; local/upload lifecycle metadata never
 * leaks into FormData values.
 */
export interface MediaValueRef {
  readonly url: string
  readonly objectKey?: string
  readonly fileName?: string
  readonly extension?: string
}

export function isMediaValueRef(value: unknown): value is MediaValueRef {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.url !== 'string' || record.url.trim().length === 0) return false
  const allowedKeys = new Set(['url', 'objectKey', 'fileName', 'extension'])
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return false
  return ['objectKey', 'fileName', 'extension'].every((key) => {
    const candidate = record[key]
    return candidate === undefined || (typeof candidate === 'string' && candidate.trim().length > 0)
  })
}

export function mediaValueRefFromUpload(media: UploadedMediaRef): MediaValueRef {
  return {
    url: media.url,
    ...(media.key ? { objectKey: media.key } : {}),
    ...(media.fileName ? { fileName: media.fileName } : {}),
    ...(media.extension ? { extension: media.extension } : {}),
  }
}
