import type {
  FormDataId,
  FormDefinitionId,
  OrganizationId,
  RoleId,
  UserId,
  WorkflowDefinitionId,
  WorkflowNodeRuntimeId,
  WorkflowRunId,
} from '@shared/types'
import type {
  WorkflowHandlerIdentity,
  WorkflowNodeCategory as ReadWorkflowNodeCategory,
  WorkflowNodeLifecycle as ReadWorkflowNodeLifecycle,
} from '@shared/ports'

export interface MainWorkflowContext {
  readonly kind: 'main'
  readonly definitionId: WorkflowDefinitionId
  readonly runId: WorkflowRunId
}

export interface ChildWorkflowContext {
  readonly kind: 'child'
  readonly parent: {
    readonly runId: WorkflowRunId
    readonly nodeId: WorkflowNodeRuntimeId
  }
  readonly definitionId: WorkflowDefinitionId
  readonly runId: WorkflowRunId
}

export type WorkflowContext = MainWorkflowContext | ChildWorkflowContext

export interface SubworkflowRef {
  readonly parentRunId: WorkflowRunId
  readonly parentNodeId: WorkflowNodeRuntimeId
  readonly definitionId: WorkflowDefinitionId
  readonly runId: WorkflowRunId
}

export interface WorkflowFormIdentity {
  readonly definitionId: FormDefinitionId
  readonly dataId?: FormDataId
}

export interface WorkflowIdentityGraph {
  readonly context: WorkflowContext
  readonly nodeId: WorkflowNodeRuntimeId
  readonly form?: WorkflowFormIdentity
}

export type HandlerIdentity = WorkflowHandlerIdentity

export interface WorkflowActor {
  readonly userId: UserId
  readonly roleIds: readonly RoleId[]
  readonly organizationRoles: readonly {
    readonly organizationId: OrganizationId
    readonly roleId: RoleId
  }[]
}

export type WorkflowNodeCategory = ReadWorkflowNodeCategory

export type WorkflowNodeLifecycle = ReadWorkflowNodeLifecycle

export interface WorkflowNodeMetadata {
  readonly id: WorkflowNodeRuntimeId
  readonly category: WorkflowNodeCategory
  readonly lifecycle: WorkflowNodeLifecycle
  readonly handlers?: readonly HandlerIdentity[]
  readonly isSystem?: boolean
  readonly isSentinel?: boolean
}

export type WorkflowActionIntent =
  | 'interact_with_form'
  | 'complete'
  | 'open_subworkflow'
  | 'place_order'
  | 'transition'
  | 'rollback'
  | 'takeback'
  | 'cancel'
  | 'acceptance'
  | 'quotation'
  | 'construction'

export type WorkflowBlockedReason =
  | 'not_handler'
  | 'node_inactive'
  | 'required_form_missing'
  | 'unsupported_node_type'
  | 'policy_unverified'
  | 'system_node'
  | 'non_user_node'

export interface WorkflowActionPolicyDecision {
  readonly action: WorkflowActionIntent
  readonly allowed: boolean
  readonly reason?: WorkflowBlockedReason
  readonly command?: {
    readonly type: WorkflowActionIntent
    readonly nodeId: WorkflowNodeRuntimeId
  }
}
