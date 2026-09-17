import { appointmentFormDefinitionWireId } from '@adapters/api/appointment-contract'
import { mockCommandScenarioIds } from '@adapters/api/mock'
import { actionWorkspaceRouteFor } from '@features/work-orders/action-workspace'
import type { AppointmentFieldValue } from '@shared/ports'
import { asOpaqueId, type WorkOrderId, type WorkflowNodeRuntimeId } from '@shared/types'

export interface MockActionWorkspaceScenario {
  readonly key: string
  readonly label: string
  readonly description: string
  readonly route: string
}

export interface MockActionDraftSeed {
  readonly key: 'required' | 'deferred' | 'retryable'
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly actionIntent: 'set_appointment'
  readonly contentKind: 'dynamic_form'
  readonly contentIdentity: string
  readonly values: Readonly<Record<string, AppointmentFieldValue>>
}

const appointmentNodeFor = (suffix: string): WorkflowNodeRuntimeId =>
  asOpaqueId<'WorkflowNodeRuntimeId'>(`mock-workflow-node-${suffix}-appointment`)

const routeFor = (workOrderId: string, nodeSuffix: string): string =>
  actionWorkspaceRouteFor(
    asOpaqueId<'WorkOrderId'>(workOrderId),
    appointmentNodeFor(nodeSuffix),
    'set_appointment',
  )

/** Canonical identities shared by Mock Detail fixtures and developer Draft seed records. */
export const mockAppointmentDraftSeeds: readonly MockActionDraftSeed[] = [
  {
    key: 'required',
    workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.appointmentSuccess),
    workflowNodeId: appointmentNodeFor('016'),
    actionIntent: 'set_appointment',
    contentKind: 'dynamic_form',
    contentIdentity: appointmentFormDefinitionWireId,
    values: { need: '1', datetime: '2026-09-20 11:00', note: 'mock draft A' },
  },
  {
    key: 'deferred',
    workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.appointmentTerminal),
    workflowNodeId: appointmentNodeFor('015'),
    actionIntent: 'set_appointment',
    contentKind: 'dynamic_form',
    contentIdentity: appointmentFormDefinitionWireId,
    values: { need: '0', datetime: '2026-09-19 09:00', note: 'mock draft B' },
  },
  {
    key: 'retryable',
    workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.appointmentRetryable),
    workflowNodeId: appointmentNodeFor('014'),
    actionIntent: 'set_appointment',
    contentKind: 'dynamic_form',
    contentIdentity: appointmentFormDefinitionWireId,
    values: { need: '1', datetime: '2026-09-20 14:00' },
  },
]

/**
 * Development-only navigation hints for the existing Mock infrastructure.
 * The page remains scenario-agnostic; every entry resolves through the same
 * Detail projection and Action Workspace load path.
 */
export const mockActionWorkspaceScenarios: readonly MockActionWorkspaceScenario[] = [
  {
    key: 'fresh',
    label: '全新预约',
    description: '空白表单，可体验必填校验与成功提交',
    route: routeFor(mockCommandScenarioIds.appointmentSuccess, '016'),
  },
  {
    key: 'retryable',
    label: '可重试失败',
    description: '提交失败后保留输入，可再次提交',
    route: routeFor(mockCommandScenarioIds.appointmentRetryable, '014'),
  },
  {
    key: 'terminal',
    label: '终止失败',
    description: '终止失败后保留可恢复输入',
    route: routeFor(mockCommandScenarioIds.appointmentTerminal, '015'),
  },
]
