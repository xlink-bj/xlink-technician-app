import type { UploadPort } from '@shared/ports'
import type { LocalMedia, OperationSnapshot, UploadedMediaRef } from '@shared/types'

import { adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'
import { asRecord, optionalString, requiredString } from '../common/records'

export interface UploadTokenDriver {
  issueToken(media: LocalMedia): Promise<unknown>
}

export interface MediaUploadDriver {
  /** The provider only receives the opaque upload token; response identity is normalized below. */
  upload(input: { readonly media: LocalMedia; readonly token: string }): Promise<unknown>
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

function tokenFromResponse(raw: unknown): UploadToken {
  const record = asRecord(raw, 'upload token response')
  const objectKey = optionalString(record, ['key', 'fileKey', 'objectKey'])
  const downloadUrl = optionalString(record, ['url', 'downloadUrl', 'publicUrl'])
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
  const key = optionalString(record, ['key', 'fileKey', 'objectKey']) ?? token.objectKey
  const url = optionalString(record, ['url', 'downloadUrl', 'publicUrl']) ?? token.downloadUrl
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
      const result = await this.uploadDriver.upload({ media, token: token.token })
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
