export const environmentNames = ['dev', 'test', 'staging', 'prod'] as const
export const targetPlatforms = ['mp-weixin', 'android', 'ios'] as const

export type EnvironmentName = (typeof environmentNames)[number]
export type TargetPlatform = (typeof targetPlatforms)[number]

export interface EnvironmentConfig {
  readonly environment: EnvironmentName
  readonly platform: TargetPlatform
  readonly apiBaseUrl: string
  readonly flags: Readonly<Record<string, boolean>>
}

export type EnvironmentConfigResult =
  | { readonly ok: true; readonly value: EnvironmentConfig }
  | { readonly ok: false; readonly issues: readonly string[] }

const secretKeys = new Set(['apiKey', 'password', 'secret', 'token'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEnvironmentName(value: unknown): value is EnvironmentName {
  return typeof value === 'string' && environmentNames.includes(value as EnvironmentName)
}

function isTargetPlatform(value: unknown): value is TargetPlatform {
  return typeof value === 'string' && targetPlatforms.includes(value as TargetPlatform)
}

export function parseEnvironmentConfig(input: unknown): EnvironmentConfigResult {
  if (!isRecord(input)) {
    return { ok: false, issues: ['configuration must be an object'] }
  }

  const issues: string[] = []
  for (const key of Object.keys(input)) {
    if (secretKeys.has(key)) issues.push(`secret field is not allowed: ${key}`)
  }

  if (!isEnvironmentName(input.environment)) issues.push('environment is invalid')
  if (!isTargetPlatform(input.platform)) issues.push('platform is invalid')

  if (typeof input.apiBaseUrl !== 'string' || input.apiBaseUrl.trim().length === 0) {
    issues.push('apiBaseUrl is required')
  } else {
    try {
      const parsed = new URL(input.apiBaseUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        issues.push('apiBaseUrl must use http or https')
      }
    } catch {
      issues.push('apiBaseUrl must be a valid URL')
    }
  }

  const flags = input.flags ?? {}
  if (!isRecord(flags) || Object.values(flags).some((value) => typeof value !== 'boolean')) {
    issues.push('flags must contain boolean values')
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    value: {
      environment: input.environment as EnvironmentName,
      platform: input.platform as TargetPlatform,
      apiBaseUrl: input.apiBaseUrl as string,
      flags: flags as Readonly<Record<string, boolean>>,
    },
  }
}
