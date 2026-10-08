import type { AuthBackendDriver, AuthBackendLoginRequest } from './auth-session-adapter'
import { AuthTransportError } from './auth-session-adapter'
import { isProductionReadOnlyTarget } from '@shared/config'

export type UniRequestExecutor = (options: UniNamespace.RequestOptions) => unknown

export interface UniAuthBackendOptions {
  readonly apiBaseUrl: string
  readonly request?: UniRequestExecutor
  readonly timeoutMs?: number
}

function endpointUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function wireForm(body: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => {
      // AuthSessionAdapter keeps tenant semantic inside the adapter boundary;
      // R1's phoneLogin endpoint names the actual wire field tenantId.
      const wireKey = key === 'tenant' ? 'tenantId' : key
      return [wireKey, value]
    }),
  )
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
    if (isProductionReadOnlyTarget(import.meta.env.VITE_XLINK_ENVIRONMENT, options.apiBaseUrl)) {
      throw new AuthTransportError(
        'Production login is disabled because the backend login path persists account permission context',
        false,
      )
    }

    let response: UniNamespace.RequestSuccessCallbackResult
    try {
      response = await requestResponse(request, {
        url: endpointUrl(options.apiBaseUrl, input.path),
        method: 'POST',
        // Keep the request shape identical to the verified consumer/R1 call:
        // uni/wx serializes the object according to the form content type.
        data: wireForm(input.body),
        header: { 'Content-Type': 'application/x-www-form-urlencoded' },
        dataType: 'json',
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
