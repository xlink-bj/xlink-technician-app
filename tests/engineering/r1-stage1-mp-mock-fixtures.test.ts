import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isMockOwnedRead, resetBusinessMockCache, setBusinessMockMode, tryMockRead } from '@adapters/api/mock'
import { mockR1AddFormCodeId, mockR1FormData, mockR1FormsWorkOrderId,
  mockR1RepeatWorkOrderId, mockSyntheticDynamicFormDefinitionId,
} from '@adapters/api/mock/fixtures'
import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { useR1LocalFormDraftStore } from '@features/work-orders/r1-local-form-drafts'
import { asOpaqueId } from '@shared/types'
import type { StoragePort, WorkflowNodeRead } from '@shared/ports'

describe('R1 MP local-only forms and repeat fixtures', () => {
  afterEach(() => { vi.unstubAllEnvs(); resetBusinessMockCache() })

  it('owns every synthetic read even when Mock is off, and exposes bounded R1-shaped data in Mock DATA', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    for (const id of [mockR1FormsWorkOrderId, mockR1RepeatWorkOrderId]) {
      expect(isMockOwnedRead(`basic/serviceAppointment/queryById/${id}`)).toBe(true)
    }
    expect(isMockOwnedRead('code/query', { parentId: mockR1AddFormCodeId })).toBe(true)
    expect(isMockOwnedRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`)).toBe(true)
    setBusinessMockMode('data')
    const baseline = await tryMockRead('basic/serviceAppointment/querySAWorkflowNode', { page: 1, rows: 20 })
    expect(baseline).toMatchObject({ total: 12 })
    vi.stubEnv('VITE_XLINK_R1_MP_UX_FIXTURES', 'true')
    const reviewList = await tryMockRead('basic/serviceAppointment/querySAWorkflowNode', { page: 1, rows: 20 })
    expect(reviewList).toMatchObject({ total: 14 })
    const forms = await tryMockRead(`basic/serviceAppointment/queryById/${mockR1FormsWorkOrderId}`)
    expect(forms).toMatchObject({ data: { workflowNode: [{
      nodeDef: { nodeType: 'forms', addFormCodeId: mockR1AddFormCodeId },
      exts: { formList: [{ _id: mockR1FormData.formsFirst }, { _id: mockR1FormData.formsSecond }] },
    }] } })
    const choices = await tryMockRead('code/query', { parentId: mockR1AddFormCodeId })
    expect(choices).toMatchObject({ total: 2 })
    const repeat = await tryMockRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`, {
      'is:workflowId|string#and': 'mock-workflow-run-021',
      'ne:state|integer#and': -1, page: 1, rows: 20,
    })
    expect(repeat).toMatchObject({ total: 2, data: [
      { _id: mockR1FormData.repeatFirst }, { _id: mockR1FormData.repeatSecond },
    ] })
    const detail = await tryMockRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`, {
      'is:_id|string#and': mockR1FormData.repeatFirst,
    })
    expect(detail).toMatchObject({ total: 1, data: [{ _id: mockR1FormData.repeatFirst }] })
    expect(await tryMockRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`, {
      'is:_id|string#and': 'external-id',
    })).toMatchObject({ total: 0, data: [] })
  })

  it('stages repeat deletion only after the bounded list has been loaded, never issuing a command', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_MOCK', 'true')
    setBusinessMockMode('data')
    setActivePinia(createPinia())
    const values = new Map<string, unknown>()
    const storage = {
      read: vi.fn(async (key: { key: string }) => ({ state: 'succeeded' as const, data: values.get(key.key) ?? null })),
      write: vi.fn(async (key: { key: string }, value: unknown) => {
        values.set(key.key, value); return { state: 'succeeded' as const }
      }),
    } as unknown as StoragePort
    const read = createTechnicianApiReadAdapter({ execute: request =>
      tryMockRead(request.path, request.body ?? {}) as Promise<unknown> })
    const node: WorkflowNodeRead = {
      id: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-021-repeat'),
      category: 'repeat', sourceNodeType: 'repeat', lifecycle: 'active',
      formDefinitionId: asOpaqueId<'FormDefinitionId'>(mockSyntheticDynamicFormDefinitionId),
      runId: asOpaqueId<'WorkflowRunId'>('mock-workflow-run-021'),
    }
    const store = useR1LocalFormDraftStore()
    let appAllowsSyntheticData = false
    store.configure(storage, read, {
      trustedDefaultMockReader: true,
      isSyntheticMockDataModeEnabled: () => appAllowsSyntheticData,
    })
    await store.open({ actorScope: 'synthetic-role', workOrderId: mockR1RepeatWorkOrderId,
      runtimeNodeId: String(node.id), sourceNodeType: 'repeat',
      formDefinitionId: mockSyntheticDynamicFormDefinitionId }, node)
    expect(await store.stageDelete(mockR1FormData.repeatSecond)).toBe(false)
    expect(store.isSyntheticMockDataModeEnabled()).toBe(false)
    expect(await store.loadRepeatReferences()).toBe(false)
    appAllowsSyntheticData = true
    expect(store.isSyntheticMockDataModeEnabled()).toBe(true)
    expect(await store.loadRepeatReferences()).toBe(true)
    expect(await store.stageDelete(mockR1FormData.repeatSecond)).toBe(true)
    expect(store.snapshot.intents).toMatchObject([{ kind: 'delete',
      targetFormDataId: mockR1FormData.repeatSecond }])
    expect(storage.write).toHaveBeenCalledTimes(1)
    appAllowsSyntheticData = false
    expect(store.isSyntheticMockDataModeEnabled()).toBe(false)
  })
})
