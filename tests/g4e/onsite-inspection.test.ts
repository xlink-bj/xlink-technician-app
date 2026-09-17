import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createTechnicianApiCommandAdapter } from '@adapters/api/technician-api-commands'
import {
  createRoleScopedTechnicianApiReadAdapter,
  createTechnicianApiReadAdapter,
  type ApiReadTransport,
} from '@adapters/api/technician-api'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createUniUploadPort } from '@adapters/upload/uni-upload-port'
import {
  isMockOwnedRead,
  mockCommandScenarioIds,
  mockInspectionFormDefinitionId,
  mockObservedInspectionFormDefinitionId,
  resetBusinessMockCache,
  resetMockCommandState,
  setBusinessMockMode,
} from '@adapters/api/mock'
import { createActionDraftRepository } from '@runtimes/action'
import { detailWorkflowProjectionFor } from '@features/work-orders/detail-workflow'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import {
  dynamicActionFieldsFor,
  dynamicActionUnsupportedFieldsFor,
} from '@features/work-orders/dynamic-form-action'
import type {
  DynamicFormRead,
  FormFieldValue,
  MediaFilePickerPort,
  SaveDynamicFormInput,
  SessionSnapshot,
  StorageKey,
  StoragePort,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
  UploadPort,
  WorkOrderDetail,
} from '@shared/ports'
import {
  asOpaqueId,
  createCapabilityResult,
  type FormDataId,
  type LocalMedia,
  type OperationSnapshot,
  type UploadedMediaRef,
} from '@shared/types'

const roleId = asOpaqueId<'RoleId'>('inspection-role')
const userId = asOpaqueId<'UserId'>('inspection-user')
const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('inspection-session'),
  user: { id: userId },
  currentRole: { id: roleId },
  capabilityNames: [],
}
const workOrderId = asOpaqueId<'WorkOrderId'>('inspection-work-order')
const workflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('inspection-node')
const formDefinitionId = asOpaqueId<'FormDefinitionId'>('inspection-definition')
const formDataId = asOpaqueId<'FormDataId'>('inspection-form-data')

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function inspectionDetail(): WorkOrderDetail {
  return {
    id: workOrderId,
    workflowRunId: asOpaqueId<'WorkflowRunId'>('inspection-run'),
    displayNumber: '19018',
    customerName: '演示现场勘察',
    workflowNodes: [{
      id: workflowNodeId,
      category: 'forms',
      lifecycle: 'active',
      displayName: '现场勘察',
      formDefinitionId,
      visibility: { evidenceState: 'verified', viewableRoleIds: [roleId] },
    }],
  }
}

function inspectionForm(values: Readonly<Record<string, FormFieldValue>> = {}): DynamicFormRead {
  return {
    definitionId: formDefinitionId,
    fields: [
      { key: 'summary', label: '现场情况', type: 'textarea', required: true, readOnly: false },
      {
        key: 'result',
        label: '勘察结论',
        type: 'radio',
        required: true,
        readOnly: false,
        options: [{ value: 'safe', label: '可继续施工' }, { value: 'follow_up', label: '需要跟进' }],
      },
      { key: 'photo', label: '现场照片', type: 'image', required: true, readOnly: false },
      { key: 'note', label: '备注', type: 'textarea', required: false, readOnly: false },
    ],
    values,
  }
}

function storageFor() {
  const values = new Map<string, unknown>()
  const storage = {
    read: vi.fn(async (key: StorageKey) => succeeded(values.get(key.key) ?? null)),
    write: vi.fn(async (key: StorageKey, value: unknown) => {
      values.set(key.key, value)
      return succeeded(undefined)
    }),
    remove: vi.fn(async (key: StorageKey) => {
      values.delete(key.key)
      return succeeded(undefined)
    }),
    listKeys: vi.fn(async () => succeeded([...values.keys()])),
  } as unknown as StoragePort
  return { storage, values }
}

