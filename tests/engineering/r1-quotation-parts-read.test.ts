import { expect, it, vi } from 'vitest'
import { createNormalQuotationPartsReader } from '@app/r1-quotation-parts-read'
import { readQuotationRepairParts } from '@features/work-orders/quotation/repair-parts-provider'
import type { SessionSnapshot, TechnicianApiReadPort, WorkOrderDetail } from '@shared/ports'
const origin = 'http://127.0.0.1:5189'
const env = { DEV: true, VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_MOCK: 'false', VITE_XLINK_API_BASE_URL: `${origin}/xlink/wm`, VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false', VITE_XLINK_AUTH_TENANT: 'tenant' }
function harness(override: Record<string, unknown> = {}, uiOrigin = origin) {
  let session = { sessionRef: 'session', user: { id: 'user' }, currentRole: { id: 'role' } } as unknown as SessionSnapshot
  let listed = true
  const node = { _id: 'node', tenantId: 'tenant', workflowId: 'run', workflowFormDataId: 'work', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: ['role'], nodeDef: { nodeType: 'placeOrder' } }
  const raw = { success: true, status: 1, data: { serviceAppointment: { _id: 'work', tenantId: 'tenant', state: 1, workflowId: 'run', serviceType: '11', exts: { sourceType: '4' } }, workflow: { _id: 'run', tenantId: 'tenant', formDataId: 'work', state: 0 }, workflowNode: [node] } }
  const detail = { id: 'work', quotationCatalogContext: { workOrderId: 'work', serviceType: '11', sourceType: '4' } } as unknown as WorkOrderDetail
  let provider: unknown = [{ type: 'parts', children: [{ value: '01', name: '屋面', children: [{ value: '0101', name: '顶面' }] }] }]
  let hook: ((path: string) => void) | undefined
  const execute = vi.fn(async (r: { path: string; body?: Readonly<Record<string, unknown>> }) => {
    hook?.(r.path)
    if (r.path === 'i/code/selectMultistageCode.do') { expect(r.body).toEqual({ types: 'parts', tenantId: 'tenant' }); return structuredClone(provider) }
    expect(r.path).toBe('basic/serviceAppointment/queryById/work'); expect(r.body).toEqual({}); return structuredClone(raw)
  })
  const page = { items: [{ id: 'work' }], totalCount: 1, page: 1 }
  const read = { isWorkOrderListedForCurrentSession: () => listed,
    listWorkOrders: vi.fn(async () => { hook?.('list'); listed = page.items.some(x => x.id === 'work'); return { state: 'succeeded', data: page } as never }),
    getCascadeCodeOptions: vi.fn(async () => ({ state: 'succeeded', data: { items: [] } } as never)) }
  const reader = createNormalQuotationPartsReader({ auth: { getCurrentSession: () => session }, read, env: { ...env, ...override }, origin: uiOrigin, transport: { execute } })
  return { reader, detail, raw, node, execute, read, page, provider: (v: unknown) => { provider = v }, unlist: () => { listed = false }, hook: (fn: (path: string) => void) => { hook = fn }, change: (key: string) => { session = { ...session, ...(key === 'session' ? { sessionRef: 'changed' } : key === 'user' ? { user: { id: 'changed' } } : key === 'role' ? { currentRole: { id: 'changed' } } : { roleVersion: 'changed' }) } as SessionSnapshot } }
}
it('reads exact source-backed parts tree between fresh current-node reads without changing codes', async () => {
  const h = harness(); const result = await h.reader(h.detail, 'node')
  expect(result?.state).toBe('succeeded'); expect(result?.data?.items[0]?.children?.[0]?.value).toBe('0101')
  expect(h.execute).toHaveBeenCalledTimes(3); expect(h.read.listWorkOrders).not.toHaveBeenCalled()
})
it('rebuilds cold authorization only through the normal role-scoped list', async () => {
  const h = harness(); h.unlist(); expect((await h.reader(h.detail, 'node'))?.state).toBe('succeeded')
  expect(h.read.listWorkOrders).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
})
it.each([{ PROD: true }, { DEV: false }, { VITE_XLINK_ENVIRONMENT: 'production' }, { VITE_XLINK_MOCK: 'true' }, { VITE_XLINK_AUTH_TENANT: '' }, { VITE_XLINK_ENABLE_REAL_WRITES: 'true' }, { VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true' }, { VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS: 'true' }, { VITE_XLINK_H5_MOCK_E2E: 'true' }, { VITE_XLINK_AUTH_API_BASE_URL: 'https://other' }])('does not own unsafe environment %j', async override => {
  const h = harness(override); expect(await h.reader(h.detail, 'node')).toBeNull(); expect(h.execute).not.toHaveBeenCalled(); expect(h.read.listWorkOrders).not.toHaveBeenCalled()
})
it('makes no request off exact loopback origin', async () => { const h = harness({}, 'https://example.com'); expect(await h.reader(h.detail, 'node')).toBeNull(); expect(h.execute).not.toHaveBeenCalled() })
it.each(['serviceType', 'sourceType'])('does not own other %s context', async key => { const h = harness(); (h.detail.quotationCatalogContext as unknown as Record<string, unknown>)[key] = 'other'; expect(await h.reader(h.detail, 'node')).toBeNull(); expect(h.execute).not.toHaveBeenCalled() })
it.each(['session', 'user', 'role', 'version'])('rejects changed %s across await', async key => { const h = harness(); h.hook(() => h.change(key)); expect((await h.reader(h.detail, 'node'))?.state).toBe('failed_terminal'); expect(h.execute).toHaveBeenCalledTimes(1) })
it.each(['tenant', 'run', 'node', 'handler', 'state', 'source', 'service', 'duplicate'])('rejects raw %s mismatch without provider read', async kind => {
  const h = harness()
  if (kind === 'tenant') h.raw.data.serviceAppointment.tenantId = 'other'
  if (kind === 'run') h.raw.data.workflow.formDataId = 'other'
  if (kind === 'node') h.node.workflowFormDataId = 'other'
  if (kind === 'handler') h.node.handlerIds = ['other']
  if (kind === 'state') h.node.state = 1
  if (kind === 'source') h.raw.data.serviceAppointment.exts.sourceType = 'other'
  if (kind === 'service') h.raw.data.serviceAppointment.serviceType = '12'
  if (kind === 'duplicate') h.raw.data.workflowNode.push(h.node)
  expect((await h.reader(h.detail, 'node'))?.state).toBe('failed_terminal'); expect(h.execute).toHaveBeenCalledTimes(1)
})
it.each([[], [{ type: 'repairParts', children: [] }], [{ type: 'parts', children: [] }], [{ type: 'parts', children: [{ value: 'x', name: 'X', children: 'bad' }] }], [{ type: 'parts', children: [{ value: 'x', name: 'X' }, { value: 'x', name: 'X' }] }]].map(provider => ({ provider })))('never falls back for malformed/wrong owned provider %j', async ({ provider }) => {
  const h = harness(); h.provider(provider)
  const result = await readQuotationRepairParts(h.read as unknown as TechnicianApiReadPort, h.detail, 'node', h.reader)
  expect(result.source).toBe('local'); expect(result.result.state).toBe('failed_terminal'); expect(h.read.getCascadeCodeOptions).not.toHaveBeenCalled()
})
it('rejects revocation during provider and changed fresh-node state', async () => {
  for (const revoke of [true, false]) { const h = harness(); h.hook(path => { if (path.includes('selectMultistage')) { if (revoke) h.unlist(); else h.node.state = 1 } }); expect((await h.reader(h.detail, 'node'))?.state).toBe('failed_terminal') }
})
it.each(['missing', 'total', 'page', 'session'])('rejects cold list %s without detail or provider request', async kind => {
  const h = harness(); h.unlist()
  if (kind === 'missing') h.page.items = [{ id: 'other' }]
  if (kind === 'total') h.page.totalCount = 201
  if (kind === 'page') h.page.page = 2
  if (kind === 'session') h.hook(() => h.change('session'))
  expect((await h.reader(h.detail, 'node'))?.state).toBe('failed_terminal'); expect(h.execute).not.toHaveBeenCalled()
})
const runScope = { tenantId: 'tenant', userId: 'user', roleId: 'role', workOrderId: 'work', workflowRunId: 'run', runtimeNodeId: 'node', workflowDefinitionId: 'definition' }
const fencedEnv = (scope = runScope) => ({ VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_NORMAL_QUOTATION_RUN: 'create-once', VITE_XLINK_NORMAL_QUOTATION_SCOPE: JSON.stringify({ version: 1, scope, expiresAt: new Date(Date.now() + 60000).toISOString() }) })
it('retains parts contract under a separate exact externally fenced quotation run', async () => {
 const h = harness(fencedEnv()); Object.assign(h.raw.data.workflow, { defId: 'definition' })
 expect((await h.reader(h.detail, 'node'))?.state).toBe('succeeded'); expect(h.execute).toHaveBeenCalledTimes(3)
})
it.each(['userId','roleId','workOrderId','runtimeNodeId','workflowRunId','workflowDefinitionId'])('fenced reader rejects mismatched %s before dictionary', async key => {
 const h = harness(fencedEnv({ ...runScope, [key]: 'other' })); Object.assign(h.raw.data.workflow, { defId: 'definition' })
 expect((await h.reader(h.detail, 'node'))?.state).toBe('failed_terminal')
 expect(h.execute.mock.calls.every(call => !call[0].path.includes('selectMultistage'))).toBe(true)
})
