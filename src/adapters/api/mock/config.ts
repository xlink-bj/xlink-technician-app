import type { EnvironmentName } from '@shared/config'

export const businessMockStorageKey = 'xlink_technician_business_mock_enabled'

type MockEnvironment = EnvironmentName | 'unknown'

interface MockStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: boolean): unknown
}

let cachedFlag: boolean | null = null

function environmentFromBuild(): MockEnvironment {
  const value = import.meta.env.VITE_XLINK_ENVIRONMENT
  if (value === 'dev' || value === 'test' || value === 'staging' || value === 'prod') return value
  return 'unknown'
}

function isMockAllowed(environment: MockEnvironment): boolean {
  return environment !== 'unknown' && environment !== 'prod'
}

function buildMockFlag(): boolean {
  return import.meta.env.VITE_XLINK_MOCK === 'true'
}

function platformStorage(): MockStorage | null {
  if (typeof uni === 'undefined') return null
  return uni as unknown as MockStorage
}

function readStoredFlag(): boolean | undefined {
  try {
    const value = platformStorage()?.getStorageSync(businessMockStorageKey)
    return value === true || value === false ? value : undefined
  } catch {
    return undefined
  }
}

function persistFlag(value: boolean): void {
  try {
    platformStorage()?.setStorageSync(businessMockStorageKey, value)
  } catch {
    // Storage is an optional developer convenience. The in-memory cache remains authoritative.
  }
}

export interface ResolveBusinessMockInput {
  readonly environment: MockEnvironment
  readonly storageValue?: boolean
  readonly buildEnabled?: boolean
}

export function resolveBusinessMockEnabled(input: ResolveBusinessMockInput): boolean {
  if (!isMockAllowed(input.environment)) return false
  if (input.storageValue !== undefined) return input.storageValue
  return input.buildEnabled === true
}

export function isBusinessMockDeveloperModeAvailable(): boolean {
  return isMockAllowed(environmentFromBuild())
}

export function isBusinessMockEnabled(): boolean {
  const environment = environmentFromBuild()
  if (!isMockAllowed(environment)) {
    cachedFlag = false
    return false
  }
  if (cachedFlag !== null) return cachedFlag

  cachedFlag = resolveBusinessMockEnabled({
    environment,
    storageValue: readStoredFlag(),
    buildEnabled: buildMockFlag(),
  })
  return cachedFlag
}

export function setBusinessMockEnabled(enabled: boolean): void {
  if (!isBusinessMockDeveloperModeAvailable()) {
    cachedFlag = false
    return
  }
  cachedFlag = enabled
  persistFlag(enabled)
}

export function resetBusinessMockCache(): void {
  cachedFlag = null
}
