import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
  mockSyntheticDynamicFormDefinitionId,
  mockSurveyFormDefinitionId,
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

const roleId = asOpaqueId<'RoleId'>('survey-role')
const userId = asOpaqueId<'UserId'>('survey-user')
const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('survey-session'),
  user: { id: userId },
  currentRole: { id: roleId },
  capabilityNames: [],
}
const workOrderId = asOpaqueId<'WorkOrderId'>('survey-work-order')
const workflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('survey-node')
const formDefinitionId = asOpaqueId<'FormDefinitionId'>('survey-definition')
const formDataId = asOpaqueId<'FormDataId'>('survey-form-data')

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function surveyDetail(): WorkOrderDetail {
  return {
    id: workOrderId,
    workflowRunId: asOpaqueId<'WorkflowRunId'>('survey-run'),
    displayNumber: '19018',
    customerName: '演示现场勘察',
    workflowNodes: [{
      id: workflowNodeId,
      category: 'forms',
      lifecycle: 'active',
      displayName: '现场勘察',
      formDefinitionId,
      formPurpose: 'survey',
      visibility: { evidenceState: 'verified', viewableRoleIds: [roleId] },
    }],
  }
}

function surveyForm(values: Readonly<Record<string, FormFieldValue>> = {}): DynamicFormRead {
  return {
    purpose: 'survey',
    definitionId: formDefinitionId,
    fields: [
      { fieldId: 'survey-summary', valueKey: 'surveySummary', label: '现场情况', type: 'textarea', required: true, readOnly: false },
      {
        fieldId: 'survey-result', valueKey: 'surveyResult',
        label: '勘察结论',
        type: 'radio',
        required: true,
        readOnly: false,
        options: [{ value: 'safe', label: '可继续施工' }, { value: 'follow_up', label: '需要跟进' }],
      },
      { fieldId: 'survey-photo', valueKey: 'surveyPhoto', label: '现场照片', type: 'image', required: true, readOnly: false },
      { fieldId: 'survey-note', valueKey: 'surveyNote', label: '备注', type: 'textarea', required: false, readOnly: false },
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
  detailResult: WorkOrderDetail = surveyDetail(),
  dynamicForm: DynamicFormRead = surveyForm(),
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
      ref: asOpaqueId<'LocalMediaRef'>('local-survey-photo'),
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
  store.setField('survey-summary', '墙面情况正常')
  store.setField('survey-result', 'safe')
  await store.pickDynamicMedia('survey-photo')
  expect((await store.saveDynamicForm()).state).toBe('succeeded')
}

describe('G4-E Survey dynamic Action Content', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_MOCK', '')
    resetBusinessMockCache()
    resetMockCommandState()
  })

  it('projects a verified dynamic form node as the executable current Action', () => {
    const projection = detailWorkflowProjectionFor(surveyDetail(), session)
    expect(projection.selection).toBe('selected')
    expect(projection.currentTask).toMatchObject({
      actionIntent: 'interact_with_form',
      execution: 'enabled',
    })
  })

  it('keeps an unclassified dynamic form generic even when its display label resembles Survey copy', () => {
    const generic = surveyDetail()
    const genericNode = generic.workflowNodes![0]
    const projection = detailWorkflowProjectionFor({
      ...generic,
      workflowNodes: [{
        ...genericNode,
        displayName: '现场勘察',
        formDefinitionId: asOpaqueId<'FormDefinitionId'>('generic-form-definition'),
        formPurpose: undefined,
      }],
    }, session)

    expect(projection.currentTask).toMatchObject({
      actionIntent: 'interact_with_form',
      execution: 'enabled',
    })
    expect(projection.currentTask).not.toHaveProperty('formPurpose')
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
    store.setField('survey-summary', '墙面情况正常')
    store.setField('survey-result', 'safe')
    await store.pickDynamicMedia('survey-photo')

    expect(store.canSubmit).toBe(false)
    const unsavedCompletion = await store.completeDynamicForm()
    expect(unsavedCompletion.state).toBe('failed_terminal')
    expect(unsavedCompletion.error?.category).toBe('validation')
    expect(save).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()

    expect((await store.saveDynamicForm()).state).toBe('succeeded')
    expect(store.dynamicFormSaveState).toBe('saved')
    expect(store.canSubmit).toBe(true)

    store.setField('survey-note', '保存后发生的修改')
    expect(store.dynamicFormSaveState).toBe('not_saved')
    expect(store.canSubmit).toBe(false)
    expect(complete).not.toHaveBeenCalled()
  })

  it('carries verified conditional visibility through the adapter without exposing raw metadata', async () => {
    const transport: ApiReadTransport = {
      execute: vi.fn(async () => ({
        data: [{
          _id: 'field-row-conditional',
          name: 'surveyPhoto',
          nameDisp: '现场照片',
          type: 'image',
          frontEndConfig: { showField: 'surveyResult', showValue: 'safe' },
        }],
      })),
    }
    const api = createTechnicianApiReadAdapter(transport)
    const definition = await api.getFormDefinition(formDefinitionId)
    const field = definition.data?.fields?.[0]

    expect(field).toMatchObject({
      visibility: { kind: 'equals', path: 'surveyResult', value: 'safe' },
    })
    expect(field).not.toHaveProperty('frontEndConfig')
  })

  it('hides conditional fields and does not warn for hidden unsupported Action Content', () => {
    const form: DynamicFormRead = {
      ...surveyForm({ surveyResult: 'follow_up' }),
      fields: [
        ...surveyForm().fields,
        {
          fieldId: 'survey-follow-up-photo', valueKey: 'surveyFollowUpPhoto',
          label: '跟进照片',
          type: 'unknown-media',
          required: false,
          readOnly: false,
          visibility: { kind: 'equals', path: 'surveyResult', value: 'safe' },
        },
      ],
    }

    expect(dynamicActionFieldsFor(form).find((field) => field.valueKey === 'surveyFollowUpPhoto')?.runtime.visible).toBe(false)
    expect(dynamicActionUnsupportedFieldsFor(form).map((field) => field.valueKey)).not.toContain('surveyFollowUpPhoto')
  })

  it('supports checkbox and cascade fields without scalarizing their values', () => {
    const form: DynamicFormRead = {
      fields: [
        {
          fieldId: 'surveyChecks', valueKey: 'surveyChecks',
          label: '检查项',
          type: 'checkbox',
          required: true,
          readOnly: false,
          options: [{ value: 'ok', label: '正常' }],
        },
        {
          fieldId: 'surveyPath', valueKey: 'surveyPath',
          label: '检查路径',
          type: 'cascade',
          required: false,
          readOnly: false,
          options: [{ value: 'a', label: 'A' }],
        },
      ],
      values: {},
    }
    expect(dynamicActionUnsupportedFieldsFor(form).map((field) => field.valueKey)).toEqual([])
  })

  it('supports declared multi-value choices without scalarizing them', () => {
    const form: DynamicFormRead = {
      fields: [
        {
          fieldId: 'survey-measurements', valueKey: 'surveyMeasurements',
          label: '勘查记录',
          type: 'select',
          required: false,
          readOnly: false,
          multiple: true,
          options: [{ value: 'a', label: 'A' }],
        },
        {
          fieldId: 'serviceGoods', valueKey: 'serviceGoods',
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

    expect(dynamicActionUnsupportedFieldsFor(form).map((field) => field.valueKey)).toEqual([])

    expect(dynamicActionUnsupportedFieldsFor({
      fields: [{ ...form.fields[0], options: undefined }],
      values: {},
    }).map((field) => field.valueKey)).toEqual(['surveyMeasurements'])
  })

  it('addresses repeated Survey rows by fieldId while storing the shared valueKey', async () => {
    const form: DynamicFormRead = {
      fields: [
        { fieldId: 'survey-length-row-001', valueKey: 'length', label: '长度（结构）', type: 'digit', required: false, readOnly: false },
        { fieldId: 'survey-length-row-002', valueKey: 'length', label: '长度（局部）', type: 'digit', required: false, readOnly: false },
      ],
      values: {},
    }
    const { store } = configureWorkspace(succeeded(undefined), surveyDetail(), form)
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })

    store.setField('survey-length-row-002', '2.5')

    expect(store.dynamicForm?.values).toEqual({ length: 2.5 })
    expect(store.dynamicFormSaveState).toBe('not_saved')
  })

  it('blocks completion when a required provider remains UNKNOWN', async () => {
    const form: DynamicFormRead = {
      ...surveyForm(),
      fields: [
        ...surveyForm().fields,
        {
          fieldId: 'serviceGoods', valueKey: 'serviceGoods',
          label: '套餐名称',
          type: 'bizSelect',
          required: true,
          readOnly: false,
          multiple: true,
          options: undefined,
        },
      ],
    }
    const { store, save, complete } = configureWorkspace(succeeded(undefined), surveyDetail(), form)
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    store.setField('survey-summary', '墙面情况正常')
    store.setField('survey-result', 'safe')
    await store.pickDynamicMedia('survey-photo')

    expect(store.canSubmit).toBe(false)
    const result = await store.saveDynamicForm()
    expect(result.error?.category).toBe('unsupported_capability')
    expect(save).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })

  it('guards media picker and upload with the effective field state', async () => {
    const readOnlyForm: DynamicFormRead = {
      ...surveyForm(),
      fields: surveyForm().fields.map((field) => field.valueKey === 'surveyPhoto' ? { ...field, readOnly: true } : field),
    }
    const hiddenForm: DynamicFormRead = {
      ...surveyForm(),
      fields: surveyForm().fields.map((field) => field.valueKey === 'surveyPhoto'
        ? { ...field, visibility: { kind: 'equals' as const, path: 'surveyResult', value: 'safe' } }
        : field),
    }
    const unsupportedForm: DynamicFormRead = {
      ...surveyForm(),
      fields: surveyForm().fields.map((field) => field.valueKey === 'surveyPhoto' ? { ...field, type: 'video' } : field),
    }

    for (const form of [readOnlyForm, hiddenForm, unsupportedForm]) {
      const { store, picker, upload } = configureWorkspace(succeeded(undefined), surveyDetail(), form)
      await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
      const result = await store.pickDynamicMedia('survey-photo')
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
      values: expect.objectContaining({ surveyPhoto: 'https://mock-upload.invalid/local-survey-photo' }),
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
    const initialDetail = surveyDetail()
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

  it('keeps synthetic Survey reads local and refuses synthetic fall-through when Mock is off', async () => {
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
    const detail = await read.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.surveySuccess))
    expect(detail.state).toBe('succeeded')
    expect(detail.data?.workflowNodes?.[0]).toMatchObject({
      formDefinitionId: asOpaqueId<'FormDefinitionId'>(mockSurveyFormDefinitionId),
    })
    expect(request).not.toHaveBeenCalled()
    expect(isMockOwnedRead(`biz/extForm/query/${mockSurveyFormDefinitionId}`)).toBe(true)

    setBusinessMockMode('off')
    await expect(readTransport.execute({
      method: 'POST',
      path: `biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`,
      body: { 'is:_id|string#and': 'synthetic-data' },
    })).rejects.toMatchObject({ category: 'server_terminal' })
    expect(request).not.toHaveBeenCalled()

    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    const commandTransport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request,
    })
    await expect(commandTransport.execute({
      method: 'POST',
      path: `biz/extForm/upsert/${mockSurveyFormDefinitionId}`,
      body: { dataStr: JSON.stringify({ sid: 'real-work-order' }) },
    })).rejects.toMatchObject({ category: 'server_terminal' })
    expect(request).not.toHaveBeenCalled()
  })

  it('runs the observed Survey form through the real Adapter command path', async () => {
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
    const detail = await read.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.surveySuccess))
    expect(detail.state).toBe('succeeded')
    const node = detail.data?.workflowNodes?.[0]
    expect(node?.formDefinitionId).toBe(asOpaqueId<'FormDefinitionId'>(mockSurveyFormDefinitionId))

    const initial = await commands.readDynamicForm!({
      definitionId: node!.formDefinitionId!,
      expectedWorkflowRunId: detail.data?.workflowRunId,
    })
    expect(initial).toMatchObject({ state: 'succeeded', data: { values: {} } })
    expect(initial.data?.purpose).toBe('survey')
    const partOptions = initial.data?.fields.find((field) => field.valueKey === 'part')?.options ?? []
    expect(partOptions).toHaveLength(7)
    expect(partOptions[0]).toMatchObject({ label: '屋面' })
    expect(partOptions[0]?.children).toHaveLength(4)
    expect(initial.data?.fields).toHaveLength(61)
    const duplicateLengthRows = initial.data?.fields.filter((field) => field.valueKey === 'length') ?? []
    expect(duplicateLengthRows).toHaveLength(2)
    expect(new Set(duplicateLengthRows.map((field) => field.fieldId)).size).toBe(2)
    const initialFields = dynamicActionFieldsFor(initial.data!)
    expect(initialFields.find((field) => field.valueKey === 'part')?.runtime.capability).toBe('SUPPORTED_GENERIC')
    expect(initialFields.find((field) => field.valueKey === 'serviceGoods')?.runtime.capability).toBe('UNSUPPORTED')
    expect(initialFields.find((field) => field.valueKey === 'leakageCause')?.runtime.capability).toBe('UNSUPPORTED')
    const window = partOptions.find((option) => option.label === '窗户')
    const windowPart = window?.children?.[0]
    expect(windowPart).toBeDefined()
    const selectedPart = {
      ...initial.data!,
      values: { part: [window!.value, windowPart!.value] },
    }
    expect(dynamicActionFieldsFor(selectedPart)
      .filter((field) => field.valueKey === 'length')
      .map((field) => field.runtime.visible)).toEqual([true, false])

    const saved = await commands.saveDynamicForm!({
      workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.surveySuccess),
      workflowNodeId: node!.id,
      workflowRunId: detail.data?.workflowRunId,
      definitionId: node!.formDefinitionId!,
      values: { memo: '按现场条件继续施工' },
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
      data: { dataId: saved.data, values: expect.objectContaining({ memo: '按现场条件继续施工' }) },
    })

    const completed = await commands.completeWorkflowNode!({
      workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.surveySuccess),
      workflowNodeId: node!.id,
      workflowRunId: detail.data?.workflowRunId,
      definitionId: node!.formDefinitionId!,
      formDataId: saved.data!,
    })
    expect(completed.state).toBe('succeeded')
    const after = await read.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.surveySuccess))
    expect(after.data?.workflowNodes?.[0]?.lifecycle).not.toBe('active')
    expect(request).not.toHaveBeenCalled()
  })

  it('runs the observed backend-shaped Survey schema through the same raw-row Adapter path', async () => {
    setBusinessMockMode('data')
    const request = vi.fn(() => { throw new Error('observed schema fixture must not use network') })
    const readTransport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request,
      mockLatencyMs: 0,
    })
    const read = createTechnicianApiReadAdapter(readTransport)

    const definition = await read.getFormDefinition(asOpaqueId<'FormDefinitionId'>(mockSurveyFormDefinitionId))

    expect(definition.state).toBe('succeeded')
    expect(definition.data?.fields).toHaveLength(61)
    expect(definition.data?.fields?.filter((field) => field.valueKey === 'province')).toHaveLength(2)
    expect(definition.data?.fields?.filter((field) => field.valueKey === 'length')).toHaveLength(2)
    expect(definition.data?.fields?.filter((field) => field.valueKey === 'width')).toHaveLength(2)
    expect(definition.data?.fields?.filter((field) => field.valueKey === 'gap4')).toHaveLength(2)
    const unsupported = dynamicActionUnsupportedFieldsFor({
      fields: definition.data?.fields ?? [],
      values: {},
    }).map((field) => field.valueKey)
    expect(unsupported).toEqual(expect.arrayContaining(['surveyPDFUrl', 'area', 'province', 'part', 'serviceGoods']))
    expect(unsupported).not.toContain('gap0')
    expect(unsupported).not.toContain('leakageCauseSelect')
    expect(request).not.toHaveBeenCalled()
  })

  it('keeps generic dynamic forms generic and restricts Survey copy to verified purpose', () => {
    const generic = readFileSync(fileURLToPath(new URL('../../src/features/work-orders/components/GenericDynamicFormActionContent.vue', import.meta.url)), 'utf8')
    const survey = readFileSync(fileURLToPath(new URL('../../src/features/work-orders/components/SurveyActionContent.vue', import.meta.url)), 'utf8')
    expect(generic).toContain('表单信息')
    expect(generic).not.toContain('现场勘察')
    expect(survey).toContain('现场勘察')
    expect(survey).toContain('GenericDynamicFormActionContent')
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
