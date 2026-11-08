import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBusinessMockMode, resetBusinessMockCache } from '@adapters/api/mock/config'
import { resetMockCommandState } from '@adapters/api/mock/command-state'
import { resetMockJourney } from '@adapters/api/mock/journey'
import { tryMockRead } from '@adapters/api/mock/router'
import { tryMockR1SpecialCommand } from '@adapters/api/mock/r1-special-protocol'
import { updateMockR1SpecialState } from '@adapters/api/mock/r1-special-state'
import { mockR1FormsWorkOrderId, mockSyntheticDynamicFormDefinitionId } from '@adapters/api/mock/fixtures'
import { r1SpecialFormUpsert, r1FormsUpdateExtsCommand } from '@adapters/api/r1-special-workflow-wires'
import type { ApiCommandRequest } from '@adapters/api/technician-api-commands'
import { planR1FormsUpdateExts } from '@features/work-orders/r1-forms-exts-plan'
import { executeR1Stage1FunctionalCandidate, type R1Stage1Intent } from '@app/r1-stage1-functional-flow'
import { inspectR1MultiStepReceipt, closeCompletedR1MutationReceiptAfterReadback,
  closeCompletedR1ReceiptAfterReadback, type R1MultiStepScope } from '@features/work-orders/r1-multistep-offline-transaction'
