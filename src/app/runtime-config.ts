import type { AuthWireConfig } from '@adapters/auth/auth-session-adapter'
import {
  parseEnvironmentConfig,
  type EnvironmentConfig,
} from '@shared/config'

export interface ApplicationRuntimeConfig {
  readonly environment: EnvironmentConfig
  readonly authWireConfig: AuthWireConfig
}

export type ApplicationRuntimeConfigResult =
  | { readonly ok: true; readonly value: ApplicationRuntimeConfig }
  | { readonly ok: false; readonly issues: readonly string[] }

function requiredValue(input: Record<string, unknown>, key: string, issues: string[]): string | undefined {
  const value = input[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${key} is required at runtime`)
    return undefined
  }
  return value
}

export function loadApplicationRuntimeConfig(
  input: Record<string, unknown> = import.meta.env,
): ApplicationRuntimeConfigResult {
  const environment = parseEnvironmentConfig({
    environment: input.VITE_XLINK_ENVIRONMENT,
    platform: input.VITE_XLINK_PLATFORM,
    apiBaseUrl: input.VITE_XLINK_API_BASE_URL,
    flags: {},
  })
  const issues = environment.ok ? [] : [...environment.issues]
  const tenant = requiredValue(input, 'VITE_XLINK_AUTH_TENANT', issues)
  const phoneLoginMethod = requiredValue(input, 'VITE_XLINK_AUTH_METHOD', issues)

  if (!environment.ok || !tenant || !phoneLoginMethod) return { ok: false, issues }

  return {
    ok: true,
    value: {
      environment: environment.value,
      authWireConfig: { tenant, phoneLoginMethod },
    },
  }
}
