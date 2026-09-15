import type { WorkflowNodeRead } from '@shared/ports'

import { evaluateNodeVisibility, evaluateWorkflowAction } from './policy'
import type {
  WorkflowActionIntent,
  WorkflowActionPolicyDecision,
  WorkflowActor,
  WorkflowNodeCategory,
  WorkflowNodeMetadata,
} from './types'

export type CurrentTaskSelection = 'selected' | 'none' | 'ambiguous'
export type DetailWorkflowActionIntent = Extract<
  WorkflowActionIntent,
  'interact_with_form' | 'open_subworkflow' | 'place_order' | 'set_appointment'
>

export interface CurrentTaskProjection {
  readonly nodeId: WorkflowNodeRead['id']
  readonly title: string
  readonly category: WorkflowNodeCategory
  readonly actionIntent: DetailWorkflowActionIntent
  readonly domainPolicy: Pick<WorkflowActionPolicyDecision, 'action' | 'allowed' | 'reason'>
  /** The current D3 slice never authorizes a workflow mutation. */
  readonly execution: 'disabled_read_only'
}

export interface DetailWorkflowProjection {
  readonly selection: CurrentTaskSelection
  readonly visibleNodeCount: number
  readonly actionableNodeCount: number
  readonly currentTask?: CurrentTaskProjection
}

export function workflowNodeMetadataFromRead(node: WorkflowNodeRead): WorkflowNodeMetadata {
  return {
    id: node.id,
    category: node.category,
    lifecycle: node.lifecycle,
    ...(node.handlers ? { handlers: node.handlers } : {}),
    ...(node.visibility ? { visibility: node.visibility } : {}),
    ...(node.formPurpose ? { formPurpose: node.formPurpose } : {}),
    ...(node.isSystem ? { isSystem: node.isSystem } : {}),
    ...(node.isSentinel ? { isSentinel: node.isSentinel } : {}),
  }
}

export function workflowActionIntentForCategory(
  category: WorkflowNodeCategory,
  formPurpose?: WorkflowNodeRead['formPurpose'],
): DetailWorkflowActionIntent | undefined {
  switch (category) {
    case 'forms':
    case 'repeat':
      return formPurpose === 'appointment' ? 'set_appointment' : 'interact_with_form'
    case 'subworkflow':
      return 'open_subworkflow'
    case 'placeOrder':
      return 'place_order'
    default:
      return undefined
  }
}

function policySummary(decision: WorkflowActionPolicyDecision): CurrentTaskProjection['domainPolicy'] {
  return {
    action: decision.action,
    allowed: decision.allowed,
    ...(decision.reason ? { reason: decision.reason } : {}),
  }
}

/**
 * Projects normalized Detail workflow nodes into one read-only current task.
 * Visibility and action eligibility come from the existing Workflow Runtime;
 * no array position or display/status label is used for selection.
 */
export function projectDetailWorkflow(
  nodes: readonly WorkflowNodeRead[],
  actor?: WorkflowActor,
): DetailWorkflowProjection {
  const visibleNodes = nodes.filter((node) =>
    evaluateNodeVisibility(workflowNodeMetadataFromRead(node), actor).visible,
  )

  const candidates = visibleNodes.flatMap((node) => {
    const title = node.displayName
    if (node.lifecycle !== 'active' || !title) return []
    const actionIntent = workflowActionIntentForCategory(node.category, node.formPurpose)
    if (!actionIntent) return []

    const metadata = workflowNodeMetadataFromRead(node)
    const domainPolicy = evaluateWorkflowAction({ action: actionIntent, node: metadata, actor })
    if (!domainPolicy.allowed) return []
    return [{ node, title, actionIntent, domainPolicy }]
  })

  if (candidates.length !== 1) {
    return {
      selection: candidates.length > 1 ? 'ambiguous' : 'none',
      visibleNodeCount: visibleNodes.length,
      actionableNodeCount: candidates.length,
    }
  }

  const candidate = candidates[0]
  return {
    selection: 'selected',
    visibleNodeCount: visibleNodes.length,
    actionableNodeCount: candidates.length,
    currentTask: {
      nodeId: candidate.node.id,
      title: candidate.title,
      category: candidate.node.category,
      actionIntent: candidate.actionIntent,
      domainPolicy: policySummary(candidate.domainPolicy),
      execution: 'disabled_read_only',
    },
  }
}
