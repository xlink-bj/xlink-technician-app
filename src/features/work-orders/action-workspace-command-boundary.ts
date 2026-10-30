import type { ActionDescriptor } from '@runtimes/action'
import type { FormMutationCheckpoints, SessionSnapshot, StoragePort } from '@shared/ports'
import { createOperationError, type FormDataId, type OperationSnapshot } from '@shared/types'
import {
  beginActionMutation, recordActionFormSaved, recordActionWorkflowCompleted,
  type ActionMutationScope,
} from './action-mutation-receipt'

/** Preserve actor fingerprint JSON order for already-persisted receipts. */
export function actionWorkspaceSessionScopeKey(session: SessionSnapshot): string {
  return JSON.stringify([
    String(session.sessionRef),
    String(session.user.id),
    session.currentRole ? String(session.currentRole.id) : null,
    session.roleVersion ?? null,
  ])
}

export function actionMutationScopeFor(
  action: ActionDescriptor,
  session: SessionSnapshot | null,
  loadedSessionScope: string | null,
): ActionMutationScope | null {
  if (!session || !loadedSessionScope || !action.contentIdentity
    || String(session.user.id) !== String(action.userId)) return null
  return {
    userId: String(action.userId),
    workOrderId: String(action.workOrderId),
    workflowNodeId: String(action.workflowNodeId),
    formDefinitionId: String(action.contentIdentity),
    authorizationScope: loadedSessionScope,
  }
}

function denial(message: string): OperationSnapshot<void> {
  return { state: 'failed_terminal', error: createOperationError('session_invalid', message) }
}
function failedFrom<T>(result: OperationSnapshot<T>): OperationSnapshot<void> {
  return result.state === 'succeeded'
    ? { state: 'failed_terminal', error: createOperationError('server_terminal', 'Action Workspace read was incomplete') }
    : { state: result.state, ...(result.error ? { error: result.error } : {}) }
}

/** Per-command lease and durable ACK coordinator; the caller owns active role and descriptor. */
export function createActionMutationCheckpoints(input: {
  readonly storage: StoragePort
  readonly scope: ActionMutationScope
  readonly isCurrent: () => boolean
  readonly currentFormDataId: () => FormDataId | undefined
}): FormMutationCheckpoints {
  const { storage, scope } = input
  let formReserved = false
  let workflowReserved = false
  let savedId: FormDataId | null = null
  let completed = false
  return {
    async beforeFormDispatch() {
      if (!input.isCurrent()) return denial('账号或角色已变化，禁止保存旧表单。')
      if (formReserved) return { state: 'succeeded' }
      const result = await beginActionMutation(storage, scope, 'form_dispatched', input.currentFormDataId())
      if (result.state !== 'succeeded') return failedFrom(result)
      if (!input.isCurrent()) return denial('保存前账号或角色已变化，结果待核查。')
      formReserved = true
      return { state: 'succeeded' }
    },
    async afterFormSaved(formDataId) {
      if (savedId === formDataId) return { state: 'succeeded' }
      const result = await recordActionFormSaved(storage, scope, formDataId)
      if (result.state !== 'succeeded') return failedFrom(result)
      savedId = formDataId
      return { state: 'succeeded' }
    },
    async beforeWorkflowDispatch(formDataId) {
      if (!input.isCurrent()) return denial('账号或角色已变化，禁止完成旧工作流。')
      if (workflowReserved) return { state: 'succeeded' }
      const result = await beginActionMutation(storage, scope, 'workflow_dispatched', formDataId)
      if (result.state !== 'succeeded') return failedFrom(result)
      if (!input.isCurrent()) return denial('完成前账号或角色已变化，结果待核查。')
      workflowReserved = true
      return { state: 'succeeded' }
    },
    async afterWorkflowCompleted() {
      if (completed) return { state: 'succeeded' }
      const result = await recordActionWorkflowCompleted(storage, scope)
      if (result.state !== 'succeeded') return failedFrom(result)
      completed = true
      return { state: 'succeeded' }
    },
  }
}
