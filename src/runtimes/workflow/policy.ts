import type {
  HandlerIdentity,
  WorkflowActor,
  WorkflowNodeMetadata,
} from './types'
import type { WorkflowActionIntent, WorkflowActionPolicyDecision, WorkflowBlockedReason } from './types'

export interface NodeVisibilityDecision {
  readonly visible: boolean
  readonly reason?: WorkflowBlockedReason
}

function matchesHandler(actor: WorkflowActor, handler: HandlerIdentity): boolean {
  if (handler.kind === 'user') return actor.userId === handler.userId
  if (handler.kind === 'role') return actor.roleIds.some((roleId) => roleId === handler.roleId)
  if (handler.kind === 'unclassified') {
    return (
      String(actor.userId) === handler.value ||
      actor.roleIds.some((roleId) => String(roleId) === handler.value) ||
      actor.organizationRoles.some(
        (organizationRole) => `${organizationRole.organizationId}+${organizationRole.roleId}` === handler.value,
      )
    )
  }
  return actor.organizationRoles.some(
    (organizationRole) =>
      organizationRole.organizationId === handler.organizationId && organizationRole.roleId === handler.roleId,
  )
}

function matchesRoleId(actor: WorkflowActor, roleIds: readonly string[]): boolean {
  return roleIds.some((roleId) => actor.roleIds.some((actorRoleId) => String(actorRoleId) === roleId))
}

export function isHandlerMatch(actor: WorkflowActor, handlers: readonly HandlerIdentity[]): boolean {
  return handlers.some((handler) => matchesHandler(actor, handler))
}

export function evaluateNodeVisibility(
  node: WorkflowNodeMetadata,
  actor?: WorkflowActor,
): NodeVisibilityDecision {
  if (node.isSystem || node.isSentinel || node.category === 'system' || node.category === 'sentinel') {
    return { visible: false, reason: 'system_node' }
  }
  if (node.lifecycle === 'unknown') return { visible: false, reason: 'policy_unverified' }
  if (node.lifecycle !== 'active') return { visible: false, reason: 'node_inactive' }
  if (node.category === 'accept' || node.category === 'allot' || node.category === 'dispatch') {
    return { visible: false, reason: 'non_user_node' }
  }
  if (node.category === 'unsupported') return { visible: false, reason: 'unsupported_node_type' }
  const evidence = node.visibility
  if (!evidence || evidence.evidenceState !== 'verified') {
    return { visible: false, reason: 'policy_unverified' }
  }
  if (!actor) return { visible: false, reason: 'not_handler' }

  const handlerMatch = node.handlers ? isHandlerMatch(actor, node.handlers) : false
  const roleMatch =
    (evidence.selectableRoleIds && matchesRoleId(actor, evidence.selectableRoleIds)) ||
    (evidence.viewableRoleIds && matchesRoleId(actor, evidence.viewableRoleIds))
  if (!handlerMatch && !roleMatch) {
    return { visible: false, reason: 'not_handler' }
  }
  return { visible: true }
}

export function evaluateWorkflowAction(input: {
  readonly action: WorkflowActionIntent
  readonly node: WorkflowNodeMetadata
  readonly actor?: WorkflowActor
  readonly formRecordCount?: number
}): WorkflowActionPolicyDecision {
  const visibility = evaluateNodeVisibility(input.node, input.actor)
  if (!visibility.visible) {
    return {
      action: input.action,
      allowed: false,
      reason: visibility.reason,
    }
  }

  if (
    input.action === 'transition' ||
    input.action === 'rollback' ||
    input.action === 'takeback' ||
    input.action === 'cancel' ||
    input.action === 'acceptance' ||
    input.action === 'quotation' ||
    input.action === 'construction'
  ) {
    return { action: input.action, allowed: false, reason: 'policy_unverified' }
  }

  const formNode = input.node.category === 'forms' || input.node.category === 'repeat'
  if (input.action === 'interact_with_form') {
    return formNode
      ? { action: input.action, allowed: true, command: { type: input.action, nodeId: input.node.id } }
      : { action: input.action, allowed: false, reason: 'unsupported_node_type' }
  }
  if (input.action === 'complete') {
    if (!formNode) return { action: input.action, allowed: false, reason: 'unsupported_node_type' }
    if ((input.formRecordCount ?? 0) < 1) {
      return { action: input.action, allowed: false, reason: 'required_form_missing' }
    }
    return { action: input.action, allowed: true, command: { type: input.action, nodeId: input.node.id } }
  }
  if (input.action === 'open_subworkflow') {
    return input.node.category === 'subworkflow'
      ? { action: input.action, allowed: true, command: { type: input.action, nodeId: input.node.id } }
      : { action: input.action, allowed: false, reason: 'unsupported_node_type' }
  }
  if (input.action === 'place_order') {
    return input.node.category === 'placeOrder'
      ? { action: input.action, allowed: true, command: { type: input.action, nodeId: input.node.id } }
      : { action: input.action, allowed: false, reason: 'unsupported_node_type' }
  }
  return { action: input.action, allowed: false, reason: 'unsupported_node_type' }
}
