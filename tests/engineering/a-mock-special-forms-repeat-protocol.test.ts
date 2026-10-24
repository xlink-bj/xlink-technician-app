import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBusinessMockMode, resetBusinessMockCache } from '@adapters/api/mock/config'
import { resetMockCommandState } from '@adapters/api/mock/command-state'
import { resetMockJourney } from '@adapters/api/mock/journey'
import { tryMockRead } from '@adapters/api/mock/router'
import { tryMockR1SpecialCommand as specialGateway } from '@adapters/api/mock/r1-special-protocol'
import { isMockOwnedCommand } from '@adapters/api/mock/ownership'
import {
  mockR1FormsWorkOrderId, mockR1RepeatWorkOrderId, mockSyntheticDynamicFormDefinitionId,
} from '@adapters/api/mock/fixtures'
import {
  r1SpecialFormUpsert, r1FormsUpdateExtsCommand, r1FormsAfterSaveProcess,
  r1RepeatBatchProcess,
} from '@adapters/api/r1-special-workflow-wires'
import { planR1FormsUpdateExts } from '@features/work-orders/r1-forms-exts-plan'
import { asOpaqueId } from '@shared/types'

const memory = new Map<string, unknown>()
beforeEach(() => {
  memory.clear()
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => memory.get(key),
    setStorageSync: (key: string, value: unknown) => { memory.set(key, value) },
    removeStorageSync: (key: string) => { memory.delete(key) },
  })
  resetBusinessMockCache()
  setBusinessMockMode('data')
  resetMockCommandState()
  resetMockJourney()
})
afterEach(() => {
  resetMockCommandState()
  resetBusinessMockCache()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const definitionId = asOpaqueId<'FormDefinitionId'>(mockSyntheticDynamicFormDefinitionId)
const mockActor = { userId: 'synthetic-user', roleId: 'synthetic-role' }
const tryMockR1SpecialCommand = (request: Parameters<typeof specialGateway>[0]) =>
  specialGateway(request, mockActor, () => true)
function spec(kind: 'forms' | 'repeat') {
  return {
    sourceNodeType: kind,
    definitionId,
    workOrderId: asOpaqueId<'WorkOrderId'>(kind === 'forms' ? mockR1FormsWorkOrderId : mockR1RepeatWorkOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(kind === 'forms'
      ? 'mock-workflow-node-020-forms' : 'mock-workflow-node-021-repeat'),
    workflowRunId: asOpaqueId<'WorkflowRunId'>(kind === 'forms'
      ? 'mock-workflow-run-020' : 'mock-workflow-run-021'),
  } as const
}
async function save(kind: 'forms' | 'repeat', value: string) {
  const request = r1SpecialFormUpsert({ ...spec(kind), state: 1,
    formData: { inspectionSummary: value },
  })
  const response = await tryMockR1SpecialCommand(request) as { data?: { _id?: string } }
  const id = response.data?._id
  expect(id).toMatch(/^mock-special-form-data-/)
  return asOpaqueId<'FormDataId'>(id!)
}
async function nodeDetail(kind: 'forms' | 'repeat') {
  const detail = await tryMockRead(`basic/serviceAppointment/queryById/${spec(kind).workOrderId}`,
    {}, { latencyMs: 0 }) as { data: { workflowNode: Record<string, unknown>[] } }
  return detail.data.workflowNode[0]
}

describe('A synthetic source-specific forms / repeat writes', () => {
  it('forms: source Upsert → exact FormData query → full EXTS append → blank-slot Process → detail readback', async () => {
    const savedId = await save('forms', '屋面多表单已记录')
    const read = await tryMockRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`,
      { 'is:_id|string#and': savedId }, { latencyMs: 0 })
    expect(read).toMatchObject({ data: [{ _id: savedId, extId: mockSyntheticDynamicFormDefinitionId,
      exts: { inspectionSummary: '屋面多表单已记录' } }] })
    const scope = spec('forms')
    const process = r1FormsAfterSaveProcess({ ...scope, sourceNodeType: 'forms', updatedFormListAcknowledged: true })
    expect(await tryMockR1SpecialCommand(process)).toMatchObject({ success: false, code: 'TERMINAL' })
    const node = await nodeDetail('forms')
    const planned = planR1FormsUpdateExts({
      workflowNodeId: scope.workflowNodeId, sourceNodeType: 'forms',
      authoritativeExts: node.exts as Record<string, unknown>,
      change: { kind: 'saved', record: { _id: savedId,
        formDefId: mockSyntheticDynamicFormDefinitionId, formTitle: '现场记录', state: 1 } },
    })
    expect(await tryMockR1SpecialCommand(r1FormsUpdateExtsCommand({
      sourceNodeType: 'forms', planned,
    }))).toMatchObject({ success: true })
    expect((await nodeDetail('forms')).exts).toMatchObject({ formList: [
      {}, {}, { _id: savedId, state: 1, formTitle: '现场记录' },
    ] })
    expect(await tryMockR1SpecialCommand(process)).toMatchObject({ success: true })
    expect(await nodeDetail('forms')).toMatchObject({ state: 10 })
    expect(await tryMockR1SpecialCommand(process)).toMatchObject({ success: false, code: 'TERMINAL' })
  })

  it('forms refuses EXTS replacement that discards previously saved rows', async () => {
    const savedId = await save('forms', '待排查')
    const plan = planR1FormsUpdateExts({ workflowNodeId: spec('forms').workflowNodeId,
      sourceNodeType: 'forms', authoritativeExts: (await nodeDetail('forms')).exts as Record<string, unknown>,
      change: { kind: 'saved', record: { _id: savedId, formDefId: mockSyntheticDynamicFormDefinitionId } },
    })
    const corrupted = { ...plan, body: { ...plan.body, formList: [{ _id: savedId, state: 1 }] } }
    expect(await tryMockR1SpecialCommand(r1FormsUpdateExtsCommand({
      sourceNodeType: 'forms', planned: corrupted,
    }))).toMatchObject({ success: false, code: 'TERMINAL' })
    expect((await nodeDetail('forms')).state).toBe(0)
  })

  it('repeat: two distinct saved IDs → one comma-joined Process; wrong/stale IDs rejected', async () => {
    const first = await save('repeat', '第一次勘察')
    const second = await save('repeat', '复检')
    const scope = spec('repeat')
    const forged = r1RepeatBatchProcess({ ...scope, sourceNodeType: 'repeat',
      savedFormDataIds: [first, asOpaqueId<'FormDataId'>('mock-other-work-order-data')] })
    expect(await tryMockR1SpecialCommand(forged)).toMatchObject({ success: false, code: 'TERMINAL' })
    const valid = r1RepeatBatchProcess({ ...scope, sourceNodeType: 'repeat', savedFormDataIds: [first, second] })
    expect(valid.body?.nodeFormDataId).toBe(`${first},${second}`)
    expect(await tryMockR1SpecialCommand(valid)).toMatchObject({ success: true })
    expect(await nodeDetail('repeat')).toMatchObject({ state: 10 })
    expect(await tryMockR1SpecialCommand(valid)).toMatchObject({ success: false, code: 'TERMINAL' })
  })

  it('does not expose special source wires to disabled DEV or ordinary command transport', async () => {
    const request = r1SpecialFormUpsert({ ...spec('repeat'), state: 1,
      formData: { inspectionSummary: 'DEV only' },
    })
    const ordinary = { ...request }
    delete ordinary.r1Special
    expect(await tryMockR1SpecialCommand(ordinary)).toBeNull()
    expect(isMockOwnedCommand('workflowNode/updateExts/mock-workflow-node-020-forms')).toBe(true)
    expect(isMockOwnedCommand('biz/extForm/remove/mock-form-definition-inspection')).toBe(true)
    expect(isMockOwnedCommand('workflow/process', {
      workflowNodeId: 'mock-workflow-node-021-repeat', sid: 'unknown',
    })).toBe(true)
    expect(await specialGateway(request, { ...mockActor, roleId: 'foreign-role' }, () => true))
      .toMatchObject({ success: false, code: 'TERMINAL' })
    expect(await specialGateway(request, mockActor, () => false))
      .toMatchObject({ success: false, code: 'TERMINAL' })
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect(await tryMockR1SpecialCommand(request)).toBeNull()
    expect(await nodeDetail('repeat')).toMatchObject({ state: 0 })
  })
})
