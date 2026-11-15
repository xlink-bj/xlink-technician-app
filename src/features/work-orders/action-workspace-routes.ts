import type { WorkOrderId, WorkflowNodeRuntimeId } from '@shared/types'

/** Stable public route contract; the store re-exports these unchanged. */
export const actionWorkspaceRoute = '/pages/work-orders/action-workspace' as const
export const actionWorkspaceTimeRoute = '/pages/work-orders/action-time' as const
export const actionWorkspaceConfirmationRoute = '/pages/work-orders/action-confirmation' as const

function actionRouteFor(
  route: string,
  workOrderId: WorkOrderId,
  workflowNodeId: WorkflowNodeRuntimeId,
  actionIntent: string,
): string {
  return `${route}?id=${encodeURIComponent(String(workOrderId))}&node=${encodeURIComponent(String(workflowNodeId))}&action=${encodeURIComponent(actionIntent)}`
}

export function actionWorkspaceRouteFor(
  workOrderId: WorkOrderId,
  workflowNodeId: WorkflowNodeRuntimeId,
  actionIntent: string,
): string {
  return actionRouteFor(actionWorkspaceRoute, workOrderId, workflowNodeId, actionIntent)
}

export function actionWorkspaceTimeRouteFor(
  workOrderId: WorkOrderId,
  workflowNodeId: WorkflowNodeRuntimeId,
  actionIntent: string,
): string {
  return actionRouteFor(actionWorkspaceTimeRoute, workOrderId, workflowNodeId, actionIntent)
}

export function actionWorkspaceConfirmationRouteFor(
  workOrderId: WorkOrderId,
  workflowNodeId: WorkflowNodeRuntimeId,
  actionIntent: string,
): string {
  return actionRouteFor(actionWorkspaceConfirmationRoute, workOrderId, workflowNodeId, actionIntent)
}

export function parseActionWorkspaceId(value: unknown): WorkOrderId | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return value.trim() as WorkOrderId
}

export function parseActionWorkspaceNodeId(value: unknown): WorkflowNodeRuntimeId | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return value.trim() as WorkflowNodeRuntimeId
}

/** Cold/reloaded confirmations must not infer a predecessor from their query alone. */
export function appointmentWorkspaceHasBack(
  options: Record<string, unknown> | undefined,
  pages: readonly { route?: string; options?: Record<string, unknown> }[],
): boolean {
  const previous = pages[pages.length - 2]
  return typeof options?.id === 'string' && options.id.length > 0
    && typeof options.node === 'string' && options.node.length > 0
    && previous?.route === actionWorkspaceRoute.slice(1)
    && previous.options?.id === options.id && previous.options?.node === options.node
    && previous.options?.action === options.action
}

