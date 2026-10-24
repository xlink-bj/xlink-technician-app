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
  r1FormsFinalizeProcess, r1RepeatBatchProcess, r1RepeatRemoveCommand,
} from '@adapters/api/r1-special-workflow-wires'
import { planR1FormsUpdateExts } from '@features/work-orders/r1-forms-exts-plan'
import { executeR1Stage1FunctionalCandidate } from '@app/r1-stage1-functional-flow'
import { inspectR1MultiStepReceipt, type R1MultiStepScope } from '@features/work-orders/r1-multistep-offline-transaction'
import type { StorageKey, StoragePort } from '@shared/ports'
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

function receiptStorage(): StoragePort {
  const receipts = new Map<string, unknown>()
  return {
    read: async (key: StorageKey) => ({ state: 'succeeded', data: receipts.get(key.key) ?? null }),
    write: async (key: StorageKey, value: unknown) => {
      receipts.set(key.key, value)
      return { state: 'succeeded' }
    },
    remove: async (key: StorageKey) => {
      receipts.delete(key.key)
      return { state: 'succeeded' }
    },
  } as StoragePort
}
function functionalScope(kind: 'forms' | 'repeat'): R1MultiStepScope {
  const source = spec(kind)
  return {
    userId: mockActor.userId,
    workOrderId: source.workOrderId,
    runtimeNodeId: source.workflowNodeId,
    workflowRunId: source.workflowRunId,
    formDefinitionId: source.definitionId,
    sourceNodeType: kind,
    authorizationScope: `${mockActor.userId}:${mockActor.roleId}`,
  }
}

