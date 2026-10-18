/**
 * Canonical synthetic command response plans.
 *
 * Pure fixture policy only: a scenario outcome is NOT real Order, Workflow,
 * authorization or server truth. Profiles cannot enable a new API route.
 */
import { mockBusinessScenarioFor, type MockBusinessScenarioKey } from './scenario-registry'
import { mockCommandScenarioIds } from './fixtures'

export type MockFailureKind = 'retryable' | 'terminal'
export type MockTransitionIntent = 'accept' | 'appointment'
export interface MockScenarioResponsePlan {
  readonly scenarioKey: MockBusinessScenarioKey
  readonly workOrderId: string
  readonly outcome: 'success' | 'retryable' | 'terminal' | 'local-only'
  readonly latencyMs: number
  readonly network: 'mock-owned'
  readonly businessWrites: 'synthetic-only'
}
export const defaultMockReadLatencyMs = 300

export function mockScenarioResponsePlanFor(
  key: MockBusinessScenarioKey,
  latencyMs = defaultMockReadLatencyMs,
): MockScenarioResponsePlan {
  if (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 10_000) {
    throw new Error('Mock latency must be a bounded finite value (0..10000ms)')
  }
  const scenario = mockBusinessScenarioFor(key)
  return {
    scenarioKey: key,
    workOrderId: scenario.workOrderId,
    outcome: scenario.expectedOutcome,
    latencyMs,
    network: 'mock-owned',
    businessWrites: 'synthetic-only',
  }
}

/**
 * Explicit outcome lookup; unknown / wrong intent must not invent failures
 * for another WorkOrder or grant a matching synthetic success.
 */
export function mockCommandFailureFor(
  intent: MockTransitionIntent,
  workOrderId: string,
): MockFailureKind | null {
  const ids = mockCommandScenarioIds
  if (intent === 'accept') {
    if (workOrderId === ids.acceptRetryable) return 'retryable'
    if (workOrderId === ids.acceptTerminal) return 'terminal'
  }
  if (intent === 'appointment') {
    if (workOrderId === ids.appointmentRetryable) return 'retryable'
    if (workOrderId === ids.appointmentTerminal) return 'terminal'
  }
  return null
}
