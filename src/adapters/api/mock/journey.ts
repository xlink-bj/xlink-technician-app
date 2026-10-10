import { isBusinessMockMode } from './config'

/**
 * A clearly labelled, DEV-only review journey. This is NOT R1 Workflow Complete
 * or a surrogate for official Order submit. Only a local mock stage is saved.
 */
export const mockJourneyWorkOrderId = 'mock-work-order-019-continuous-journey'
export const mockJourneyWorkflowRunId = 'mock-workflow-run-019'
export const mockJourneyNodes = {
  appointment: 'mock-workflow-node-019-appointment',
  survey: 'mock-workflow-node-019-survey',
  quotation: 'mock-workflow-node-019-place-order',
} as const
export type MockJourneyStage = keyof typeof mockJourneyNodes
const storageKey = 'xlink.dev.mock.journey.019.stage.v1'
const allowed: readonly MockJourneyStage[] = ['appointment', 'survey', 'quotation']
let fallbackStage: MockJourneyStage = 'appointment'

export function isDevMockJourneyEnabled(): boolean {
  return import.meta.env.DEV === true
    && import.meta.env.VITE_XLINK_H5_MOCK_E2E === 'true'
    && isBusinessMockMode() === 'data'
}

export function mockJourneyStage(): MockJourneyStage {
  if (!isDevMockJourneyEnabled()) return 'appointment'
  try {
    const raw: unknown = uni.getStorageSync(storageKey)
    if (typeof raw === 'string' && allowed.includes(raw as MockJourneyStage)) {
      return raw as MockJourneyStage
    }
  } catch { /* Vitest can run without a uni storage implementation. */ }
  return fallbackStage
}

export function advanceMockJourney(expected: MockJourneyStage): MockJourneyStage | null {
  if (!isDevMockJourneyEnabled() || mockJourneyStage() !== expected) return null
  if (expected === 'quotation') return null
  const next: MockJourneyStage = expected === 'appointment' ? 'survey' : 'quotation'
  try {
    // Storage failure must fail closed; do not claim the stage advanced.
    uni.setStorageSync(storageKey, next)
  } catch {
    return null
  }
  fallbackStage = next
  return next
}

export function resetMockJourney(): void {
  if (!isDevMockJourneyEnabled()) return
  uni.removeStorageSync(storageKey)
  fallbackStage = 'appointment'
}
