import { expect, it, vi } from 'vitest'
import { createNormalQuotationUnitDisplay } from '@app/r1-quotation-unit-display'
import { workflowNode } from '@adapters/api/read-models/workflow'
import type { SessionSnapshot, WorkOrderDetail } from '@shared/ports'
import { companyUnitLabels } from '@features/work-orders/quotation/company-unit-labels'

const origin = 'http://127.0.0.1:5189'
const env = { DEV: true, VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_MOCK: 'false', VITE_XLINK_API_BASE_URL: `${origin}/xlink/wm`, VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false', VITE_XLINK_AUTH_TENANT: 'tenant' }
const dictionary = [{ codeId: 'company', eleid: 'company', options: { 'test-u': '测试单位' } }]
function harness(overrides: Record<string, unknown> = {}, uiOrigin = origin) {
  let session = { sessionRef: 'session', user: { id: 'user' }, currentRole: { id: 'role' } } as unknown as SessionSnapshot | null
  let listed = true
  const node = { _id: 'node', tenantId: 'tenant', workflowId: 'run', workflowFormDataId: 'work', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: ['role'], nodeDef: { nodeType: 'placeOrder' } }
  const raw = { success: true, status: 1, data: { serviceAppointment: { _version: 1, _id: 'work', tenantId: 'tenant', state: 1, workflowId: 'run', serviceType: '11', exts: { sourceType: '4' } }, workflow: { _id: 'run', defId: 'definition', tenantId: 'tenant', formDataId: 'work', state: 0 }, workflowNode: [node] } }
  const detail = { id: 'work', quotationCatalogContext: { workOrderId: 'work', serviceType: '11', sourceType: '4' }, workflowNodes: [workflowNode(node)] } as unknown as WorkOrderDetail
  let provider: unknown = dictionary
  let hook: ((path: string) => Promise<void> | void) | undefined
  const execute = vi.fn(async (r: { path: string; body?: Readonly<Record<string, unknown>> }) => {
    await hook?.(r.path)
    if (r.path === 'i/code/selectCode.do') {
      expect(r.body).toEqual({ jsonPara: '[{"codeId":"company","eleid":"company"}]', tenantId: 'tenant' })
      return structuredClone(provider)
    }
    if (r.path === 'i/code/selectMultistageCode.do') return [{ type: 'parts', children: [{ value: 'part', name: '测试部位' }] }]
    expect(r.path).toBe('basic/serviceAppointment/queryById/work')
    return structuredClone(raw)
  })
  const read = { isWorkOrderListedForCurrentSession: () => listed, listWorkOrders: vi.fn(), getWorkOrderDetail: vi.fn(async () => ({ state: 'succeeded' as const, data: detail })) }
  const inputEnv: Record<string, unknown> = { ...env, ...overrides }
  const display = createNormalQuotationUnitDisplay({ auth: { getCurrentSession: () => session }, read, env: inputEnv, origin: uiOrigin, transport: { execute } })
  return { display, read, execute, raw, node, detail, env: inputEnv,
    provider: (value: unknown) => { provider = value }, hook: (fn: typeof hook) => { hook = fn },
    unlist: () => { listed = false }, logout: () => { session = null },
    changeRole: () => { session = { ...session!, currentRole: { id: 'other' } } as SessionSnapshot } }
}
it('loads exact company labels between actual parts context checks, preserving raw codes and singleflight', async () => {
  const h = harness(), item = Object.freeze({ unit: 'test-u', materialUnit: 'test-u', specUnit: 'unknown' })
  const before = JSON.stringify(item)
  const a = h.display.load('work'), b = h.display.load('work')
  expect(a).toBe(b); expect(await a).toBe(true)
  expect(h.execute.mock.calls.map(([r]) => r.path)).toEqual([
    'basic/serviceAppointment/queryById/work', 'i/code/selectMultistageCode.do', 'basic/serviceAppointment/queryById/work',
    'i/code/selectCode.do', 'basic/serviceAppointment/queryById/work', 'i/code/selectMultistageCode.do', 'basic/serviceAppointment/queryById/work',
  ])
  expect(h.display.isVerifiedScope('work')).toBe(true)
  expect(h.display.displayLabel('work', item.unit)).toBe('测试单位')
  expect(h.display.displayLabel('work', item.specUnit)).toBe('未核对')
  expect(JSON.stringify(item)).toBe(before)
})
it('supports only one source JSON text layer', async () => {
  const h = harness(); h.provider(JSON.stringify(dictionary)); expect(await h.display.load('work')).toBe(true)
  h.provider(JSON.stringify(JSON.stringify(dictionary))); expect(await h.display.load('work')).toBe(false)
})
it.each([null, [], [{ codeId: 'other', eleid: 'company', options: { x: 'X' } }], { data: dictionary }, [{ codeId: 'company', eleid: 'company', options: {} }]])('fails closed on unknown company provider %j', async provider => {
  const h = harness(); h.provider(provider); expect(await h.display.load('work')).toBe(false)
  expect(h.display.displayLabel('work', 'test-u')).toBe('未核对')
})
it.each(['tenant', 'role', 'node', 'list', 'source'])('rejects invalid %s proof before company request', async kind => {
  const h = harness()
  if (kind === 'tenant') h.raw.data.serviceAppointment.tenantId = 'foreign'
  if (kind === 'role') h.changeRole()
  if (kind === 'node') h.node.state = 10
  if (kind === 'list') h.unlist()
  if (kind === 'source') h.raw.data.serviceAppointment.exts.sourceType = 'other'
  expect(await h.display.load('work')).toBe(false)
  expect(h.execute.mock.calls.some(([r]) => r.path === 'i/code/selectCode.do')).toBe(false)
})
it.each(['http://localhost:5189', 'https://example.com', 'http://127.0.0.1:5190'])('makes no reads on %s', async location => {
  const h = harness({}, location); expect(await h.display.load('work')).toBe(false)
  expect(h.read.getWorkOrderDetail).not.toHaveBeenCalled(); expect(h.execute).not.toHaveBeenCalled()
  expect(h.display.displayLabel('work', 'original unit')).toBe('original unit')
})
it.each([{ DEV: false }, { PROD: true }, { VITE_XLINK_ENVIRONMENT: 'prod' },
  { VITE_XLINK_MOCK: 'true' }, { VITE_XLINK_R1_NODE_FORM_READ: 'false' }])(
  'a composed disabled provider preserves existing unit display without reads: %j', async overrides => {
    const h = harness(overrides)
    expect(await h.display.load('work')).toBe(false)
    expect(h.display.isVerifiedScope('work')).toBe(false)
    expect(h.display.displayLabel('work', '平米')).toBe('平米')
    expect(h.display.displayLabel('work', '2')).toBe('2')
    expect(h.display.displayLabel('work', undefined)).toBe('')
    expect(h.read.getWorkOrderDetail).not.toHaveBeenCalled(); expect(h.execute).not.toHaveBeenCalled()
  },
)
it('disabling an already verified provider drops labels and restores raw display', async () => {
  const h = harness(); expect(await h.display.load('work')).toBe(true)
  h.env.VITE_XLINK_R1_NODE_FORM_READ = 'false'
  expect(h.display.displayLabel('work', 'test-u')).toBe('test-u')
  h.env.VITE_XLINK_R1_NODE_FORM_READ = 'true'
  expect(h.display.displayLabel('work', 'test-u')).toBe('未核对')
  expect(h.display.isVerifiedScope('work')).toBe(false)
})
it('parses only bounded nonempty company labels without mutating raw codes or provider input', () => {
  const raw = [{ codeId: 'company', eleid: 'company', options: { '2': ' 平米 ', '5': '桶' } }]
  const before = JSON.stringify(raw)
  expect([...companyUnitLabels(raw)!]).toEqual([['2', '平米'], ['5', '桶']])
  expect(JSON.stringify(raw)).toBe(before)
  for (const options of [[], {}, { '': 'X' }, { x: '' }, { x: 0 }, { x: null },
    Object.fromEntries(Array.from({ length: 501 }, (_, n) => [String(n), 'X']))]) {
    expect(companyUnitLabels([{ codeId: 'company', eleid: 'company', options }])).toBeNull()
  }
  expect(companyUnitLabels([{ codeId: 'company', eleid: 'other', options: { x: 'X' } }])).toBeNull()
})
it('requires nonexpired exact external scope for write-enabled run', async () => {
  const scope = { version: 1, scope: { tenantId: 'tenant', userId: 'user', roleId: 'role', workOrderId: 'work', runtimeNodeId: 'node', workflowRunId: 'run', workflowDefinitionId: 'definition' }, expiresAt: '2099-01-01T00:00:00.000Z' }
  const h = harness({ VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_NORMAL_QUOTATION_RUN: 'create-once', VITE_XLINK_NORMAL_QUOTATION_SCOPE: JSON.stringify(scope) })
  expect(await h.display.load('work')).toBe(true)
  h.env.VITE_XLINK_NORMAL_QUOTATION_SCOPE = JSON.stringify({ ...scope, expiresAt: '2000-01-01T00:00:00.000Z' })
  expect(h.display.isVerifiedScope('work')).toBe(false); expect(await h.display.load('work')).toBe(false)
})
it.each(['logout', 'role', 'list', 'node'])('rejects %s revocation during company response', async kind => {
  const h = harness()
  h.hook(path => { if (path === 'i/code/selectCode.do') {
    if (kind === 'logout') h.logout(); else if (kind === 'role') h.changeRole(); else if (kind === 'list') h.unlist(); else h.node.state = 10
  } })
  expect(await h.display.load('work')).toBe(false); expect(h.display.isVerifiedScope('work')).toBe(false)
})
it('cancels stale work without publishing labels or issuing further requests', async () => {
  const h = harness(); let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let started!: () => void; const waiting = new Promise<void>(resolve => { started = resolve })
  h.hook(async path => { if (path === 'i/code/selectCode.do') { started(); await gate } })
  const loading = h.display.load('work'); await waiting
  h.logout(); expect(await h.display.load('work')).toBe(false)
  const count = h.execute.mock.calls.length; release()
  expect(await loading).toBe(false); expect(h.execute).toHaveBeenCalledTimes(count)
  expect(h.display.displayLabel('work', 'test-u')).toBe('未核对')
})
it('drops published labels immediately when current role or list proof changes', async () => {
  for (const change of ['role', 'list', 'logout']) {
    const h = harness(); expect(await h.display.load('work')).toBe(true)
    if (change === 'role') h.changeRole(); else if (change === 'list') h.unlist(); else h.logout()
    expect(h.display.displayLabel('work', 'test-u')).toBe('未核对'); expect(h.display.isVerifiedScope('work')).toBe(false)
  }
})

it('rejects context changes across company even if the node remains visible', async () => {
  const h = harness(); h.hook(path => { if (path === 'i/code/selectCode.do') h.node.handlerIds.push('user') })
  expect(await h.display.load('work')).toBe(false)
  expect(h.display.displayLabel('work', 'test-u')).toBe('未核对')
})

it('accepts real R1 read-time SA._version increments without weakening authority checks', async () => {
  const h = harness()
  h.hook(path => { if (path.startsWith('basic/serviceAppointment/queryById/')) h.raw.data.serviceAppointment._version++ })
  expect(await h.display.load('work')).toBe(true)
  expect(h.raw.data.serviceAppointment._version).toBe(5)
  expect(h.display.displayLabel('work', 'test-u')).toBe('测试单位')
})
it.each(['state', 'handler', 'definition'])('rejects changed actual node %s across company read', async field => {
  const h = harness()
  h.hook(path => { if (path === 'i/code/selectCode.do') {
    if (field === 'state') h.node.state = 10
    else if (field === 'handler') h.node.handlerIds = ['foreign']
    else h.raw.data.workflow.defId = 'changed-definition'
  } })
  expect(await h.display.load('work')).toBe(false)
  expect(h.display.isVerifiedScope('work')).toBe(false)
})