import type { StorageKey, StoragePort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

// Protocol integration only: genuine synthetic Mock router/state/gateway, never HTTP.
// saveOnly here names the explicit offline candidate plan, not the legacy R1
// saveNodeExts(state=0) behaviour or a newly enabled normal-App capability.
type Row = Record<string, unknown>
const memory = new Map<string, unknown>()
const totals = { tests: 0, candidateDispatches: 0, syntheticCommandCalls: 0,
  syntheticReads: 0, unknownCommands: 0, unknownReads: 0, httpIntents: 0 }
let activeRequests: ApiCommandRequest[][] = []
const noHttp = () => { totals.httpIntents++; throw Error('HTTP forbidden: pure synthetic protocol test') }
const actor = { userId: 'synthetic-user', roleId: 'synthetic-role' }
const spec = { sourceNodeType: 'forms' as const,
  definitionId: asOpaqueId<'FormDefinitionId'>(mockSyntheticDynamicFormDefinitionId),
  workOrderId: asOpaqueId<'WorkOrderId'>(mockR1FormsWorkOrderId),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-020-forms'),
  workflowRunId: asOpaqueId<'WorkflowRunId'>('mock-workflow-run-020') }
const scope: R1MultiStepScope = { userId: actor.userId, workOrderId: spec.workOrderId,
  runtimeNodeId: spec.workflowNodeId, workflowRunId: spec.workflowRunId,
  formDefinitionId: spec.definitionId, sourceNodeType: 'forms', authorizationScope: 'synthetic-user:synthetic-role' }
async function command(request: ApiCommandRequest, suppliedActor = actor): Promise<unknown> {
  totals.syntheticCommandCalls++
  const result = await tryMockR1SpecialCommand(request, suppliedActor, () => true)
  if (result === null || result === undefined) {
    totals.unknownCommands++
    throw Error('Unknown synthetic command; HTTP fallback forbidden')
  }
  return result
}
async function read(path: string, body: Record<string, unknown>): Promise<unknown> {
  const allowed = path === `basic/serviceAppointment/queryById/${spec.workOrderId}`
    || (path.startsWith('biz/extForm/query/') && Boolean(body['is:_id|string#and']))
  if (!allowed) { totals.unknownReads++; throw Error('Unreviewed synthetic read') }
  totals.syntheticReads++
  const result = await tryMockRead(path, body, { latencyMs: 0 })
  if (result === null || result === undefined) {
    totals.unknownReads++
    throw Error('Unknown synthetic read; HTTP fallback forbidden')
  }
  return result
}

beforeEach(() => {
  memory.clear(); activeRequests = []
  vi.stubGlobal('fetch', noHttp)
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubGlobal('uni', { request: noHttp, getStorageSync: (key: string) => memory.get(key),
    setStorageSync: (key: string, value: unknown) => { memory.set(key, value) },
    removeStorageSync: (key: string) => { memory.delete(key) } })
  resetBusinessMockCache(); setBusinessMockMode('data'); resetMockCommandState(); resetMockJourney()
})
afterEach(() => {
  totals.tests++; totals.candidateDispatches += activeRequests.reduce((count, requests) => count + requests.length, 0)
  expect(totals.httpIntents).toBe(0); expect(totals.unknownCommands).toBe(0); expect(totals.unknownReads).toBe(0)
  resetMockCommandState(); resetBusinessMockCache(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
})
afterAll(() => { console.info('PURE_MOCK_PROTOCOL_COUNTS', JSON.stringify(totals)) })

function storage(): StoragePort {
  const rows = new Map<string, unknown>()
  return { read: async (key: StorageKey) => ({ state: 'succeeded', data: rows.get(key.key) ?? null }),
    write: async (key: StorageKey, value: unknown) => { rows.set(key.key, value); return { state: 'succeeded' } },
    remove: async (key: StorageKey) => { rows.delete(key.key); return { state: 'succeeded' } } } as StoragePort
}
async function node(): Promise<Row> {
  const raw = await read(`basic/serviceAppointment/queryById/${spec.workOrderId}`, {}) as { data: { workflowNode: Row[] } }
  return raw.data.workflowNode.find(row => row._id === spec.workflowNodeId)!
}
async function exts(): Promise<Row & { formList: Row[] }> { return (await node()).exts as Row & { formList: Row[] } }
async function exact(id: string, definition: string = spec.definitionId): Promise<Row> {
  const result = await read(`biz/extForm/query/${definition}`,
    { 'is:_id|string#and': id }) as { data: Row[]; total: number }
  expect(result.total).toBe(1); expect(result.data).toHaveLength(1)
  expect(result.data[0]!._id).toBe(id)
  return result.data[0]!
}
function gateway() {
  const requests: ApiCommandRequest[] = []
  activeRequests.push(requests)
  return { requests, revalidate: async () => (await node()).state === 0,
    dispatch: vi.fn(async (request: ApiCommandRequest): Promise<unknown> => {
      requests.push(request); return command(request)
    }) }
}
async function add(summary: string): Promise<string> {
  const ack = await command(r1SpecialFormUpsert({ ...spec, state: 1,
    formData: { inspectionSummary: summary, inspectionNote: 'optional original', serverOpaque: 'unmapped scalar kept' } })) as { data: { _id: string } }
  expect(ack.data?._id).toMatch(/^mock-special-form-data-forms-/)
  const id = ack.data._id
  const planned = planR1FormsUpdateExts({ sourceNodeType: 'forms', workflowNodeId: spec.workflowNodeId,
    authoritativeExts: await exts(), change: { kind: 'saved', record: {
      _id: id, formDefId: spec.definitionId, formTitle: summary, state: 1 } } })
  expect(await command(r1FormsUpdateExtsCommand({ sourceNodeType: 'forms', planned }))).toMatchObject({ success: true })
  return id
}
async function existing() {
  await node() // Initialize/restore genuine synthetic state before custom fixture data.
  expect(updateMockR1SpecialState(draft => {
    draft.forms.exts.unknownNode = { nested: ['keep', { zero: 0, enabled: false }] }
    for (const [index, row] of (draft.forms.exts.formList as Row[]).entries())
      row.unknownRow = { historical: true, index }
    return true
  })).toBe(true)
  const first = await add('first active'), second = await add('second active'), deleted = await add('deleted entry')
  expect(updateMockR1SpecialState(draft => {
    for (const [index, row] of (draft.forms.exts.formList as Row[]).entries())
      row.unknownRow ??= { synthetic: true, index, nested: ['retained'] }
    return true
  })).toBe(true)
  const deletion = planR1FormsUpdateExts({ sourceNodeType: 'forms', workflowNodeId: spec.workflowNodeId,
    authoritativeExts: await exts(), change: { kind: 'delete', recordId: deleted } })
  expect(await command(r1FormsUpdateExtsCommand({ sourceNodeType: 'forms', planned: deletion }))).toMatchObject({ success: true })
  const original = await exact(deleted)
  expect(await command(r1SpecialFormUpsert({ ...spec, state: -1, existingFormDataId: asOpaqueId<'FormDataId'>(deleted),
    authoritativeOriginal: original, formData: {} }))).toMatchObject({ data: { _id: deleted } })
  const baseline = structuredClone(await exts())
  expect(baseline.formList).toHaveLength(5)
  expect(baseline.formList.filter(row => row.state === 1)).toHaveLength(4)
  expect(baseline.formList.filter(row => row.state === -1)).toHaveLength(1)
  return { first, second, deleted, baseline }
}
async function saveIntent(baseline: Row, finish = false): Promise<R1Stage1Intent> {
  return { kind: 'forms_save', sourceNodeType: 'forms', scope,
    fields: { inspectionSummary: 'new after multiple records' }, title: 'new appended title',
    authoritativeExts: baseline, processActive: finish }
}
async function verifySaved(receipts: StoragePort, id: string, fields: Record<string, string>, extra: Row = {}) {
  const record = await exact(id), current = await exts()
  expect(await closeCompletedR1MutationReceiptAfterReadback(receipts, scope, {
    workOrderId: scope.workOrderId, runtimeNodeId: scope.runtimeNodeId, sourceNodeType: 'forms',
    workflowRunId: scope.workflowRunId, formDefinitionId: scope.formDefinitionId,
    formData: record, formsExts: current, expectedFields: fields, ...extra,
  })).toBe(true)
  expect((await inspectR1MultiStepReceipt(receipts, scope)).data).toBeNull()
}

describe('existing multiple forms records through the strict synthetic protocol', () => {
  it('preserves separate existing raw and slot titles through the real wire and strict Mock protocol', async () => {
    const h = await existing()
    expect(updateMockR1SpecialState(draft => {
      draft.rows[h.first]!.formTitle = 'original raw title independent of slot'
      return true
    })).toBe(true)
    const raw = await exact(h.first)
    const upsert = r1SpecialFormUpsert({ ...spec, state: 1, authoritativeOriginal: raw,
      existingFormDataId: asOpaqueId<'FormDataId'>(h.first), formData: { inspectionSummary: 'title preserving edit' } })
    const outgoing = JSON.parse(String(upsert.body?.dataStr))
    expect(outgoing.formTitle).toBe(raw.formTitle)
    expect(await command(upsert)).toMatchObject({ data: { _id: h.first } })
    // Pinned R1 saveNodeExts L10247-10251 only rebinds its local map item;
    // an existing array slot is not replaced by formData or a default title.
    const planned = planR1FormsUpdateExts({ sourceNodeType: 'forms', workflowNodeId: spec.workflowNodeId,
      authoritativeExts: h.baseline, change: { kind: 'saved', record: { _id: h.first, formDefId: spec.definitionId, state: 1 } } })
    expect(await command(r1FormsUpdateExtsCommand({ sourceNodeType: 'forms', planned }))).toMatchObject({ success: true })
    resetMockCommandState()
    expect((await exact(h.first)).formTitle).toBe(raw.formTitle)
    expect((await exts()).formList).toEqual(h.baseline.formList)
    expect((await node()).state).toBe(0)
  })
  it('appends over active/deleted history and independently proves full EXTS and exact persisted values after reload', async () => {
    const h = await existing(), receipts = storage(), g = gateway()
    const result = await executeR1Stage1FunctionalCandidate(receipts, await saveIntent(h.baseline), g)
    expect(result.state).toBe('succeeded')
    const id = result.data!.savedFormDataIds[0]!
    expect(g.requests.map(r => r.path)).toEqual([`biz/extForm/upsert/${spec.definitionId}`, `workflowNode/updateExts/${spec.workflowNodeId}`])
    expect((g.requests[1]!.jsonBody as Row).formList).toEqual([...h.baseline.formList,
      { _id: id, formDefId: spec.definitionId, formTitle: 'new appended title', state: 1 }])
    resetMockCommandState()
    const after = await exts()
    expect(after.unknownNode).toEqual(h.baseline.unknownNode)
    expect(after.formList.slice(0, 5)).toEqual(h.baseline.formList)
    expect((await node()).state).toBe(0)
    await verifySaved(receipts, id, { inspectionSummary: 'new after multiple records' })
  })

  it('edits the same ID with consistent raw wire values while preserving and clearing source keys', async () => {
    const h = await existing(), receipts = storage(), g = gateway(), original = await exact(h.first)
    const beforeSecond = await exact(h.second), beforeDeleted = await exact(h.deleted)
    const intent: R1Stage1Intent = { kind: 'forms_save', sourceNodeType: 'forms', scope,
      fields: { inspectionSummary: 'edited existing' }, title: 'renamed existing', processActive: false,
      authoritativeExts: h.baseline, authoritativeOriginal: original, existingFormDataId: h.first,
      clearedFieldKeys: ['inspectionNote'] }
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, g)).state).toBe('succeeded')
    const wire = JSON.parse(String(g.requests[0]!.body?.dataStr))
    expect(wire._id).toBe(h.first); expect(wire.serverOpaque).toBe('unmapped scalar kept')
    // Assert the outgoing wire itself, before the Mock gateway's own merge.
    // Mock readback remains a synthetic result, not a real-backend edit pass.
    expect(wire.inspectionSummary).toBe('edited existing')
    expect(wire.exts.inspectionSummary).toBe(wire.inspectionSummary)
    expect(wire.exts.inspectionSummary).not.toBe((original.exts as Row).inspectionSummary)
    expect(wire).not.toHaveProperty('inspectionNote'); expect(wire.exts).not.toHaveProperty('inspectionNote')
    resetMockCommandState()
    const edited = await exact(h.first)
    expect((edited.exts as Row).inspectionSummary).toBe(wire.inspectionSummary)
    expect(edited.serverOpaque).toBe(original.serverOpaque)
    expect((edited.exts as Row).serverOpaque).toBe((original.exts as Row).serverOpaque)
    expect(edited).not.toHaveProperty('inspectionNote'); expect(edited.exts).not.toHaveProperty('inspectionNote')
    expect(await exact(h.second)).toEqual(beforeSecond); expect(await exact(h.deleted)).toEqual(beforeDeleted)
    const after = await exts()
    expect(after.formList).toHaveLength(5)
    expect(after.formList.find(row => row._id === h.first)).toEqual({
      ...h.baseline.formList.find(row => row._id === h.first), formTitle: 'renamed existing' })
    expect(after.formList.filter(row => row._id !== h.first)).toEqual(h.baseline.formList.filter(row => row._id !== h.first))
    await verifySaved(receipts, h.first, { inspectionSummary: 'edited existing' }, { expectedAbsentKeys: ['inspectionNote'] })
  })

  it.each(['unknownValue', 'extraKey'] as const)('rejects %s EXTS tampering unrelated to the submitted top-level patch', async fault => {
    const h = await existing(), receipts = storage(), g = gateway(), original = await exact(h.first)
    const dispatch = g.dispatch.getMockImplementation()!
    g.dispatch.mockImplementationOnce(async request => {
      const data = JSON.parse(String(request.body?.dataStr))
      if (fault === 'unknownValue') data.exts.serverOpaque = 'tampered without matching submitted value'
      else data.exts.unexpectedMetadata = 'not in authoritative source'
      return dispatch({ ...request, body: { dataStr: JSON.stringify(data) } })
    })
    const intent: R1Stage1Intent = { kind: 'forms_save', sourceNodeType: 'forms', scope,
      fields: { inspectionSummary: 'valid changed field' }, title: 'unchanged source protected', processActive: false,
      authoritativeExts: h.baseline, authoritativeOriginal: original, existingFormDataId: h.first }
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, g)).state).toBe('failed_terminal')
    expect(g.requests).toHaveLength(1)
    resetMockCommandState()
    expect(await exact(h.first)).toEqual(original)
    expect(await exts()).toEqual(h.baseline)
    expect((await inspectR1MultiStepReceipt(receipts, scope)).data?.state).toBe('may_have_dispatched')
  })

  it.each(['save_finish', 'finalize'] as const)('%s uses its distinct Process ID slots and proves persisted completion separately', async kind => {
    const h = await existing(), receipts = storage(), g = gateway()
    const intent: R1Stage1Intent = kind === 'save_finish' ? await saveIntent(h.baseline, true)
      : { kind: 'forms_finalize', sourceNodeType: 'forms', scope,
        authoritativeSavedIds: h.baseline.formList.filter(row => row.state === 1).map(row => String(row._id)) }
    const done = await executeR1Stage1FunctionalCandidate(receipts, intent, g)
    expect(done.state).toBe('succeeded')
    expect(g.requests.map(r => r.path)).toEqual(kind === 'save_finish'
      ? [`biz/extForm/upsert/${spec.definitionId}`, `workflowNode/updateExts/${spec.workflowNodeId}`, 'workflow/process'] : ['workflow/process'])
    expect(g.requests.at(-1)!.body).toMatchObject({ nodeFormDefId: kind === 'save_finish' ? '' : spec.definitionId,
      nodeFormDataId: '', workflowNodeId: spec.workflowNodeId, sid: spec.workOrderId })
    expect((await inspectR1MultiStepReceipt(receipts, scope)).data?.state).toBe('completed')
    resetMockCommandState()
    expect((await node()).state).toBe(10)
    const after = await exts()
    expect(after.formList.slice(0,5)).toEqual(h.baseline.formList)
    for (const id of done.data!.savedFormDataIds) {
      const definition = String(after.formList.find(row => row._id === id)!.formDefId)
      expect((await exact(id, definition)).state).toBe(1)
    }
    expect(await closeCompletedR1ReceiptAfterReadback(receipts, scope, { workOrderId: scope.workOrderId,
      runtimeNodeId: scope.runtimeNodeId, sourceNodeType: 'forms', workflowCompleted: true,
      savedFormDataIds: done.data!.savedFormDataIds })).toBe(true)
  })

  it.each(['unknown', 'deleted', 'wrongOriginal'] as const)('refuses %s existing edit identity before any command or receipt', async kind => {
    const h = await existing(), receipts = storage(), g = gateway()
    const id = kind === 'unknown' ? 'mock-special-form-data-forms-999' : kind === 'deleted' ? h.deleted : h.first
    const original = kind === 'unknown' ? { ...(await exact(h.first)), _id: id } : await exact(id)
    if (kind === 'wrongOriginal') original.sid = 'foreign-order'
    const intent: R1Stage1Intent = { kind: 'forms_save', sourceNodeType: 'forms', scope,
      fields: { inspectionSummary: 'must not persist' }, title: 'invalid edit', processActive: false,
      authoritativeOriginal: original, authoritativeExts: h.baseline, existingFormDataId: id }
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, g)).state).toBe('failed_terminal')
    expect(g.dispatch).not.toHaveBeenCalled()
    expect((await inspectR1MultiStepReceipt(receipts, scope)).data).toBeNull()
    expect(await exts()).toEqual(h.baseline)
  })

  it.each(['missing', 'conflicting'] as const)('does not link an applied upsert after a %s identity ACK', async fault => {
    const h = await existing(), receipts = storage(), g = gateway()
    const dispatch = g.dispatch.getMockImplementation()!
    let appliedId = ''
    g.dispatch.mockImplementationOnce(async request => {
      const response = await dispatch(request) as { data: { _id: string } }
      appliedId = response.data._id
      return fault === 'missing' ? { data: {} }
        : { data: { _id: appliedId, id: 'contradictory-other-record' } }
    })
    const intent = await saveIntent(h.baseline)
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, g)).state).toBe('failed_terminal')
    expect(g.requests).toHaveLength(1)
    resetMockCommandState()
    expect((await exact(appliedId)).inspectionSummary).toBe('new after multiple records')
    expect(await exts()).toEqual(h.baseline)
    expect((await inspectR1MultiStepReceipt(receipts, scope)).data).toMatchObject({
      state: 'may_have_dispatched', stepIndex: 0, savedFormDataIds: [] })
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, { ...g })).state).toBe('failed_terminal')
    expect(g.requests).toHaveLength(1)
  })

  it('uses the real Mock gateway role rejection and never updates EXTS', async () => {
    const h = await existing(), receipts = storage(), g = gateway()
    g.dispatch.mockImplementation(async request => {
      g.requests.push(request)
      return command(request, { ...actor, roleId: 'wrong-role' })
    })
    const intent = await saveIntent(h.baseline)
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, g)).state).toBe('failed_terminal')
    expect(g.requests).toHaveLength(1)
    expect(await exts()).toEqual(h.baseline)
    expect((await inspectR1MultiStepReceipt(receipts, scope)).data?.state).toBe('may_have_dispatched')
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, { ...g })).state).toBe('failed_terminal')
    expect(g.requests).toHaveLength(1)
  })

  it('revalidates revoked permission between applied upsert and EXTS without replaying either step', async () => {
    const h = await existing(), receipts = storage(), g = gateway()
    let allowed = true
    g.revalidate = async () => allowed && (await node()).state === 0
    const dispatch = g.dispatch.getMockImplementation()!
    g.dispatch.mockImplementationOnce(async request => { const response = await dispatch(request); allowed = false; return response })
    const intent = await saveIntent(h.baseline)
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, g)).state).toBe('failed_terminal')
    expect(g.requests).toHaveLength(1); expect(await exts()).toEqual(h.baseline)
    expect((await inspectR1MultiStepReceipt(receipts, scope)).data).toMatchObject({
      state: 'may_have_dispatched', stepIndex: 1 })
    allowed = true
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, { ...g })).state).toBe('failed_terminal')
    expect(g.requests).toHaveLength(1)
  })

  it.each(['upsert', 'exts', 'process'] as const)('holds an applied %s with lost ACK and never replays after reload', async lost => {
    const h = await existing(), receipts = storage(), g = gateway()
    const dispatch = g.dispatch.getMockImplementation()!
    g.dispatch.mockImplementation(async request => {
      const result = await dispatch(request)
      const target = lost === 'upsert' ? request.path.startsWith('biz/extForm/upsert/')
        : lost === 'exts' ? request.path.startsWith('workflowNode/updateExts/') : request.path === 'workflow/process'
      if (target) throw Error('synthetic ACK lost after committed Mock mutation')
      return result
    })
    const intent = await saveIntent(h.baseline, true)
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, g)).state).toBe('failed_terminal')
    const dispatched = lost === 'upsert' ? 1 : lost === 'exts' ? 2 : 3
    expect(g.requests).toHaveLength(dispatched)
    expect((await inspectR1MultiStepReceipt(receipts, scope)).data).toMatchObject({ state: 'may_have_dispatched', stepIndex: dispatched - 1 })
    resetMockCommandState()
    const current = await exts()
    expect(current.formList.slice(0,5)).toEqual(h.baseline.formList)
    expect(current.formList).toHaveLength(lost === 'upsert' ? 5 : 6)
    expect((await node()).state).toBe(lost === 'process' ? 10 : 0)
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, { ...g })).state).toBe('failed_terminal')
    expect(g.requests).toHaveLength(dispatched)
    const receipt = (await inspectR1MultiStepReceipt(receipts, scope)).data!
    if (receipt.savedFormDataIds[0]) expect((await exact(receipt.savedFormDataIds[0])).inspectionSummary).toBe('new after multiple records')
  })

  it.each(['upsert', 'exts'] as const)('does not advance after explicit %s failure and keeps its receipt through a new coordinator', async failed => {
    const h = await existing(), receipts = storage(), g = gateway()
    const dispatch = g.dispatch.getMockImplementation()!
    g.dispatch.mockImplementation(async request => {
      if ((failed === 'upsert' && request.path.startsWith('biz/extForm/upsert/'))
        || (failed === 'exts' && request.path.startsWith('workflowNode/updateExts/'))) {
        g.requests.push(request); return { success: false, code: 'TERMINAL' }
      }
      return dispatch(request)
    })
    const intent = await saveIntent(h.baseline, true)
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, g)).state).toBe('failed_terminal')
    expect(g.requests).toHaveLength(failed === 'upsert' ? 1 : 2)
    expect((await inspectR1MultiStepReceipt(receipts, scope)).data?.state).toBe('may_have_dispatched')
    resetMockCommandState()
    expect(await exts()).toEqual(h.baseline); expect((await node()).state).toBe(0)
    const count = g.requests.length
    expect((await executeR1Stage1FunctionalCandidate(receipts, intent, { ...g })).state).toBe('failed_terminal')
    expect(g.requests).toHaveLength(count)
  })
})
