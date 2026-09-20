import type {
  CustomerContactId,
  FormDataId,
  FormDefinitionId,
  OrganizationId,
  RoleId,
  UserId,
  WorkOrderId,
  WorkflowDefinitionId,
  WorkflowNodeRuntimeId,
  WorkflowRunId,
} from '@shared/types'
import type { MediaValueRef, OperationSnapshot } from '@shared/types'

export interface ReadPage<T> {
  readonly items: readonly T[]
  readonly page?: number
  readonly pageSize?: number
  readonly totalCount?: number
}

export interface WorkOrderListQuery {
  readonly page: number
  readonly pageSize: number
  /** Optional server-side search across the accepted Work Order evidence fields. */
  readonly searchText?: string
}

export interface WorkOrderSummary {
  readonly id: WorkOrderId
  readonly displayNumber?: string
  /** Adapter-normalized Chinese status/task label; not an authorization/action code. */
  readonly taskLabel?: string
  /** Adapter-normalized service-part label for the compact card badge. */
  readonly servicePartLabel?: string
  readonly customerName?: string
  readonly serviceDistrict?: string
  readonly serviceAddress?: string
  /** Display-ready distance supplied by the read boundary; no location calculation here. */
  readonly distanceText?: string
  /** Optional same-community order count supplied by the read boundary. */
  readonly communityOrderCount?: number
  /** Ephemeral normalized contact input for the list phone action; never persisted or rendered. */
  readonly contact?: WorkOrderContact
  /** Normalized workflow evidence used by List action projection. */
  readonly workflowNodes?: readonly WorkflowNodeRead[]
}

/** Semantic customer-contact data kept only in in-memory read models. */
export interface WorkOrderContact {
  readonly contactRef?: CustomerContactId
  readonly normalizedPhone?: string
  readonly displayMask?: string
}

/**
 * Adapter-normalized workflow metadata shared with the Workflow Runtime.
 * These values are deliberately independent of backend nodeDef/state fields.
 */
export type WorkflowNodeCategory =
  | 'forms'
  | 'repeat'
  | 'subworkflow'
  | 'placeOrder'
  | 'user'
  | 'accept'
  | 'allot'
  | 'dispatch'
  | 'system'
  | 'sentinel'
  | 'unsupported'

export type WorkflowNodeLifecycle = 'active' | 'closed' | 'inactive' | 'unknown'

/** Verified semantic identity of a dynamic form; absent means generic. */
export type FormPurpose = 'appointment' | 'survey'

export type WorkflowHandlerIdentity =
  | { readonly kind: 'user'; readonly userId: UserId }
  | { readonly kind: 'role'; readonly roleId: RoleId }
  | {
      readonly kind: 'organizationRole'
      readonly organizationId: OrganizationId
      readonly roleId: RoleId
    }
  /** A bare handlerIds value cannot be classified without actor context. */
  | { readonly kind: 'unclassified'; readonly value: string }

export type WorkflowNodeVisibilityEvidenceState = 'verified' | 'missing' | 'unknown'

/** Adapter-normalized, read-only visibility inputs from the workflow node. */
export interface WorkflowNodeVisibilityEvidence {
  /** R1 `nodeDef.userChoose`; role IDs allowed to select the node. */
  readonly selectableRoleIds?: readonly RoleId[]
  /** R1 `nodeDef.viewableRoleIds`; role IDs allowed to view the node. */
  readonly viewableRoleIds?: readonly RoleId[]
  /** Whether the recognized wire inputs were structurally usable. */
  readonly evidenceState: WorkflowNodeVisibilityEvidenceState
}

export interface WorkOrderDetail {
  readonly id: WorkOrderId
  readonly workflowRunId?: WorkflowRunId
  readonly displayNumber?: string
  /** Adapter-normalized Chinese status/task label shared with the list model. */
  readonly taskLabel?: string
  /** Adapter-normalized district label shared with the list model. */
  readonly serviceDistrict?: string
  readonly customerName?: string
  readonly serviceAddress?: string
  /** Display-ready distance supplied by the read boundary; no location calculation here. */
  readonly distanceText?: string
  /** Optional part label; emitted only when a verified label source is available. */
  readonly servicePartLabel?: string
  readonly contact?: WorkOrderContact
  /** Adapter-normalized read-only follow-up timeline; omitted when no records exist. */
  readonly activities?: readonly WorkOrderActivity[]
  /** Adapter-normalized workflow nodes consumed by the read-only Workflow Runtime. */
  readonly workflowNodes?: readonly WorkflowNodeRead[]
}

export type WorkOrderTaskTone = 'blue' | 'red' | 'orange' | 'purple' | 'green' | 'gray'

export type WorkOrderActivityIcon =
  | 'phone'
  | 'task'
  | 'location'
  | 'appointment'
  | 'complete'
  | 'unavailable'

export interface WorkOrderActivity {
  /** Backend action identity retained only for stable local rendering keys. */
  readonly id: string
  readonly title: string
  readonly content: string
  readonly owner: string
  readonly time: string
  readonly icon: WorkOrderActivityIcon
  readonly tone: WorkOrderTaskTone
  readonly badge: string
}

export interface WorkflowDefinitionRead {
  readonly id: WorkflowDefinitionId
}

