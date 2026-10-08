import type { ApiCommandTransport } from '@adapters/api/technician-api-commands'
import { isBusinessMockMode } from '@adapters/api/mock'
import type { UploadPort } from '@shared/ports'
import { createOperationError, type LocalMedia, type OperationSnapshot, type UploadedMediaRef } from '@shared/types'
import { isProductionReadOnlyTarget } from '@shared/config'

import { createUploadAdapter, type MediaUploadDriver, type UploadTokenDriver } from './upload-adapter'

interface UniUploadResult {
  readonly statusCode?: number
  readonly data?: unknown
}

interface UniUploadOptions {
  readonly url: string
  readonly filePath: string
  readonly name: string
  readonly formData?: Readonly<Record<string, string>>
  readonly success: (result: UniUploadResult) => void
  readonly fail: (error: unknown) => void
}

type UniUploadFile = (options: UniUploadOptions) => unknown

function defaultUploadFile(options: UniUploadOptions): unknown {
  const driver = (typeof uni === 'undefined' ? undefined : uni) as unknown as { uploadFile?: UniUploadFile }
  if (!driver.uploadFile) throw new Error('file upload is unavailable')
  return driver.uploadFile(options)
}

function parseUploadResponse(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      // The shared UploadAdapter converts the malformed response into a safe failure.
    }
  }
  return {}
}

function fileNameFor(media: LocalMedia): string {
  const supplied = media.name?.trim().split('/').pop()
  if (supplied) return supplied
  const extension = media.mimeType.split('/')[1]?.toLowerCase() === 'jpeg'
    ? 'jpg'
    : media.mimeType.split('/')[1]?.toLowerCase() ?? 'bin'
  return `upload.${extension}`
}

function uploadFile(
  upload: UniUploadFile,
  media: LocalMedia,
  token: string,
): Promise<unknown> {
  const filePath = media.localPath
  if (!filePath) return Promise.reject(new Error('selected media has no online upload path'))
  return new Promise((resolve, reject) => {
    try {
      upload({
        url: 'https://up-z1.qiniup.com',
        filePath,
        name: 'file',
        formData: { token },
        success: (result) => {
          if (typeof result.statusCode === 'number' && (result.statusCode < 200 || result.statusCode >= 300)) {
            reject(new Error(`upload returned HTTP ${result.statusCode}`))
            return
          }
          resolve(parseUploadResponse(result.data))
        },
        fail: reject,
      })
    } catch (error) {
      reject(error)
    }
  })
}

function mockUploadResponse(media: LocalMedia): Record<string, string> {
  const key = `mock-upload/${encodeURIComponent(String(media.ref))}`
  return {
    key,
    url: `https://mock-upload.invalid/${key}`,
  }
}

/**
 * Creates the existing token -> provider upload bridge for MP/App. Platform
 * file APIs stay here; Action Content only receives normalized UploadedMediaRef.
 */
export function createUniUploadPort(
  commandTransport: ApiCommandTransport,
  upload: UniUploadFile = defaultUploadFile,
): UploadPort {
  const adapter = createUploadAdapter(
    {
      issueToken: (media) => commandTransport.execute({
        method: 'POST',
        path: 'back/super/file/upToken.do',
        body: { fileName: fileNameFor(media) },
      }).then((response) => {
        const record = typeof response === 'object' && response !== null && !Array.isArray(response)
          ? response as Record<string, unknown>
          : undefined
        const key = record?.key ?? record?.fileKey ?? record?.objectKey
        const baseUrl = import.meta.env.VITE_XLINK_MEDIA_DOWNLOAD_BASE_URL
        if (!record || typeof key !== 'string' || typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
          return response
        }
        return {
          ...record,
          downloadUrl: `${baseUrl.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`,
        }
      }),
    },
    {
      upload: async ({ media, token }) => {
        if (isBusinessMockMode() !== 'off') return mockUploadResponse(media)
        return uploadFile(upload, media, token)
      },
    },
  )

  return {
    async upload(media: LocalMedia): Promise<OperationSnapshot<UploadedMediaRef>> {
      if (
        isProductionReadOnlyTarget(
          import.meta.env.VITE_XLINK_ENVIRONMENT,
          import.meta.env.VITE_XLINK_API_BASE_URL,
        )
        || (isBusinessMockMode() === 'off' && import.meta.env.VITE_XLINK_ENABLE_REAL_WRITES !== 'true')
      ) {
        return {
          state: 'failed_terminal',
          error: createOperationError('unsupported_capability', 'Real media upload is disabled for this build'),
        }
      }
      return adapter.upload(media)
    },
  }
}
