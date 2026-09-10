import type {
  FormDataId,
  FormDefinitionId,
  WorkOrderId,
  WorkflowDefinitionId,
  WorkflowNodeRuntimeId,
  WorkflowRunId,
} from '@shared/types'
import type { OperationSnapshot } from '@shared/types'

export interface ReadPage<T> {
  readonly data: readonly T[]
  readonly page?: number
  readonly rows?: number
  readonly total?: number
  readonly dataCount?: number
}

export interface WorkOrderListQuery {
  readonly page: number
  readonly rows: number
  readonly sortField?: string
  readonly sortOrder?: 'asc' | 'desc'
  readonly filters?: Readonly<Record<string, string | number | boolean>>
}

export interface WorkOrderSummary {
  readonly id: WorkOrderId
  readonly title?: string
  readonly stateCode?: string
}

export interface WorkOrderDetail {
  readonly id: WorkOrderId
  readonly workflowRunId?: WorkflowRunId
}

export interface WorkflowDefinitionRead {
  readonly id: WorkflowDefinitionId
}

export interface WorkflowNodeRead {
  readonly id: WorkflowNodeRuntimeId
  readonly definitionId?: WorkflowDefinitionId
  readonly runId?: WorkflowRunId
  readonly parentNodeId?: WorkflowNodeRuntimeId
}

export interface FormDefinitionRead {
  readonly id: FormDefinitionId
}

export interface FormDataRead {
  readonly id: FormDataId
  readonly definitionId: FormDefinitionId
  readonly workflowRunId?: WorkflowRunId
}

export interface CodeOptionRead {
  readonly value: string
  readonly label: string
}

export interface CodeOptionsQuery {
  readonly valueOption?: string
  readonly parentValue?: string
}

export interface TechnicianApiReadPort {
  listWorkOrders(
    query: WorkOrderListQuery,
  ): Promise<OperationSnapshot<ReadPage<WorkOrderSummary>>>
  getWorkOrderDetail(id: WorkOrderId): Promise<OperationSnapshot<WorkOrderDetail>>
  getWorkflowDefinition(
    id: WorkflowDefinitionId,
  ): Promise<OperationSnapshot<WorkflowDefinitionRead>>
  getWorkflowNodes(runId: WorkflowRunId): Promise<OperationSnapshot<readonly WorkflowNodeRead[]>>
  getChildWorkflowNodes(
    parentNodeId: WorkflowNodeRuntimeId,
  ): Promise<OperationSnapshot<readonly WorkflowNodeRead[]>>
  getFormDefinition(id: FormDefinitionId): Promise<OperationSnapshot<FormDefinitionRead>>
  getFormData(input: {
    readonly definitionId: FormDefinitionId
    readonly dataId?: FormDataId
  }): Promise<OperationSnapshot<ReadPage<FormDataRead>>>
  getFormDetail(input: {
    readonly definitionId: FormDefinitionId
    readonly dataId: FormDataId
  }): Promise<OperationSnapshot<FormDataRead>>
  getCodeOptions(
    query: CodeOptionsQuery,
  ): Promise<OperationSnapshot<ReadPage<CodeOptionRead>>>
}
