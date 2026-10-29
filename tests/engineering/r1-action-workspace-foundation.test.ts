import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { actionDraftIdentityFor, createActionDraftRepository, type ActionDraftRepository } from '@runtimes/action'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { mediaTaskMatchesDynamicForm } from '@features/work-orders/action-workspace-draft-utils'
import type {
  AppointmentFormRead, SessionSnapshot, StoragePort, TechnicianApiCommandPort,
  TechnicianApiReadPort, WorkOrderDetail, MediaUploadQueuePort,
} from '@shared/ports'
import { asOpaqueId, type MediaUploadTask, type OperationSnapshot } from '@shared/types'
import { watch } from 'vue'

function success<T>(data: T): OperationSnapshot<T> { return { state: 'succeeded', data } }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

const workOrderId = asOpaqueId<'WorkOrderId'>('foundation-order')
const nodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('foundation-node')
const definitionId = asOpaqueId<'FormDefinitionId'>('foundation-definition')
const roleA = asOpaqueId<'RoleId'>('foundation-role-a')
const roleB = asOpaqueId<'RoleId'>('foundation-role-b')
const userId = asOpaqueId<'UserId'>('foundation-user')
const sessionA: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('foundation-session'),
  user: { id: userId }, currentRole: { id: roleA }, capabilityNames: [], roleVersion: 'v1',
}
const sessionB: SessionSnapshot = { ...sessionA, currentRole: { id: roleB }, roleVersion: 'v2' }
const detail: WorkOrderDetail = {
  id: workOrderId,
  workflowNodes: [{
    id: nodeId, category: 'forms', lifecycle: 'active', displayName: '预约时间',
    formPurpose: 'appointment', formDefinitionId: definitionId,
    visibility: { evidenceState: 'verified', viewableRoleIds: [roleA, roleB] },
  }],
}
const form: AppointmentFormRead = {
  definitionId,
  fields: [{ fieldId: 'note', valueKey: 'note', label: '备注', type: 'textarea', required: false, readOnly: false }],
  values: {},
}
const input = { workOrderId, workflowNodeId: nodeId, actionIntent: 'set_appointment' }

function fixture(options: { repository?: ActionDraftRepository; mediaQueue?: MediaUploadQueuePort; survey?: boolean } = {}) {
  const storageValues = new Map<string, unknown>()
  const storage = {
    read: vi.fn(async (key: { key: string }) => success(storageValues.get(key.key) ?? null)),
    write: vi.fn(async (key: { key: string }, value: unknown) => { storageValues.set(key.key, value); return success(undefined) }),
    remove: vi.fn(async (key: { key: string }) => { storageValues.delete(key.key); return success(undefined) }),
    listKeys: vi.fn(async () => success([...storageValues.keys()])),
  } as unknown as StoragePort
  const repository = options.repository ?? createActionDraftRepository(storage)
  const surveyDetail: WorkOrderDetail = {
    ...detail, workflowNodes: [{
      ...detail.workflowNodes![0]!, formPurpose: 'survey', displayName: '现场勘查',
    }],
  }
  const api = { getWorkOrderDetail: vi.fn(async () => success(options.survey ? surveyDetail : detail)) } as unknown as TechnicianApiReadPort
  const command = {
    readAppointmentForm: vi.fn(async () => success(form)),
    readDynamicForm: vi.fn(async () => success({
      purpose: 'survey' as const, definitionId,
      fields: [{ fieldId: 'photo', valueKey: 'photo', label: '照片', type: 'image' as const, required: false, readOnly: false }],
      values: {},
    })),
  } as unknown as TechnicianApiCommandPort
  let activeSession: SessionSnapshot | null = sessionA
  const store = useActionWorkspaceStore()
  store.configure({
    apiRead: api, commandApi: command, draftRepository: repository, storage,
    navigation: { navigate: vi.fn(async () => undefined) },
    getSession: () => activeSession,
    ...(options.mediaQueue ? { mediaUploadQueue: options.mediaQueue } : {}),
    debounceMs: 1000,
  })
  return {
    store, api, command, repository, storage, storageValues,
    changeSession(next: SessionSnapshot | null) { activeSession = next },
    load: () => store.load({ ...input, actionIntent: options.survey ? 'interact_with_form' : input.actionIntent }),
  }
}

