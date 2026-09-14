import type { SessionRef } from '@shared/types'

import {
  ApiReadTransportError,
  type ApiReadRequest,
  type ApiReadTransport,
} from './technician-api'
import { isMockOwnedRead, tryMockRead } from './mock'

export type UniApiRequestExecutor = (options: UniNamespace.RequestOptions) => unknown

export interface UniApiReadTransportOptions {
  readonly apiBaseUrl: string
  readonly getSessionRef: () => SessionRef | null
  readonly request?: UniApiRequestExecutor
  readonly timeoutMs?: number
  readonly mockLatencyMs?: number
}

function endpointUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function formEncode(body: Readonly<Record<string, string | number | boolean>>): string {
  return Object.entries(body)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

function queryEncode(query: Readonly<Record<string, string>> | undefined): string {
  if (!query) return ''
  const encoded = Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  return encoded.length > 0 ? `?${encoded}` : ''
}

function defaultRequest(options: UniNamespace.RequestOptions): unknown {
  return uni.request(options)
}

function requestResponse(
  request: UniApiRequestExecutor,
  options: UniNamespace.RequestOptions,
): Promise<UniNamespace.RequestSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    try {
      request({
        ...options,
        success: resolve,
        fail: reject,
      })
    } catch (error) {
      reject(error)
    }
  })
}

function isSuccessStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300
}

function errorCategoryForStatus(
  statusCode: number,
): 'session_invalid' | 'authorization_denied' | 'network_retryable' | 'server_terminal' {
  if (statusCode === 401) return 'session_invalid'
  if (statusCode === 403) return 'authorization_denied'
  if (statusCode === 0 || statusCode >= 500) return 'network_retryable'
  return 'server_terminal'
}

export function createUniApiReadTransport(options: UniApiReadTransportOptions): ApiReadTransport {
  const request = options.request ?? defaultRequest

  return {
    async execute(input: ApiReadRequest): Promise<unknown> {
      const sessionRef = options.getSessionRef()
      if (!sessionRef) {
        throw new ApiReadTransportError('Authenticated session is required for API reads', 'session_invalid')
      }

      const mockResponse = await tryMockRead(
        input.path,
        input.body ?? input.query ?? {},
        options.mockLatencyMs === undefined ? {} : { latencyMs: options.mockLatencyMs },
      )
      if (mockResponse !== null) return mockResponse
      if (isMockOwnedRead(input.path, input.body ?? input.query ?? {})) {
        throw new ApiReadTransportError('Synthetic mock read is disabled', 'server_terminal')
      }

      const header: Record<string, string> = {
        Cookie: `JSESSIONID=${sessionRef}`,
      }
      if (input.method === 'POST') header['Content-Type'] = 'application/x-www-form-urlencoded'

      let response: UniNamespace.RequestSuccessCallbackResult
      try {
        response = await requestResponse(request, {
          url: `${endpointUrl(options.apiBaseUrl, input.path)}${queryEncode(input.query)}`,
          method: input.method,
          ...(input.method === 'POST' ? { data: formEncode(input.body ?? {}) } : {}),
          header,
          dataType: 'json',
          ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
        })
      } catch (error) {
        throw new ApiReadTransportError(
          error instanceof Error ? error.message : 'API read request failed',
          'network_retryable',
        )
      }

      if (!isSuccessStatus(response.statusCode)) {
        throw new ApiReadTransportError(
          `API read request returned HTTP ${response.statusCode}`,
          errorCategoryForStatus(response.statusCode),
        )
      }

      return response.data
    },
  }
}
