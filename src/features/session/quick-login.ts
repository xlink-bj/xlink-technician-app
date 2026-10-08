export interface QuickLoginInput {
  readonly phoneNumber: string
  readonly verificationCode: string
}

type RuntimeInput = Record<string, unknown>

function optionalString(input: RuntimeInput, key: string): string | undefined {
  const value = input[key]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

/**
 * Resolves the R2-style local convenience without changing AuthStartRequest.
 * Production credentials are available only to a local dev server and are
 * stripped from Production builds. The established 999999 quick-login code
 * remains a local convenience; backend source confirms that exact fallback.
 */
export function resolveQuickLoginInput(
  input: RuntimeInput = {
    VITE_XLINK_ENVIRONMENT: import.meta.env.VITE_XLINK_ENVIRONMENT,
    VITE_XLINK_QUICK_LOGIN_PHONE: import.meta.env.VITE_XLINK_QUICK_LOGIN_PHONE,
    VITE_XLINK_QUICK_LOGIN_CODE: import.meta.env.VITE_XLINK_QUICK_LOGIN_CODE,
    VITE_XLINK_LOCAL_DEV: import.meta.env.DEV ? 'true' : 'false',
  },
): QuickLoginInput | null {
  const environment = optionalString(input, 'VITE_XLINK_ENVIRONMENT')
  const localDev = optionalString(input, 'VITE_XLINK_LOCAL_DEV') === 'true'
  if (!environment || (environment === 'prod' && !localDev)) return null

  const phoneNumber = optionalString(input, 'VITE_XLINK_QUICK_LOGIN_PHONE')
  if (!phoneNumber) return null

  const configuredCode = optionalString(input, 'VITE_XLINK_QUICK_LOGIN_CODE')

  return {
    phoneNumber,
    // Production can use this fallback only in a local dev server.
    verificationCode: configuredCode ?? '999999',
  }
}
