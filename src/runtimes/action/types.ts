import type { FormDefinitionId, FormDataId, RoleId, UserId, WorkOrderId, WorkflowNodeRuntimeId } from '@shared/types'
import type { FormPurpose } from '@shared/ports'
import type { WorkflowActionIntent } from '@runtimes/workflow'

/** Content kinds are an explicit plug-in boundary for future Actions. */
export type ActionContentKind =
  | 'dynamic_form'
  | 'quotation'
  | 'contract'
  | 'media_signature'
  | 'composite'
  | 'unsupported'

export type ActionExecution = 'enabled' | 'disabled'

export type ActionBusinessResult = 'not_started' | 'succeeded' | 'failed'

export type ActionDraftFinalizationStatus = 'not_started' | 'completed' | 'pending'

export type ActionRefreshStatus = 'not_started' | 'refreshed' | 'pending'

export type ActionLifecycle =
  | 'available'
  | 'in_progress'
  | 'draft_local'
  | 'submitting'
  | 'succeeded'
  | 'failed_retryable'
  | 'failed_terminal'
  | 'blocked'

export type ActionDraftStatus =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'saved_local'
  | 'restore_available'
  | 'save_failed'

export interface ActionIdentity {
  readonly userId: UserId
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly actionIntent: WorkflowActionIntent
  readonly contentKind: ActionContentKind
  readonly contentIdentity?: FormDefinitionId | FormDataId | string
}

export interface ActionDescriptor extends ActionIdentity {
  readonly title: string
  readonly execution: ActionExecution
  /** Source-preserved R1 nodeDef.nodeType; separate from display category. */
  readonly sourceNodeType?: string
  /** Semantic form identity resolved by the Adapter, not inferred from intent. */
  readonly formPurpose?: FormPurpose
}

export interface ActionDraftIdentity {
  readonly version: 1
  readonly userId: UserId
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly actionIntent: WorkflowActionIntent
  readonly contentKind: ActionContentKind
  readonly contentIdentity?: string
  /** Role provenance for v3 scoped drafts; absent only for legacy unscoped records. */
  readonly roleId?: RoleId
}

export interface ActionDraftRecord<TValues extends Readonly<Record<string, unknown>>> {
  readonly version: 1
  readonly identity: ActionDraftIdentity
  readonly values: TValues
  readonly updatedAt: string
  readonly status: 'unfinished' | 'completed'
}

export function actionContentKindForIntent(intent: WorkflowActionIntent): ActionContentKind {
  switch (intent) {
    case 'set_appointment':
    case 'interact_with_form':
      return 'dynamic_form'
    case 'place_order':
    case 'quotation':
      return 'quotation'
    case 'construction':
      return 'composite'
    default:
      return 'unsupported'
  }
}

export function actionExecutionForWorkflowDecision(execution: 'enabled' | 'disabled_read_only'): ActionExecution {
  return execution === 'enabled' ? 'enabled' : 'disabled'
}

export function actionDraftIdentityFor(action: ActionIdentity, roleId?: RoleId): ActionDraftIdentity {
  return {
    version: 1,
    userId: action.userId,
    workOrderId: action.workOrderId,
    workflowNodeId: action.workflowNodeId,
    actionIntent: action.actionIntent,
    contentKind: action.contentKind,
    ...(action.contentIdentity ? { contentIdentity: String(action.contentIdentity) } : {}),
    ...(roleId ? { roleId } : {}),
  }
}

export function actionDraftStorageKey(identity: ActionDraftIdentity): string {
  // Codec v2 uses a tagged optional segment so absence and a literal content
  // identity such as "none" remain distinct without relying on a reserved
  // user value.
  const contentIdentity = identity.contentIdentity === undefined
    ? 'u'
    : `v${encodeURIComponent(String(identity.contentIdentity))}`
  return [
    'action-workspace',
    identity.roleId ? '3' : '2',
    encodeURIComponent(String(identity.userId)),
    ...(identity.roleId ? [encodeURIComponent(String(identity.roleId))] : []),
    encodeURIComponent(String(identity.workOrderId)),
    encodeURIComponent(String(identity.workflowNodeId)),
    encodeURIComponent(identity.actionIntent),
    encodeURIComponent(identity.contentKind),
    encodeURIComponent(contentIdentity),
  ].join(':')
}

/**
 * The v1 key format is read/remove compatibility only. New writes must use
 * actionDraftStorageKey so an app upgrade cannot create an identity collision.
 */
export function actionDraftLegacyStorageKey(identity: ActionDraftIdentity): string {
  const contentIdentity = identity.contentIdentity ?? 'none'
  return [
    'action-workspace',
    '1',
    encodeURIComponent(String(identity.userId)),
    encodeURIComponent(String(identity.workOrderId)),
    encodeURIComponent(String(identity.workflowNodeId)),
    encodeURIComponent(identity.actionIntent),
    encodeURIComponent(identity.contentKind),
    encodeURIComponent(contentIdentity),
  ].join(':')
}

/**
 * The immediately preceding v1 implementation used the v2 tags without
 * bumping the key version. Keep those keys readable/removable as well.
 */
function actionDraftLegacyTaggedStorageKey(identity: ActionDraftIdentity): string {
  const contentIdentity = identity.contentIdentity === undefined
    ? 'u'
    : `v${encodeURIComponent(String(identity.contentIdentity))}`
  return [
    'action-workspace',
    '1',
    encodeURIComponent(String(identity.userId)),
    encodeURIComponent(String(identity.workOrderId)),
    encodeURIComponent(String(identity.workflowNodeId)),
    encodeURIComponent(identity.actionIntent),
    encodeURIComponent(identity.contentKind),
    encodeURIComponent(contentIdentity),
  ].join(':')
}

export function actionDraftLegacyStorageKeys(identity: ActionDraftIdentity): readonly string[] {
  // A role-provenanced v3 draft may NEVER recover unprovenanced v1/v2 data.
  if (identity.roleId) return []
  return [...new Set([
    actionDraftLegacyStorageKey(identity),
    actionDraftLegacyTaggedStorageKey(identity),
  ])]
}

export function actionDraftStorageKeyPrefixForUser(userId: UserId): string {
  return ['action-workspace', '2', encodeURIComponent(String(userId))].join(':') + ':'
}

export function actionDraftScopedStorageKeyPrefixForRole(userId: UserId, roleId: RoleId): string {
  return ['action-workspace', '3', encodeURIComponent(String(userId)), encodeURIComponent(String(roleId))].join(':') + ':'
}

export function actionDraftLegacyStorageKeyPrefixForUser(userId: UserId): string {
  return ['action-workspace', '1', encodeURIComponent(String(userId))].join(':') + ':'
}

export function actionDraftIdentityMatches(
  left: ActionDraftIdentity,
  right: ActionDraftIdentity,
): boolean {
  return left.version === right.version
    && String(left.userId) === String(right.userId)
    && String(left.workOrderId) === String(right.workOrderId)
    && String(left.workflowNodeId) === String(right.workflowNodeId)
    && left.actionIntent === right.actionIntent
    && left.contentKind === right.contentKind
    && (left.contentIdentity ?? '') === (right.contentIdentity ?? '')
    && (left.roleId === undefined ? right.roleId === undefined : String(left.roleId) === String(right.roleId))
}