function configureWorkspace(
  commandResult: OperationSnapshot<void> = succeeded(undefined),
  detailResult: WorkOrderDetail = inspectionDetail(),
  dynamicForm: DynamicFormRead = inspectionForm(),
) {
  const storage = storageFor()
  const api: TechnicianApiReadPort = {
    getWorkOrderDetail: vi.fn(async () => succeeded(detailResult)),
  } as unknown as TechnicianApiReadPort
  const save = vi.fn(async (_input: SaveDynamicFormInput) => succeeded(formDataId))
  const complete = vi.fn(async () => commandResult)
  const command: TechnicianApiCommandPort = {
    readDynamicForm: vi.fn(async () => succeeded(dynamicForm)),
    saveDynamicForm: save,
    completeWorkflowNode: complete,
    readAppointmentForm: vi.fn(async () => succeeded({ fields: [], values: {} })),
    submitAppointment: vi.fn(async () => succeeded(undefined)),
    inspectAcceptOrder: vi.fn(async () => succeeded({ requiresConfirmation: false })),
    acceptOrder: vi.fn(async () => succeeded(undefined)),
  }
  const picker: MediaFilePickerPort = {
    pick: vi.fn(async () => createCapabilityResult<readonly LocalMedia[]>('photo-library', 'granted', [{
      ref: asOpaqueId<'LocalMediaRef'>('local-inspection-photo'),
      localPath: '/tmp/not-persisted.jpg',
      mimeType: 'image/jpeg',
      source: 'library' as const,
    }])),
  }
  const upload: UploadPort = {
    upload: vi.fn(async (media: LocalMedia): Promise<OperationSnapshot<UploadedMediaRef>> => succeeded({
      url: `https://mock-upload.invalid/${String(media.ref)}`,
      source: media.source,
      mimeType: media.mimeType,
      uploadState: 'uploaded' as const,
    })),
  }
  const navigation = { navigate: vi.fn(async () => undefined) }
  const store = useActionWorkspaceStore()
  store.configure({
    apiRead: api,
    commandApi: command,
    draftRepository: createActionDraftRepository(storage.storage),
    navigation,
    getSession: () => session,
    mediaFilePicker: picker,
    upload,
    debounceMs: 1,
    now: () => '2026-09-17T10:00:00.000Z',
  })
  return { store, api, command, save, complete, picker, upload, storage }
}

async function fillAndSave(store: ReturnType<typeof useActionWorkspaceStore>): Promise<void> {
  store.setField('summary', '墙面情况正常')
  store.setField('result', 'safe')
  await store.pickDynamicMedia('photo')
  expect((await store.saveDynamicForm()).state).toBe('succeeded')
}

