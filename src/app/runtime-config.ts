import type { AuthWireConfig } from '@adapters/auth/auth-session-adapter'
import {
  parseEnvironmentConfig,
  isProductionApiHost,
  type EnvironmentConfig,
} from '@shared/config'

export interface ApplicationRuntimeConfig {
  readonly environment: EnvironmentConfig
  readonly authWireConfig: AuthWireConfig
  /** Separate source-verified Production phone-login host, never a business API target. */
  readonly authApiBaseUrl: string
  /** DEV-only: absolutely no real business read/write/upload network fallback. */
  readonly authOnlyMockBusiness: boolean
  /** Credential-free QA of the real DEV main App, never enabled in release builds. */
  readonly devMockUxSession: boolean
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
  // Use this optional override only for the known Production phone-login host
  // in a local Vite development server. Business adapters retain the ordinary
  // environment API URL and are strictly network-denied in this hybrid mode.
  const authOverride = input.VITE_XLINK_AUTH_API_BASE_URL
  const hasAuthOverride = authOverride !== undefined && authOverride !== ''
  const mockQaRequested = input.VITE_XLINK_H5_MOCK_E2E === 'true'
  const devMockUxSession = mockQaRequested
    && input.DEV === true
    && environment.ok
    && environment.value.environment === 'dev'
    && environment.value.apiBaseUrl === 'https://example.invalid'
    && input.VITE_XLINK_MOCK === 'true'
    && !hasAuthOverride
    && input.VITE_XLINK_ENABLE_REAL_WRITES !== 'true'
  if (mockQaRequested && !devMockUxSession) {
    issues.push('Credential-free Mock UX requires isolated local DEV, inert business host, enabled Mock, disabled writes and no auth override')
  }
  if (hasAuthOverride && (
    typeof authOverride !== 'string'
    || !/^https:\/\//i.test(authOverride)
    || !isProductionApiHost(authOverride)
    || input.DEV !== true
    || !environment.ok
    || environment.value.environment === 'prod'
  )) {
    issues.push('VITE_XLINK_AUTH_API_BASE_URL requires local DEV, a non-production business environment and the known HTTPS Production login host')
  }

  if (!environment.ok || !tenant || !phoneLoginMethod || issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    value: {
      environment: environment.value,
      authWireConfig: { tenant, phoneLoginMethod },
      authApiBaseUrl: hasAuthOverride ? authOverride as string : environment.value.apiBaseUrl,
      authOnlyMockBusiness: hasAuthOverride || devMockUxSession,
      devMockUxSession,
    },
  }
}
