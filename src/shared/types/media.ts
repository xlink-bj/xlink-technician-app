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
