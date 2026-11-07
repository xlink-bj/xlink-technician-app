import { describe, expect, it, vi } from 'vitest'
import { createNormalNodeFormsReader, normalNodeFormsReadEnabled } from '@app/r1-node-forms-read'
import type { SessionSnapshot } from '@shared/ports'
const origin = 'http://127.0.0.1:5189'
const env = { DEV: true, VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_MOCK: 'false', VITE_XLINK_API_BASE_URL: `${origin}/xlink/wm`, VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false' }
function harness(envOverride: Record<string, unknown> = {}) {
  let session = { sessionRef: 'session', user: { id: 'user' }, currentRole: { id: 'role' }, capabilityNames: [] } as unknown as SessionSnapshot
  let listed = false
  const node = { _id: 'node', tenantId: 'tenant', workflowId: 'workflow', workflowFormDataId: 'work', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: ['role'], nodeDef: { nodeType: 'repeat', formDefId: 'ext' } }
  const detail = { success: true, status: 1, data: { serviceAppointment: { _id: 'work', tenantId: 'tenant', state: 1, workflowId: 'workflow' }, workflow: { _id: 'workflow', tenantId: 'tenant', formDataId: 'work', state: 0 }, workflowNode: [node] } }
  const ext = { _id: 'ext', tenantId: 'tenant', state: 1, type: 1, colName: 'survey' }
  const field = { _id: 'field', tenantId: 'tenant', extId: 'ext', state: 1, name: 'answer', title: 'Answer', type: 'radio', valueOption: 'OPTIONS', colName: 'survey' }
  const fieldPage = { data: [field], total: 1, page: 1, size: 50 }
  const record = { _id: 'record', tenantId: 'tenant', sid: 'work', nodeId: 'node', workflowId: 'workflow', state: 1, exts: { answer: 'yes' } }
  const list = { items: [{ id: 'work' }], totalCount: 1, page: 1, pageSize: 20 }
  const calls: string[] = []
  let hook: (() => void) | undefined
  const execute = vi.fn(async (request: { path: string; body?: Readonly<Record<string, unknown>> }) => {
    calls.push(request.path); hook?.()
    if (request.path.startsWith('basic/serviceAppointment/')) { expect(request.body).toEqual({}); return structuredClone(detail) }
    if (request.path === 'biz/ext/queryById.do') return structuredClone(ext)
    if (request.path === 'biz/extField/query') return structuredClone(fieldPage)
    if (request.path === 'biz/extForm/query/ext') return { data: [structuredClone(record)], total: 1, page: 1, size: request.body?.rows, dataCount: 1 }
    throw Error('Unexpected request')
  })
  const read = {
    listWorkOrders: vi.fn(async () => { calls.push('role-list'); listed = list.items.some(x => x.id === 'work'); return { state: 'succeeded', data: list } as never }),
    isWorkOrderListedForCurrentSession: () => listed,
    getDynamicCodeOptions: vi.fn(async () => { calls.push('provider'); return { state: 'succeeded', data: { items: [{ value: 'yes', label: 'Yes' }] } } as never }),
  }
  const reader = createNormalNodeFormsReader({ auth: { getCurrentSession: () => session }, read, tenantId: 'tenant', env: { ...env, ...envOverride }, origin, transport: { execute } })
  return { reader, execute, read, calls, detail, node, ext, field, fieldPage, list, record, hook: (fn: () => void) => { hook = fn }, changeSession: () => { session = { ...session, sessionRef: 'changed' as never } }, changeRole: () => { session = { ...session, currentRole: { ...session.currentRole!, id: 'other' as never } } } }
}
describe('normal form read gate', () => {
  it('requires explicit local read enablement', () => { expect(normalNodeFormsReadEnabled({}, origin)).toBe(false); expect(normalNodeFormsReadEnabled(env, origin)).toBe(true) })
  it.each([{ VITE_XLINK_ENVIRONMENT: 'production' }, { VITE_XLINK_MOCK: 'true' }, { DEV: false }, { VITE_XLINK_ENABLE_REAL_WRITES: 'true' }, { VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true' }, { VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS: 'true' }])('denies unsafe mode %j', override => expect(normalNodeFormsReadEnabled({ ...env, ...override }, origin)).toBe(false))
  it('rejects non-loopback origin', () => expect(normalNodeFormsReadEnabled(env, 'https://example.com')).toBe(false))
})
it('cold page traverses role list, raw detail, schema/provider, discovery, exact read and second detail', async () => {
  const h = harness(); const snapshot = await h.reader.load('work', 'node')
  expect(snapshot.records[0]?.values?.answer).toBe('yes'); expect(h.reader.isCurrent(snapshot)).toBe(true)
  expect(h.calls).toEqual(['role-list', 'basic/serviceAppointment/queryById/work', 'biz/ext/queryById.do', 'biz/extField/query', 'provider', 'biz/extForm/query/ext', 'biz/extForm/query/ext', 'basic/serviceAppointment/queryById/work'])
  expect(h.execute.mock.calls[4]?.[0].body?.['is:_id|string#and']).toBe('record')
})
it.each(['session', 'role', 'clear'])('rejects %s change during await', async kind => {
  const h = harness(); h.hook(() => kind === 'session' ? h.changeSession() : kind === 'role' ? h.changeRole() : h.reader.clear())
  await expect(h.reader.load('work', 'node')).rejects.toThrow(); expect(h.execute).toHaveBeenCalledTimes(1)
})
it.each(['sa', 'node', 'wf', 'ext', 'field'])('rejects %s tenant mismatch', async kind => {
  const h = harness(); const target = { sa: h.detail.data.serviceAppointment, node: h.node, wf: h.detail.data.workflow, ext: h.ext, field: h.field }[kind]!
  target.tenantId = 'foreign'; await expect(h.reader.load('work', 'node')).rejects.toThrow()
})
it.each(['unsupported', 'invisible', 'closed', 'incomplete', 'duplicate', 'unlisted'])('rejects %s evidence', async kind => {
  const h = harness()
  if (kind === 'unsupported') h.node.nodeDef.nodeType = 'rawform'
  if (kind === 'invisible') h.node.handlerIds = ['other-role']
  if (kind === 'closed') h.node.state = 1
  if (kind === 'incomplete') h.fieldPage.total = 2
  if (kind === 'duplicate') { h.fieldPage.data.push(h.field); h.fieldPage.total = 2 }
  if (kind === 'unlisted') h.list.items = [{ id: 'other-work' }]
  await expect(h.reader.load('work', 'node')).rejects.toThrow()
})

it.each([
  { VITE_XLINK_AUTH_API_BASE_URL: 'https://auth.example.com' },
  { VITE_XLINK_AUTH_API_BASE_URL: ' ' },
  { VITE_XLINK_AUTH_API_BASE_URL: null },
  { VITE_XLINK_H5_MOCK_E2E: 'true' },
])('rejects auth override/mock isolation %j before any request', async override => {
  expect(normalNodeFormsReadEnabled({ ...env, ...override }, origin)).toBe(false)
  const h = harness(override)
  await expect(h.reader.load('work', 'node')).rejects.toThrow()
  expect(h.read.listWorkOrders).not.toHaveBeenCalled()
  expect(h.read.getDynamicCodeOptions).not.toHaveBeenCalled()
  expect(h.execute).not.toHaveBeenCalled()
})
