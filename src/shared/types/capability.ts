export type CapabilityState =
  | 'not_requested'
  | 'granted'
  | 'denied'
  | 'denied_permanently_or_settings'
  | 'unavailable'
  | 'unsupported_platform'
  | 'cancelled'
  | 'error_retryable'

export interface CapabilityMetadata {
  readonly canRetry: boolean
  readonly canOpenSettings: boolean
}

export interface CapabilityResult<T> extends CapabilityMetadata {
  readonly capability: string
  readonly state: CapabilityState
  readonly value?: T
  readonly reason?: string
}

const metadataByState: Readonly<Record<CapabilityState, CapabilityMetadata>> = {
  not_requested: { canRetry: true, canOpenSettings: false },
  granted: { canRetry: false, canOpenSettings: false },
  denied: { canRetry: true, canOpenSettings: false },
  denied_permanently_or_settings: { canRetry: false, canOpenSettings: true },
  unavailable: { canRetry: true, canOpenSettings: true },
  unsupported_platform: { canRetry: false, canOpenSettings: false },
  cancelled: { canRetry: true, canOpenSettings: false },
  error_retryable: { canRetry: true, canOpenSettings: false },
}

export function capabilityMetadata(state: CapabilityState): CapabilityMetadata {
  return metadataByState[state]
}

export function createCapabilityResult<T>(
  capability: string,
  state: CapabilityState,
  value?: T,
  reason?: string,
): CapabilityResult<T> {
  return {
    capability,
    state,
    value,
    reason,
    ...capabilityMetadata(state),
  }
}

export function isCapabilityGranted(result: CapabilityResult<unknown>): boolean {
  return result.state === 'granted'
}
