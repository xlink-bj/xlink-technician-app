import type { LocalMediaRef } from './identifiers'

export type MediaSource = 'camera' | 'library' | 'file'
export type UploadState = 'pending' | 'uploading' | 'uploaded' | 'failed'

export interface LocalMedia {
  readonly ref: LocalMediaRef
  readonly mimeType: string
  readonly source: MediaSource
  /** Ephemeral platform path used only by the online upload adapter. */
  readonly localPath?: string
  readonly name?: string
  readonly size?: number
  readonly capturedAt?: string
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
 * The persisted Survey media shape.  This is intentionally separate from
 * UploadedMediaRef: local/upload lifecycle metadata must never leak into
 * FormData values.
 */
export interface SurveyMediaRef {
  readonly url: string
  readonly objectKey?: string
  readonly fileName?: string
  readonly extension?: string
}

export function isSurveyMediaRef(value: unknown): value is SurveyMediaRef {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.url !== 'string' || record.url.trim().length === 0) return false
  return ['objectKey', 'fileName', 'extension'].every((key) => {
    const candidate = record[key]
    return candidate === undefined || (typeof candidate === 'string' && candidate.trim().length > 0)
  })
}

export function surveyMediaRefFromUpload(media: UploadedMediaRef): SurveyMediaRef {
  return {
    url: media.url,
    ...(media.key ? { objectKey: media.key } : {}),
    ...(media.fileName ? { fileName: media.fileName } : {}),
    ...(media.extension ? { extension: media.extension } : {}),
  }
}
