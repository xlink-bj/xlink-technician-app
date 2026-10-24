import { appointmentFormDefinitionWireId } from '@adapters/api/appointment-contract'
import { formDataUpsertCommand, workflowCompleteCommand } from '@adapters/api/action-command-wires'
import {
  isDevMockJourneyEnabled, mockJourneyNodes, mockJourneyStage,
  mockJourneyWorkflowRunId, mockJourneyWorkOrderId,
} from '@adapters/api/mock/journey'
import { tryMockCommand, tryMockRead } from '@adapters/api/mock/router'
import { mockSurveyFormDefinitionId } from '@adapters/api/mock/survey-contract'
import type { FormFieldValue } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

type WritableJourneyStage = 'appointment' | 'survey'
type CommitResult = 'advanced' | 'protocol_failed'

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function sameWireValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function matchesSavedFormData(
  row: unknown, formDataId: string, definitionId: string,
  nodeId: string, wireValues: Record<string, unknown>,
): boolean {
  const saved = record(row)
  const exts = record(saved?.exts)
  if (!saved || !exts || saved._id !== formDataId || saved.extId !== definitionId
    || saved.sid !== mockJourneyWorkOrderId || saved.nodeId !== nodeId
    || saved.state !== 1) return false
  for (const [key, value] of Object.entries(wireValues)) {
    if (['_id', 'sid', 'smodule', 'nodeId', 'workflowId', 'state'].includes(key)) continue
    if (!sameWireValue(exts[key], value)) return false
  }
  return true
}

function matchesAdvancedDetail(raw: unknown, completed: WritableJourneyStage, savedId: string): boolean {
  const payload = record(record(raw)?.data)
  const order = record(payload?.serviceAppointment)
  const workflow = record(payload?.workflow)
  const nodes = payload?.workflowNode
  const next = completed === 'appointment' ? 'survey' : 'quotation'
  if (order?._id !== mockJourneyWorkOrderId
    || order.workflowRunId !== mockJourneyWorkflowRunId
    || workflow?._id !== mockJourneyWorkflowRunId
    || !Array.isArray(nodes) || nodes.length !== (completed === 'appointment' ? 2 : 3)) return false
  const old = nodes.find((node: unknown) => record(node)?._id === mockJourneyNodes[completed])
  const active = nodes.find((node: unknown) => record(node)?._id === mockJourneyNodes[next])
  return record(old)?.state === 10 && record(old)?.formDataId === savedId
    && record(active)?.state === 0
    && nodes.filter((node: unknown) => record(node)?.state === 0).length === 1
}

/** DEV-only synthetic protocol, called directly at the Mock router boundary.
 * No real HTTP client, Production fallback, or implicit workflow mutation.
 * Success requires exact FormData readback, Process ACK and WorkOrder readback. */
export async function commitMockJourneyStage(
  stage: WritableJourneyStage,
  values: Readonly<Record<string, FormFieldValue>>,
  authorizationCurrent: () => boolean,
): Promise<CommitResult> {
  const canDispatch = () => isDevMockJourneyEnabled() && mockJourneyStage() === stage
    && authorizationCurrent()
  if (!canDispatch()) return 'protocol_failed'
  const definitionId = stage === 'appointment' ? appointmentFormDefinitionWireId : mockSurveyFormDefinitionId
  const nodeId = mockJourneyNodes[stage]
  try {
    const save = formDataUpsertCommand({
      workOrderId: asOpaqueId<'WorkOrderId'>(mockJourneyWorkOrderId),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(nodeId),
      workflowRunId: asOpaqueId<'WorkflowRunId'>(mockJourneyWorkflowRunId),
      definitionId: asOpaqueId<'FormDefinitionId'>(definitionId),
      purpose: stage === 'appointment' ? 'appointment' : 'survey',
      values,
    })
    const wireValues = JSON.parse(String(save.body?.dataStr)) as Record<string, unknown>
    if (!canDispatch()) return 'protocol_failed'
    const saveResult = record(await tryMockCommand(save.path, save.body))
    const formDataId = record(saveResult?.data)?._id
    if (!canDispatch()
      || typeof formDataId !== 'string' || !formDataId.startsWith('mock-form-data-')) return 'protocol_failed'

    if (!canDispatch()) return 'protocol_failed'
    const readForm = record(await tryMockRead(`biz/extForm/query/${definitionId}`,
      { 'is:_id|string#and': formDataId }, { latencyMs: 0 }))
    if (!readForm || !Array.isArray(readForm.data) || readForm.data.length !== 1
      || !matchesSavedFormData(readForm.data[0], formDataId, definitionId, nodeId, wireValues)
      || !canDispatch()) return 'protocol_failed'

    const process = workflowCompleteCommand({
      workOrderId: asOpaqueId<'WorkOrderId'>(mockJourneyWorkOrderId),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(nodeId),
      workflowRunId: asOpaqueId<'WorkflowRunId'>(mockJourneyWorkflowRunId),
      definitionId: asOpaqueId<'FormDefinitionId'>(definitionId),
      formDataId: asOpaqueId<'FormDataId'>(formDataId),
    })
    if (!canDispatch()) return 'protocol_failed'
    const processResult = record(await tryMockCommand(process.path, process.body))
    const next = stage === 'appointment' ? 'survey' : 'quotation'
    if (processResult?.success !== true || !isDevMockJourneyEnabled()
      || mockJourneyStage() !== next || !authorizationCurrent()) return 'protocol_failed'
    const detail = await tryMockRead(`basic/serviceAppointment/queryById/${mockJourneyWorkOrderId}`,
      {}, { latencyMs: 0 })
    return authorizationCurrent() && matchesAdvancedDetail(detail, stage, formDataId)
      ? 'advanced' : 'protocol_failed'
  } catch {
    // Mapping failures, malformed responses, unavailable Mock and storage failure
    // all stop the journey. There is intentionally no real-network fallback.
    return 'protocol_failed'
  }
}
