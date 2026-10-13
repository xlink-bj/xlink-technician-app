import type { SessionSnapshot, WorkOrderDetail } from '@shared/ports'
import { isHandlerMatch, type WorkflowActor } from '@runtimes/workflow'

/**
 * A fresh, role-scoped ServiceAppointment detail is the ONLY accepted source.
 * This is R1's currentNode.isHandler UI rule, not backend signer authorization.
 * The authenticated SessionSnapshot currently has no verified orgId. We can
 * prove userId/roleId handlers; orgId+roleId remains unknown and denies.
 * No handler identities or user data leave this pure evaluator.
 */
export function reviewR1ActivePlaceOrderHandler(
  detail: WorkOrderDetail | null,
  session: SessionSnapshot | null,
  expectedWorkOrderId: string,
): { readonly verified: boolean; readonly reason: string } {
  if (!session?.currentRole?.id || !session.roleVersion) {
    return { verified: false, reason: '当前角色版本/会话身份缺失' }
  }
  if (!detail || String(detail.id) !== expectedWorkOrderId || !Array.isArray(detail.workflowNodes)) {
    return { verified: false, reason: '新读取的工单与工作流节点归属未核验' }
  }
  // No arbitrary "first node" selection: R1 uses the active placeOrder node.
  // Ambiguous or missing active nodes are NOT evidence of isHandler.
  const active = detail.workflowNodes.filter(n => n.category === 'placeOrder'
    && n.lifecycle === 'active' && !n.isSystem && !n.isSentinel)
  if (active.length !== 1) {
    return { verified: false, reason: '无法唯一确定当前有效的下单工作流节点' }
  }
  const node = active[0]!
  if (detail.workflowRunId && node.runId && detail.workflowRunId !== node.runId) {
    return { verified: false, reason: '节点属于其他工作流实例' }
  }
  if (node.visibility?.evidenceState !== 'verified' || !node.handlers?.length) {
    return { verified: false, reason: '当前节点缺少可核验的 handlerIds 数据' }
  }
  const actor: WorkflowActor = {
    userId: session.user.id,
    roleIds: [session.currentRole.id],
    // The available SessionSnapshot has no verified organization identity.
    organizationRoles: [],
  }
  return isHandlerMatch(actor, node.handlers)
    ? { verified: true, reason: '当前节点 handlerIds 已与会话用户/角色匹配（仅 R1 界面条件）' }
    : { verified: false, reason: '当前节点 handlerIds 未证明当前会话为处理人' }
}
