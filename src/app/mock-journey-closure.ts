import { appointmentFormDefinitionWireId } from '@adapters/api/appointment-contract'
import {
  isDevMockJourneyEnabled, mockJourneyNodes, mockJourneyStage,
  mockJourneyWorkOrderId, type MockJourneyStage,
} from '@adapters/api/mock/journey'
import { mockSurveyFormDefinitionId } from '@adapters/api/mock/survey-contract'
import type { ReadPriorDraft } from './mock-journey-context'
import { commitMockJourneyStage } from './mock-journey-protocol'
import type { FormFieldValue } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

export type MockJourneyAdvanceResult =
  | { readonly state: 'advanced'; readonly next: MockJourneyStage }
  | { readonly state: 'blocked'; readonly reason: 'scope' | 'missing_draft' | 'read_failed' | 'protocol_failed' }

const appointmentEvidenceKeys = ['need', 'datetime', 'note'] as const
const surveyEvidenceKeys = [
  'part', 'leakageCause', 'squareMeter', 'gapLength', 'length', 'width',
  'planeArea', 'perimeter', 'height',
] as const

/** A locally saved field has actually been provided by the technician.
 * This is deliberately NOT R1 required-field or Workflow Process validation. */
export function hasLocalJourneyEvidence(
  stage: 'appointment' | 'survey',
  values: Readonly<Record<string, unknown>>,
): boolean {
  const keys = stage === 'appointment' ? appointmentEvidenceKeys : surveyEvidenceKeys
  return keys.some((key) => {
    const value = values[key]
    if (key === 'need') return value === '1' || value === '0'
    if (typeof value === 'string') return value.trim().length > 0
    if (typeof value === 'number') return Number.isFinite(value)
    if (Array.isArray(value)) return value.length > 0
    return false
  })
}

/** Called only after Workspace.flushDraft; re-read the exact persisted draft.
 * Then issue DEV Mock-only R1-shaped FormData/Workflow commands and readbacks.
 * This never creates real server FormData, an Order or a Contract. */
export async function advanceMockJourneyWithSavedDraft(
  expected: 'appointment' | 'survey',
  read: ReadPriorDraft,
  authorizationCurrent: () => boolean,
): Promise<MockJourneyAdvanceResult> {
  if (!isDevMockJourneyEnabled() || mockJourneyStage() !== expected || !authorizationCurrent()) {
    return { state: 'blocked', reason: 'scope' }
  }
  const identity = {
    workOrderId: asOpaqueId<'WorkOrderId'>(mockJourneyWorkOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(mockJourneyNodes[expected]),
    actionIntent: expected === 'appointment' ? 'set_appointment' as const : 'interact_with_form' as const,
    contentKind: 'dynamic_form' as const,
    contentIdentity: expected === 'appointment' ? appointmentFormDefinitionWireId : mockSurveyFormDefinitionId,
  }
  let result: Awaited<ReturnType<ReadPriorDraft>>
  try {
    result = await read(identity)
  } catch {
    return { state: 'blocked', reason: 'read_failed' }
  }
  if (!isDevMockJourneyEnabled() || mockJourneyStage() !== expected || !authorizationCurrent()) {
    return { state: 'blocked', reason: 'scope' }
  }
  if (result.state !== 'succeeded') return { state: 'blocked', reason: 'read_failed' }
  const record = result.data
  if (!record || record.status !== 'unfinished'
    || String(record.identity.workOrderId) !== mockJourneyWorkOrderId
    || String(record.identity.workflowNodeId) !== String(identity.workflowNodeId)
    || record.identity.actionIntent !== identity.actionIntent
    || record.identity.contentKind !== identity.contentKind
    || record.identity.contentIdentity !== identity.contentIdentity
    || !record.values || !hasLocalJourneyEvidence(expected, record.values)) {
    return { state: 'blocked', reason: 'missing_draft' }
  }
  const outcome = await commitMockJourneyStage(expected,
    record.values as Readonly<Record<string, FormFieldValue>>, authorizationCurrent)
  if (outcome !== 'advanced') return { state: 'blocked', reason: 'protocol_failed' }
  return { state: 'advanced', next: mockJourneyStage() }
}
