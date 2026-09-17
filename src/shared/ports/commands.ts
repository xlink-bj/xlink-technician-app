import type { FormFieldValue, FormFieldVisibility } from '@shared/ports/api'
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
  readonly children?: readonly AppointmentFormOption[]
}

export interface AppointmentFormFieldRead {
  /** Stable ExtField row identity; never used as a FormData value key. */
  readonly fieldId: string
  /** Backend business field name used in FormData values. May repeat across rows. */
  readonly valueKey: string
  readonly label: string
  readonly type: string
  readonly required: boolean
  readonly readOnly: boolean
  /** Backend `multiple` flag; a multi-value control must not be rendered as a scalar choice. */
  readonly multiple?: boolean
  readonly options?: readonly AppointmentFormOption[]
  /** Adapter-normalized conditional visibility; raw backend metadata stays out of UI. */
  readonly visibility?: FormFieldVisibility
  /** Adapter-normalized option provider identity, when evidenced by the field. */
  readonly valueOption?: string
  /** Explicit capability boundary for metadata the current Runtime cannot safely interpret. */
  readonly unsupportedReason?: string
}

export interface AppointmentFormRead {
  readonly fields: readonly AppointmentFormFieldRead[]
  readonly values: Readonly<Record<string, AppointmentFieldValue>>
  /** Adapter-normalized definition identity used to scope local Action drafts. */
  readonly definitionId?: FormDefinitionId
  readonly dataId?: FormDataId
}

/** Generic dynamic-form read model shared by future Action Content. */
export interface DynamicFormRead {
  readonly fields: readonly AppointmentFormFieldRead[]
  readonly values: Readonly<Record<string, FormFieldValue>>
  readonly definitionId?: FormDefinitionId
  readonly dataId?: FormDataId
  readonly workflowRunId?: WorkflowRunId
}

export interface ReadDynamicFormInput {
  readonly definitionId: FormDefinitionId
  readonly formDataId?: FormDataId
  readonly expectedWorkflowRunId?: WorkflowRunId
}

export interface SaveDynamicFormInput {
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly workflowRunId?: WorkflowRunId
  readonly definitionId: FormDefinitionId
  readonly formDataId?: FormDataId
  readonly values: Readonly<Record<string, FormFieldValue>>
}

export interface CompleteWorkflowNodeInput {
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly workflowRunId?: WorkflowRunId
  readonly definitionId: FormDefinitionId
  readonly formDataId: FormDataId
}

export type AppointmentVisitIntent = 'visit_required' | 'visit_deferred' | 'unknown'

export interface SubmitAppointmentInput {
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly workflowRunId?: WorkflowRunId
  readonly formDataId?: FormDataId
  /** Feature-projected branch used by the transport safety boundary. */
  readonly visitIntent?: AppointmentVisitIntent
  readonly values: Readonly<Record<string, AppointmentFieldValue>>
}

export interface TechnicianApiCommandPort {
  inspectAcceptOrder(input: AcceptOrderInput): Promise<OperationSnapshot<AcceptOrderInspection>>
  acceptOrder(input: AcceptOrderInput): Promise<OperationSnapshot<void>>
  readAppointmentForm(input: {
    readonly formDataId?: FormDataId
  }): Promise<OperationSnapshot<AppointmentFormRead>>
  /** Optional while older test/application compositions are appointment-only. */
  readDynamicForm?(input: ReadDynamicFormInput): Promise<OperationSnapshot<DynamicFormRead>>
  saveDynamicForm?(input: SaveDynamicFormInput): Promise<OperationSnapshot<FormDataId>>
  completeWorkflowNode?(input: CompleteWorkflowNodeInput): Promise<OperationSnapshot<void>>
  submitAppointment(input: SubmitAppointmentInput): Promise<OperationSnapshot<void>>
}
