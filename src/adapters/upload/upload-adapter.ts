import type { UploadPort } from '@shared/ports'
import type { LocalMedia, OperationSnapshot, UploadedMediaRef } from '@shared/types'

import { adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'
import { asRecord, optionalString, requiredString } from '../common/records'

export interface UploadTokenDriver {
  issueToken(media: LocalMedia): Promise<unknown>
}

export interface MediaUploadDriver {
  upload(input: { readonly media: LocalMedia; readonly token: string }): Promise<unknown>
}

export class RetryableUploadError extends Error {
  constructor(message = 'Upload transport is retryable') {
    super(message)
    this.name = 'RetryableUploadError'
  }
}

function tokenFromResponse(raw: unknown): string {
  const record = asRecord(raw, 'upload token response')
  return requiredString(record, ['token', 'uploadToken'], 'upload token')
}

function uploadedRefFromResponse(raw: unknown, media: LocalMedia): UploadedMediaRef {
  const record = asRecord(raw, 'upload response')
  const url = requiredString(record, ['url', 'downloadUrl', 'publicUrl'], 'uploaded media URL')
  const key = optionalString(record, ['key', 'fileKey', 'objectKey'])
  return {
    url,
    ...(key ? { key } : {}),
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
      const result = await this.uploadDriver.upload({ media, token })
      return succeeded(uploadedRefFromResponse(result, media))
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
