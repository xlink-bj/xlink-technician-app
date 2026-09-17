import type { FormDefinitionId, FormDataId, UserId, WorkOrderId, WorkflowNodeRuntimeId } from '@shared/types'
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
}

export interface ActionDraftIdentity {
  readonly version: 1
  readonly userId: UserId
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly actionIntent: WorkflowActionIntent
  readonly contentKind: ActionContentKind
  readonly contentIdentity?: string
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

export function actionDraftIdentityFor(action: ActionIdentity): ActionDraftIdentity {
  return {
    version: 1,
    userId: action.userId,
    workOrderId: action.workOrderId,
    workflowNodeId: action.workflowNodeId,
    actionIntent: action.actionIntent,
    contentKind: action.contentKind,
    ...(action.contentIdentity ? { contentIdentity: String(action.contentIdentity) } : {}),
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
    '2',
    encodeURIComponent(String(identity.userId)),
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
  return [...new Set([
    actionDraftLegacyStorageKey(identity),
    actionDraftLegacyTaggedStorageKey(identity),
  ])]
}

export function actionDraftStorageKeyPrefixForUser(userId: UserId): string {
  return ['action-workspace', '2', encodeURIComponent(String(userId))].join(':') + ':'
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
}
