import type { LocalMediaRef } from './identifiers'

export type MediaSource = 'camera' | 'library' | 'file'
export type UploadState = 'pending' | 'uploading' | 'uploaded' | 'failed'

export interface LocalMedia {
  readonly ref: LocalMediaRef
  readonly mimeType: string
  readonly source: MediaSource
  readonly name?: string
  readonly size?: number
  readonly capturedAt?: string
}

export interface UploadedMediaRef {
  readonly url: string
  readonly key?: string
  readonly mimeType?: string
  readonly source: MediaSource
  readonly uploadState: Extract<UploadState, 'uploaded'>
}
