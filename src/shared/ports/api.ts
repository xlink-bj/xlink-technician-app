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
  readonly category: WorkflowNodeCategory
  readonly lifecycle: WorkflowNodeLifecycle
  readonly handlers?: readonly WorkflowHandlerIdentity[]
  readonly visibility?: WorkflowNodeVisibilityEvidence
  readonly isSystem?: boolean
  readonly isSentinel?: boolean
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
  }): Promise<OperationSnapshot<ReadPage<FormDataRead>>>
  getFormDetail(input: {
    readonly definitionId: FormDefinitionId
    readonly dataId: FormDataId
  }): Promise<OperationSnapshot<FormDataRead>>
  getCodeOptions(
    query: CodeOptionsQuery,
  ): Promise<OperationSnapshot<ReadPage<CodeOptionRead>>>
  getCascadeCodeOptions(
    query: CascadeCodeOptionsQuery,
  ): Promise<OperationSnapshot<ReadPage<CodeOptionRead>>>
}
