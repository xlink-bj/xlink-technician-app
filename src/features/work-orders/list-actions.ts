import type { SessionSnapshot, WorkOrderSummary } from '@shared/ports'
import type { WorkflowNodeRuntimeId } from '@shared/types'

import { evaluateWorkflowAction, workflowNodeMetadataFromRead } from '@runtimes/workflow'

export interface WorkOrderListActionProjection {
  readonly detailAccessible: boolean
  readonly acceptOrder?: { readonly workflowNodeId: WorkflowNodeRuntimeId }
  readonly contactAvailable: boolean
}

function actorFor(session: SessionSnapshot | null) {
  if (!session) return undefined
  return {
    userId: session.user.id,
    roleIds: session.currentRole ? [session.currentRole.id] : [],
    organizationRoles: [],
  }
}

/**
 * Projects the List affordances from normalized workflow evidence. In
 * particular, a pre-accept row never receives a Detail route or contact
 * action, and the accept CTA is emitted only for one policy-allowed node.
 */
export function workOrderListActionFor(
  item: WorkOrderSummary,
  session: SessionSnapshot | null,
): WorkOrderListActionProjection {
  const actor = actorFor(session)
  const activeAcceptNodes = (item.workflowNodes ?? []).filter(
    (node) => node.category === 'accept' && node.lifecycle === 'active',
  )
  if (activeAcceptNodes.length > 0) {
    const allowed = activeAcceptNodes.filter((node) =>
      evaluateWorkflowAction({
        action: 'accept_order',
        node: workflowNodeMetadataFromRead(node),
        actor,
      }).allowed,
    )
    return {
      detailAccessible: false,
      ...(allowed.length === 1 ? { acceptOrder: { workflowNodeId: allowed[0].id } } : {}),
      contactAvailable: false,
    }
  }

  return {
    detailAccessible: true,
    contactAvailable: Boolean(item.contact?.normalizedPhone),
  }
}
