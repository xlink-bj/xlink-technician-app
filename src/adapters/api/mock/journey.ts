import { isBusinessMockMode } from './config'
import { appointmentFormDefinitionWireId } from '../appointment-contract'
import { mockSurveyFormDefinitionId } from './survey-contract'

/** DEV-only synthetic review journey. Its state and FormData are isolated from
 * R1 Production/Beta; the Mock router requires a matching Process command. */
export const mockJourneyWorkOrderId = 'mock-work-order-019-continuous-journey'
export const mockJourneyWorkflowRunId = 'mock-workflow-run-019'
export const mockJourneyNodes = {
  appointment: 'mock-workflow-node-019-appointment',
  survey: 'mock-workflow-node-019-survey',
  quotation: 'mock-workflow-node-019-place-order',
} as const
export type MockJourneyStage = keyof typeof mockJourneyNodes
const storageKey = 'xlink.dev.mock.journey.019.stage.v1'
const formDataKey = 'xlink.dev.mock.journey.019.form-data.v1.'
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

/** Stage mutation has no public local-only shortcut: it requires the precise
 * synthetic FormData which the Mock router just authorized for Process. */
export function advanceMockJourneyAfterProcess(
  expected: 'appointment' | 'survey', formDataId: string,
): MockJourneyStage | null {
  if (!isDevMockJourneyEnabled() || mockJourneyStage() !== expected) return null
  const persisted = readMockJourneyFormData(expected)
  const data = persisted !== null && typeof persisted === 'object' && !Array.isArray(persisted)
    ? persisted as Record<string, unknown> : null
  if (!data || data._id !== formDataId || data.sid !== mockJourneyWorkOrderId
    || data.nodeId !== mockJourneyNodes[expected] || data.state !== 1
    || data.extId !== (expected === 'appointment'
      ? appointmentFormDefinitionWireId : mockSurveyFormDefinitionId)) return null
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

/** Simulate persistent Mock server-side FormData across an H5 page reload.
 * Only the two explicit synthetic review stages may use this namespace. */
export function persistMockJourneyFormData(stage: 'appointment' | 'survey', data: unknown): boolean {
  if (!isDevMockJourneyEnabled() || mockJourneyStage() !== stage) return false
  try {
    uni.setStorageSync(`${formDataKey}${stage}`, JSON.stringify(data))
    return uni.getStorageSync(`${formDataKey}${stage}`) === JSON.stringify(data)
  } catch {
    return false
  }
}

export function readMockJourneyFormData(stage: 'appointment' | 'survey'): unknown | null {
  if (!isDevMockJourneyEnabled()) return null
  try {
    const raw: unknown = uni.getStorageSync(`${formDataKey}${stage}`)
    return typeof raw === 'string' ? JSON.parse(raw) as unknown : null
  } catch {
    return null
  }
}

export function resetMockJourney(): void {
  if (!isDevMockJourneyEnabled()) return
  uni.removeStorageSync(storageKey)
  uni.removeStorageSync(`${formDataKey}appointment`)
  uni.removeStorageSync(`${formDataKey}survey`)
  fallbackStage = 'appointment'
}
