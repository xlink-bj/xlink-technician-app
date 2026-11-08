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
  let provider: unknown = [{ codeId: 'OPTIONS', eleid: 'OPTIONS', options: { yes: 'Yes' } }]
  let cascade: unknown = [{ type: 'OPTIONS', children: [{ value: 'yes', name: 'Cascade yes', children: [] }] }]
  let hook: ((path: string) => void | Promise<void>) | undefined
  const execute = vi.fn(async (request: { path: string; body?: Readonly<Record<string, unknown>> }) => {
    calls.push(request.path); await hook?.(request.path)
    if (request.path.startsWith('basic/serviceAppointment/')) { expect(request.body).toEqual({}); return structuredClone(detail) }
    if (request.path === 'biz/ext/queryById.do') return structuredClone(ext)
    if (request.path === 'biz/extField/query') return structuredClone(fieldPage)
    if (request.path === 'i/code/selectCode.do') return structuredClone(provider)
    if (request.path === 'i/code/selectMultistageCode.do') return structuredClone(cascade)
    if (request.path === 'biz/extForm/query/ext') return { data: [structuredClone(record)], total: 1, page: 1, size: request.body?.rows, dataCount: 1 }
    throw Error('Unexpected request')
  })
  const read = {
    listWorkOrders: vi.fn(async () => { calls.push('role-list'); listed = list.items.some(x => x.id === 'work'); return { state: 'succeeded', data: list } as never }),
    isWorkOrderListedForCurrentSession: () => listed,
    getDynamicCodeOptions: vi.fn(async () => { throw Error('Lossy provider port must not be used') }),
  }
  const reader = createNormalNodeFormsReader({ auth: { getCurrentSession: () => session }, read, tenantId: 'tenant', env: { ...env, ...envOverride }, origin, transport: { execute } })
  return { reader, execute, read, calls, detail, node, ext, field, fieldPage, list, record, provider: (raw: unknown) => { provider = raw }, cascade: (raw: unknown) => { cascade = raw }, unlist: () => { listed = false }, hook: (fn: (path: string) => void | Promise<void>) => { hook = fn }, changeSession: () => { session = { ...session, sessionRef: 'changed' as never } }, changeRole: () => { session = { ...session, currentRole: { ...session.currentRole!, id: 'other' as never } } } }
}
describe('normal form read gate', () => {
  it('requires explicit local read enablement', () => { expect(normalNodeFormsReadEnabled({}, origin)).toBe(false); expect(normalNodeFormsReadEnabled(env, origin)).toBe(true) })
  it.each([{ VITE_XLINK_ENVIRONMENT: 'production' }, { VITE_XLINK_MOCK: 'true' }, { DEV: false }, { VITE_XLINK_ENABLE_REAL_WRITES: 'true' }, { VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true' }, { VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS: 'true' }])('denies unsafe mode %j', override => expect(normalNodeFormsReadEnabled({ ...env, ...override }, origin)).toBe(false))
  it('rejects non-loopback origin', () => expect(normalNodeFormsReadEnabled(env, 'https://example.com')).toBe(false))
})
it('cold page traverses role list, raw detail, schema/provider, discovery, exact read and second detail', async () => {
  const h = harness(); const snapshot = await h.reader.load('work', 'node')
  expect(snapshot.records[0]?.values?.answer).toBe('yes'); expect(h.reader.isCurrent(snapshot)).toBe(true)
  expect(snapshot.definition.fields?.[0]?.options).toEqual([{ value: 'yes', label: 'Yes' }])
  expect(h.read.getDynamicCodeOptions).not.toHaveBeenCalled()
  expect(h.calls).toEqual(['role-list', 'basic/serviceAppointment/queryById/work', 'biz/ext/queryById.do', 'biz/extField/query', 'i/code/selectCode.do', 'biz/extForm/query/ext', 'biz/extForm/query/ext', 'basic/serviceAppointment/queryById/work'])
  expect(h.execute.mock.calls[5]?.[0].body?.['is:_id|string#and']).toBe('record')
})

it.each(['session', 'role', 'clear', 'unlist'])('rejects %s changes specifically while a provider response is pending', async kind => {
  const h = harness()
  h.hook(async path => {
    if (path !== 'i/code/selectCode.do') return
    await Promise.resolve()
    if (kind === 'session') h.changeSession()
    else if (kind === 'role') h.changeRole()
    else if (kind === 'clear') h.reader.clear()
    else h.unlist()
  })
  await expect(h.reader.load('work', 'node')).rejects.toThrow()
  expect(h.calls.at(-1)).toBe('i/code/selectCode.do')
  expect(h.calls.some(path => path.startsWith('biz/extForm/'))).toBe(false)
})

it('hydrates Code and Cascade independently even with identical provider IDs, and reloads without a cache', async () => {
  const h = harness()
  h.fieldPage.data.push({ ...h.field, _id: 'field-tree', name: 'tree', type: 'cascade' })
  h.fieldPage.total = 2
  const first = await h.reader.load('work', 'node')
  expect(first.definition.fields?.[0]?.options).toEqual([{ value: 'yes', label: 'Yes' }])
  expect(first.definition.fields?.[1]?.options).toEqual([{ value: 'yes', label: 'Cascade yes', children: [] }])
  expect(h.execute).toHaveBeenCalledWith({ method: 'POST', path: 'i/code/selectCode.do', body: {
    jsonPara: '[{"codeId":"OPTIONS","eleid":"OPTIONS"}]', tenantId: 'tenant',
  } })
  expect(h.execute).toHaveBeenCalledWith({ method: 'POST', path: 'i/code/selectMultistageCode.do', body: { types: 'OPTIONS', tenantId: 'tenant' } })
  h.provider([{ codeId: 'OPTIONS', eleid: 'OPTIONS', options: {} }])
  h.cascade([{ type: 'OPTIONS', children: [] }])
  const second = await h.reader.load('work', 'node')
  expect(second.definition.fields?.map(f => f.options)).toEqual([[], []])
  expect(first.definition.fields?.[0]?.options).toEqual([{ value: 'yes', label: 'Yes' }])
  expect(h.calls.filter(path => path.startsWith('i/code/'))).toHaveLength(4)
})

it.each([
  { valueOption: 42 }, { valueOption: 'java:example.Codes' }, { valueOption: 'one,two' },
  { name: ' answer' }, { type: 'select ' }, { type: 'bizSelect' }, { tenantId: 'foreign' },
  { id: 'foreign' }, { fieldType: 'cascade' }, { key: 'other' },
])('rejects invalid second field %j before requesting either provider', async metadata => {
  const h = harness()
  h.fieldPage.data.push({ ...h.field, _id: 'second-field', name: 'second', ...metadata } as typeof h.field)
  h.fieldPage.total = 2
  await expect(h.reader.load('work', 'node')).rejects.toThrow()
  expect(h.calls.some(path => path.startsWith('i/code/'))).toBe(false)
})

it('hydrates conditionally hidden Cascade fields and retains unknown record values unchanged', async () => {
  const h = harness()
  Object.assign(h.field, { type: 'cascade', showList: ['4'], frontEndConfig: '{"showField":"other","showValue":"missing"}' })
  h.record.exts.answer = 'not-in-provider'
  const snapshot = await h.reader.load('work', 'node')
  expect(snapshot.definition.fields?.[0]?.options).toEqual([{ value: 'yes', label: 'Cascade yes', children: [] }])
  expect(snapshot.records[0]?.values?.answer).toBe('not-in-provider')
  expect(h.calls.filter(path => path === 'i/code/selectMultistageCode.do')).toHaveLength(1)
})

it('keeps missing runtime permission evidence missing and performs only the bounded read routes', async () => {
  const h = harness()
  const snapshot = await h.reader.load('work', 'node')
  expect(snapshot.fillableFieldIds).toBeUndefined()
  expect(snapshot.node.formFieldIdsReadOnly).toBeUndefined()
  const allowed = new Set(['basic/serviceAppointment/queryById/work', 'biz/ext/queryById.do',
    'biz/extField/query', 'i/code/selectCode.do', 'biz/extForm/query/ext'])
  expect(h.execute.mock.calls.every(([request]) => allowed.has(request.path))).toBe(true)
})
it.each([{ showList: ['1', '2', '5'] }, { showList: [] }, { frontEndConfig: '{"mpDetailHide":true}' }])('does not request statically excluded provider %j', async metadata => {
  const h = harness(); Object.assign(h.field, metadata)
  h.provider(null)
  expect((await h.reader.load('work', 'node')).records).toHaveLength(1)
  expect(h.read.getDynamicCodeOptions).not.toHaveBeenCalled()
  expect(h.calls.some(path => path.startsWith('i/code/'))).toBe(false)
})
it('does not skip a conditional provider or treat failure as verified empty options', async () => {
  const h = harness(); Object.assign(h.field, { showList: ['4'], frontEndConfig: '{"showField":"other","showValue":"missing"}' })
  h.provider(null)
  await expect(h.reader.load('work', 'node')).rejects.toThrow()
  expect(h.calls.filter(path => path === 'i/code/selectCode.do')).toHaveLength(1)
  expect(h.read.getDynamicCodeOptions).not.toHaveBeenCalled()
  expect(h.calls.some(path => path.startsWith('biz/extForm/'))).toBe(false)
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

describe('ordinary forms full EXTS read consistency', () => {
  function formsHarness() {
    const h = harness()
    h.node.nodeDef.nodeType = 'forms'
    const exts = { formList: [{ _id: 'record', formDefId: 'ext', state: 1 }],
      serverOnly: { revision: 'original', nested: [1, { retain: true }] } }
    Object.assign(h.node, { exts })
    return { ...h, exts }
  }
  it('retains read-only forms discovery when complete EXTS remains unchanged', async () => {
    const h = formsHarness(), before = structuredClone(h.exts)
    const snapshot = await h.reader.load('work', 'node')
    expect(snapshot.records[0]?.id).toBe('record')
    const transient = h.reader.currentFormsExts!(snapshot)!
    expect(transient).toEqual(before)
    ;(transient.serverOnly as Record<string, unknown>).revision = 'caller-mutated-copy'
    expect(h.reader.currentFormsExts!(snapshot)).toEqual(before)
    expect(h.reader.currentFormsExts!({ ...snapshot })).toBeNull()
    expect(h.exts).toEqual(before)
    expect(h.calls.some(path => path.includes('upsert') || path.includes('updateExts') || path === 'workflow/process')).toBe(false)
    h.reader.clear()
    expect(h.reader.currentFormsExts!(snapshot)).toBeNull()
  })
  it.each(['unknown', 'nested', 'rowMetadata'])('rejects %s EXTS drift hidden by the display projection', async kind => {
    const h = formsHarness()
    h.hook(path => {
      if (path !== 'biz/extForm/query/ext') return
      if (kind === 'unknown') h.exts.serverOnly.revision = 'changed'
      if (kind === 'nested') h.exts.serverOnly.nested.push(2)
      if (kind === 'rowMetadata') Object.assign(h.exts.formList[0]!, { unknownSourceMetadata: 'changed' })
    })
    await expect(h.reader.load('work', 'node')).rejects.toThrow()
  })
  it.each([undefined, Number.NaN, new Date('2026-01-01'), () => 'omitted'])('rejects non-JSON EXTS instead of silently losing evidence %#', async value => {
    const h = formsHarness()
    Object.assign(h.exts.serverOnly, { unsupported: value })
    await expect(h.reader.load('work', 'node')).rejects.toThrow()
    expect(h.calls.some(path => path.startsWith('biz/extForm/'))).toBe(false)
  })
})

describe('Survey attachments in the normal readonly reader', () => {
  function mediaHarness() {
    const h = harness()
    Object.assign(h.field, { name: 'images1', type: 'file', preset: 0, valueOption: '', showList: ['4'], multiple: false })
    Object.assign(h.record.exts, { images1: [{ url: 'https://media.example.test/photo?token=PRIVATE', name: 'object-key', extname: 'jpg' }] })
    return h
  }
  it('uses independently proven Ext and schema, discovers and exactly rereads media, with no provider/mutation request', async () => {
    const h = mediaHarness(), snapshot = await h.reader.load('work', 'node')
    expect(snapshot.records[0]?.values?.images1).toEqual([{ url: 'https://media.example.test/photo?token=PRIVATE', objectKey: 'object-key', extension: 'jpg' }])
    expect(h.calls.filter(path => path.startsWith('biz/extForm/'))).toHaveLength(2)
    expect(h.calls.some(path => /code|upload|upsert|process/.test(path))).toBe(false)
  })
  it.each(['ext', 'purpose', 'key', 'type', 'provider', 'shape', 'identity'])('keeps unverified %s media closed', async mismatch => {
    const h = mediaHarness()
    if (mismatch === 'ext') h.ext.colName = 'other'
    if (mismatch === 'purpose') h.field.colName = 'other'
    if (mismatch === 'key') h.field.name = 'unknownFile'
    if (mismatch === 'type') h.field.type = 'data'
    if (mismatch === 'provider') h.field.valueOption = 'UNKNOWN_PROVIDER'
    if (mismatch === 'shape') Object.assign(h.record.exts, { images1: [{ url: 'javascript:alert(1)' }] })
    if (mismatch === 'identity') h.record.nodeId = 'foreign'
    if (['purpose', 'key', 'type'].includes(mismatch)) {
      const snapshot = await h.reader.load('work', 'node'); expect(snapshot.records[0]?.values?.images1).toBeUndefined()
    } else await expect(h.reader.load('work', 'node')).rejects.toThrow()
  })
  it.each(['session', 'role', 'clear', 'unlist'])('rejects media when %s changes across record await', async kind => {
    const h = mediaHarness()
    h.hook(async path => { if (!path.startsWith('biz/extForm/')) return; await Promise.resolve()
      if (kind === 'session') h.changeSession(); else if (kind === 'role') h.changeRole(); else if (kind === 'clear') h.reader.clear(); else h.unlist()
    })
    await expect(h.reader.load('work', 'node')).rejects.toThrow()
  })
})

it.each([false, true, null])('does not choose one of two root/EXTS Survey media copies (equal=%s)', async equal => {
  const h = harness()
  Object.assign(h.field, { name: 'images1', type: 'file', preset: 0, valueOption: '', showList: ['4'] })
  const images1 = [{ url: 'https://media.example.test/photo', name: 'key', extname: 'jpg' }]
  Object.assign(h.record, { images1 }); Object.assign(h.record.exts, { images1: equal === null ? null : equal ? images1 : [] })
  await expect(h.reader.load('work', 'node')).rejects.toThrow(/unverified/)
})

it('does not attach the readonly media decoder to an authorized scoped-write snapshot', async () => {
  const grant = { version: 1, scope: { tenantId: 'tenant', userId: 'user', roleId: 'role', workOrderId: 'work',
    workflowRunId: 'workflow', runtimeNodeId: 'node', formDefinitionId: 'ext' }, expiresAt: '2099-01-01T00:00:00Z', fieldIds: ['field'], operations: ['create','complete'] }
  const h = harness({ VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true',
    VITE_XLINK_R1_REPEAT_ACTIONS: 'true', VITE_XLINK_AUTH_TENANT: 'tenant', VITE_XLINK_R1_REPEAT_GRANT: JSON.stringify(grant) })
  Object.assign(h.field, { name: 'images1', type: 'file', preset: 0, valueOption: '' })
  Object.assign(h.record.exts, { images1: [{ url: 'https://media.example.test/photo', name: 'key', extname: 'jpg' }] })
  const snapshot = await h.reader.load('work', 'node')
  expect(snapshot.records[0]?.values?.images1).toBeUndefined()
  expect(h.calls.some(path => /upsert|upload|process/.test(path))).toBe(false)
})

it.each(['wrong-slot-empty', 'missing-preset-empty', 'wrong-preset-empty'])('rejects %s before a normal Survey attachment can look absent', async kind => {
  const h = harness()
  Object.assign(h.field, { name: 'images1', type: 'file', valueOption: '', preset: 0 })
  if (kind === 'wrong-slot-empty') Object.assign(h.record, { images1: [] })
  else {
    Object.assign(h.record.exts, { images1: [] })
    Object.assign(h.field, { preset: kind === 'missing-preset-empty' ? undefined : 1 })
  }
  await expect(h.reader.load('work', 'node')).rejects.toThrow(/unverified/)
})