describe('G4-E onsite inspection dynamic Action Content', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_MOCK', '')
    resetBusinessMockCache()
    resetMockCommandState()
  })

  it('projects a verified dynamic form node as the executable current Action', () => {
    const projection = detailWorkflowProjectionFor(inspectionDetail(), session)
    expect(projection.selection).toBe('selected')
    expect(projection.currentTask).toMatchObject({
      actionIntent: 'interact_with_form',
      execution: 'enabled',
    })
  })

  it('uses the Dynamic Form Runtime for required validation before any write', async () => {
    const { store, save, complete } = configureWorkspace()
    expect((await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })).state).toBe('succeeded')

    const result = await store.completeDynamicForm()
    expect(result.error?.category).toBe('validation')
    expect(save).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })

  it('requires an explicit successful form save before completion and invalidates eligibility after edits', async () => {
    const { store, save, complete } = configureWorkspace()
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    store.setField('summary', '墙面情况正常')
    store.setField('result', 'safe')
    await store.pickDynamicMedia('photo')

    expect(store.canSubmit).toBe(false)
    const unsavedCompletion = await store.completeDynamicForm()
    expect(unsavedCompletion.state).toBe('failed_terminal')
    expect(unsavedCompletion.error?.category).toBe('validation')
    expect(save).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()

    expect((await store.saveDynamicForm()).state).toBe('succeeded')
    expect(store.dynamicFormSaveState).toBe('saved')
    expect(store.canSubmit).toBe(true)

    store.setField('note', '保存后发生的修改')
    expect(store.dynamicFormSaveState).toBe('not_saved')
    expect(store.canSubmit).toBe(false)
    expect(complete).not.toHaveBeenCalled()
  })

  it('carries verified conditional visibility through the adapter without exposing raw metadata', async () => {
    const transport: ApiReadTransport = {
      execute: vi.fn(async () => ({
        data: [{
          _id: 'field-row-conditional',
          name: 'inspectionPhoto',
          nameDisp: '现场照片',
          type: 'image',
          frontEndConfig: { showField: 'inspectionResult', showValue: 'safe' },
        }],
      })),
    }
    const api = createTechnicianApiReadAdapter(transport)
    const definition = await api.getFormDefinition(formDefinitionId)
    const field = definition.data?.fields?.[0]

    expect(field).toMatchObject({
      visibility: { kind: 'equals', path: 'inspectionResult', value: 'safe' },
    })
    expect(field).not.toHaveProperty('frontEndConfig')
  })

  it('hides conditional fields and does not warn for hidden unsupported Action Content', () => {
    const form: DynamicFormRead = {
      ...inspectionForm({ result: 'follow_up' }),
      fields: [
        ...inspectionForm().fields,
        {
          key: 'followUpPhoto',
          label: '跟进照片',
          type: 'unknown-media',
          required: false,
          readOnly: false,
          visibility: { kind: 'equals', path: 'result', value: 'safe' },
        },
      ],
    }

    expect(dynamicActionFieldsFor(form).find((field) => field.key === 'followUpPhoto')?.runtime.visible).toBe(false)
    expect(dynamicActionUnsupportedFieldsFor(form).map((field) => field.key)).not.toContain('followUpPhoto')
  })

  it('supports checkbox and cascade fields without scalarizing their values', () => {
    const form: DynamicFormRead = {
      fields: [
        {
          key: 'inspectionChecks',
          label: '检查项',
          type: 'checkbox',
          required: true,
          readOnly: false,
          options: [{ value: 'ok', label: '正常' }],
        },
        {
          key: 'inspectionPath',
          label: '检查路径',
          type: 'cascade',
          required: false,
          readOnly: false,
          options: [{ value: 'a', label: 'A' }],
        },
      ],
      values: {},
    }
    expect(dynamicActionUnsupportedFieldsFor(form).map((field) => field.key)).toEqual([])
  })

  it('supports declared multi-value choices without scalarizing them', () => {
    const form: DynamicFormRead = {
      fields: [
        {
          key: 'inspectionContent',
          label: '巡检内容',
          type: 'select',
          required: false,
          readOnly: false,
          multiple: true,
          options: [{ value: 'a', label: 'A' }],
        },
        {
          key: 'serviceGoods',
          label: '套餐名称',
          type: 'bizSelect',
          required: true,
          readOnly: false,
          multiple: true,
          options: [{ value: 'a', label: 'A' }],
        },
      ],
      values: {},
    }

    expect(dynamicActionUnsupportedFieldsFor(form).map((field) => field.key)).toEqual([])

    expect(dynamicActionUnsupportedFieldsFor({
      fields: [{ ...form.fields[0], options: undefined }],
      values: {},
    }).map((field) => field.key)).toEqual(['inspectionContent'])
  })

  it('guards media picker and upload with the effective field state', async () => {
    const readOnlyForm: DynamicFormRead = {
      ...inspectionForm(),
      fields: inspectionForm().fields.map((field) => field.key === 'photo' ? { ...field, readOnly: true } : field),
    }
    const hiddenForm: DynamicFormRead = {
      ...inspectionForm(),
      fields: inspectionForm().fields.map((field) => field.key === 'photo'
        ? { ...field, visibility: { kind: 'equals' as const, path: 'result', value: 'safe' } }
        : field),
    }
    const unsupportedForm: DynamicFormRead = {
      ...inspectionForm(),
      fields: inspectionForm().fields.map((field) => field.key === 'photo' ? { ...field, type: 'video' } : field),
    }

    for (const form of [readOnlyForm, hiddenForm, unsupportedForm]) {
      const { store, picker, upload } = configureWorkspace(succeeded(undefined), inspectionDetail(), form)
      await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
      const result = await store.pickDynamicMedia('photo')
      expect(result.state).toBe('failed_terminal')
      expect(picker.pick).not.toHaveBeenCalled()
      expect(upload.upload).not.toHaveBeenCalled()
    }
  })

  it('keeps save and workflow completion as separate commands and uploads media online', async () => {
    const { store, api, save, complete, picker, upload, storage } = configureWorkspace()
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    await fillAndSave(store)

    expect(picker.pick).toHaveBeenCalledTimes(1)
    expect(upload.upload).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: formDefinitionId,
      values: expect.objectContaining({ photo: 'https://mock-upload.invalid/local-inspection-photo' }),
    }))
    expect(save.mock.calls[0][0]).not.toHaveProperty('formDataId')
    expect(complete).not.toHaveBeenCalled()

    const result = await store.completeDynamicForm()
    expect(result.state).toBe('succeeded')
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ formDataId }))
    expect(api.getWorkOrderDetail).toHaveBeenCalledTimes(2)
    expect(store.businessResult).toBe('succeeded')
    expect(store.refreshStatus).toBe('refreshed')
    expect(storage.values.size).toBe(0)
    const serialized = JSON.stringify([...storage.values.values()])
    expect(serialized).not.toContain('not-persisted')
  })

  it('reconciles a failed completion before a later manual retry and never auto-retries', async () => {
    const failed: OperationSnapshot<void> = {
      state: 'failed_retryable',
      error: { category: 'network_retryable', message: 'temporary', retryable: true },
    }
    const { store, complete, api } = configureWorkspace(failed)
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    await fillAndSave(store)

    const first = await store.completeDynamicForm()
    expect(first.state).toBe('failed_retryable')
    expect(complete).toHaveBeenCalledTimes(1)
    expect(api.getWorkOrderDetail).toHaveBeenCalledTimes(2)
    expect(store.businessResult).toBe('failed')
    expect(store.canSubmit).toBe(true)
  })

  it('blocks retry when reconciliation shows the workflow node is no longer current', async () => {
    const failed: OperationSnapshot<void> = {
      state: 'failed_retryable',
      error: { category: 'network_retryable', message: 'temporary', retryable: true },
    }
    const initialDetail = inspectionDetail()
    const reconciledDetail: WorkOrderDetail = {
      ...initialDetail,
      workflowNodes: [{ ...initialDetail.workflowNodes![0], lifecycle: 'closed' }],
    }
    const { store, complete, api } = configureWorkspace(failed)
    vi.mocked(api.getWorkOrderDetail)
      .mockResolvedValueOnce(succeeded(initialDetail))
      .mockResolvedValueOnce(succeeded(reconciledDetail))
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    await fillAndSave(store)

    const result = await store.completeDynamicForm()
    expect(result.state).toBe('failed_retryable')
    expect(complete).toHaveBeenCalledTimes(1)
    expect(api.getWorkOrderDetail).toHaveBeenCalledTimes(2)
    expect(store.canSubmit).toBe(false)
    expect(store.loadState).toBe('blocked')
  })

  it('keeps synthetic inspection reads local and refuses synthetic fall-through when Mock is off', async () => {
    setBusinessMockMode('data')
    const request = vi.fn(() => { throw new Error('real transport must not be called') })
    const readTransport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request,
      mockLatencyMs: 0,
      getMockActor: () => ({ userId, roleId }),
    })
    const read = createRoleScopedTechnicianApiReadAdapter(readTransport, () => roleId, {
      cascadeTenantId: 'synthetic-tenant',
      codeTenantId: 'synthetic-tenant',
    })
    const detail = await read.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.inspectionSuccess))
    expect(detail.state).toBe('succeeded')
    expect(detail.data?.workflowNodes?.[0]).toMatchObject({
      formDefinitionId: asOpaqueId<'FormDefinitionId'>(mockObservedInspectionFormDefinitionId),
    })
    expect(request).not.toHaveBeenCalled()
    expect(isMockOwnedRead(`biz/extForm/query/${mockObservedInspectionFormDefinitionId}`)).toBe(true)

    setBusinessMockMode('off')
    await expect(readTransport.execute({
      method: 'POST',
      path: `biz/extForm/query/${mockInspectionFormDefinitionId}`,
      body: { 'is:_id|string#and': 'synthetic-data' },
    })).rejects.toMatchObject({ category: 'server_terminal' })
    expect(request).not.toHaveBeenCalled()
  })

  it('runs the observed inspection form through the real Adapter command path', async () => {
    setBusinessMockMode('data')
    const request = vi.fn(() => { throw new Error('synthetic path must not use network') })
    const readTransport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request,
      mockLatencyMs: 0,
      getMockActor: () => ({ userId, roleId }),
    })
    const read = createRoleScopedTechnicianApiReadAdapter(readTransport, () => roleId, {
      cascadeTenantId: 'synthetic-tenant',
      codeTenantId: 'synthetic-tenant',
    })
    const commandTransport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request,
    })
    const commands = createTechnicianApiCommandAdapter(commandTransport, read)
    const detail = await read.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.inspectionSuccess))
    expect(detail.state).toBe('succeeded')
    const node = detail.data?.workflowNodes?.[0]
    expect(node?.formDefinitionId).toBe(asOpaqueId<'FormDefinitionId'>(mockObservedInspectionFormDefinitionId))

    const initial = await commands.readDynamicForm!({
      definitionId: node!.formDefinitionId!,
      expectedWorkflowRunId: detail.data?.workflowRunId,
    })
    expect(initial).toMatchObject({ state: 'succeeded', data: { values: {} } })
    expect(initial.data?.fields.find((field) => field.key === 'part')?.options).toEqual([
      { value: 'repair-part-code-001', label: '屋面' },
      { value: 'repair-part-code-002', label: '外墙' },
      { value: 'repair-part-code-003', label: '卫生间' },
    ])
    expect(initial.data?.fields.find((field) => field.key === 'isQualified')?.options).toEqual([
      { value: '0', label: '不合格' },
      { value: '1', label: '合格' },
    ])
    const initialFields = dynamicActionFieldsFor(initial.data!)
    expect(initialFields.find((field) => field.key === 'part')?.runtime.capability).toBe('SUPPORTED_GENERIC')
    expect(initialFields.find((field) => field.key === 'isQualified')?.runtime.capability).toBe('SUPPORTED_GENERIC')
    const selectedPart = {
      ...initial.data!,
      values: { part: ['repair-part-code-001'] },
    }
    expect(dynamicActionFieldsFor(selectedPart).find((field) => field.key === 'length')?.runtime.visible).toBe(true)

    const saved = await commands.saveDynamicForm!({
      workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.inspectionSuccess),
      workflowNodeId: node!.id,
      workflowRunId: detail.data?.workflowRunId,
      definitionId: node!.formDefinitionId!,
      values: { requirement: '符合现场施工要求', suggest: '按现场条件继续施工' },
    })
    expect(saved.state).toBe('succeeded')
    expect(saved.data).toBeTruthy()

    const rereadForm = await commands.readDynamicForm!({
      definitionId: node!.formDefinitionId!,
      formDataId: saved.data,
      expectedWorkflowRunId: detail.data?.workflowRunId,
    })
    expect(rereadForm).toMatchObject({
      state: 'succeeded',
      data: { dataId: saved.data, values: expect.objectContaining({ suggest: '按现场条件继续施工' }) },
    })

    const completed = await commands.completeWorkflowNode!({
      workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.inspectionSuccess),
      workflowNodeId: node!.id,
      workflowRunId: detail.data?.workflowRunId,
      definitionId: node!.formDefinitionId!,
      formDataId: saved.data!,
    })
    expect(completed.state).toBe('succeeded')
    const after = await read.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.inspectionSuccess))
    expect(after.data?.workflowNodes?.[0]?.lifecycle).not.toBe('active')
    expect(request).not.toHaveBeenCalled()
  })

  it('runs the observed backend-shaped Inspection schema through the same raw-row Adapter path', async () => {
    setBusinessMockMode('data')
    const request = vi.fn(() => { throw new Error('observed schema fixture must not use network') })
    const readTransport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request,
      mockLatencyMs: 0,
    })
    const read = createTechnicianApiReadAdapter(readTransport)

    const definition = await read.getFormDefinition(asOpaqueId<'FormDefinitionId'>(mockObservedInspectionFormDefinitionId))

    expect(definition.state).toBe('succeeded')
    expect(definition.data?.fields?.map((field) => field.key)).toEqual([
      'part', 'village', 'length', 'width', 'planeArea', 'inspectionSOP',
      'inspectionContent', 'requirement', 'isQualified', 'reason', 'otherReason',
      'serviceGoods', 'suggest', 'surveyDrawing', 'reformDate',
    ])
    expect(definition.data?.fields?.find((field) => field.key === 'inspectionContent')).toMatchObject({
      type: 'select',
      multiple: true,
    })
    expect(dynamicActionUnsupportedFieldsFor({
      fields: definition.data?.fields ?? [],
      values: {},
    }).map((field) => field.key)).toEqual(expect.arrayContaining([
      'part', 'inspectionSOP', 'inspectionContent', 'isQualified', 'serviceGoods',
    ]))
    expect(definition.data?.fields?.find((field) => field.key === 'length')).toMatchObject({
      visibility: {
        kind: 'oneOf',
        path: 'part',
        values: [['repair-part-code-001'], ['repair-part-code-002']],
      },
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('blocks real media upload by default before token or provider transport', async () => {
    setBusinessMockMode('off')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'false')
    const execute = vi.fn(async () => ({ token: 'must-not-be-requested' }))
    const providerUpload = vi.fn()
    const upload = createUniUploadPort({ execute }, providerUpload)

    const result = await upload.upload({
      ref: asOpaqueId<'LocalMediaRef'>('real-mode-photo'),
      localPath: '/tmp/not-uploaded.jpg',
      mimeType: 'image/jpeg',
      source: 'library',
    })

    expect(result).toMatchObject({
      state: 'failed_terminal',
      error: { category: 'unsupported_capability' },
    })
    expect(execute).not.toHaveBeenCalled()
    expect(providerUpload).not.toHaveBeenCalled()
  })
})
