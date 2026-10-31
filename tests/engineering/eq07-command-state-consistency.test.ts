import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createActionDraftRepository } from '@runtimes/action'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import type {
  AppointmentFormRead,
  DynamicFormRead,
  MediaFilePickerPort,
  UploadPort,
  SessionSnapshot,
  StoragePort,
  SubmitAppointmentInput,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
  WorkOrderDetail,
} from '@shared/ports'
import {
  asOpaqueId, createCapabilityResult, type FormDataId,
  type LocalMedia, type OperationSnapshot, type UploadedMediaRef,
} from '@shared/types'

function success<T>(data: T): OperationSnapshot<T> { return { state: 'succeeded', data } }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

const roleId = asOpaqueId<'RoleId'>('eq07-role')
const workOrderId = asOpaqueId<'WorkOrderId'>('eq07-work-order')
const nodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('eq07-node')
const definitionId = asOpaqueId<'FormDefinitionId'>('eq07-form')
const dataId = asOpaqueId<'FormDataId'>('eq07-data')
const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('eq07-session'),
  user: { id: asOpaqueId<'UserId'>('eq07-user') },
  currentRole: { id: roleId },
  capabilityNames: [],
}
function fixture(kind: 'survey' | 'appointment') {
  const intent = kind === 'survey' ? 'interact_with_form' : 'set_appointment'
  const detail: WorkOrderDetail = {
    id: workOrderId,
    workflowRunId: asOpaqueId<'WorkflowRunId'>('eq07-workflow'),
    workflowNodes: [{
      id: nodeId, category: 'forms', lifecycle: 'active',
      displayName: kind === 'survey' ? '现场勘察' : '预约上门',
      formDefinitionId: definitionId, formPurpose: kind,
      visibility: { evidenceState: 'verified', viewableRoleIds: [roleId] },
    }],
  }
  const form: DynamicFormRead = {
    purpose: 'survey', definitionId,
    fields: [
      { fieldId: 'summary', valueKey: 'summary', label: '情况', type: 'textarea', required: true, readOnly: false },
      { fieldId: 'note', valueKey: 'note', label: '备注', type: 'textarea', required: false, readOnly: false },
      { fieldId: 'photo', valueKey: 'photo', label: '照片', type: 'image', required: false, readOnly: false },
    ],
    values: {},
  }
  const appointment: AppointmentFormRead = {
    definitionId,
    fields: [
      { fieldId: 'datetime', valueKey: 'datetime', label: '上门时间', type: 'datetime', required: true, readOnly: false },
    ],
    values: {},
  }
  const api = {
    getWorkOrderDetail: vi.fn(async () => success(detail)),
  } as unknown as TechnicianApiReadPort
  const command = {
    readDynamicForm: vi.fn(async () => success(form)),
    readAppointmentForm: vi.fn(async () => success(appointment)),
    saveDynamicForm: vi.fn(async () => success(dataId)),
    completeWorkflowNode: vi.fn(async () => success(undefined)),
    submitAppointment: vi.fn(async (input: SubmitAppointmentInput) => {
      const saved = await input.mutation?.afterFormSaved(dataId)
      if (saved?.state !== 'succeeded') return saved ?? { state: 'failed_terminal' }
      const reserved = await input.mutation?.beforeWorkflowDispatch(dataId)
      if (reserved?.state !== 'succeeded') return reserved ?? { state: 'failed_terminal' }
      return input.mutation!.afterWorkflowCompleted()
    }),
  } as unknown as TechnicianApiCommandPort
  const stored = new Map<string, unknown>()
  const storage = {
    read: vi.fn(async (key: { key: string }) => success(stored.get(key.key) ?? null)),
    write: vi.fn(async (key: { key: string }, value: unknown) => { stored.set(key.key, value); return success(undefined) }),
    remove: vi.fn(async (key: { key: string }) => { stored.delete(key.key); return success(undefined) }),
    listKeys: vi.fn(async () => success([...stored.keys()])),
  } as unknown as StoragePort
  const picker: MediaFilePickerPort = {
    pick: vi.fn(async () => createCapabilityResult<readonly LocalMedia[]>('photo-library', 'granted', [{
      ref: asOpaqueId<'LocalMediaRef'>('eq07-local-photo'),
      localPath: '/tmp/eq07-local-only.jpg',
      mimeType: 'image/jpeg',
      source: 'library' as const,
    }])),
  }
  const upload: UploadPort = {
    upload: vi.fn(async (): Promise<OperationSnapshot<UploadedMediaRef>> => success({
      url: 'https://mock-upload.invalid/eq07-local-photo', source: 'library',
      mimeType: 'image/jpeg', uploadState: 'uploaded' as const,
    })),
  }
  let activeSession: SessionSnapshot | null = session
  const store = useActionWorkspaceStore()
  store.configure({
    apiRead: api, commandApi: command,
    draftRepository: createActionDraftRepository(storage),
    storage,
    navigation: { navigate: vi.fn(async () => undefined) },
    getSession: () => activeSession,
    mediaFilePicker: picker, upload,
    debounceMs: 60000,
  })
  return {
    store, api, command, storage, picker, upload, intent,
    changeSession(next: SessionSnapshot | null) { activeSession = next },
    async load() {
      const result = await store.load({ workOrderId, workflowNodeId: nodeId, actionIntent: intent })
      expect(result.state).toBe('succeeded')
    },
    fill() {
      expect(store.setField(kind === 'survey' ? 'summary' : 'datetime',
        kind === 'survey' ? '先写入情况' : '2026-04-20 10:00').state).toBe('succeeded')
    },
  }
}

