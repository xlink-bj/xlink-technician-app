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
 * Resolves the R2-style developer convenience without changing the semantic
 * AuthStartRequest. It is deliberately unavailable in production and does
 * not provide a fallback phone number.
 */
export function resolveQuickLoginInput(
  input: RuntimeInput = {
    VITE_XLINK_ENVIRONMENT: import.meta.env.VITE_XLINK_ENVIRONMENT,
    VITE_XLINK_QUICK_LOGIN_PHONE: import.meta.env.VITE_XLINK_QUICK_LOGIN_PHONE,
    VITE_XLINK_QUICK_LOGIN_CODE: import.meta.env.VITE_XLINK_QUICK_LOGIN_CODE,
  },
): QuickLoginInput | null {
  const environment = optionalString(input, 'VITE_XLINK_ENVIRONMENT')
  if (!environment || environment === 'prod') return null

  const phoneNumber = optionalString(input, 'VITE_XLINK_QUICK_LOGIN_PHONE')
  if (!phoneNumber) return null

  return {
    phoneNumber,
    // R1/R2 evidence establishes 999999 as the non-production test code;
    // local configuration may override it without changing the Auth port.
    verificationCode: optionalString(input, 'VITE_XLINK_QUICK_LOGIN_CODE') ?? '999999',
  }
}