describe('R1 Action Workspace foundation: async generation and authorization isolation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
  })

  it('does not publish an old appointment draft after clear supersedes its pending read', async () => {
    const gate = deferred<OperationSnapshot<any>>()
    const repository: ActionDraftRepository = {
      read: vi.fn(async () => gate.promise),
      write: vi.fn(async () => success(undefined)),
      remove: vi.fn(async () => success(undefined)),
      listForUser: vi.fn(async () => success({ entries: [], invalidRecordCount: 0 })),
    }
    const x = fixture({ repository })
    const loading = x.load()
    await vi.waitFor(() => expect(repository.read).toHaveBeenCalled())
    x.store.clear()
    gate.resolve(success({
      version: 1, identity: actionDraftIdentityFor({
        userId, workOrderId, workflowNodeId: nodeId, actionIntent: 'set_appointment',
        contentKind: 'dynamic_form', contentIdentity: definitionId,
      }, roleA), status: 'unfinished', updatedAt: '2026-10-22T10:00:00Z', values: { note: 'late sensitive draft' },
    }))
    expect((await loading).state).toBe('failed_terminal')
    expect(x.store.appointmentForm).toBeNull()
    expect(x.store.descriptor).toBeNull()
    expect(x.store.loadState).toBe('idle')
  })

  it('never applies a completed old draft read after the authenticated role changes', async () => {
    const gate = deferred<OperationSnapshot<any>>()
    const repository: ActionDraftRepository = {
      read: vi.fn(async () => gate.promise),
      write: vi.fn(async () => success(undefined)),
      remove: vi.fn(async () => success(undefined)),
      listForUser: vi.fn(async () => success({ entries: [], invalidRecordCount: 0 })),
    }
    const x = fixture({ repository })
    const leaked: unknown[] = []
    const unwatch = watch(() => x.store.appointmentForm?.values.note, next => { if (next) leaked.push(next) }, { flush: 'sync' })
    const loading = x.load()
    await vi.waitFor(() => expect(repository.read).toHaveBeenCalled())
    x.changeSession(sessionB)
    gate.resolve(success({
      version: 1, identity: actionDraftIdentityFor({
        userId, workOrderId, workflowNodeId: nodeId, actionIntent: 'set_appointment',
        contentKind: 'dynamic_form', contentIdentity: definitionId,
      }, roleA), status: 'unfinished', updatedAt: '2026-10-22T10:00:00Z', values: { note: 'must not flash' },
    }))
    const outcome = await loading
    unwatch()
    expect(outcome.error?.category).toBe('session_invalid')
    expect(x.store.appointmentForm).toBeNull()
    expect(leaked).toEqual([])
  })

  it('persists appointment drafts with explicit role provenance and keeps other role drafts isolated', async () => {
    const x = fixture()
    expect((await x.load()).state).toBe('succeeded')
    expect(x.store.setField('note', 'role-A sensitive note').state).toBe('succeeded')
    expect((await x.store.flushDraft()).state).toBe('succeeded')
    const roleAIdentity = actionDraftIdentityFor({
      userId, workOrderId, workflowNodeId: nodeId, actionIntent: 'set_appointment',
      contentKind: 'dynamic_form', contentIdentity: definitionId,
    }, roleA)
    expect((await x.repository.read(roleAIdentity)).data?.values.note).toBe('role-A sensitive note')
    x.changeSession(sessionB)
    expect((await x.load()).state).toBe('succeeded')
    expect(x.store.appointmentForm?.values.note).toBeUndefined()
    expect(x.store.setField('note', 'role-B separate note').state).toBe('succeeded')
    expect((await x.store.flushDraft()).state).toBe('succeeded')
    const roleBIdentity = { ...roleAIdentity, roleId: roleB }
    expect((await x.repository.read(roleBIdentity)).data?.values.note).toBe('role-B separate note')
    expect((await x.repository.read(roleAIdentity)).data?.values.note).toBe('role-A sensitive note')
  })

  it('rejects stale edits and does not debounce-persist the previous role after switching', async () => {
    vi.useFakeTimers()
    try {
      const x = fixture()
      expect((await x.load()).state).toBe('succeeded')
      expect(x.store.setField('note', 'pending private draft').state).toBe('succeeded')
      x.changeSession(sessionB)
      expect(x.store.setField('note', 'must not change').error?.category).toBe('session_invalid')
      await vi.advanceTimersByTimeAsync(2000)
      expect(x.storage.write).not.toHaveBeenCalled()
      expect(x.store.appointmentForm?.values.note).toBe('pending private draft')
      expect((await x.store.flushDraft()).error?.category).toBe('session_invalid')
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects sibling draft reads on role change both before and after asynchronous storage', async () => {
    const x = fixture()
    expect((await x.load()).state).toBe('succeeded')
    const requested = {
      workOrderId, workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('sibling-node'),
      actionIntent: 'interact_with_form' as const, contentKind: 'dynamic_form' as const,
    }
    const gate = deferred<OperationSnapshot<null>>()
    const readSpy = vi.spyOn(x.repository, 'read').mockImplementationOnce(async () => gate.promise)
    const reading = x.store.readSiblingActionDraft(requested)
    x.changeSession(sessionB)
    gate.resolve(success(null))
    expect((await reading).error?.category).toBe('session_invalid')
    const called = readSpy.mock.calls.length
    expect((await x.store.readSiblingActionDraft(requested)).error?.category).toBe('session_invalid')
    expect(readSpy).toHaveBeenCalledTimes(called)
  })

  it('does not accept an unrelated Work Order detail as the requested command identity', async () => {
    const x = fixture()
    vi.mocked(x.api.getWorkOrderDetail).mockResolvedValueOnce(success({
      ...detail, id: asOpaqueId<'WorkOrderId'>('different-order'),
    }))
    expect((await x.load()).error?.category).toBe('unsupported_capability')
    expect(x.command.readAppointmentForm).not.toHaveBeenCalled()
    expect(x.store.descriptor).toBeNull()
  })

  it('does not mount a dynamic form returned for a different FormDefinition', async () => {
    const x = fixture({ survey: true })
    vi.mocked(x.command.readDynamicForm!).mockResolvedValueOnce(success({
      purpose: 'survey', definitionId: asOpaqueId<'FormDefinitionId'>('another-definition'),
      fields: [{ fieldId: 'note', valueKey: 'note', label: '备注', type: 'text', readOnly: false, required: false }],
      values: {},
    }))
    expect((await x.load()).error?.category).toBe('unsupported_capability')
    expect(x.store.dynamicForm).toBeNull()
    expect(x.storage.write).not.toHaveBeenCalled()
  })

  it('rejects wrong-user/order/node media queue rows despite matching form/field labels', () => {
    const descriptor = {
      userId, workOrderId, workflowNodeId: nodeId, contentIdentity: definitionId,
      actionIntent: 'interact_with_form' as const, contentKind: 'dynamic_form' as const,
      title: '现场勘查', execution: 'enabled' as const,
    }
    const dynamic = {
      purpose: 'survey' as const, definitionId,
      fields: [{ fieldId: 'photo', valueKey: 'photo', label: '照片', type: 'image' as const, required: false, readOnly: false }],
      values: {},
    }
    const task: MediaUploadTask = {
      schemaVersion: 1, taskId: asOpaqueId<'MediaUploadTaskId'>('foundation-media'),
      state: 'uploaded', attempts: 1, createdAt: '2026-10-22T10:00:00Z', updatedAt: '2026-10-22T10:00:00Z',
      scope: {
        userId, workOrderId, workflowNodeId: nodeId, formDefinitionId: definitionId,
        fieldId: 'photo', valueKey: 'photo', localAssetId: asOpaqueId<'LocalMediaRef'>('foundation-photo'),
      },
      uploadedRef: { url: 'https://example.invalid/photo.jpg', source: 'library', uploadState: 'uploaded' },
    }
    expect(mediaTaskMatchesDynamicForm(task, descriptor, dynamic)).toBe(true)
    expect(mediaTaskMatchesDynamicForm({ ...task, scope: { ...task.scope, userId: asOpaqueId<'UserId'>('another-user') } }, descriptor, dynamic)).toBe(false)
    expect(mediaTaskMatchesDynamicForm({ ...task, scope: { ...task.scope, workOrderId: asOpaqueId<'WorkOrderId'>('another-order') } }, descriptor, dynamic)).toBe(false)
    expect(mediaTaskMatchesDynamicForm({ ...task, scope: { ...task.scope, workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('another-node') } }, descriptor, dynamic)).toBe(false)
  })

  it('stops media queue recovery before resuming old tasks when the role changes during the list', async () => {
    const gate = deferred<OperationSnapshot<readonly MediaUploadTask[]>>()
    const queue = {
      listForAction: vi.fn(async () => gate.promise),
      process: vi.fn(async (task: string) => success({ taskId: task })),
    } as unknown as MediaUploadQueuePort
    const x = fixture({ mediaQueue: queue, survey: true })
    const loading = x.load()
    await vi.waitFor(() => expect(queue.listForAction).toHaveBeenCalled())
    x.changeSession(sessionB)
    gate.resolve(success([{
      schemaVersion: 1, taskId: asOpaqueId<'MediaUploadTaskId'>('stale-task'),
      state: 'postprocessing', attempts: 0, createdAt: '2026-10-22T10:00:00Z', updatedAt: '2026-10-22T10:00:00Z',
      scope: {
        userId, workOrderId, workflowNodeId: nodeId, formDefinitionId: definitionId,
        fieldId: 'photo', valueKey: 'photo', localAssetId: asOpaqueId<'LocalMediaRef'>('stale-asset'),
      },
    }]))
    expect((await loading).error?.category).toBe('session_invalid')
    expect(x.store.descriptor).toBeNull()
    expect(queue.process).not.toHaveBeenCalled()
  })
})
