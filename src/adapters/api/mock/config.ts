import type { EnvironmentName } from '@shared/config'

export const businessMockStorageKey = 'xlink_technician_business_mock_enabled'
export const businessMockModeStorageKey = 'xlink_technician_business_mock_mode'

export type BusinessMockMode = 'off' | 'data' | 'empty'
export type BusinessMockEnvironment = EnvironmentName | 'unknown'

interface MockStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): unknown
}

let cachedMode: BusinessMockMode | null = null

function environmentFromBuild(): BusinessMockEnvironment {
  const value = import.meta.env.VITE_XLINK_ENVIRONMENT
  if (value === 'dev' || value === 'test' || value === 'staging' || value === 'prod') return value
  return 'unknown'
}

function isMockAllowed(environment: BusinessMockEnvironment): boolean {
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

function readStoredMode(): BusinessMockMode | undefined {
  try {
    const value = platformStorage()?.getStorageSync(businessMockModeStorageKey)
    if (value === 'data' || value === 'empty' || value === 'off') return value
  } catch {
    return undefined
  }

  const legacyFlag = readStoredFlag()
  return legacyFlag === undefined ? undefined : legacyFlag ? 'data' : 'off'
}

function persistFlag(value: boolean): void {
  try {
    platformStorage()?.setStorageSync(businessMockStorageKey, value)
  } catch {
    // Storage is an optional developer convenience. The in-memory cache remains authoritative.
  }
}

export interface ResolveBusinessMockInput {
  readonly environment: BusinessMockEnvironment
  readonly storageMode?: BusinessMockMode
  readonly storageValue?: boolean
  readonly buildEnabled?: boolean
}

export function resolveBusinessMockMode(input: ResolveBusinessMockInput): BusinessMockMode {
  if (!isMockAllowed(input.environment)) return 'off'
  if (input.storageMode !== undefined) return input.storageMode
  if (input.storageValue !== undefined) return input.storageValue ? 'data' : 'off'
  return input.buildEnabled === true ? 'data' : 'off'
}

export function resolveBusinessMockEnabled(input: ResolveBusinessMockInput): boolean {
  return resolveBusinessMockMode(input) !== 'off'
}

export function isBusinessMockDeveloperModeAvailable(): boolean {
  return isMockAllowed(environmentFromBuild())
}

export function isBusinessMockEnabled(): boolean {
  return isBusinessMockMode() !== 'off'
}

export function isBusinessMockMode(): BusinessMockMode {
  const environment = environmentFromBuild()
  if (!isMockAllowed(environment)) {
    cachedMode = 'off'
    return cachedMode
  }
  if (cachedMode !== null) return cachedMode

  cachedMode = resolveBusinessMockMode({
    environment,
    storageMode: readStoredMode(),
    buildEnabled: buildMockFlag(),
  })
  return cachedMode
}

export function setBusinessMockMode(mode: BusinessMockMode): void {
  if (!isBusinessMockDeveloperModeAvailable()) {
    cachedMode = 'off'
    return
  }
  cachedMode = mode
  persistFlag(mode !== 'off')
  try {
    platformStorage()?.setStorageSync(businessMockModeStorageKey, mode)
  } catch {
    // The in-memory cache remains authoritative for the current session.
  }
}

export function setBusinessMockEnabled(enabled: boolean): void {
  setBusinessMockMode(enabled ? 'data' : 'off')
}

export function resetBusinessMockCache(): void {
  cachedMode = null
}
