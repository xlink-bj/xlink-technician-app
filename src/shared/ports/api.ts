import type {
  CustomerContactId,
  FormDataId,
  FormDefinitionId,
  WorkOrderId,
  WorkflowDefinitionId,
  WorkflowNodeRuntimeId,
  WorkflowRunId,
} from '@shared/types'
import type { OperationSnapshot } from '@shared/types'

export interface ReadPage<T> {
  readonly items: readonly T[]
  readonly page?: number
  readonly pageSize?: number
  readonly totalCount?: number
}

export interface WorkOrderListQuery {
  readonly page: number
  readonly pageSize: number
}

export interface WorkOrderSummary {
  readonly id: WorkOrderId
  readonly title?: string
}

/** Semantic customer-contact data kept in the in-memory detail model only. */
export interface WorkOrderContact {
  readonly contactRef?: CustomerContactId
  readonly normalizedPhone?: string
  readonly displayMask?: string
}

export interface WorkOrderDetail {
  readonly id: WorkOrderId
  readonly workflowRunId?: WorkflowRunId
  readonly displayNumber?: string
  readonly customerName?: string
  readonly serviceAddress?: string
  readonly contact?: WorkOrderContact
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
