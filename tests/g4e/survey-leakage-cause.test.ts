import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPinia, setActivePinia } from 'pinia'

import { createSurveyLeakageCauseProvider } from '@adapters/api/survey-leakage-cause'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock'
import {
  normalizeDynamicForm,
  dynamicActionFieldsFor,
} from '@features/work-orders/dynamic-form-action'
import {
  normalizeSurveyLeakageCauseSelection,
  surveyLeakageCauseExperienceFor,
  surveyLeakageCauseGroups,
  surveyLeakageCauseLabels,
  surveyLeakageCausePartLabelsFor,
  surveyLeakageCausePartChangePolicy,
  surveyLeakageCausePersistedIds,
} from '@features/work-orders/survey-leakage-cause'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { createActionDraftRepository } from '@runtimes/action'
import type {
  DynamicFormRead,
  SaveDynamicFormInput,
  StorageKey,
  StoragePort,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
  WorkOrderDetail,
  SurveyLeakageCauseRow,
} from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'

const contractFile = fileURLToPath(new URL('../../contracts/beta/survey/leakage-cause-contract.json', import.meta.url))

const rows: readonly SurveyLeakageCauseRow[] = [
  { part: 'roof', id: 'cause-roof-1', label: '屋面节点' },
  { part: 'roof', id: 'cause-roof-2', label: '屋面排水' },
  { part: 'bath', id: 'cause-bath-1', label: '卫生间节点' },
]

const workOrderId = asOpaqueId<'WorkOrderId'>('survey-leakage-work-order')
const workflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('survey-leakage-node')
const formDefinitionId = asOpaqueId<'FormDefinitionId'>('survey-leakage-definition')
const formDataId = asOpaqueId<'FormDataId'>('survey-leakage-data')
const userId = asOpaqueId<'UserId'>('survey-leakage-user')
const session = {
  sessionRef: asOpaqueId<'SessionRef'>('survey-leakage-session'),
  user: { id: userId },
  currentRole: { id: asOpaqueId<'RoleId'>('survey-leakage-role') },
  capabilityNames: [],
}

function surveyForm(values: Readonly<Record<string, unknown>> = {}): DynamicFormRead {
  return {
    purpose: 'survey',
    definitionId: formDefinitionId,
    fields: [
      {
        fieldId: 'trigger',
        valueKey: 'leakageCauseSelect',
        label: '选择渗漏原因',
        type: 'select',
        required: false,
        readOnly: false,
        showList: ['4'],
        visibility: { kind: 'includes', path: 'part', value: 'roof' },
      },
      {
        fieldId: 'value',
        valueKey: 'leakageCause',
        label: '已选择渗漏原因',
        type: 'data',
        required: true,
        multiple: true,
        readOnly: false,
        showList: ['4'],
        visibility: { kind: 'includes', path: 'part', value: 'roof' },
      },
    ],
    values: values as DynamicFormRead['values'],
  }
}

function workspaceDetail(): WorkOrderDetail {
  return {
    id: workOrderId,
    workflowRunId: asOpaqueId<'WorkflowRunId'>('survey-leakage-run'),
    workflowNodes: [{
      id: workflowNodeId,
      category: 'forms',
      lifecycle: 'active',
      displayName: '现场勘察',
      formDefinitionId,
      formPurpose: 'survey',
      visibility: { evidenceState: 'verified', viewableRoleIds: [session.currentRole.id] },
    }],
  }
}

function storageFor(): StoragePort {
  const records = new Map<string, unknown>()
  return {
    read: vi.fn(async <T>(key: StorageKey): Promise<OperationSnapshot<T | null>> => ({ state: 'succeeded', data: (records.get(key.key) as T | undefined) ?? null })),
    write: vi.fn(async (key: StorageKey, value: unknown): Promise<OperationSnapshot<void>> => {
      records.set(key.key, value)
      return { state: 'succeeded' }
    }),
    remove: vi.fn(async (key: StorageKey): Promise<OperationSnapshot<void>> => {
      records.delete(key.key)
      return { state: 'succeeded' }
    }),
    listKeys: vi.fn(async (): Promise<OperationSnapshot<readonly string[]>> => ({ state: 'succeeded', data: [...records.keys()] })),
  } as unknown as StoragePort
}

