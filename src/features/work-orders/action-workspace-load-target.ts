import { actionContentKindForIntent, type ActionContentKind } from '@runtimes/action'
import type { CurrentTaskProjection } from '@runtimes/workflow'
import type { SessionSnapshot, WorkOrderDetail, WorkflowNodeRead } from '@shared/ports'
import type { ErrorCategory, RoleId, WorkOrderId, WorkflowNodeRuntimeId } from '@shared/types'

export interface ActionWorkspaceLoadTargetRequest {
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly actionIntent?: string
  readonly localPreviewOnly?: boolean
}
type Blocked = {
  readonly kind: 'blocked'
  readonly category: Extract<ErrorCategory, 'unsupported_capability' | 'session_invalid'>
  readonly message: string
  readonly keepDetail: boolean
}
type Ready = {
  readonly kind: 'ready'
  /** Verified role provenance for downstream draft identity; never nullable. */
  readonly roleId: RoleId
  readonly currentTask: CurrentTaskProjection
  readonly node: WorkflowNodeRead
  readonly contentKind: ActionContentKind
  readonly isAppointmentAction: boolean
  readonly isDynamicAction: boolean
  readonly isQuotationAction: boolean
}
export type ActionWorkspaceLoadTarget = Blocked | Ready
function denied(category: Blocked['category'], message: string, keepDetail: boolean): Blocked {
  return { kind: 'blocked', category, message, keepDetail }
}

/** Read-side eligibility only. Workflow Runtime owns execution authorization;
 * no UI metadata or localPreviewOnly flag can grant business commands. */
export function selectActionWorkspaceLoadTarget(input: {
  readonly detail: WorkOrderDetail
  readonly session: SessionSnapshot
  readonly currentTask?: CurrentTaskProjection
  readonly request: ActionWorkspaceLoadTargetRequest
  /** Must come from the Store's compile-time DEV and explicit Mock E2E gate. */
  readonly devMockE2EBuildEnabled: boolean
}): ActionWorkspaceLoadTarget {
  const { detail, session, currentTask, request } = input
  if (String(detail.id) !== String(request.workOrderId)) {
    return denied('unsupported_capability', 'Work Order response identity does not match the requested order', false)
  }
  if (!session.currentRole?.id) {
    return denied('session_invalid', '当前角色不可用，禁止恢复无角色归属的工作台草稿。', false)
  }
  const node = detail.workflowNodes?.find(candidate => candidate.id === request.workflowNodeId)
  // DEV tour: LOCAL draft preview only, never an executable FormData/Workflow action.
  const syntheticReadOnlyPreview = request.localPreviewOnly === true
    && input.devMockE2EBuildEnabled
    && String(request.workOrderId) === 'mock-work-order-019-continuous-journey'
    && String(request.workflowNodeId) === (request.actionIntent === 'set_appointment'
      ? 'mock-workflow-node-019-appointment'
      : request.actionIntent === 'interact_with_form'
        ? 'mock-workflow-node-019-survey' : '')
    && (currentTask?.sourceNodeType === 'forms' || currentTask?.sourceNodeType === 'repeat')
    && currentTask?.execution === 'disabled_read_only'
  if (!currentTask || !node
    || String(currentTask.nodeId) !== String(request.workflowNodeId)
    || (request.actionIntent && currentTask.actionIntent !== request.actionIntent)
    || (currentTask.execution !== 'enabled' && !syntheticReadOnlyPreview)) {
    return denied('unsupported_capability', 'This Action is not executable', true)
  }
  const contentKind = actionContentKindForIntent(currentTask.actionIntent)
  const isAppointmentAction = currentTask.actionIntent === 'set_appointment'
  const isDynamicAction = currentTask.actionIntent === 'interact_with_form'
  const isQuotationAction = currentTask.actionIntent === 'place_order' && contentKind === 'quotation'
  if (!isAppointmentAction && !isDynamicAction && !isQuotationAction) {
    return denied('unsupported_capability', 'This Action content is not supported', true)
  }
  if (isDynamicAction && !node.formDefinitionId) {
    return denied('unsupported_capability', 'Dynamic form definition is unavailable', true)
  }
  return { kind: 'ready', roleId: session.currentRole.id, currentTask, node, contentKind,
    isAppointmentAction, isDynamicAction, isQuotationAction }
}
