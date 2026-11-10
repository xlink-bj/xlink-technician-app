import type { UploadPort } from '@shared/ports'
import type { LocalMedia, OperationSnapshot, UploadedMediaRef } from '@shared/types'

import { adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'
import { asRecord, requiredString } from '../common/records'

export interface UploadTokenDriver {
  issueToken(media: LocalMedia): Promise<unknown>
}

export interface MediaUploadDriver {
  /** Keep the credential opaque; the issued object key is a separate provider form field. */
  upload(input: {
    readonly media: LocalMedia
    readonly token: string
    readonly objectKey?: string
  }): Promise<unknown>
}

export class RetryableUploadError extends Error {
  constructor(message = 'Upload transport is retryable') {
    super(message)
    this.name = 'RetryableUploadError'
  }
}

interface UploadToken {
  readonly token: string
  readonly objectKey?: string
  readonly downloadUrl?: string
}

// Upload identities are strings, not coercible record IDs. Validate every
// supplied alias so a malformed/conflicting alias cannot hide behind another.
function uploadObjectKey(record: Record<string, unknown>): string | undefined {
  let key: string | undefined
  for (const alias of ['key', 'fileKey', 'objectKey']) {
    const value = record[alias]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('upload object key is malformed')
    }
    if (key !== undefined && key !== value) throw new Error('upload object key aliases conflict')
    key = value
  }
  return key
}

function uploadUrl(record: Record<string, unknown>): string | undefined {
  for (const alias of ['url', 'downloadUrl', 'publicUrl']) {
    const value = record[alias]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('uploaded media URL is malformed')
    }
    return value
  }
  return undefined
}

function tokenFromResponse(raw: unknown): UploadToken {
  const record = asRecord(raw, 'upload token response')
  const objectKey = uploadObjectKey(record)
  const downloadUrl = uploadUrl(record)
  return {
    token: requiredString(record, ['token', 'uploadToken'], 'upload token'),
    ...(objectKey ? { objectKey } : {}),
    ...(downloadUrl ? { downloadUrl } : {}),
  }
}

function extensionFor(media: LocalMedia): string | undefined {
  const name = media.name?.trim()
  return name && name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined
}

function uploadedRefFromResponse(raw: unknown, media: LocalMedia, token: UploadToken): UploadedMediaRef {
  const record = asRecord(raw, 'upload response')
  // Token metadata is not evidence that the provider accepted the upload.
  if (record.error !== undefined) throw new Error('upload provider reported an error')
  const key = uploadObjectKey(record)
  if (!key) throw new Error('uploaded object key is missing')
  if (token.objectKey !== undefined && key !== token.objectKey) {
    throw new Error('uploaded object key does not match the issued key')
  }
  // A token URL (possibly signed) is safe to reuse only after identity agrees.
  const url = uploadUrl(record) ?? (token.objectKey === key ? token.downloadUrl : undefined)
  if (!url) throw new Error('uploaded media URL is unavailable; configure the media download base URL')
  const extension = extensionFor(media)
  return {
    url,
    ...(key ? { key } : {}),
    ...(media.name ? { fileName: media.name } : {}),
    ...(extension ? { extension } : {}),
    mimeType: media.mimeType,
    source: media.source,
    uploadState: 'uploaded',
  }
}

export class UploadAdapter implements UploadPort {
  constructor(
    private readonly tokenDriver: UploadTokenDriver,
    private readonly uploadDriver: MediaUploadDriver,
  ) {}

  async upload(media: LocalMedia): Promise<OperationSnapshot<UploadedMediaRef>> {
    try {
      const token = tokenFromResponse(await this.tokenDriver.issueToken(media))
      const result = await this.uploadDriver.upload({
        media,
        token: token.token,
        ...(token.objectKey !== undefined ? { objectKey: token.objectKey } : {}),
      })
      return succeeded(uploadedRefFromResponse(result, media, token))
    } catch (error) {
      if (error instanceof RetryableUploadError) {
        return adapterFailure('network_retryable', error.message)
      }
      return adapterFailure('server_terminal', unknownErrorMessage(error, 'Upload failed'))
    }
  }
}

export function createUploadAdapter(
  tokenDriver: UploadTokenDriver,
  uploadDriver: MediaUploadDriver,
): UploadPort {
  return new UploadAdapter(tokenDriver, uploadDriver)
}
