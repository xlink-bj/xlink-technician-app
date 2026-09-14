import type { SessionSnapshot, WorkOrderDetail } from '@shared/ports'
import { projectDetailWorkflow } from '@runtimes/workflow'
import type { DetailWorkflowProjection, WorkflowActor } from '@runtimes/workflow'

function workflowActorFor(session: SessionSnapshot | null): WorkflowActor | undefined {
  if (!session) return undefined
  return {
    userId: session.user.id,
    roleIds: session.currentRole ? [session.currentRole.id] : [],
    organizationRoles: [],
  }
}

export function detailWorkflowProjectionFor(
  detail: WorkOrderDetail | null,
  session: SessionSnapshot | null,
): DetailWorkflowProjection {
  return projectDetailWorkflow(detail?.workflowNodes ?? [], workflowActorFor(session))
}
