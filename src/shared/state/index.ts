export type FoundationState = {
  initialized: boolean
}

export function createFoundationState(): FoundationState {
  return { initialized: true }
}

export { useSessionStore } from './session'
export type { SessionStatus } from './session'
