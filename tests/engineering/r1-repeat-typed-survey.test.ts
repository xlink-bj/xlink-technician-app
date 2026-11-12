import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createR1RepeatActions, type R1RepeatScope } from '@app/r1-repeat-actions'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import type { SessionSnapshot } from '@shared/ports'
import type { ApiReadRequest } from '@adapters/api/technician-api'
import type { ApiCommandRequest } from '@adapters/api/technician-api-commands'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

// Synthetic two-scalar definition, not a production Survey schema. The normal
// reader invokes the real scoped reader and form mapper; only transport is stubbed.
const scope: R1RepeatScope = { tenantId: 'tenant', userId: 'user', roleId: 'role', workOrderId: 'work', workflowRunId: 'run', runtimeNodeId: 'node', formDefinitionId: 'ext-survey' }
const origin = 'http://127.0.0.1:5189'
const draft = { squareMeter: 18.75, memo: '现场确认维修范围' }
function harness() {
  const session = { sessionRef: 'synthetic-session', user: { id: 'user' }, currentRole: { id: 'role' } } as unknown as SessionSnapshot
  const env = { DEV: true, VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_AUTH_TENANT: 'tenant', VITE_XLINK_API_BASE_URL: `${origin}/xlink/wm`, VITE_XLINK_MOCK: 'false', VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true', VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_R1_REPEAT_ACTIONS: 'true', VITE_XLINK_R1_REPEAT_GRANT: JSON.stringify({ version: 1, scope, expiresAt: '2099-01-01T00:00:00Z', fieldIds: ['area', 'memo'], operations: ['create', 'complete'] }) }
  const node = { _id: 'node', tenantId: 'tenant', workflowId: 'run', workflowFormDataId: 'work', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: ['role'], nodeDef: { nodeType: 'repeat', formDefId: 'ext-survey', formFieldIdsFill: ['area', 'memo'], formFieldIdsReadOnly: [] } }
  const ext = { _id: 'ext-survey', tenantId: 'tenant', state: 1, type: '1', colName: 'survey' }
  const fields = [
    { _id: 'area', tenantId: 'tenant', extId: ext._id, state: 1, name: 'squareMeter', title: '面积', type: 'digit', required: true },
    { _id: 'memo', tenantId: 'tenant', extId: ext._id, state: 1, name: 'memo', title: '备注', type: 'textarea', required: false },
  ]
  let records: Record<string, unknown>[] = []
  let concurrentCreate = false
  let mutateRow = (_row: Record<string, unknown>) => {}
  let createAck: unknown = { status: 1, success: true, data: { _id: 'saved-survey' } }
  const events: string[] = []
  const readTransport = { execute: vi.fn(async (request: ApiReadRequest) => {
    const { path, body } = request
    events.push(`${path}${body?.['is:_id|string#and'] ? ':exact' : ''}`)
    if (path === 'basic/serviceAppointment/queryById/work') return structuredClone({ success: true, status: 1, data: { serviceAppointment: { _id: 'work', tenantId: 'tenant', state: 1, workflowId: 'run' }, workflow: { _id: 'run', tenantId: 'tenant', formDataId: 'work', state: 0 }, workflowNode: [node] } })
    if (path === 'biz/ext/queryById.do') return structuredClone(ext)
    if (path === 'biz/extField/query') return { data: structuredClone(fields), total: fields.length, page: 1, size: 50 }
    if (path === 'biz/extForm/query/ext-survey') {
      const selected = body?.['is:_id|string#and']
      const data = records.filter(row => !selected || row._id === selected)
      return { data: structuredClone(data), total: data.length, page: 1, size: body?.rows, dataCount: data.length }
    }
    throw Error(`Unexpected read: ${path}`)
  }) }
  const reader = createNormalNodeFormsReader({ auth: { getCurrentSession: () => session }, tenantId: 'tenant', env, origin, transport: readTransport, read: {
    isWorkOrderListedForCurrentSession: () => true,
    listWorkOrders: vi.fn(),
  } })
  const commands = { execute: vi.fn(async (request: ApiCommandRequest): Promise<unknown> => {
    events.push(request.path)
    if (request.path === 'workflow/process') return { status: 1, success: true }
    if (request.path !== 'biz/extForm/upsert/ext-survey') throw Error('Unexpected command')
    const data = JSON.parse(String(request.body?.dataStr))
    // Typed server projection: smodule is a parent command parameter, not a
    // required Survey property. Server supplies inherited identity/audit fields.
    const row: Record<string, unknown> = { _id: 'saved-survey', tenantId: 'tenant', sid: data.sid, nodeId: data.nodeId, workflowId: data.workflowId, state: 1, squareMeter: data.squareMeter, memo: data.memo, sourceType: 1, createTime: '2026-11-08 02:00:00', createDateTime: '2026-11-08 02:00:00' }
    mutateRow(row)
    // A second client may create after the initial empty read. This stub only
    // diagnoses the existing exact-reread fence; the local lock is not CAS.
    records = concurrentCreate ? [{ ...row, _id: 'concurrent-survey' }, row] : [row]
    return createAck
  }) }
  const make = () => createR1RepeatActions({ env, origin, getSession: () => session, hasExactGrant: candidate => JSON.stringify(candidate) === JSON.stringify(scope), readLatest: s => reader.load(s.workOrderId, s.runtimeNodeId), transport: commands })
  return { make, reader, commands, readTransport, fields, node, events, mutate: (fn: typeof mutateRow) => { mutateRow = fn }, ack: (value: unknown) => { createAck = value }, concurrent: () => { concurrentCreate = true } }
}
beforeEach(() => installLocalFixtureBrowser())
afterEach(() => vi.unstubAllGlobals())

describe('generic repeat typed Survey transport contract', () => {
  it('saves typed Ext1 scalar data, exact-rereads it, and separately completes fresh saved IDs without an entity ACK', async () => {
    const h = harness(), actions = h.make()
    const saved = await actions.saveOnly(scope, draft)
    expect(saved.definition.fields?.map(f => [f.valueKey, f.type])).toEqual([['squareMeter', 'digit'], ['memo', 'textarea']])
    expect(saved.records[0]?.values).toMatchObject(draft)
    expect(saved.records[0]?.values).not.toHaveProperty('smodule')
    expect(saved.records[0]).not.toHaveProperty('appointmentReplacement')
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(h.commands.execute.mock.calls[0]![0].body?.dataStr))).toEqual({ ...draft, sid: 'work', smodule: 'serviceAppointment', nodeId: 'node', workflowId: 'run', state: 1 })
    const start = h.events.length
    expect(await actions.complete(scope)).toEqual({ acknowledged: true, transitionVerified: false })
    expect(h.events.slice(start).filter(e => e.includes('extForm/query') || e === 'workflow/process')).toEqual(['biz/extForm/query/ext-survey', 'biz/extForm/query/ext-survey:exact', 'workflow/process'])
    expect(h.commands.execute.mock.calls[1]![0].body).toEqual({ workflowNodeId: 'node', nodeFormDefId: 'ext-survey', nodeFormDataId: '', smodule: 'serviceAppointment', sid: 'work' })
    expect(actions.completed(scope)).toBe(true)
    await expect(h.make().complete(scope)).rejects.toThrow()
    expect(h.commands.execute).toHaveBeenCalledTimes(2)
  })
  it.each(['tenantId', 'sid', 'nodeId', 'workflowId', 'state'])('locks missing or contradictory persisted %s without retry', async key => {
    for (const missing of [true, false]) {
      installLocalFixtureBrowser()
      const h = harness(), actions = h.make()
      h.mutate(row => { if (missing) delete row[key]; else row[key] = 'foreign' })
      await expect(actions.saveOnly(scope, draft)).rejects.toThrow()
      expect(actions.locked(scope)).toBe(true)
      await expect(h.make().saveOnly(scope, draft)).rejects.toThrow()
      expect(h.commands.execute).toHaveBeenCalledTimes(1)
    }
  })
  it.each([{}, { _id: 'other' }, { _id: 'saved-survey', id: 'other' }])('locks missing/mismatched create ACK identity %#', async data => {
    const h = harness(), actions = h.make()
    h.ack({ status: 1, success: true, data })
    await expect(actions.saveOnly(scope, draft)).rejects.toThrow()
    await expect(h.make().saveOnly(scope, draft)).rejects.toThrow()
    expect(actions.locked(scope)).toBe(true)
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
  })
  it.each([undefined, '18.75', 18.76])('locks missing or nonidentical typed value %s', async value => {
    const h = harness(), actions = h.make()
    h.mutate(row => { if (value === undefined) delete row.squareMeter; else row.squareMeter = value })
    await expect(actions.saveOnly(scope, draft)).rejects.toThrow()
    await expect(h.make().saveOnly(scope, draft)).rejects.toThrow()
    expect(actions.locked(scope)).toBe(true)
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
  })
  it('rejects unknown fields and node-readonly fields before command dispatch', async () => {
    const h = harness(), actions = h.make()
    await expect(actions.saveOnly(scope, { ...draft, unknown: 'value' })).rejects.toThrow()
    h.node.nodeDef.formFieldIdsReadOnly = ['area'] as never[]
    await expect(actions.saveOnly(scope, draft)).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
  it.each(['createTime', 'createUser', 'updateTime', 'orgId', '_version'])('rejects schema and caller attempts to submit server-owned %s', async key => {
    const h = harness(), actions = h.make()
    await expect(actions.saveOnly(scope, { ...draft, [key]: 'injected' })).rejects.toThrow()
    h.fields[1]!.name = key
    await expect(actions.saveOnly(scope, { squareMeter: 18.75, [key]: 'injected' })).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
  it('does not edit an existing saved record or complete an empty record set', async () => {
    const h = harness(), actions = h.make()
    await expect(actions.complete(scope)).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
    await actions.saveOnly(scope, draft)
    await expect(h.make().saveOnly(scope, { ...draft, memo: 'replacement' })).rejects.toThrow()
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
  })
  it('locks an ACK followed by two same-scope records rather than claiming cross-client CAS or retrying', async () => {
    const h = harness(), actions = h.make()
    h.concurrent()
    await expect(actions.saveOnly(scope, draft)).rejects.toThrow()
    expect(actions.locked(scope)).toBe(true)
    expect(h.events.filter(event => event.includes('extForm/query'))).toEqual([
      'biz/extForm/query/ext-survey',
      'biz/extForm/query/ext-survey',
      'biz/extForm/query/ext-survey:exact',
      'biz/extForm/query/ext-survey:exact',
    ])
    await expect(h.make().saveOnly(scope, draft)).rejects.toThrow()
    await expect(h.make().complete(scope)).rejects.toThrow()
    expect(h.commands.execute).toHaveBeenCalledTimes(1)
    expect(h.commands.execute.mock.calls[0]![0].path).toBe('biz/extForm/upsert/ext-survey')
  })
  it('preserves zero decimal and the supported text normalization of false', async () => {
    const h = harness()
    const saved = await h.make().saveOnly(scope, { squareMeter: 0, memo: false })
    expect(saved.records[0]?.values).toMatchObject({ squareMeter: 0, memo: 'false' })
  })
  it('rejects boolean false as a decimal rather than inventing a boolean field type', async () => {
    const h = harness()
    await expect(h.make().saveOnly(scope, { squareMeter: false, memo: '' })).rejects.toThrow()
    expect(h.commands.execute).not.toHaveBeenCalled()
  })
})
