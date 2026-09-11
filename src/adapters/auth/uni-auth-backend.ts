import type { AuthBackendDriver, AuthBackendLoginRequest } from './auth-session-adapter'
import { AuthTransportError } from './auth-session-adapter'

export type UniRequestExecutor = (options: UniNamespace.RequestOptions) => unknown

export interface UniAuthBackendOptions {
  readonly apiBaseUrl: string
  readonly request?: UniRequestExecutor
  readonly timeoutMs?: number
}

function endpointUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function formEncode(body: Readonly<Record<string, string>>): string {
  return Object.entries(body)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

function defaultRequest(options: UniNamespace.RequestOptions): unknown {
  return uni.request(options)
}

function requestResponse(
  request: UniRequestExecutor,
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

export function createUniAuthBackendDriver(options: UniAuthBackendOptions): AuthBackendDriver {
  const request = options.request ?? defaultRequest

  const login = async (input: AuthBackendLoginRequest): Promise<unknown> => {
    let response: UniNamespace.RequestSuccessCallbackResult
    try {
      response = await requestResponse(request, {
        url: endpointUrl(options.apiBaseUrl, input.path),
        method: 'POST',
        data: formEncode(input.body),
        header: { 'Content-Type': 'application/x-www-form-urlencoded' },
        dataType: 'json',
        responseType: 'json',
        ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      })
    } catch (error) {
      throw new AuthTransportError(
        error instanceof Error ? error.message : 'Authentication request failed',
        true,
      )
    }

    if (!isSuccessStatus(response.statusCode)) {
      throw new AuthTransportError(
        `Authentication request returned HTTP ${response.statusCode}`,
        response.statusCode >= 500 || response.statusCode === 0,
      )
    }

    return response.data
  }

  return {
    login,
    // Remote session revalidation is not established by accepted evidence.
    restore: async () => ({ valid: false, reason: 'remote session revalidation not configured' }),
    // Local session clearing is supported; no remote logout endpoint is invented here.
    logout: async () => ({ remoteLogout: 'not_configured' }),
  }
}