export interface WorkflowNodeRead {
  readonly id: WorkflowNodeRuntimeId
  readonly definitionId?: WorkflowDefinitionId
  readonly runId?: WorkflowRunId
  readonly parentNodeId?: WorkflowNodeRuntimeId
  readonly displayName?: string
  /** Adapter-normalized opaque form definition identity, when supplied by the node. */
  readonly formDefinitionId?: FormDefinitionId
  /** Semantic form purpose; the raw form definition identity stays Adapter-owned. */
  readonly formPurpose?: FormPurpose
  readonly formDataId?: FormDataId
  /** Node-instance readonly context; never baked into the field definition. */
  readonly formFieldIdsReadOnly?: readonly string[]
  readonly category: WorkflowNodeCategory
  readonly lifecycle: WorkflowNodeLifecycle
  readonly handlers?: readonly WorkflowHandlerIdentity[]
  readonly visibility?: WorkflowNodeVisibilityEvidence
  readonly isSystem?: boolean
  readonly isSentinel?: boolean
}

export interface FormDefinitionRead {
  readonly id: FormDefinitionId
  readonly purpose?: FormPurpose
  readonly fields?: readonly FormFieldRead[]
}

export interface FormFieldRead {
  /** Stable ExtField row identity; never used as a FormData value key. */
  readonly fieldId: string
  /** Backend business field name used in FormData values. May repeat across rows. */
  readonly valueKey: string
  readonly label: string
  readonly type: string
  readonly required: boolean
  readonly readOnly: boolean
  readonly order?: number
  readonly state?: number | string
  readonly fixed?: string | number | boolean
  readonly operationType?: string | number
  readonly showList?: readonly (string | number)[]
  /** Backend `multiple` flag; a multi-value control must not be rendered as a scalar choice. */
  readonly multiple?: boolean
  readonly options?: readonly FormFieldOptionRead[]
  /** Adapter-normalized conditional visibility; raw frontEndConfig never crosses the port. */
  readonly visibility?: FormFieldVisibility
  /** Adapter-normalized option provider identity, when evidenced by the field. */
  readonly valueOption?: string
  /** Safe structural presentation metadata; raw frontEndConfig stays Adapter-owned. */
  readonly presentation?: FormFieldPresentation
  /** Explicit capability boundary for metadata the current Runtime cannot safely interpret. */
  readonly unsupportedReason?: string
}

export interface FormFieldPresentation {
  readonly componentType?: string
  readonly placeholder?: string
  readonly width?: string | number
  readonly minlength?: number
  readonly maxlength?: number
  readonly group?: string
  readonly customizeFlag?: boolean
  readonly max?: number
  readonly min?: number
  readonly surveyTool?: boolean
  readonly urlShape?: string
  readonly paramsShape?: string
}

/** A normalized option may retain its hierarchy for cascade controls. */
export interface FormFieldOptionRead {
  readonly value: string
  readonly label: string
  readonly children?: readonly FormFieldOptionRead[]
}

export type FormFieldPrimitive = string | number | boolean
export type FormFieldValue =
  | FormFieldPrimitive
  | null
  | MediaValueRef
  | readonly (FormFieldPrimitive | MediaValueRef)[]

export interface FormValueCodecContext {
  readonly valueKey: string
}

/** Business/form codecs own persistence-specific value translation. */
export interface FormValueCodec {
  decode(value: unknown, context: FormValueCodecContext): FormFieldValue | undefined
  encode(value: FormFieldValue, context: FormValueCodecContext): unknown
}

export type FormFieldVisibilityPath = string | readonly string[]

export type FormFieldVisibility =
  | { readonly kind: 'equals'; readonly path: FormFieldVisibilityPath; readonly value: FormFieldValue }
  | { readonly kind: 'oneOf'; readonly path: FormFieldVisibilityPath; readonly values: readonly FormFieldValue[] }
  | { readonly kind: 'includes'; readonly path: FormFieldVisibilityPath; readonly value: FormFieldValue }
  | { readonly kind: 'exists'; readonly path: FormFieldVisibilityPath; readonly expected: boolean }
  | { readonly kind: 'all'; readonly conditions: readonly FormFieldVisibility[] }

export interface FormDataRead {
  readonly id: FormDataId
  readonly definitionId: FormDefinitionId
  readonly workflowRunId?: WorkflowRunId
  readonly values?: Readonly<Record<string, FormFieldValue>>
}

export interface CodeOptionRead {
  readonly value: string
  readonly label: string
  readonly children?: readonly CodeOptionRead[]
}

export interface CodeOptionsQuery {
  readonly valueOption?: string
  readonly parentValue?: string
}

export interface CascadeCodeOptionsQuery {
  /** R1 cascade code type, for example `repairParts`. */
  readonly codeType: string
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
    readonly valueCodec?: FormValueCodec
  }): Promise<OperationSnapshot<ReadPage<FormDataRead>>>
  getFormDetail(input: {
    readonly definitionId: FormDefinitionId
    readonly dataId: FormDataId
    readonly valueCodec?: FormValueCodec
  }): Promise<OperationSnapshot<FormDataRead>>
  getCodeOptions(
    query: CodeOptionsQuery,
  ): Promise<OperationSnapshot<ReadPage<CodeOptionRead>>>
  /** R1's batch code provider used by dynamic form fields. */
  getDynamicCodeOptions?(
    query: { readonly valueOption: string },
  ): Promise<OperationSnapshot<ReadPage<CodeOptionRead>>>
  getCascadeCodeOptions(
    query: CascadeCodeOptionsQuery,
  ): Promise<OperationSnapshot<ReadPage<CodeOptionRead>>>
}
