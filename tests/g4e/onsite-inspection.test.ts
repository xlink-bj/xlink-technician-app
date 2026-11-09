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
import { createMediaQueueRepository, createMediaUploadQueue, InMemoryDurableMediaStore } from '@runtimes/media'
import { detailWorkflowProjectionFor } from '@features/work-orders/detail-workflow'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import {
  dynamicActionFieldsFor,
  dynamicActionUnsupportedFieldsFor,
  normalizeDynamicFieldValue,
  normalizeDynamicForm,
} from '@features/work-orders/dynamic-form-action'
import type {
  DynamicFormRead,
  FormFieldVisibility,
  FormFieldValue,
  FormMutationCheckpoints,
  LocationPort,
  LocationSnapshot,
  MediaCapturePort,
  MediaFilePickerPort,
  MediaUploadQueuePort,
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
  createOperationError,
  type FormDataId,
  type LocalMedia,
  type MediaUploadTask,
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

function surveyMediaForm(values: Readonly<Record<string, FormFieldValue>> = {}): DynamicFormRead {
  return {
    purpose: 'survey',
    definitionId: formDefinitionId,
    fields: [
      { fieldId: 'survey-images-1', valueKey: 'images1', label: '大面全景', type: 'file', required: true, readOnly: false },
      { fieldId: 'survey-infrared', valueKey: 'infraredImageList', label: '红外照片现场图', type: 'file', required: false, readOnly: false },
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
const wireCheckpoints: FormMutationCheckpoints = {
  beforeFormDispatch: async () => ({ state: 'succeeded' }),
  afterFormSaved: async () => ({ state: 'succeeded' }),
  beforeWorkflowDispatch: async () => ({ state: 'succeeded' }),
  afterWorkflowCompleted: async () => ({ state: 'succeeded' }),
}

function configureWorkspace(
  commandResult: OperationSnapshot<void> = succeeded(undefined),
  detailResult: WorkOrderDetail = surveyDetail(),
  dynamicForm: DynamicFormRead = surveyForm(),
  useDurableMediaQueue = false,
  mediaQueueOverride?: MediaUploadQueuePort,
  mediaCaptureOverride?: MediaCapturePort,
  locationOverride?: LocationPort,
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
  const mediaUploadQueue = mediaQueueOverride ?? (useDurableMediaQueue
    ? createMediaUploadQueue(new InMemoryDurableMediaStore(), createMediaQueueRepository(storage.storage), upload)
    : undefined)
  const navigation = { navigate: vi.fn(async () => undefined) }
  const store = useActionWorkspaceStore()
  store.configure({
    apiRead: api,
    commandApi: command,
    draftRepository: createActionDraftRepository(storage.storage),
    storage: storage.storage,
    navigation,
    getSession: () => session,
    mediaFilePicker: picker,
    ...(mediaCaptureOverride ? { mediaCapture: mediaCaptureOverride } : {}),
    ...(locationOverride ? { location: locationOverride } : {}),
    upload,
    ...(mediaUploadQueue ? { mediaUploadQueue } : {}),
    debounceMs: 1,
    now: () => '2026-09-17T10:00:00.000Z',
  })
  return { store, api, command, save, complete, picker, upload, storage, mediaUploadQueue }
}

function configurePlaneArea(values: Readonly<Record<string, FormFieldValue>> = {}, extraFields: DynamicFormRead['fields'] = []) {
  const definitionId = asOpaqueId<'FormDefinitionId'>('7971040108398070730')
  const form: DynamicFormRead = { purpose: 'survey', definitionId,
    fields: [...['length', 'width', 'planeArea'].map(valueKey => ({ fieldId: `source-${valueKey}`, valueKey,
      label: valueKey, type: 'digit', required: false, readOnly: false })), ...extraFields],
    values: { part: ['3', '310'], length: 2, width: 3, planeArea: 6, ...values } }
  const detail = surveyDetail()
  const current = { ...detail, workflowNodes: detail.workflowNodes!.map(node => ({ ...node, formDefinitionId: definitionId })) }
  return { ...configureWorkspace(succeeded(undefined), current, form), form }
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
      definitionId: formDefinitionId,
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

  it('derives R1 planeArea in the actual Workspace draft after a permitted measurement row changes', async () => {
    const { store, save } = configurePlaneArea()
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect(store.setField('source-length', '2.345').state).toBe('succeeded')
    expect(store.dynamicForm?.values.planeArea).toBe(7.04)
    expect(store.dynamicFormSaveState).toBe('not_saved')
    expect(save).not.toHaveBeenCalled()
  })

  it.each([
    ['0', '', ''], [0, '', 0], ['', '0', ''], ['', 0, 0], ['2.345', '3', 7.04],
  ] as const)('keeps actual input types and zero/empty branches in Workspace (%s, %s)', async (length, width, area) => {
    const { store, save } = configurePlaneArea({ width })
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect(store.setField('source-length', length).state).toBe('succeeded')
    expect(store.dynamicForm?.values.length).toBe(length)
    expect(store.dynamicForm?.values.planeArea).toBe(area)
    expect(save).not.toHaveBeenCalled()
  })

  it.each(['source-readonly', 'target-readonly', 'workflow-readonly', 'target-hidden', 'invalid-peer', 'array-peer', 'missing-target'])(
    'does not mutate a draft when the measurement or target cannot be authorized: %s', async boundary => {
      const h = configurePlaneArea(boundary === 'invalid-peer' ? { width: 'not-a-number' } : boundary === 'array-peer' ? { width: ['3'] } : {})
      if (boundary === 'source-readonly') Object.assign(h.form.fields[0]!, { readOnly: true })
      if (boundary === 'target-readonly') Object.assign(h.form.fields[2]!, { readOnly: true })
      if (boundary === 'workflow-readonly') Object.assign(h.form, { workflowReadOnlyFieldIds: ['source-planeArea'] })
      if (boundary === 'target-hidden') Object.assign(h.form.fields[2]!, { showList: ['5'] })
      if (boundary === 'missing-target') Object.assign(h.form, { fields: h.form.fields.slice(0, 2) })
      await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
      const before = structuredClone(JSON.parse(JSON.stringify(h.store.dynamicForm?.values)))
      expect(h.store.setField('source-length', '4').state).not.toBe('succeeded')
      expect(h.store.dynamicForm?.values).toEqual(before)
      expect(h.save).not.toHaveBeenCalled()
    })

  it.each([
    ['width', '0', 'length', '', ''], ['width', 0, 'length', '', 0],
    ['length', '0', 'width', '', ''], ['length', 0, 'width', '', 0],
  ] as const)('retains the previous event type through the next Workspace event (%s=%s then %s empty)', async (firstKey, first, secondKey, second, area) => {
    const h = configurePlaneArea()
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect(h.store.setField(`source-${firstKey}`, first).state).toBe('succeeded')
    expect(h.store.dynamicForm?.values[firstKey]).toBe(first)
    expect(h.store.dynamicForm?.values.planeArea).toBe(0)
    expect(h.store.setField(`source-${secondKey}`, second).state).toBe('succeeded')
    expect(h.store.dynamicForm?.values[firstKey]).toBe(first)
    expect(h.store.dynamicForm?.values[secondKey]).toBe(second)
    expect(h.store.dynamicForm?.values.planeArea).toBe(area)
    expect(h.save).not.toHaveBeenCalled();expect(h.complete).not.toHaveBeenCalled()
  })

  it('honors repeated row identities and conditions while sharing a measurement business key', async () => {
    const h = configurePlaneArea({}, [{ fieldId: 'length-hidden', valueKey: 'length', label: 'hidden duplicate',
      type: 'digit', required: false, readOnly: false, showList: ['5'] }])
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect(h.store.setField('length-hidden', '99').state).not.toBe('succeeded')
    expect(h.store.dynamicForm?.values.planeArea).toBe(6)
    expect(h.store.setField('source-length', '4').state).toBe('succeeded')
    expect(h.store.dynamicForm?.values).toMatchObject({ length: '4', planeArea: 12 })
  })

  it('persists the derived draft before business saving and retains it across a failed explicit draft write', async () => {
    const h = configurePlaneArea()
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    h.store.setField('source-width', '4.123')
    vi.mocked(h.storage.storage.write).mockResolvedValueOnce({ state: 'failed_retryable', error: createOperationError('network_retryable', 'synthetic draft failure') })
    expect((await h.store.saveDraft()).state).toBe('failed_retryable')
    expect(h.store.dynamicForm?.values).toMatchObject({ width: '4.123', planeArea: 8.25 })
    expect((await h.store.saveDraft()).state).toBe('succeeded')
    expect(JSON.stringify([...h.storage.values.values()])).toContain('8.25')
    expect(h.save).not.toHaveBeenCalled(); expect(h.complete).not.toHaveBeenCalled()
  })

  it('does not recalculate on read, other field changes, or after changing the loaded node scope', async () => {
    const h = configurePlaneArea({ planeArea: 123 }, [{ fieldId: 'memo', valueKey: 'memo', label: 'memo', type: 'text', required: false, readOnly: false }])
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect(h.store.dynamicForm?.values.planeArea).toBe(123)
    h.store.setField('memo', 'unchanged geometry')
    expect(h.store.dynamicForm?.values.planeArea).toBe(123)
    const other = { ...h.form, definitionId: formDefinitionId, values: { part: ['3', '310'], length: 2, width: 3, planeArea: 456 } }
    vi.mocked(h.command.readDynamicForm!).mockResolvedValue(succeeded(other))
    vi.mocked(h.api.getWorkOrderDetail).mockResolvedValue(succeeded(surveyDetail()))
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    h.store.setField('source-length', '4')
    expect(h.store.dynamicForm?.values.planeArea).toBe(456)
    expect(h.save).not.toHaveBeenCalled()
  })

  it('only recalculates after measurement input, not after selecting another part', async () => {
    const h = configurePlaneArea({}, [{ fieldId: 'part', valueKey: 'part', label: 'synthetic part', type: 'cascade', required: true,
      readOnly: false, options: [{ value: '3', label: 'synthetic 3', children: [{ value: '310', label: 'synthetic 310' }] },
        { value: '1', label: 'synthetic 1', children: [{ value: '130', label: 'synthetic 130' }] }] }])
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    h.store.setField('part', ['1', '130']);h.store.setField('source-length', '4')
    expect(h.store.dynamicForm?.values.planeArea).toBe(6)
    h.store.setField('part', ['3', '310'])
    expect(h.store.dynamicForm?.values.planeArea).toBe(6)
    h.store.setField('source-width', '2.5')
    expect(h.store.dynamicForm?.values.planeArea).toBe(10)
    expect(h.save).not.toHaveBeenCalled()
  })

  it('retains pre-window string zero across a part change before the next measurement event', async () => {
    const h = configurePlaneArea({ part: ['1', '130'] }, [{ fieldId: 'part', valueKey: 'part', label: 'synthetic part', type: 'cascade', required: true,
      readOnly: false, options: [{ value: '3', label: 'synthetic 3', children: [{ value: '310', label: 'synthetic 310' }] },
        { value: '1', label: 'synthetic 1', children: [{ value: '130', label: 'synthetic 130' }] }] }])
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect(h.store.setField('source-width', '0').state).toBe('succeeded')
    expect(h.store.dynamicForm?.values.planeArea).toBe(6)
    expect(h.store.setField('part', ['3', '310']).state).toBe('succeeded')
    expect(h.store.dynamicForm?.values.planeArea).toBe(6)
    expect(h.store.setField('source-length', '').state).toBe('succeeded')
    expect(h.store.dynamicForm?.values.planeArea).toBe('')
    expect(h.store.dynamicForm?.values.width).toBe('0')
    expect(h.save).not.toHaveBeenCalled();expect(h.complete).not.toHaveBeenCalled()
  })

  it.each(['0', ''] as const)('restores pre-window event type %s through draft persistence and a failed reread', async width => {
    const h = configurePlaneArea({ part: ['1', '130'] }, [{ fieldId: 'part', valueKey: 'part', label: 'synthetic part', type: 'cascade', required: true,
      readOnly: false, options: [{ value: '3', label: 'synthetic 3', children: [{ value: '310', label: 'synthetic 310' }] },
        { value: '1', label: 'synthetic 1', children: [{ value: '130', label: 'synthetic 130' }] }] }])
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect(h.store.setField('source-width', width).state).toBe('succeeded')
    await h.store.saveDraft()
    vi.mocked(h.api.getWorkOrderDetail).mockResolvedValueOnce({ state: 'failed_retryable', error: createOperationError('network_retryable', 'synthetic read failure') })
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect(h.store.dynamicForm?.values.width).toBe(width)
    expect(h.store.dynamicForm?.values.planeArea).toBe(6)
    h.store.setField('part', ['3', '310'])
    expect(h.store.dynamicForm?.values.planeArea).toBe(6)
    h.store.setField('source-length', '')
    expect(h.store.dynamicForm?.values.planeArea).toBe('')
    expect(h.save).not.toHaveBeenCalled();expect(h.complete).not.toHaveBeenCalled()
  })

  it('restores the same derived draft after a failed reread and later successful same-scope read', async () => {
    const h = configurePlaneArea({}, [{ fieldId: 'part', valueKey: 'part', label: 'synthetic part', type: 'cascade', required: true,
      readOnly: false, options: [{ value: '3', label: 'synthetic 3', children: [{ value: '310', label: 'synthetic 310' }] }] }])
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    h.store.setField('source-width', '4.123');await h.store.saveDraft()
    vi.mocked(h.api.getWorkOrderDetail).mockResolvedValueOnce({ state: 'failed_retryable', error: createOperationError('network_retryable', 'synthetic read failure') })
    expect((await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })).state).not.toBe('succeeded')
    expect(h.store.dynamicForm).toBeNull()
    expect((await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })).state).toBe('succeeded')
    expect(h.store.dynamicForm?.values).toMatchObject({ width: '4.123', planeArea: 8.25 })
    expect(h.save).not.toHaveBeenCalled()
  })

  it('keeps only the last synchronous measurement in the draft without business dispatch', async () => {
    const h = configurePlaneArea()
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    h.store.setField('source-length', '1');h.store.setField('source-length', '12')
    await h.store.saveDraft()
    expect(h.store.dynamicForm?.values).toMatchObject({ length: '12', planeArea: 36 })
    expect(JSON.stringify([...h.storage.values.values()])).toContain('36')
    expect(h.save).not.toHaveBeenCalled();expect(h.complete).not.toHaveBeenCalled()
  })

  it('restores an unfinished empty calculated area without treating it as a valid required submission', async () => {
    const h = configurePlaneArea({ width: '0' }, [{ fieldId: 'part', valueKey: 'part', label: 'synthetic part', type: 'cascade', required: true,
      readOnly: false, options: [{ value: '3', label: 'synthetic 3', children: [{ value: '310', label: 'synthetic 310' }] }] }])
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    h.store.setField('source-length', '')
    expect(h.store.dynamicForm?.values.planeArea).toBe('')
    await h.store.saveDraft()
    await h.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect(h.store.dynamicForm?.values).toMatchObject({ length: '', width: '0', planeArea: '' })
    expect(h.save).not.toHaveBeenCalled()
  })

  it('keeps legacy serviceGoods deferred and non-blocking for Survey Action Content', async () => {
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
    expect(result.state).toBe('succeeded')
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].values).not.toHaveProperty('serviceGoods')
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
      const capture: MediaCapturePort = {
        capture: vi.fn(async () => createCapabilityResult<LocalMedia>('camera', 'granted', {
          ref: asOpaqueId<'LocalMediaRef'>('camera-should-not-start'),
          localPath: '/tmp/camera-should-not-start.jpg',
          mimeType: 'image/jpeg',
          source: 'camera',
        })),
      }
      const { store, picker, upload } = configureWorkspace(succeeded(undefined), surveyDetail(), form, false, undefined, capture)
      await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
      const result = await store.pickDynamicMedia('survey-photo')
      expect(result.state).toBe('failed_terminal')
      expect(picker.pick).not.toHaveBeenCalled()
      expect(upload.upload).not.toHaveBeenCalled()
      const cameraResult = await store.captureDynamicMedia('survey-photo')
      expect(cameraResult.state).toBe('failed_terminal')
      expect(capture.capture).not.toHaveBeenCalled()
    }
  })

  it('keeps the camera pipeline location-bound and applies only the final watermarked ref', async () => {
    const capture: MediaCapturePort = {
      capture: vi.fn(async () => createCapabilityResult<LocalMedia>('camera', 'granted', {
        ref: asOpaqueId<'LocalMediaRef'>('camera-survey-photo'),
        localPath: '/tmp/camera-survey-photo.jpg',
        mimeType: 'image/jpeg',
        source: 'camera',
        name: 'survey-original.jpg',
      })),
    }
    const location: LocationPort = {
      captureCurrentLocation: vi.fn(async () => createCapabilityResult('location', 'granted', {
        latitude: 39.9,
        longitude: 116.4,
        coordinateSystem: 'gcj02' as const,
        capturedAt: '2026-09-20T10:00:00.000Z',
      })),
    }
    const sourceUpload: UploadPort = {
      upload: vi.fn(async (media: LocalMedia) => succeeded({
        url: `https://mock-source.invalid/${String(media.ref)}`,
        key: 'original-qiniu-key',
        fileName: media.name,
        extension: 'jpg',
        source: media.source,
        mimeType: media.mimeType,
        uploadState: 'uploaded' as const,
      })),
    }
    const postProcessor = {
      preflight: vi.fn(async () => succeeded(undefined)),
      process: vi.fn(async ({ source }: { source: UploadedMediaRef }) => succeeded({
        ...source,
        url: 'https://mock-watermarked.invalid/final-camera-photo',
      })),
    }
    const queue = createMediaUploadQueue(
      new InMemoryDurableMediaStore(),
      createMediaQueueRepository(storageFor().storage),
      sourceUpload,
      { postUploadProcessor: postProcessor },
    )
    const { store } = configureWorkspace(succeeded(undefined), surveyDetail(), surveyMediaForm(), false, queue, capture, location)
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })

    const result = await store.captureDynamicMedia('survey-images-1')
    expect(result.state).toBe('succeeded')
    expect(location.captureCurrentLocation).toHaveBeenCalledTimes(1)
    expect(sourceUpload.upload).toHaveBeenCalledTimes(1)
    expect(postProcessor.process).toHaveBeenCalledTimes(1)
    expect(store.dynamicForm?.values.images1).toEqual([{
      url: 'https://mock-watermarked.invalid/final-camera-photo',
      objectKey: 'original-qiniu-key',
      fileName: 'survey-original.jpg',
      extension: 'jpg',
    }])
    expect(JSON.stringify(store.dynamicForm?.values.images1)).not.toContain('mock-source.invalid')
  })

  it('denied location blocks source upload and preserves an existing remote photo', async () => {
    const capture: MediaCapturePort = {
      capture: vi.fn(async () => createCapabilityResult<LocalMedia>('camera', 'granted', {
        ref: asOpaqueId<'LocalMediaRef'>('camera-denied-photo'),
        localPath: '/tmp/camera-denied-photo.jpg',
        mimeType: 'image/jpeg',
        source: 'camera',
      })),
    }
    const location: LocationPort = {
      captureCurrentLocation: vi.fn(async () => createCapabilityResult<LocationSnapshot>('location', 'denied', undefined, 'permission denied')),
    }
    const sourceUpload: UploadPort = { upload: vi.fn(async (): Promise<OperationSnapshot<UploadedMediaRef>> => succeeded({
      url: 'https://mock-source.invalid/should-not-upload',
      source: 'camera' as const,
      mimeType: 'image/jpeg',
      uploadState: 'uploaded' as const,
    })) }
    const queue = createMediaUploadQueue(
      new InMemoryDurableMediaStore(),
      createMediaQueueRepository(storageFor().storage),
      sourceUpload,
      { postUploadProcessor: {
        preflight: vi.fn(async () => succeeded(undefined)),
        process: vi.fn(async (): Promise<OperationSnapshot<UploadedMediaRef>> => succeeded({
          url: 'https://mock-watermarked.invalid/should-not-process',
          source: 'camera' as const,
          mimeType: 'image/jpeg',
          uploadState: 'uploaded' as const,
        })),
      } },
    )
    const existing = [{ url: 'https://existing.invalid/photo', objectKey: 'existing-key' }]
    const { store } = configureWorkspace(
      succeeded(undefined),
      surveyDetail(),
      surveyMediaForm({ images1: existing }),
      false,
      queue,
      capture,
      location,
    )
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })

    const result = await store.captureDynamicMedia('survey-images-1')
    expect(result.state).toBe('failed_terminal')
    expect(sourceUpload.upload).not.toHaveBeenCalled()
    expect(store.dynamicForm?.values.images1).toEqual(existing)
  })

  it('keeps album media on the direct upload path without location or postprocessing', async () => {
    const location: LocationPort = { captureCurrentLocation: vi.fn(async () => createCapabilityResult<LocationSnapshot>('location', 'granted')) }
    const postProcessor = {
      preflight: vi.fn(async () => succeeded(undefined)),
      process: vi.fn(async () => succeeded<UploadedMediaRef>({
        url: 'https://mock-watermarked.invalid/should-not-run',
        source: 'library',
        mimeType: 'image/jpeg',
        uploadState: 'uploaded',
      })),
    }
    const queue = createMediaUploadQueue(
      new InMemoryDurableMediaStore(),
      createMediaQueueRepository(storageFor().storage),
      { upload: vi.fn(async () => succeeded<UploadedMediaRef>({
        url: 'https://mock-source.invalid/album-final',
        source: 'library',
        mimeType: 'image/jpeg',
        uploadState: 'uploaded',
      })) },
      { postUploadProcessor: postProcessor },
    )
    const { store } = configureWorkspace(succeeded(undefined), surveyDetail(), surveyMediaForm(), false, queue, undefined, location)
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect((await store.pickDynamicMedia('survey-images-1')).state).toBe('succeeded')
    expect(location.captureCurrentLocation).not.toHaveBeenCalled()
    expect(postProcessor.process).not.toHaveBeenCalled()
  })

  it('keeps required camera media pending when remote watermark processing is retryable', async () => {
    const capture: MediaCapturePort = {
      capture: vi.fn(async () => createCapabilityResult<LocalMedia>('camera', 'granted', {
        ref: asOpaqueId<'LocalMediaRef'>('camera-pending-photo'),
        localPath: '/tmp/camera-pending-photo.jpg',
        mimeType: 'image/jpeg',
        source: 'camera',
      })),
    }
    const location: LocationPort = {
      captureCurrentLocation: vi.fn(async () => createCapabilityResult('location', 'granted', {
        latitude: 39.9,
        longitude: 116.4,
        coordinateSystem: 'gcj02' as const,
        capturedAt: '2026-09-20T10:00:00.000Z',
      })),
    }
    const postProcessor = {
      preflight: vi.fn(async () => succeeded(undefined)),
      process: vi.fn(async () => ({
        state: 'failed_retryable' as const,
        error: createOperationError('network_retryable', 'not dispatched', { code: 'postprocess_not_dispatched' }),
      })),
    }
    const queue = createMediaUploadQueue(
      new InMemoryDurableMediaStore(),
      createMediaQueueRepository(storageFor().storage),
      { upload: vi.fn(async () => succeeded<UploadedMediaRef>({
        url: 'https://mock-source.invalid/pending',
        source: 'camera',
        mimeType: 'image/jpeg',
        uploadState: 'uploaded',
      })) },
      { postUploadProcessor: postProcessor },
    )
    const { store } = configureWorkspace(succeeded(undefined), surveyDetail(), surveyMediaForm(), false, queue, capture, location)
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    expect((await store.captureDynamicMedia('survey-images-1')).state).toBe('failed_retryable')
    expect(store.dynamicForm?.values.images1).toBeUndefined()
    expect(store.mediaTasksByField['survey-images-1'][0].sourceUploadedRef).toBeDefined()
    expect(store.canSubmit).toBe(false)
  })

  it('keeps Survey media as structured object lists and blocks the special drawing tool from generic upload', async () => {
    const form = surveyMediaForm()
    const drawingForm: DynamicFormRead = {
      ...form,
      fields: [...form.fields, { fieldId: 'survey-drawing', valueKey: 'surveyDrawing', label: '测绘图', type: 'file', required: true, readOnly: false }],
    }
    const drawingWorkspace = configureWorkspace(succeeded(undefined), surveyDetail(), drawingForm)
    await drawingWorkspace.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })

    expect(drawingWorkspace.store.dynamicUnsupportedFields.map((field) => field.valueKey)).not.toContain('surveyDrawing')
    const drawing = await drawingWorkspace.store.pickDynamicMedia('survey-drawing')
    expect(drawing.state).toBe('failed_terminal')
    expect(drawing.error?.category).toBe('unsupported_capability')
    expect(drawingWorkspace.picker.pick).not.toHaveBeenCalled()

    const { store, picker, upload, save } = configureWorkspace(succeeded(undefined), surveyDetail(), surveyMediaForm())
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })

    const photo = await store.pickDynamicMedia('survey-images-1')
    expect(photo.state).toBe('succeeded')
    expect(store.dynamicForm?.values.images1).toEqual([{
      url: 'https://mock-upload.invalid/local-survey-photo',
    }])
    expect(store.mediaStateByField['survey-images-1']).toBe('uploaded')

    const saved = await store.saveDynamicForm()
    expect(saved.state).toBe('succeeded')
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({
        images1: [{ url: 'https://mock-upload.invalid/local-survey-photo' }],
      }),
    }))
    expect(upload.upload).toHaveBeenCalledTimes(1)
  })

  it('rejects a Survey media selection over an evidenced field maximum before upload', async () => {
    const { store, picker, upload } = configureWorkspace(succeeded(undefined), surveyDetail(), surveyMediaForm())
    vi.mocked(picker.pick).mockResolvedValue(createCapabilityResult<readonly LocalMedia[]>('photo-library', 'granted', [
      ...Array.from({ length: 5 }, (_, index) => ({
        ref: asOpaqueId<'LocalMediaRef'>(`infrared-${index}`),
        localPath: `/tmp/infrared-${index}.jpg`,
        mimeType: 'image/jpeg',
        source: 'library' as const,
      })),
    ]))
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })

    const result = await store.pickDynamicMedia('survey-infrared')
    expect(result.state).toBe('failed_terminal')
    expect(upload.upload).not.toHaveBeenCalled()
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
    expect(storage.values.size).toBe(1)
    const serialized = JSON.stringify([...storage.values.values()])
    expect(serialized).not.toContain('not-persisted')
  })

  it('uses the durable queue path before applying a confirmed media reference to the form', async () => {
    const { store, save, upload } = configureWorkspace(succeeded(undefined), surveyDetail(), surveyForm(), true)
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })

    store.setField('survey-summary', '墙面情况正常')
    store.setField('survey-result', 'safe')
    const selected = await store.pickDynamicMedia('survey-photo')
    expect(selected.state).toBe('succeeded')
    expect(store.dynamicForm?.values.surveyPhoto).toBe('https://mock-upload.invalid/local-survey-photo')
    expect(store.mediaTasksByField['survey-photo']).toHaveLength(1)
    expect(store.mediaTasksByField['survey-photo'][0].state).toBe('uploaded')
    expect(upload.upload).toHaveBeenCalledTimes(1)

    expect((await store.saveDynamicForm()).state).toBe('succeeded')
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({ surveyPhoto: 'https://mock-upload.invalid/local-survey-photo' }),
    }))
    expect(store.mediaTasksByField['survey-photo']).toEqual([])
  })

  it('does not finalize an uploaded task whose ref is absent from this save payload', async () => {
    const finalizeAfterSave = vi.fn(async () => succeeded(undefined))
    const queue = {
      listForAction: vi.fn(async () => succeeded<readonly MediaUploadTask[]>([])),
      finalizeAfterSave,
    } as unknown as MediaUploadQueuePort
    const { store } = configureWorkspace(succeeded(undefined), surveyDetail(), surveyForm(), false, queue)
    await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
    store.setField('survey-summary', '墙面情况正常')
    store.setField('survey-result', 'safe')
    store.setField('survey-photo', 'https://mock-upload.invalid/current-photo')

    const unappliedTask: MediaUploadTask = {
      schemaVersion: 1,
      taskId: asOpaqueId<'MediaUploadTaskId'>('unapplied-task'),
      scope: {
        userId,
        workOrderId,
        workflowNodeId,
        formDefinitionId,
        fieldId: 'survey-photo',
        valueKey: 'surveyPhoto',
        localAssetId: asOpaqueId<'LocalMediaRef'>('unapplied-local-photo'),
      },
      state: 'uploaded',
      attempts: 1,
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T10:00:00.000Z',
      uploadedRef: {
        url: 'https://mock-upload.invalid/hidden-photo',
        source: 'library',
        mimeType: 'image/jpeg',
        uploadState: 'uploaded',
      },
    }
    store.mediaTasksByField = { 'survey-photo': [unappliedTask] }

    expect((await store.saveDynamicForm()).state).toBe('succeeded')
    expect(finalizeAfterSave).not.toHaveBeenCalled()
    expect(store.mediaTasksByField['survey-photo']).toHaveLength(1)
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
    expect(store.canSubmit).toBe(false)
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

  it('exercises Survey transport serialization and command plumbing only', async () => {
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
    expect(initialFields.find((field) => field.valueKey === 'leakageCause')?.runtime.capability).toBe('CONDITIONAL_CAPABILITY')
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
      mutation: wireCheckpoints,
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
      mutation: wireCheckpoints,
    })
    expect(completed.state).toBe('succeeded')
    const after = await read.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.surveySuccess))
    expect(after.data?.workflowNodes?.[0]?.lifecycle).not.toBe('active')
    expect(request).not.toHaveBeenCalled()
  })

  it('serializes normalized Survey media refs back to the evidenced R1 object shape', async () => {
    let capturedRequest: { readonly body?: Readonly<Record<string, unknown>> } | undefined
    const transport = {
      execute: vi.fn(async (input: { readonly body?: Readonly<Record<string, unknown>> }) => {
        capturedRequest = input
        return { data: { _id: 'survey-data-002' } }
      }),
    }
    const commands = createTechnicianApiCommandAdapter(transport, {} as TechnicianApiReadPort)
    const result = await commands.saveDynamicForm!({
      workOrderId,
      workflowNodeId,
      definitionId: formDefinitionId,
      purpose: 'survey',
      mutation: wireCheckpoints,
      values: {
        images1: [{
          url: 'https://media.invalid/object-002',
          objectKey: 'survey/object-002',
          extension: 'jpg',
        }],
      },
    })

    expect(result).toMatchObject({ state: 'succeeded', data: 'survey-data-002' })
    const dataStr = capturedRequest?.body?.dataStr
    expect(typeof dataStr).toBe('string')
    expect(JSON.parse(String(dataStr))).toMatchObject({
      images1: [{ url: 'https://media.invalid/object-002', name: 'survey/object-002', extname: 'jpg' }],
    })
  })

  it('does not serialize neutral media through a generic form path', async () => {
    const execute = vi.fn(async () => ({ data: { _id: 'must-not-write' } }))
    const commands = createTechnicianApiCommandAdapter(
      { execute },
      {} as TechnicianApiReadPort,
    )

    const result = await commands.saveDynamicForm!({
      workOrderId,
      workflowNodeId,
      definitionId: formDefinitionId,
      mutation: wireCheckpoints,
      values: {
        attachment: [{ url: 'https://media.invalid/generic-object' }],
      },
    })

    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('server_terminal')
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    ['scalar', 'fake'],
    ['primitive list', ['a', 'b']],
  ])('does not serialize a non-media Survey value (%s)', async (_label, value) => {
    const execute = vi.fn(async () => ({ data: { _id: 'must-not-write' } }))
    const commands = createTechnicianApiCommandAdapter(
      { execute },
      {} as TechnicianApiReadPort,
    )

    const result = await commands.saveDynamicForm!({
      workOrderId,
      workflowNodeId,
      definitionId: formDefinitionId,
      purpose: 'survey',
      mutation: wireCheckpoints,
      values: { images1: value },
    })

    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('server_terminal')
    expect(execute).not.toHaveBeenCalled()
  })

  it('applies ExtField.showList to the mobile detail Action surface', () => {
    const form: DynamicFormRead = {
      purpose: 'survey',
      fields: [
        { fieldId: 'mobile-list-only', valueKey: 'mobileListOnly', label: '列表字段', type: 'text', required: false, readOnly: false, showList: ['3'] },
        { fieldId: 'mobile-detail', valueKey: 'mobileDetail', label: '详情字段', type: 'text', required: false, readOnly: false, showList: ['4'] },
        { fieldId: 'hidden-unsupported', valueKey: 'hiddenUnsupported', label: '隐藏字段', type: 'unverified', required: false, readOnly: false, showList: ['2'] },
        { fieldId: 'visible-unsupported', valueKey: 'visibleUnsupported', label: '详情不支持字段', type: 'unverified', required: false, readOnly: false, showList: ['4'] },
      ],
      values: {
        mobileListOnly: 'should-not-submit',
        mobileDetail: 'visible-value',
        hiddenUnsupported: 'hidden-value',
        visibleUnsupported: 'unsupported-value',
      },
    }

    const fields = dynamicActionFieldsFor(form)
    expect(fields.find((field) => field.fieldId === 'mobile-list-only')?.runtime.visible).toBe(false)
    expect(fields.find((field) => field.fieldId === 'mobile-detail')?.runtime.visible).toBe(true)
    expect(dynamicActionUnsupportedFieldsFor(form).map((field) => field.fieldId)).toEqual(['visible-unsupported'])
    expect(normalizeDynamicForm({ ...form, fields: form.fields.slice(0, 3) })).toMatchObject({
      state: 'succeeded',
      data: { mobileDetail: 'visible-value' },
    })
  })

  it('does not block an unsupported field with verified hidden visibility', () => {
    const form: DynamicFormRead = {
      fields: [{
        fieldId: 'hidden-unsupported-by-rule',
        valueKey: 'hiddenUnsupportedByRule',
        label: '条件隐藏字段',
        type: 'unverified',
        required: false,
        readOnly: false,
        visibility: { kind: 'equals', path: 'showUnsupported', value: true },
      }],
      values: { showUnsupported: false },
    }

    expect(dynamicActionUnsupportedFieldsFor(form)).toEqual([])
  })

  it('blocks an unsupported field with verified visible visibility', () => {
    const form: DynamicFormRead = {
      fields: [{
        fieldId: 'visible-unsupported-by-rule',
        valueKey: 'visibleUnsupportedByRule',
        label: '条件显示字段',
        type: 'unverified',
        required: false,
        readOnly: false,
        visibility: { kind: 'equals', path: 'showUnsupported', value: true },
      }],
      values: { showUnsupported: true },
    }

    expect(dynamicActionUnsupportedFieldsFor(form).map((field) => field.fieldId))
      .toEqual(['visible-unsupported-by-rule'])
  })

  it('blocks an unsupported field when its visibility cannot be resolved', () => {
    const form: DynamicFormRead = {
      fields: [{
        fieldId: 'unresolvable-unsupported-visibility',
        valueKey: 'unresolvableUnsupportedVisibility',
        label: '无法解析的条件字段',
        type: 'unverified',
        required: false,
        readOnly: false,
        visibility: {
          kind: 'all',
          conditions: [{ kind: 'equals', path: 'showUnsupported' } as unknown as FormFieldVisibility],
        },
      }],
      values: {},
    }

    expect(dynamicActionUnsupportedFieldsFor(form).map((field) => field.fieldId))
      .toEqual(['unresolvable-unsupported-visibility'])
  })

  it('treats Survey gap rows as visible presentation-only controls', () => {
    const form: DynamicFormRead = {
      purpose: 'survey',
      fields: [
        { fieldId: 'gap-visible', valueKey: 'gap0', label: '分隔槽', type: 'gap', required: true, readOnly: false, showList: ['4'] },
        {
          fieldId: 'gap-hidden', valueKey: 'gap1', label: '分隔槽', type: 'gap', required: false, readOnly: false, showList: ['4'],
          visibility: { kind: 'equals', path: 'showGap', value: true },
        },
        { fieldId: 'gap-list-only', valueKey: 'gap2', label: '分隔槽', type: 'gap', required: false, readOnly: false, showList: ['2'] },
        { fieldId: 'memo', valueKey: 'memo', label: '备注', type: 'text', required: false, readOnly: false, showList: ['4'] },
      ],
      values: { gap0: 'invalid-gap-value', showGap: false, memo: '现场记录' },
    }

    const fields = dynamicActionFieldsFor(form)
    expect(fields.find((field) => field.fieldId === 'gap-visible')?.runtime).toMatchObject({
      capability: 'PRESENTATION_ONLY',
      visible: true,
      readOnly: true,
      required: false,
    })
    expect(fields.find((field) => field.fieldId === 'gap-hidden')?.runtime.visible).toBe(false)
    expect(fields.find((field) => field.fieldId === 'gap-list-only')?.runtime.visible).toBe(false)
    expect(dynamicActionUnsupportedFieldsFor(form).some((field) => field.fieldId.startsWith('gap-'))).toBe(false)
    expect(normalizeDynamicForm(form)).toMatchObject({
      state: 'succeeded',
      data: { memo: '现场记录' },
    })
    expect(normalizeDynamicForm(form).data).not.toHaveProperty('gap0')
    expect(normalizeDynamicFieldValue(form, form.fields[0], 'attempt')).toMatchObject({
      state: 'failed_terminal',
      error: { category: 'validation' },
    })
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
    expect(definition.data?.fields?.find((field) => field.valueKey === 'surveyPDFUrl')?.showList).toEqual(['1', '2'])
    expect(definition.data?.fields?.find((field) => field.valueKey === 'length')?.showList).toEqual(['1', '2', '4'])
    const unsupported = dynamicActionUnsupportedFieldsFor({
      fields: definition.data?.fields ?? [],
      values: {},
    }).map((field) => field.valueKey)
    expect(unsupported).toEqual(expect.arrayContaining(['part', 'serviceGoods']))
    expect(unsupported).not.toContain('surveyPDFUrl')
    expect(unsupported).not.toContain('area')
    expect(unsupported).not.toContain('province')
    expect(unsupported).not.toContain('gap0')
    expect(unsupported).not.toContain('leakageCauseSelect')
    expect(request).not.toHaveBeenCalled()
  })

  it('keeps generic dynamic forms generic and restricts Survey copy to verified purpose', () => {
    const generic = readFileSync(fileURLToPath(new URL('../../src/features/work-orders/components/GenericDynamicFormActionContent.vue', import.meta.url)), 'utf8')
    const survey = readFileSync(fileURLToPath(new URL('../../src/features/work-orders/components/SurveyActionContent.vue', import.meta.url)), 'utf8')
    expect(generic).toContain('表单信息')
    expect(generic).not.toContain('现场勘查')
    expect(survey).toContain('现场勘查')
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

  it('uses the R1 fileName token request while keeping Mock upload local', async () => {
    setBusinessMockMode('data')
    const execute = vi.fn(async (input: { readonly body?: Readonly<Record<string, unknown>> }) => {
      expect(input.body).toEqual({ fileName: 'survey-photo.jpg' })
      return { token: 'synthetic-upload-token' }
    })
    const providerUpload = vi.fn()
    const upload = createUniUploadPort({ execute }, providerUpload)

    const result = await upload.upload({
      ref: asOpaqueId<'LocalMediaRef'>('survey-photo-with-name'),
      localPath: '/tmp/survey-photo.jpg',
      name: 'survey-photo.jpg',
      mimeType: 'image/jpeg',
      source: 'library',
    })

    expect(result.state).toBe('succeeded')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(providerUpload).not.toHaveBeenCalled()
  })
})