describe('EQ07 P0 command and form revision consistency / synthetic, no business network', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_MOCK', '')
  })

  it('preserves edits made after FormData dispatch and keeps Workflow Complete blocked until resave', async () => {
    const x = fixture('survey')
    await x.load()
    x.fill()
    const gate = deferred<OperationSnapshot<FormDataId>>()
    vi.mocked(x.command.saveDynamicForm!).mockImplementationOnce(async () => gate.promise)
    const saving = x.store.saveDynamicForm()
    await vi.waitFor(() => expect(x.command.saveDynamicForm).toHaveBeenCalledTimes(1))
    expect(x.store.setField('note', '请求发出后新增备注').state).toBe('succeeded')
    gate.resolve(success(dataId))
    expect((await saving).error?.category).toBe('cancelled')
    expect(x.store.dynamicForm?.values.note).toBe('请求发出后新增备注')
    expect(x.store.dynamicForm?.dataId).toBe(dataId)
    expect(x.store.dynamicFormSaveState).toBe('not_saved')
    expect(x.store.canSubmit).toBe(false)
    expect((await x.store.completeDynamicForm()).state).toBe('failed_terminal')
    expect(x.command.completeWorkflowNode).not.toHaveBeenCalled()
    expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
    expect(vi.mocked(x.command.saveDynamicForm!).mock.calls[1]?.[0]).toMatchObject({
      formDataId: dataId, values: { summary: '先写入情况', note: '请求发出后新增备注' },
    })
    expect(x.store.canSubmit).toBe(true)
  })

  it('single-flights FormData from BEFORE draft flush and rejects a second tap', async () => {
    const x = fixture('survey')
    await x.load()
    x.fill()
    const gate = deferred<OperationSnapshot<void>>()
    vi.mocked(x.storage.write).mockImplementationOnce(async () => gate.promise)
    const first = x.store.saveDynamicForm()
    expect(x.store.dynamicFormSaveState).toBe('saving')
    expect((await x.store.saveDynamicForm()).error?.category).toBe('validation')
    expect(x.command.saveDynamicForm).not.toHaveBeenCalled()
    gate.resolve(success(undefined))
    expect((await first).state).toBe('succeeded')
    expect(x.command.saveDynamicForm).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch a stale snapshot when the user edits during local draft flush', async () => {
    const x = fixture('survey')
    await x.load()
    x.fill()
    const gate = deferred<OperationSnapshot<void>>()
    vi.mocked(x.storage.write).mockImplementationOnce(async () => gate.promise)
    const pending = x.store.saveDynamicForm()
    expect(x.store.setField('note', '等待落盘期间的新内容').state).toBe('succeeded')
    gate.resolve(success(undefined))
    expect((await pending).error?.category).toBe('cancelled')
    expect(x.command.saveDynamicForm).not.toHaveBeenCalled()
    expect(x.store.dynamicFormSaveState).toBe('not_saved')
    expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
    expect(vi.mocked(x.command.saveDynamicForm!).mock.calls[0]?.[0].values).toMatchObject({
      note: '等待落盘期间的新内容',
    })
  })

  it('blocks remote FormData on failed local draft persistence, allows explicit retry only', async () => {
    const x = fixture('survey')
    await x.load()
    x.fill()
    vi.mocked(x.storage.write).mockResolvedValueOnce({
      state: 'failed_retryable', error: { category: 'network_retryable', message: 'local fault', retryable: true },
    })
    expect((await x.store.saveDynamicForm()).state).toBe('failed_retryable')
    expect(x.command.saveDynamicForm).not.toHaveBeenCalled()
    expect(x.store.dynamicFormSaveState).toBe('failed')
    expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
    expect(x.command.saveDynamicForm).toHaveBeenCalledTimes(1)
  })

  it('discards server acknowledgment after role/session change without marking form saved', async () => {
    const x = fixture('survey')
    await x.load()
    x.fill()
    const gate = deferred<OperationSnapshot<FormDataId>>()
    vi.mocked(x.command.saveDynamicForm!).mockImplementationOnce(async () => gate.promise)
    const pending = x.store.saveDynamicForm()
    await vi.waitFor(() => expect(x.command.saveDynamicForm).toHaveBeenCalledTimes(1))
    x.changeSession({ ...session, roleVersion: '44' })
    gate.resolve(success(dataId))
    expect((await pending).error?.category).toBe('session_invalid')
    expect(x.store.dynamicFormSaveState).toBe('not_saved')
    expect(x.store.canSubmit).toBe(false)
    expect((await x.store.completeDynamicForm()).error?.category).toBe('session_invalid')
    expect(x.command.completeWorkflowNode).not.toHaveBeenCalled()
  })

  it('discards a late response after switching action generations', async () => {
    const x = fixture('survey')
    await x.load()
    x.fill()
    const gate = deferred<OperationSnapshot<FormDataId>>()
    vi.mocked(x.command.saveDynamicForm!).mockImplementationOnce(async () => gate.promise)
    const pending = x.store.saveDynamicForm()
    await vi.waitFor(() => expect(x.command.saveDynamicForm).toHaveBeenCalledTimes(1))
    x.store.clear()
    const reopened = await x.store.load({ workOrderId, workflowNodeId: nodeId, actionIntent: 'interact_with_form' })
    expect(reopened.state).toBe('failed_terminal')
    gate.resolve(success(dataId))
    expect((await pending).error?.category).toBe('cancelled')
    expect(x.store.loadState).toBe('blocked')
  })

  it('locks Workflow Complete while dispatched and until failed-command reconciliation finishes', async () => {
    const x = fixture('survey')
    await x.load()
    x.fill()
    expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
    const gate = deferred<OperationSnapshot<void>>()
    const readGate = deferred<OperationSnapshot<WorkOrderDetail>>()
    vi.mocked(x.command.completeWorkflowNode!).mockImplementationOnce(async () => gate.promise)
    vi.mocked(x.api.getWorkOrderDetail).mockImplementationOnce(async () => readGate.promise)
    const pending = x.store.completeDynamicForm()
    expect(x.store.canSubmit).toBe(false)
    expect((await x.store.completeDynamicForm()).error?.category).toBe('validation')
    expect(x.store.setField('note', '禁止提交期间修改').error?.category).toBe('validation')
    await vi.waitFor(() => expect(x.command.completeWorkflowNode).toHaveBeenCalledTimes(1))
    gate.resolve({
      state: 'failed_retryable', error: { category: 'network_retryable', message: 'ambiguous command', retryable: true },
    })
    await vi.waitFor(() => expect(x.api.getWorkOrderDetail).toHaveBeenCalledTimes(2))
    expect(x.store.canSubmit).toBe(false)
    expect((await x.store.completeDynamicForm()).error?.category).toBe('network_retryable')
    readGate.resolve(success({
      id: workOrderId,
      workflowNodes: [{
        id: nodeId, category: 'forms', lifecycle: 'active',
        displayName: '现场勘察', formDefinitionId: definitionId, formPurpose: 'survey',
        visibility: { evidenceState: 'verified', viewableRoleIds: [roleId] },
      }],
    }))
    expect((await pending).state).toBe('failed_retryable')
    expect(x.store.canSubmit).toBe(false)
    expect(x.command.completeWorkflowNode).toHaveBeenCalledTimes(1)
  })

  it('reserves Appointment submit before local flush and never double-dispatches', async () => {
    const x = fixture('appointment')
    await x.load()
    x.fill()
    const gate = deferred<OperationSnapshot<void>>()
    vi.mocked(x.storage.write).mockImplementationOnce(async () => gate.promise)
    const first = x.store.submit()
    expect(x.store.lifecycle).toBe('submitting')
    expect((await x.store.submit()).error?.category).toBe('validation')
    expect(x.store.setField('datetime', '2026-04-21 11:00').error?.category).toBe('validation')
    expect(x.command.submitAppointment).not.toHaveBeenCalled()
    gate.resolve(success(undefined))
    expect((await first).state).toBe('succeeded')
    expect(x.command.submitAppointment).toHaveBeenCalledTimes(1)
    expect(x.store.businessResult).toBe('succeeded')
  })

  it('fails Appointment closed before remote dispatch when local draft flush fails', async () => {
    const x = fixture('appointment')
    await x.load()
    x.fill()
    vi.mocked(x.storage.write).mockResolvedValueOnce({
      state: 'failed_retryable', error: { category: 'network_retryable', message: 'local fault', retryable: true },
    })
    expect((await x.store.submit()).state).toBe('failed_retryable')
    expect(x.command.submitAppointment).not.toHaveBeenCalled()
    expect(x.store.lifecycle).toBe('in_progress')
    expect((await x.store.submit()).state).toBe('succeeded')
    expect(x.command.submitAppointment).toHaveBeenCalledTimes(1)
  })

  it('never commits a late Appointment command result into a new Action', async () => {
    const x = fixture('appointment')
    await x.load()
    x.fill()
    const gate = deferred<OperationSnapshot<void>>()
    vi.mocked(x.command.submitAppointment).mockImplementationOnce(async () => gate.promise)
    const first = x.store.submit()
    await vi.waitFor(() => expect(x.command.submitAppointment).toHaveBeenCalledTimes(1))
    x.store.clear()
    const reopened = await x.store.load({ workOrderId, workflowNodeId: nodeId, actionIntent: 'set_appointment' })
    expect(reopened.state).toBe('failed_terminal')
    gate.resolve(success(undefined))
    expect((await first).error?.category).toBe('unsupported_capability')
    expect(x.store.businessResult).toBe('not_started')
    expect(x.store.lifecycle).toBe('blocked')
  })
  it('abandons a picker result after changing Action and never starts a stale upload', async () => {
    const x = fixture('survey')
    await x.load()
    const pickerGate = deferred<Awaited<ReturnType<MediaFilePickerPort['pick']>>>()
    vi.mocked(x.picker.pick).mockImplementationOnce(async () => pickerGate.promise)
    const pending = x.store.pickDynamicMedia('photo')
    expect(x.store.mediaInFlightField).toBe('photo')
    x.store.clear()
    await x.load()
    pickerGate.resolve(createCapabilityResult<readonly LocalMedia[]>('photo-library', 'granted', [{
      ref: asOpaqueId<'LocalMediaRef'>('eq07-old-photo'),
      localPath: '/tmp/old-only.jpg', mimeType: 'image/jpeg', source: 'library',
    }]))
    expect((await pending).error?.category).toBe('cancelled')
    expect(x.upload.upload).not.toHaveBeenCalled()
    expect(x.store.dynamicForm?.values.photo).toBeUndefined()
  })

  it('does not mount a delayed upload response onto a newly loaded form', async () => {
    const x = fixture('survey')
    await x.load()
    const uploadGate = deferred<OperationSnapshot<UploadedMediaRef>>()
    vi.mocked(x.upload.upload).mockImplementationOnce(async () => uploadGate.promise)
    const pending = x.store.pickDynamicMedia('photo')
    await vi.waitFor(() => expect(x.upload.upload).toHaveBeenCalledTimes(1))
    x.store.clear()
    await x.load()
    uploadGate.resolve(success({
      url: 'https://mock-upload.invalid/old-photo', source: 'library',
      mimeType: 'image/jpeg', uploadState: 'uploaded',
    }))
    expect((await pending).error?.category).toBe('cancelled')
    expect(x.store.dynamicForm?.values.photo).toBeUndefined()
    expect(x.store.mediaByField.photo).toBeUndefined()
  })

  it('does not let media operations edit a form while Workflow Complete is in flight', async () => {
    const x = fixture('survey')
    await x.load()
    x.fill()
    expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
    const completionGate = deferred<OperationSnapshot<void>>()
    vi.mocked(x.command.completeWorkflowNode!).mockImplementationOnce(async () => completionGate.promise)
    const pending = x.store.completeDynamicForm()
    expect(x.store.canPickDynamicMedia('photo')).toBe(false)
    expect((await x.store.pickDynamicMedia('photo')).error?.category).toBe('validation')
    expect(x.picker.pick).not.toHaveBeenCalled()
    completionGate.resolve(success(undefined))
    expect((await pending).state).toBe('succeeded')
  })

  it('keeps Survey media actions closed when Workflow makes an editable FormDef field readonly', async () => {
    const x = fixture('survey')
    await x.load()
    expect(x.store.dynamicFields.find(field => field.fieldId === 'photo')).toMatchObject({
      readOnly: false, runtime: { visible: true, readOnly: false },
    })
    x.store.dynamicForm = {
      ...x.store.dynamicForm!,
      workflowReadOnlyFieldIds: ['photo'],
    }
    expect(x.store.dynamicFields.find(field => field.fieldId === 'photo')).toMatchObject({
      readOnly: false, runtime: { visible: true, readOnly: true },
    })
    expect(x.store.canPickDynamicMedia('photo')).toBe(false)
    expect(x.store.dynamicMediaHint('photo')).toBe('当前字段仅可查看')
    expect((await x.store.pickDynamicMedia('photo')).error?.category).toBe('validation')
    expect((await x.store.retryDynamicMedia('photo')).error?.category).toBe('validation')
    expect(x.picker.pick).not.toHaveBeenCalled()
    expect(x.upload.upload).not.toHaveBeenCalled()
  })

})
