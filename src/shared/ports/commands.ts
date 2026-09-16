import type {
  FormDataId,
  FormDefinitionId,
  WorkOrderId,
  WorkflowNodeRuntimeId,
  WorkflowRunId,
} from '@shared/types'
import type { OperationSnapshot } from '@shared/types'

export interface AcceptOrderInput {
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
}

export interface AcceptOrderInspection {
  readonly requiresConfirmation: boolean
}

export type AppointmentFieldValue = string | number | boolean | null

export interface AppointmentFormOption {
  readonly value: string
  readonly label: string
}

export interface AppointmentFormFieldRead {
  readonly key: string
  readonly label: string
  readonly type: string
  readonly required: boolean
  readonly readOnly: boolean
  readonly options?: readonly AppointmentFormOption[]
}

export interface AppointmentFormRead {
  readonly fields: readonly AppointmentFormFieldRead[]
  readonly values: Readonly<Record<string, AppointmentFieldValue>>
  /** Adapter-normalized definition identity used to scope local Action drafts. */
  readonly definitionId?: FormDefinitionId
  readonly dataId?: FormDataId
}

export interface SubmitAppointmentInput {
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly workflowRunId?: WorkflowRunId
  readonly formDataId?: FormDataId
  readonly values: Readonly<Record<string, AppointmentFieldValue>>
}

export interface TechnicianApiCommandPort {
  inspectAcceptOrder(input: AcceptOrderInput): Promise<OperationSnapshot<AcceptOrderInspection>>
  acceptOrder(input: AcceptOrderInput): Promise<OperationSnapshot<void>>
  readAppointmentForm(input: {
    readonly formDataId?: FormDataId
  }): Promise<OperationSnapshot<AppointmentFormRead>>
  submitAppointment(input: SubmitAppointmentInput): Promise<OperationSnapshot<void>>
}
