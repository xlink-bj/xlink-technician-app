import type { SessionSnapshot, WorkOrderDetail, WorkOrderTaskTone } from '@shared/ports'
import { projectDetailWorkflow } from '@runtimes/workflow'
import { workOrderCardToneFor } from './card'
import type {
  CurrentTaskProjection,
  DetailWorkflowProjection,
  WorkflowActor,
} from '@runtimes/workflow'

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

export interface DetailWorkflowUiCurrentTask extends CurrentTaskProjection {
  readonly actionLabel: string
  readonly tone: WorkOrderTaskTone
}

export interface DetailWorkflowUiProjection
  extends Omit<DetailWorkflowProjection, 'currentTask'> {
  readonly currentTask?: DetailWorkflowUiCurrentTask
}

const currentTaskPresentation: Readonly<
  Record<CurrentTaskProjection['actionIntent'], Pick<DetailWorkflowUiCurrentTask, 'actionLabel'>>
> = {
  interact_with_form: { actionLabel: '处理表单' },
  open_subworkflow: { actionLabel: '查看子流程' },
  place_order: { actionLabel: '去下单' },
  set_appointment: { actionLabel: '预约上门时间' },
}

/**
 * Adds presentation labels without making status or raw workflow fields semantic.
 * The Detail current-task tone follows the same normalized status label used by
 * the List card; action intent still comes only from the Workflow Runtime.
 */
export function detailWorkflowUiProjectionFor(
  detail: WorkOrderDetail | null,
  session: SessionSnapshot | null,
): DetailWorkflowUiProjection {
  const projection = detailWorkflowProjectionFor(detail, session)
  if (!projection.currentTask) {
    return {
      selection: projection.selection,
      visibleNodeCount: projection.visibleNodeCount,
      actionableNodeCount: projection.actionableNodeCount,
    }
  }

  return {
    ...projection,
    currentTask: {
      ...projection.currentTask,
      ...currentTaskPresentation[projection.currentTask.actionIntent],
      tone: workOrderCardToneFor(detail?.taskLabel),
    },
  }
}
