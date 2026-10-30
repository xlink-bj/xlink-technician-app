import { describe, expect, it, vi } from 'vitest'
import type { StorageKey, StoragePort, SessionSnapshot } from '@shared/ports'
import type { ActionDescriptor } from '@runtimes/action'
import { asOpaqueId, type FormDataId, type OperationSnapshot } from '@shared/types'
import {
  actionMutationScopeFor, actionWorkspaceSessionScopeKey, createActionMutationCheckpoints,
} from '@features/work-orders/action-workspace-command-boundary'
import { loadActionMutationReceipt } from '@features/work-orders/action-mutation-receipt'

function succeeded<T>(data: T): OperationSnapshot<T> { return { state: 'succeeded', data } }
function storageFixture() {
  const values = new Map<string, unknown>()
  const storage = {
    read: vi.fn(async (key: StorageKey) => succeeded(values.get(key.key) ?? null)),
    write: vi.fn(async (key: StorageKey, value: unknown) => { values.set(key.key, value); return succeeded(undefined) }),
    remove: vi.fn(async (key: StorageKey) => { values.delete(key.key); return succeeded(undefined) }),
    listKeys: vi.fn(async () => succeeded([...values.keys()])),
  } as unknown as StoragePort
  return { storage, values }
}
const session = {
  sessionRef: asOpaqueId<'SessionRef'>('s-c3b'),
  user: { id: asOpaqueId<'UserId'>('u-c3b') },
  currentRole: { id: asOpaqueId<'RoleId'>('role-c3b') },
  roleVersion: 'v1', capabilityNames: [],
} as SessionSnapshot
const scope = {
  userId: 'u-c3b', workOrderId: 'wo-c3b', workflowNodeId: 'node-c3b',
  formDefinitionId: 'form-c3b', authorizationScope: actionWorkspaceSessionScopeKey(session),
}
const saved = asOpaqueId<'FormDataId'>('formdata-c3b')

describe('C3-B command scope and durable receipt checkpoints', () => {
  it('preserves actor fingerprint and denies cross-user or absent content', () => {
    expect(actionWorkspaceSessionScopeKey(session)).toBe(JSON.stringify(['s-c3b','u-c3b','role-c3b','v1']))
    const action = { userId: session.user.id, workOrderId: asOpaqueId<'WorkOrderId'>(scope.workOrderId),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(scope.workflowNodeId), contentIdentity: scope.formDefinitionId } as ActionDescriptor
    expect(actionMutationScopeFor(action, session, scope.authorizationScope)).toEqual(scope)
    expect(actionMutationScopeFor(action, null, scope.authorizationScope)).toBeNull()
    expect(actionMutationScopeFor(action, session, null)).toBeNull()
    expect(actionMutationScopeFor({ ...action, contentIdentity: undefined }, session, scope.authorizationScope)).toBeNull()
    expect(actionMutationScopeFor({ ...action, userId: asOpaqueId<'UserId'>('other') }, session, scope.authorizationScope)).toBeNull()
    expect(actionWorkspaceSessionScopeKey({ ...session, roleVersion: 'v2' })).not.toBe(scope.authorizationScope)
  })

  it('records a durable sequence and blocks a second instance or completed retry', async () => {
    const { storage } = storageFixture()
    const make = () => createActionMutationCheckpoints({
      storage, scope, isCurrent: () => true, currentFormDataId: () => undefined,
    })
    const first = make()
    expect((await first.beforeFormDispatch()).state).toBe('succeeded')
    expect((await first.beforeFormDispatch()).state).toBe('succeeded')
    expect((await make().beforeFormDispatch()).state).toBe('failed_terminal')
    expect((await first.afterFormSaved(saved)).state).toBe('succeeded')
    expect((await first.beforeWorkflowDispatch(saved)).state).toBe('succeeded')
    expect((await first.afterWorkflowCompleted()).state).toBe('succeeded')
    expect((await loadActionMutationReceipt(storage, scope)).data?.phase).toBe('completed')
    expect((await make().beforeFormDispatch()).state).toBe('failed_terminal')
  })

  it('records a delayed FormData ACK after role revocation, but refuses further dispatch', async () => {
    const { storage } = storageFixture()
    let current = true
    const checkpoint = createActionMutationCheckpoints({
      storage, scope, isCurrent: () => current, currentFormDataId: () => undefined,
    })
    expect((await checkpoint.beforeFormDispatch()).state).toBe('succeeded')
    current = false
    expect((await checkpoint.afterFormSaved(saved)).state).toBe('succeeded')
    expect((await loadActionMutationReceipt(storage, scope)).data?.phase).toBe('form_saved')
    expect((await checkpoint.beforeWorkflowDispatch(saved)).error?.category).toBe('session_invalid')
    expect((await loadActionMutationReceipt(storage, scope)).data?.phase).toBe('form_saved')
  })

  it('stays fail-closed when the role changes during async reservation read', async () => {
    const { storage, values } = storageFixture()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const originalRead = storage.read.bind(storage)
    let firstRead = true
    storage.read = (async <T>(key: StorageKey) => {
      if (firstRead) { firstRead = false; await gate }
      return originalRead<T>(key)
    }) as StoragePort['read']
    let current = true
    const checkpoint = createActionMutationCheckpoints({
      storage, scope, isCurrent: () => current, currentFormDataId: () => undefined,
    })
    const pending = checkpoint.beforeFormDispatch()
    current = false
    release()
    expect((await pending).error?.category).toBe('session_invalid')
    expect([...values.values()].some((x: any) => x?.phase === 'form_dispatched')).toBe(true)
    expect((await checkpoint.beforeWorkflowDispatch(saved)).error?.category).toBe('session_invalid')
  })

  it('never reserves a receipt when actor was already revoked', async () => {
    const { storage } = storageFixture()
    const checkpoint = createActionMutationCheckpoints({
      storage, scope, isCurrent: () => false, currentFormDataId: () => undefined,
    })
    expect((await checkpoint.beforeFormDispatch()).error?.category).toBe('session_invalid')
    expect(storage.write).not.toHaveBeenCalled()
  })
})