async function configuredWorkspace(
  form: DynamicFormRead,
  providerResult: OperationSnapshot<readonly SurveyLeakageCauseRow[]>,
) {
  setActivePinia(createPinia())
  const detail = workspaceDetail()
  const api: TechnicianApiReadPort = {
    getWorkOrderDetail: vi.fn(async () => ({ state: 'succeeded', data: detail })),
  } as unknown as TechnicianApiReadPort
  const save = vi.fn(async (_input: SaveDynamicFormInput) => ({ state: 'succeeded', data: formDataId }))
  const complete = vi.fn(async () => ({ state: 'succeeded' }))
  const command = {
    readDynamicForm: vi.fn(async () => ({ state: 'succeeded', data: form })),
    saveDynamicForm: save,
    completeWorkflowNode: complete,
    readAppointmentForm: vi.fn(async () => ({ state: 'succeeded', data: { fields: [], values: {} } })),
    submitAppointment: vi.fn(async () => ({ state: 'succeeded' })),
    inspectAcceptOrder: vi.fn(async () => ({ state: 'succeeded', data: { requiresConfirmation: false } })),
    acceptOrder: vi.fn(async () => ({ state: 'succeeded' })),
  } as unknown as TechnicianApiCommandPort
  const store = useActionWorkspaceStore()
  store.configure({
    apiRead: api,
    commandApi: command,
    draftRepository: createActionDraftRepository(storageFor()),
    navigation: { navigate: vi.fn(async () => undefined) },
    getSession: () => session,
    surveyLeakageCauseProvider: { query: vi.fn(async () => providerResult) },
    debounceMs: 1,
  })
  expect((await store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })).state).toBe('succeeded')
  return { store, save, complete }
}