describe('A synthetic source-specific forms / repeat writes', () => {
  it('real R1 multistep coordinator → strict Mock gateway → readback, with durable replay receipt', async () => {
    const storage = receiptStorage()
    const scope = functionalScope('forms')
    const requests: string[] = []
    const gateway = {
      revalidate: async () => (await nodeDetail('forms')).state === 0,
      dispatch: async (request: Parameters<typeof specialGateway>[0]) => {
        requests.push(request.path)
        return specialGateway(request, mockActor, () => true)
      },
    }
    const intent = { kind: 'forms_save' as const, sourceNodeType: 'forms' as const,
      scope, fields: { inspectionSummary: '平屋顶渗漏，现场排查' }, title: '屋面勘察',
      authoritativeExts: (await nodeDetail('forms')).exts as Record<string, unknown>,
      processActive: true,
    }
    const done = await executeR1Stage1FunctionalCandidate(storage, intent, gateway)
    expect(done).toMatchObject({ state: 'succeeded', data: { state: 'completed' } })
    expect(requests).toEqual([
      `biz/extForm/upsert/${mockSyntheticDynamicFormDefinitionId}`,
      'workflowNode/updateExts/mock-workflow-node-020-forms', 'workflow/process',
    ])
    expect((await nodeDetail('forms')).state).toBe(10)
    expect((await inspectR1MultiStepReceipt(storage, scope)).data)
      .toMatchObject({ state: 'completed' })
    resetMockCommandState()
    expect((await nodeDetail('forms')).state).toBe(10)
    expect((await executeR1Stage1FunctionalCandidate(storage, intent, gateway)).state)
      .toBe('failed_terminal')
    expect(requests).toHaveLength(3)
  })

  it('forms: source finalize-complate path completes an authoritative existing list', async () => {
    const command = r1FormsFinalizeProcess({ ...spec('forms'), sourceNodeType: 'forms',
      availableFormDataIds: [asOpaqueId<'FormDataId'>('mock-form-data-020-existing-a')] })
    expect(command.body).toMatchObject({ nodeFormDefId: mockSyntheticDynamicFormDefinitionId,
      nodeFormDataId: '' })
    expect(await tryMockR1SpecialCommand(command)).toMatchObject({ success: true })
    resetMockCommandState()
    expect(await nodeDetail('forms')).toMatchObject({ state: 10 })
    expect(await tryMockR1SpecialCommand(command)).toMatchObject({ code: 'TERMINAL' })
  })

  it('forms: committed FormData and authoritative EXTS survive reload, then Process survives another reload', async () => {
    const savedId = await save('forms', '重启后仍然存在')
    const scope = spec('forms')
    const planned = planR1FormsUpdateExts({
      workflowNodeId: scope.workflowNodeId, sourceNodeType: 'forms',
      authoritativeExts: (await nodeDetail('forms')).exts as Record<string, unknown>,
      change: { kind: 'saved', record: { _id: savedId,
        formDefId: mockSyntheticDynamicFormDefinitionId, formTitle: '重启现场记录', state: 1 } },
    })
    expect(await tryMockR1SpecialCommand(r1FormsUpdateExtsCommand({
      sourceNodeType: 'forms', planned,
    }))).toMatchObject({ success: true })
    resetMockCommandState() // H5 reload: new in-memory server, same durable synthetic storage.
    expect(await tryMockRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`,
      { 'is:_id|string#and': savedId }, { latencyMs: 0 }))
      .toMatchObject({ data: [{ _id: savedId, exts: { inspectionSummary: '重启后仍然存在' } }] })
    expect((await nodeDetail('forms')).exts).toMatchObject({ formList: [
      {}, {}, { _id: savedId, formTitle: '重启现场记录', state: 1 },
    ] })
    const complete = r1FormsAfterSaveProcess({ ...scope, sourceNodeType: 'forms',
      updatedFormListAcknowledged: true })
    expect(await tryMockR1SpecialCommand(complete)).toMatchObject({ success: true })
    resetMockCommandState()
    expect(await nodeDetail('forms')).toMatchObject({ state: 10 })
    expect(await tryMockR1SpecialCommand(complete)).toMatchObject({ code: 'TERMINAL' })
  })

  it('repeat: durable batch survives reload without permitting a duplicate Process', async () => {
    const first = await save('repeat', '屋面初检')
    const second = await save('repeat', '屋面复检')
    resetMockCommandState()
    const complete = r1RepeatBatchProcess({ ...spec('repeat'), sourceNodeType: 'repeat',
      savedFormDataIds: [first, second] })
    expect(await tryMockR1SpecialCommand(complete)).toMatchObject({ success: true })
    resetMockCommandState()
    expect(await nodeDetail('repeat')).toMatchObject({ state: 10 })
    expect(await tryMockR1SpecialCommand(complete)).toMatchObject({ code: 'TERMINAL' })
  })

  it('forms: authoritative existing-row edit preserves EXTS history; soft-delete blocks stale completion', async () => {
    const savedId = await save('forms', '初次勘察')
    const scope = spec('forms')
    const append = planR1FormsUpdateExts({ workflowNodeId: scope.workflowNodeId,
      sourceNodeType: 'forms', authoritativeExts: (await nodeDetail('forms')).exts as Record<string, unknown>,
      change: { kind: 'saved', record: { _id: savedId,
        formDefId: mockSyntheticDynamicFormDefinitionId, formTitle: '屋面记录', state: 1 } },
    })
    expect(await tryMockR1SpecialCommand(r1FormsUpdateExtsCommand({
      sourceNodeType: 'forms', planned: append,
    }))).toMatchObject({ success: true })
    const original = (await tryMockRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`,
      { 'is:_id|string#and': savedId }, { latencyMs: 0 }) as { data: Record<string, unknown>[] }).data[0]
    const edit = r1SpecialFormUpsert({ ...scope, sourceNodeType: 'forms', state: 1,
      existingFormDataId: savedId, authoritativeOriginal: original,
      formData: { inspectionSummary: '勘察后修订' },
    })
    expect(await tryMockR1SpecialCommand(edit)).toMatchObject({ data: { _id: savedId } })
    const rename = planR1FormsUpdateExts({ workflowNodeId: scope.workflowNodeId,
      sourceNodeType: 'forms', authoritativeExts: (await nodeDetail('forms')).exts as Record<string, unknown>,
      change: { kind: 'saved', record: { _id: savedId, formTitle: '屋面复核记录' } },
    })
    expect(await tryMockR1SpecialCommand(r1FormsUpdateExtsCommand({
      sourceNodeType: 'forms', planned: rename,
    }))).toMatchObject({ success: true })
    resetMockCommandState()
    expect(await tryMockRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`,
      { 'is:_id|string#and': savedId }, { latencyMs: 0 }))
      .toMatchObject({ data: [{ _id: savedId, exts: { inspectionSummary: '勘察后修订' } }] })
    const softDelete = planR1FormsUpdateExts({ workflowNodeId: scope.workflowNodeId,
      sourceNodeType: 'forms', authoritativeExts: (await nodeDetail('forms')).exts as Record<string, unknown>,
      change: { kind: 'delete', recordId: savedId },
    })
    expect(await tryMockR1SpecialCommand(r1FormsUpdateExtsCommand({
      sourceNodeType: 'forms', planned: softDelete,
    }))).toMatchObject({ success: true })
    resetMockCommandState()
    expect((await nodeDetail('forms')).exts).toMatchObject({ formList: [
      {}, {}, { _id: savedId, state: -1, formTitle: '屋面复核记录' },
    ] })
    expect(await tryMockR1SpecialCommand(r1FormsAfterSaveProcess({ ...scope,
      sourceNodeType: 'forms', updatedFormListAcknowledged: true })))
      .toMatchObject({ code: 'TERMINAL' })
  })

  it('repeat: source remove tombstones one scoped FormData and removes it from list/readback', async () => {
    const first = await save('repeat', '初检')
    const second = await save('repeat', '复检')
    const remove = r1RepeatRemoveCommand({ sourceNodeType: 'repeat', definitionId, formDataId: first })
    expect(await tryMockR1SpecialCommand(remove)).toMatchObject({ success: true })
    expect(await tryMockR1SpecialCommand(remove)).toMatchObject({ code: 'TERMINAL' })
    resetMockCommandState()
    const query = await tryMockRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`,
      { 'is:workflowId|string#and': 'mock-workflow-run-021' }, { latencyMs: 0 }) as {
        data: { _id: string }[]
      }
    expect(query.data.map(row => row._id)).toContain(second)
    expect(query.data.map(row => row._id)).not.toContain(first)
    expect(await tryMockRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`,
      { 'is:_id|string#and': first }, { latencyMs: 0 }))
      .toMatchObject({ data: [], total: 0 })
    expect(await tryMockR1SpecialCommand(r1RepeatBatchProcess({ ...spec('repeat'),
      sourceNodeType: 'repeat', savedFormDataIds: [first, second] })))
      .toMatchObject({ code: 'TERMINAL' })
    expect(await tryMockR1SpecialCommand(r1RepeatBatchProcess({ ...spec('repeat'),
      sourceNodeType: 'repeat', savedFormDataIds: [second] })))
      .toMatchObject({ success: true })
  })

  it('corrupt or unwritable snapshot fails closed without silently applying a command', async () => {
    await save('forms', '保存前')
    const key = [...memory.keys()].find(key => key.includes('r1-special.020-021'))
    expect(key).toBeDefined()
    memory.set(key!, '{corrupt')
    resetMockCommandState()
    expect(await tryMockR1SpecialCommand(r1SpecialFormUpsert({ ...spec('forms'), state: 1,
      formData: { inspectionSummary: '不能静默覆盖' },
    }))).toMatchObject({ code: 'TERMINAL' })
    expect(await tryMockRead(`basic/serviceAppointment/queryById/${spec('forms').workOrderId}`,
      {}, { latencyMs: 0 })).toMatchObject({ success: false, code: 'TERMINAL' })
  })

  it('lost storage ACK after committed FormData poisons runtime; reload reconciles without replay', async () => {
    let failReadback = false
    vi.stubGlobal('uni', {
      getStorageSync: (key: string) => {
        if (failReadback && key.includes('r1-special.020-021')) {
          failReadback = false
          throw new Error('Mock storage ACK lost')
        }
        return memory.get(key)
      },
      setStorageSync: (key: string, value: unknown) => {
        memory.set(key, value)
        if (key.includes('r1-special.020-021')) failReadback = true
      },
      removeStorageSync: (key: string) => { memory.delete(key) },
    })
    const request = r1SpecialFormUpsert({ ...spec('repeat'), state: 1,
      formData: { inspectionSummary: '已提交但回执丢失' },
    })
    expect(await tryMockR1SpecialCommand(request)).toMatchObject({ code: 'TERMINAL' })
    expect(await tryMockR1SpecialCommand(request)).toMatchObject({ code: 'TERMINAL' })
    resetMockCommandState()
    expect(await tryMockRead(`biz/extForm/query/${mockSyntheticDynamicFormDefinitionId}`,
      { 'is:_id|string#and': 'mock-special-form-data-repeat-1' }, { latencyMs: 0 }))
      .toMatchObject({ data: [{ _id: 'mock-special-form-data-repeat-1',
        exts: { inspectionSummary: '已提交但回执丢失' } }] })
  })

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
