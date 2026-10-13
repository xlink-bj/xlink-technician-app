import type { SessionRef } from '@shared/types'
import { isProductionReadOnlyTarget } from '@shared/config'

import {
  ApiCommandTransportError,
  normalizeCommandResponse,
  type ApiCommandRequest,
  type ApiCommandTransport,
} from './technician-api-commands'
import {
  isMockOwnedCommand,
  tryMockCommand,
} from './mock'

export type UniApiCommandRequestExecutor = (options: UniNamespace.RequestOptions) => unknown

export interface UniApiCommandTransportOptions {
  readonly apiBaseUrl: string
  readonly getSessionRef: () => SessionRef | null
  readonly request?: UniApiCommandRequestExecutor
  readonly timeoutMs?: number
  /** Auth-only Production login never authorizes a live business command/upload. */
  readonly blockRealRequests?: boolean
}

function endpointUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function formEncode(body: Readonly<Record<string, string | number | boolean>>): string {
  return Object.entries(body)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

function defaultRequest(options: UniNamespace.RequestOptions): unknown {
  return uni.request(options)
}

function requestResponse(
  request: UniApiCommandRequestExecutor,
  options: UniNamespace.RequestOptions,
): Promise<UniNamespace.RequestSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    try {
      request({ ...options, success: resolve, fail: reject })
    } catch (error) {
      reject(error)
    }
  })
}

function statusCategory(
  statusCode: number,
): 'session_invalid' | 'authorization_denied' | 'network_retryable' | 'server_terminal' {
  if (statusCode === 401) return 'session_invalid'
  if (statusCode === 403) return 'authorization_denied'
  if (statusCode === 0 || statusCode >= 500) return 'network_retryable'
  return 'server_terminal'
}

function isRealMutationPath(path: string): boolean {
  const route = path.replace(/^\/+/, '').split('?')[0]
  return route === 'workflow/process'
    || route.startsWith('biz/extForm/upsert/')
    || route === 'basic/order/upsert'
    || /^workflow\/startWorkflow\/order\/null\/[^/]+$/.test(route)
}

/**
 * Independent hard stop for all Contract/Signing COMMAND routes.
 * Generic VITE_XLINK_ENABLE_REAL_WRITES does not approve legally binding
 * signatures, SMS notifications, cancellation, or external provider calls.
 * Only a separate, explicitly reviewed implementation can lift this fence.
 */
export function isUnapprovedR1SigningCommandPath(path: string): boolean {
  let route = path.split(/[?#]/)[0] ?? ''
  try { route = decodeURIComponent(route) } catch { return true }
  while (route.startsWith('/')) route = route.slice(1)
  return route.startsWith('signature/')
    || route === 'basic/contract/remove'
    || route === 'basic/contract/upsert'
    || route === 'basic/contract/getSignatureUrl'
}

export function createUniApiCommandTransport(options: UniApiCommandTransportOptions): ApiCommandTransport {
  const request = options.request ?? defaultRequest

  return {
    async execute(input: ApiCommandRequest): Promise<unknown> {
      if (isUnapprovedR1SigningCommandPath(input.path)) {
        throw new ApiCommandTransportError(
          'Contract signing, notification and cancellation commands require a separate business authorization gate',
          'unsupported_capability',
        )
      }
      const sessionRef = options.getSessionRef()
      if (!sessionRef) {
        throw new ApiCommandTransportError('Authenticated session is required for API commands', 'session_invalid')
      }

      const mockResponse = await tryMockCommand(input.path, input.body ?? {})
      if (mockResponse !== null) return normalizeCommandResponse(mockResponse)
      if (isMockOwnedCommand(input.path, input.body ?? {})) {
        throw new ApiCommandTransportError('Synthetic mock command is disabled', 'server_terminal')
      }
      if (options.blockRealRequests === true) {
        throw new ApiCommandTransportError(
          'Authenticated Mock-only development mode blocks all real business commands and uploads',
          'unsupported_capability',
        )
      }
      if (isProductionReadOnlyTarget(import.meta.env.VITE_XLINK_ENVIRONMENT, options.apiBaseUrl)) {
        throw new ApiCommandTransportError(
          'Production read-only mode blocks all command execution',
          'unsupported_capability',
        )
      }
      if (input.safety === 'deferred_appointment_datetime_encoding_unknown') {
        throw new ApiCommandTransportError(
          'Deferred appointment datetime encoding is not verified for Real API',
          'unsupported_capability',
        )
      }
      if (isRealMutationPath(input.path) && import.meta.env.VITE_XLINK_ENABLE_REAL_WRITES !== 'true') {
        throw new ApiCommandTransportError(
          'Real command writes are disabled for this build',
          'unsupported_capability',
        )
      }

      let response: UniNamespace.RequestSuccessCallbackResult
      try {
        response = await requestResponse(request, {
          url: endpointUrl(options.apiBaseUrl, input.path),
          method: input.method,
          data: formEncode(input.body ?? {}),
          header: {
            Cookie: `JSESSIONID=${sessionRef}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          dataType: 'json',
          ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
        })
      } catch (error) {
        throw new ApiCommandTransportError(
          error instanceof Error ? error.message : 'API command request failed',
          'network_retryable',
        )
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new ApiCommandTransportError(
          `API command request returned HTTP ${response.statusCode}`,
          statusCategory(response.statusCode),
        )
      }

      return normalizeCommandResponse(response.data)
    },
  }
}
