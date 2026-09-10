export type FoundationState = {
  initialized: boolean
}

export function createFoundationState(): FoundationState {
  return { initialized: true }
}
