/**
 * Canonical synthetic business scenarios. This is a registry of fixture
 * identities and expected effects, not a source of server authorization.
 *
 * The legacy router still owns payload shapes and per-request projections;
 * future scenarios must be declared here before adding fixture routes.
 */
import { mockCommandScenarioIds, mockQuotationWorkflowNodeId } from './fixtures'
import { mockJourneyNodes } from './journey'

export type MockBusinessScenarioKey = keyof typeof mockCommandScenarioIds
export type MockScenarioFamily = 'accept' | 'appointment' | 'survey' | 'quotation' | 'journey'
export type MockScenarioOutcome = 'success' | 'retryable' | 'terminal' | 'local-only'

export interface MockBusinessScenario {
  readonly key: MockBusinessScenarioKey
  readonly workOrderId: string
  readonly family: MockScenarioFamily
  readonly expectedOutcome: MockScenarioOutcome
  /** No synthetic scenario may grant a real write or real Contract authority. */
  readonly businessWrites: 'synthetic-only'
  readonly network: 'mock-owned'
  readonly workflowNodeId?: string
}

export const mockBusinessScenarios: readonly MockBusinessScenario[] = [
  { key: 'acceptDirect', workOrderId: mockCommandScenarioIds.acceptDirect, family: 'accept', expectedOutcome: 'success', businessWrites: 'synthetic-only', network: 'mock-owned' },
  { key: 'acceptRetryable', workOrderId: mockCommandScenarioIds.acceptRetryable, family: 'accept', expectedOutcome: 'retryable', businessWrites: 'synthetic-only', network: 'mock-owned' },
  { key: 'acceptTerminal', workOrderId: mockCommandScenarioIds.acceptTerminal, family: 'accept', expectedOutcome: 'terminal', businessWrites: 'synthetic-only', network: 'mock-owned' },
  { key: 'appointmentRetryable', workOrderId: mockCommandScenarioIds.appointmentRetryable, family: 'appointment', expectedOutcome: 'retryable', businessWrites: 'synthetic-only', network: 'mock-owned' },
  { key: 'appointmentTerminal', workOrderId: mockCommandScenarioIds.appointmentTerminal, family: 'appointment', expectedOutcome: 'terminal', businessWrites: 'synthetic-only', network: 'mock-owned' },
  { key: 'appointmentSuccess', workOrderId: mockCommandScenarioIds.appointmentSuccess, family: 'appointment', expectedOutcome: 'success', businessWrites: 'synthetic-only', network: 'mock-owned' },
  { key: 'surveySuccess', workOrderId: mockCommandScenarioIds.surveySuccess, family: 'survey', expectedOutcome: 'success', businessWrites: 'synthetic-only', network: 'mock-owned' },
  { key: 'quotationFoundation', workOrderId: mockCommandScenarioIds.quotationFoundation, family: 'quotation', expectedOutcome: 'local-only', workflowNodeId: mockQuotationWorkflowNodeId, businessWrites: 'synthetic-only', network: 'mock-owned' },
  { key: 'continuousJourney', workOrderId: mockCommandScenarioIds.continuousJourney, family: 'journey', expectedOutcome: 'local-only', workflowNodeId: mockJourneyNodes.quotation, businessWrites: 'synthetic-only', network: 'mock-owned' },
] as const

export function mockBusinessScenarioFor(key: MockBusinessScenarioKey): MockBusinessScenario {
  const scenario = mockBusinessScenarios.find(candidate => candidate.key === key)
  if (!scenario) throw new Error('Unregistered synthetic scenario: ' + key)
  return scenario
}
