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