describe('G4-E Survey leakage-cause contract', () => {
  it('keeps the machine-readable contract sanitized and exact', () => {
    const contract = JSON.parse(readFileSync(contractFile, 'utf8'))
    expect(contract).toMatchObject({
      domain: 'survey',
      experience: 'leakage_cause',
      status: 'SUPPORTED',
      triggerField: { fieldId: 'survey-field-057', valueKey: 'leakageCauseSelect', type: 'select' },
      valueField: { fieldId: 'survey-field-058', valueKey: 'leakageCause', type: 'data', multiple: true },
      provider: { endpoint: 'biz/extForm/queryByColName/leakageCause', method: 'POST' },
    })
    expect(contract.partDependency.visibleToVisiblePolicy).toBe('PRESERVE')
    expect(JSON.stringify(contract)).not.toMatch(/138\d{8}|token|session|cookie|真实地址/u)
  })

  it('uses the pinned R1 provider request and normalizes rows', async () => {
    const execute = vi.fn(async (request: { readonly path: string; readonly method: string; readonly body?: unknown }) => {
      expect(request).toEqual({
        method: 'POST',
        path: 'biz/extForm/queryByColName/leakageCause',
        body: { _all: '1', sortField: 'partOrder,leakageCauseOrder', sortOrder: 'asc' },
      })
      return { data: rows.map((row) => ({ part: row.part, leakageCause: row.id, label: row.label })) }
    })
    const result = await createSurveyLeakageCauseProvider({ execute }).query()
    expect(result).toEqual({ state: 'succeeded', data: rows })
  })

  it('crosses the Mock raw-response path and falls through to the same Real read path', async () => {
    // This case explicitly exercises DEV Mock, independent of the shell's
    // default environment. Restore both flags and cache even on assertion failure.
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    try {
      const mockRequest = vi.fn(() => { throw new Error('Mock provider must not use network') })
      setBusinessMockMode('data')
      const mockProvider = createSurveyLeakageCauseProvider(createUniApiReadTransport({
        apiBaseUrl: 'https://example.invalid',
        getSessionRef: () => asOpaqueId<'SessionRef'>('survey-provider-session'),
        request: mockRequest,
        mockLatencyMs: 0,
      }))
      const mockResult = await mockProvider.query()
      expect(mockResult.state).toBe('succeeded')
      expect(mockResult.data?.every((row) => row.id.startsWith('mock-leakage-cause-'))).toBe(true)
      expect(mockRequest).not.toHaveBeenCalled()

      resetBusinessMockCache()
      setBusinessMockMode('off')
      const realRequest = vi.fn((options: UniNamespace.RequestOptions) => {
        options.success?.({
          statusCode: 200,
          data: { data: [{ part: 'roof', leakageCause: 'real-read-cause', label: 'Real read option' }] },
        } as unknown as UniNamespace.RequestSuccessCallbackResult)
      })
      const realProvider = createSurveyLeakageCauseProvider(createUniApiReadTransport({
        apiBaseUrl: 'https://beta.example.invalid',
        getSessionRef: () => asOpaqueId<'SessionRef'>('survey-provider-session'),
        request: realRequest,
        mockLatencyMs: 0,
      }))
      const realResult = await realProvider.query()
      expect(realResult).toMatchObject({ state: 'succeeded', data: [{ id: 'real-read-cause' }] })
      expect(realRequest).toHaveBeenCalledTimes(1)
      expect(String(realRequest.mock.calls[0]?.[0]?.url)).not.toContain('mock-leakage-cause')
    } finally {
      resetBusinessMockCache()
      vi.unstubAllEnvs()
    }
  })

  it('fails closed on malformed provider rows', async () => {
    const result = await createSurveyLeakageCauseProvider({
      execute: async () => ({ data: [{ part: 'roof', leakageCause: 'cause-roof-1' }] }),
    }).query()
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('server_terminal')
  })

  it('requires the verified two-field Survey experience and keeps generic forms isolated', () => {
    const form = surveyForm({ part: ['roof'] })
    expect(surveyLeakageCauseExperienceFor(form)).toMatchObject({
      triggerField: { fieldId: 'trigger' },
      valueField: { fieldId: 'value' },
    })
    expect(dynamicActionFieldsFor(form).map((field) => field.runtime.capability)).toEqual([
      'CONDITIONAL_CAPABILITY',
      'CONDITIONAL_CAPABILITY',
    ])
    const generic = { ...form, purpose: undefined }
    expect(surveyLeakageCauseExperienceFor(generic)).toBeUndefined()
    expect(dynamicActionFieldsFor(generic).every((field) => field.runtime.capability === 'UNSUPPORTED')).toBe(true)
  })

  it('normalizes persisted IDs, omits the trigger, and validates required visibility', () => {
    const valid = normalizeDynamicForm(surveyForm({ part: ['roof'], leakageCause: ['cause-roof-1'] }))
    expect(valid).toMatchObject({ state: 'succeeded', data: { leakageCause: ['cause-roof-1'] } })
    expect(valid.data).not.toHaveProperty('leakageCauseSelect')

    const missing = normalizeDynamicForm(surveyForm({ part: ['roof'] }))
    expect(missing.state).toBe('failed_terminal')
    expect(missing.error?.category).toBe('validation')

    const hidden = normalizeDynamicForm(surveyForm({ part: ['bath'], leakageCause: ['cause-roof-1'] }))
    expect(hidden).toEqual({ state: 'succeeded', data: {} })
  })

  it('validates selections against the full provider and preserves unknown existing IDs for display', () => {
    const form = surveyForm({ part: ['roof'] })
    expect(normalizeSurveyLeakageCauseSelection(form, ['cause-roof-1'], rows)).toEqual({
      state: 'succeeded', data: ['cause-roof-1'],
    })
    expect(normalizeSurveyLeakageCauseSelection(form, ['cause-bath-1'], rows)).toEqual({
      state: 'succeeded', data: ['cause-bath-1'],
    })
    expect(surveyLeakageCausePersistedIds(['existing-unknown'])).toEqual(['existing-unknown'])
    expect(surveyLeakageCauseLabels(['existing-unknown'], [])).toEqual(['未解析（existing-unknown）'])
  })

  it('does not make a read-only controlled value editable or invent a required value', () => {
    const form = surveyForm({ part: ['roof'], leakageCause: ['existing-cause'] })
    const readOnly = {
      ...form,
      fields: form.fields.map((field) => field.valueKey === 'leakageCause' ? { ...field, readOnly: true } : field),
    }
    expect(normalizeDynamicForm(readOnly)).toMatchObject({ state: 'succeeded', data: { leakageCause: ['existing-cause'] } })
    expect(normalizeDynamicForm({ ...readOnly, values: { part: ['roof'] } })).toEqual({ state: 'succeeded', data: {} })
    expect(normalizeSurveyLeakageCauseSelection(readOnly, ['cause-roof-1'], rows).error?.category).toBe('validation')
  })

  it('groups provider rows by part and clears only when the field becomes hidden', () => {
    expect(surveyLeakageCauseGroups(rows, 'roof', new Map([
      ['roof', '屋面'],
      ['bath', '卫生间'],
    ]))).toEqual([
      {
        value: 'roof',
        label: '屋面',
        children: [
          { value: 'cause-roof-1', label: '屋面节点' },
          { value: 'cause-roof-2', label: '屋面排水' },
        ],
      },
      {
        value: 'bath',
        label: '卫生间',
        children: [{ value: 'cause-bath-1', label: '卫生间节点' }],
      },
    ])
    expect(surveyLeakageCausePartChangePolicy(surveyForm({ part: ['roof'] }), { part: ['bath'] })).toBe('clear_when_hidden')
    expect(surveyLeakageCausePartChangePolicy(surveyForm({ part: ['roof'] }), { part: ['roof'] })).toBe('preserve')

    const alwaysVisible = {
      ...surveyForm({ part: ['roof'], leakageCause: ['cause-roof-1'] }),
      fields: surveyForm().fields.map((field) => ({ ...field, visibility: undefined })),
    }
    expect(surveyLeakageCausePartChangePolicy(alwaysVisible, { part: ['bath'] })).toBe('preserve')
  })

  it('uses the dynamic part option labels without changing provider identity', () => {
    const form = {
      fields: [{
        fieldId: 'part',
        valueKey: 'part',
        label: '维修部位',
        type: 'cascade',
        required: true,
        readOnly: false,
        options: [{
          value: 'building',
          label: '建筑',
          children: [
            { value: 'roof', label: '屋面' },
            { value: 'bath', label: '卫生间' },
          ],
        }],
      }],
    } satisfies Pick<DynamicFormRead, 'fields'>
    expect(surveyLeakageCausePartLabelsFor(form)).toEqual(new Map([
      ['building', '建筑'],
      ['roof', '屋面'],
      ['bath', '卫生间'],
    ]))
  })

  it('keeps existing values when the provider fails and does not cross the save/complete boundary', async () => {
    const existing = surveyForm({ part: ['roof'], leakageCause: ['existing-cause'] })
    const { store, save, complete } = await configuredWorkspace(existing, {
      state: 'failed_retryable',
      error: { category: 'network_retryable', message: 'provider unavailable', retryable: true },
    })
    expect((await store.loadSurveyLeakageCauseOptions()).state).toBe('failed_retryable')
    expect(store.dynamicForm?.values.leakageCause).toEqual(['existing-cause'])
    expect(store.surveyLeakageCauseSelectedIds).toEqual(['existing-cause'])
    expect((await store.completeDynamicForm()).state).toBe('failed_terminal')
    expect(save).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })

  it('uses provider selection to dirty only local form state', async () => {
    const { store, save, complete } = await configuredWorkspace(surveyForm({ part: ['roof'] }), { state: 'succeeded', data: rows })
    expect((await store.loadSurveyLeakageCauseOptions()).state).toBe('succeeded')
    expect(store.setSurveyLeakageCauseSelection(['cause-roof-2'])).toMatchObject({ state: 'succeeded' })
    expect(store.dynamicForm?.values.leakageCause).toEqual(['cause-roof-2'])
    expect(store.dynamicFormSaveState).toBe('not_saved')
    expect(save).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })

  it('clears the persisted leakage selection when a part change hides the field', async () => {
    const form: DynamicFormRead = {
      ...surveyForm({ part: ['roof'], leakageCause: ['cause-roof-1'] }),
      fields: [
        {
          fieldId: 'part',
          valueKey: 'part',
          label: '维修部位',
          type: 'cascade',
          required: true,
          readOnly: false,
          options: [{ value: 'roof', label: '屋面' }, { value: 'bath', label: '卫生间' }],
        },
        ...surveyForm().fields,
      ],
    }
    const { store } = await configuredWorkspace(form, { state: 'succeeded', data: rows })
    expect(store.setField('part', ['bath'])).toMatchObject({ state: 'succeeded' })
    expect(store.dynamicForm?.values.leakageCause).toEqual([])
  })
})
