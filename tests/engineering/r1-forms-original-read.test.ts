import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import type { SessionSnapshot } from '@shared/ports'
import type { ApiReadRequest } from '@adapters/api/technician-api'

type Row = Record<string, unknown>
const origin = 'http://127.0.0.1:5189'
let httpIntents = 0
beforeEach(() => {
  httpIntents = 0
  const blocked = () => { httpIntents++; throw Error('Real HTTP forbidden by synthetic reader test') }
  vi.stubGlobal('fetch', blocked); vi.stubGlobal('uni', { request: blocked })
})
afterEach(() => { expect(httpIntents).toBe(0); vi.unstubAllGlobals() })

function fixture() {
  let session = { sessionRef: 'synthetic-session', user: { id: 'user' }, currentRole: { id: 'role' } } as unknown as SessionSnapshot
  let listed = false
  const nodeDef: Row = { nodeType: 'forms', formDefId: 'ext', formFieldIdsFill: ['answer-field'], formFieldIdsReadOnly: ['readonly-field'] }
  const node: Row = { _id: 'node', tenantId: 'tenant', workflowId: 'workflow', workflowFormDataId: 'work',
    workflowFormColName: 'serviceAppointment', state: 0, handlerIds: ['role'], nodeDef,
    exts: { formList: [{ _id: 'record', formDefId: 'ext', state: 1 }, { _id: 'deleted', formDefId: 'ext', state: -1 }], unknown: { keep: true } } }
  const workOrder: Row = { _id: 'work', tenantId: 'tenant', state: 1, workflowId: 'workflow' }
  const workflow: Row = { _id: 'workflow', tenantId: 'tenant', formDataId: 'work', state: 0 }
  const detail = { success: true, status: 1, data: { serviceAppointment: workOrder, workflow, workflowNode: [node] } }
  const record: Row = { _id: 'record', tenantId: 'tenant', sid: 'work', smodule: 'serviceAppointment',
    nodeId: 'node', workflowId: 'workflow', formDefId: 'ext', state: 1,
    answer: 'top answer', readonlyValue: 'readonly top', hiddenUnknown: { retained: [false, { number: 0 }] },
    exts: { answer: 'exact answer', readonlyValue: 'readonly projected', hiddenUnknown: { retained: ['nested'] } },
    auditMetadata: { actor: 'synthetic creator', version: 4 } }
  const fields = [
    { _id: 'answer-field', tenantId: 'tenant', extId: 'ext', state: 1, name: 'answer', nameDisp: 'Answer', type: 'text', required: true },
    { _id: 'readonly-field', tenantId: 'tenant', extId: 'ext', state: 1, name: 'readonlyValue', nameDisp: 'Readonly', type: 'text', required: false },
  ]
  const requests: ApiReadRequest[] = []
  let hook: ((request: ApiReadRequest) => void | Promise<void>) | undefined
  const execute = vi.fn(async (request: ApiReadRequest): Promise<unknown> => {
    requests.push(request); await hook?.(request)
    if (request.path === 'basic/serviceAppointment/queryById/work') {
      expect(request.method).toBe('POST'); expect(request.body).toEqual({})
      return structuredClone(detail)
    }
    if (request.path === 'biz/ext/queryById.do') return { _id: 'ext', tenantId: 'tenant', state: 1, type: '0', colName: 'syntheticForms' }
    if (request.path === 'biz/extField/query') return { data: structuredClone(fields), total: 2, page: 1, size: 50 }
    if (request.path === 'biz/extForm/query/ext') {
      expect(request.body?.['is:_id|string#and']).toBe('record')
      return { data: [structuredClone(record)], total: 1, page: 1, size: request.body?.rows, dataCount: 1 }
    }
    throw Error('Unrecognized synthetic read; HTTP fallback forbidden')
  })
  const reader = createNormalNodeFormsReader({ auth: { getCurrentSession: () => session }, tenantId: 'tenant',
    env: { DEV: true, VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_MOCK: 'false',
      VITE_XLINK_API_BASE_URL: `${origin}/xlink/wm`, VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false' }, origin,
    read: { listWorkOrders: vi.fn(async () => { listed = true; return { state: 'succeeded', data: {
      items: [{ id: 'work' }], totalCount: 1, page: 1, pageSize: 20 } } as never }),
    isWorkOrderListedForCurrentSession: () => listed,
    getDynamicCodeOptions: vi.fn(async () => { throw Error('No lossy option-reader fallback') }) }, transport: { execute } })
  return { reader, requests, execute, node, nodeDef, workOrder, workflow, detail, record,
    load: () => reader.load('work', 'node'), complete: () => { node.state = 10 },
    hook: (value: typeof hook) => { hook = value }, unlist: () => { listed = false },
    change: (kind: 'user' | 'role' | 'session') => {
      session = kind === 'user' ? { ...session, user: { ...session.user, id: 'other-user' as never } }
        : kind === 'role' ? { ...session, currentRole: { ...session.currentRole!, id: 'other-role' as never } }
          : { ...session, sessionRef: 'other-session' as never }
    } }
}

describe('normal forms full original exact-read provenance', () => {
  it('retains unknown/readonly/exts/audit values from exact select and issues no original for deleted or unknown IDs', async () => {
    const h = fixture(), snapshot = await h.load()
    expect(snapshot.records[0]?.values?.answer).toBe('exact answer')
    expect(h.reader.currentFormOriginal!(snapshot, 'record')).toEqual(h.record)
    expect(h.requests.filter(r => r.path === 'biz/extForm/query/ext')).toHaveLength(2)
    expect(h.reader.currentFormOriginal!(snapshot, 'deleted')).toBeNull()
    expect(h.reader.currentFormOriginal!(snapshot, 'ACK-only-id')).toBeNull()
    expect(snapshot.records[0]).not.toHaveProperty('appointmentReplacement')
  })
  it('returns detached deep clones and cannot mutate the private original through a caller copy', async () => {
    const h = fixture(), snapshot = await h.load()
    // Deliberately bypass the readonly type on this detached caller clone only.
    const raw = h.reader.currentFormOriginal!(snapshot, 'record')! as Row
    raw.answer = 'caller changed'; (raw.exts as Row).readonlyValue = 'caller changed readonly'
    ;((raw.hiddenUnknown as Row).retained as unknown[]).push('caller mutation')
    ;(raw.auditMetadata as Row).version = 999
    expect(h.reader.currentFormOriginal!(snapshot, 'record')).toEqual(h.record)
    expect(h.reader.currentFormOriginal!(snapshot, 'record')).not.toBe(raw)
  })
  it('does not turn cloned/display/ACK-shaped snapshots into original read authority', async () => {
    const h = fixture(), snapshot = await h.load()
    for (const spoof of [structuredClone(snapshot), { ...snapshot },
      { ...snapshot, records: [{ id: 'record', values: { answer: 'ACK value' } }] }]) {
      expect(h.reader.currentFormOriginal!(spoof as R1NodeFormsSnapshot, 'record')).toBeNull()
    }
    expect(h.reader.currentFormOriginal!(snapshot, 'record')).toEqual(h.record)
  })
  it('uses the later selected raw record rather than the earlier discovery response', async () => {
    const h = fixture(); let reads = 0
    h.hook(request => { if (request.path === 'biz/extForm/query/ext' && ++reads === 2)
      (h.record.exts as Row).answer = 'later exact selection' })
    const snapshot = await h.load()
    expect(snapshot.records[0]?.values?.answer).toBe('later exact selection')
    expect((h.reader.currentFormOriginal!(snapshot, 'record')!.exts as Row).answer).toBe('later exact selection')
  })
  it.each(['user', 'role', 'session', 'clear', 'unlist', 'reload'] as const)('revokes old provenance after %s', async reason => {
    const h = fixture(), snapshot = await h.load()
    if (reason === 'clear') h.reader.clear()
    else if (reason === 'unlist') h.unlist()
    else if (reason === 'reload') await h.load()
    else h.change(reason)
    expect(h.reader.currentFormOriginal!(snapshot, 'record')).toBeNull()
  })
  it('does not accept an old account snapshot even after a fresh read under a different account', async () => {
    const h = fixture(), old = await h.load()
    h.change('user')
    const fresh = await h.load()
    expect(h.reader.currentFormOriginal!(old, 'record')).toBeNull()
    expect(h.reader.currentFormOriginal!(fresh, 'record')).toEqual(h.record)
  })
})

describe('normal forms post-Process independent verification', () => {
  it.each([0, 10])('confirms the same completed node in an allowed workflow state %i and revokes originals', async workflowState => {
    const h = fixture(), snapshot = await h.load(), before = h.requests.length
    h.complete(); h.workflow.state = workflowState
    await expect(h.reader.confirmFormsCompletion!(snapshot)).resolves.toEqual({ transitionVerified: true })
    expect(h.requests.slice(before).map(request=>request.path)).toEqual(['basic/serviceAppointment/queryById/work','biz/extForm/query/ext','biz/extForm/query/ext','basic/serviceAppointment/queryById/work'])
    expect(h.requests.slice(before).filter(request=>request.path==='biz/extForm/query/ext').every(request=>request.body?.['is:_id|string#and']==='record')).toBe(true)
    expect(h.reader.isCurrent(snapshot)).toBe(false)
    expect(h.reader.currentFormOriginal!(snapshot, 'record')).toBeNull()
    await expect(h.reader.confirmFormsCompletion!(snapshot)).rejects.toThrow()
    expect(h.requests).toHaveLength(before + 4)
  })
  it.each([
    ['stillActive', (h: ReturnType<typeof fixture>) => { h.node.state = 0 }],
    ['negativeNodeState', (h: ReturnType<typeof fixture>) => { h.node.state = -1 }],
    ['stringNodeState', (h: ReturnType<typeof fixture>) => { h.node.state = '10' }],
    ['foreignNode', (h: ReturnType<typeof fixture>) => { h.node._id = 'other-node' }],
    ['foreignNodeTenant', (h: ReturnType<typeof fixture>) => { h.node.tenantId = 'other-tenant' }],
    ['foreignNodeRun', (h: ReturnType<typeof fixture>) => { h.node.workflowId = 'other-run' }],
    ['foreignParent', (h: ReturnType<typeof fixture>) => { h.node.workflowFormDataId = 'other-work' }],
    ['foreignDefinition', (h: ReturnType<typeof fixture>) => { h.node.formDefId = 'other-ext' }],
    ['foreignNodeDefinition', (h: ReturnType<typeof fixture>) => { h.nodeDef.formDefId = 'other-ext' }],
    ['wrongSourceType', (h: ReturnType<typeof fixture>) => { h.nodeDef.nodeType = 'repeat' }],
    ['foreignWorkTenant', (h: ReturnType<typeof fixture>) => { h.workOrder.tenantId = 'other-tenant' }],
    ['foreignWorkRun', (h: ReturnType<typeof fixture>) => { h.workOrder.workflowId = 'other-run' }],
    ['foreignWorkflow', (h: ReturnType<typeof fixture>) => { h.workflow._id = 'other-run' }],
    ['foreignWorkflowParent', (h: ReturnType<typeof fixture>) => { h.workflow.formDataId = 'other-work' }],
    ['invalidWorkflowState', (h: ReturnType<typeof fixture>) => { h.workflow.state = -1 }],
    ['stringWorkflowState', (h: ReturnType<typeof fixture>) => { h.workflow.state = '10' }],
    ['duplicateNodeIds', (h: ReturnType<typeof fixture>) => { h.detail.data.workflowNode.push(structuredClone(h.node)) }],
  ] as const)('rejects %s instead of accepting a completed-looking ACK/read', async (_name, mutate) => {
    const h = fixture(), snapshot = await h.load()
    h.complete(); mutate(h)
    await expect(h.reader.confirmFormsCompletion!(snapshot)).rejects.toThrow()
    // A rejected read neither blesses completion nor fabricates a new snapshot.
    expect(h.reader.isCurrent(snapshot)).toBe(true)
  })
  it('does not clear a newer current snapshot when an old completion response arrives late', async () => {
    const h = fixture(), old = await h.load()
    h.complete()
    let release!: () => void
    const paused = new Promise<void>(resolve => { release = resolve })
    h.hook(async request => { if (request.path === 'basic/serviceAppointment/queryById/work') await paused })
    const before = h.requests.length
    const pending = h.reader.confirmFormsCompletion!(old), rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(h.requests).toHaveLength(before + 1))
    h.hook(undefined); h.node.state = 0
    const fresh = await h.load()
    release(); await rejected
    expect(h.reader.isCurrent(fresh)).toBe(true)
    expect(h.reader.currentFormOriginal!(fresh, 'record')).toEqual(h.record)
    expect(h.reader.currentFormOriginal!(old, 'record')).toBeNull()
  })
  it.each(['user', 'role', 'session', 'clear', 'unlist'] as const)('rejects a late completion response after %s changes', async reason => {
    const h = fixture(), snapshot = await h.load()
    h.complete()
    h.hook(async request => {
      if (request.path !== 'basic/serviceAppointment/queryById/work') return
      await Promise.resolve()
      if (reason === 'clear') h.reader.clear()
      else if (reason === 'unlist') h.unlist()
      else h.change(reason)
    })
    await expect(h.reader.confirmFormsCompletion!(snapshot)).rejects.toThrow()
    expect(h.reader.currentFormOriginal!(snapshot, 'record')).toBeNull()
  })
})


describe('review regression: completed forms retain authoritative records and business values',()=>{
  it.each([
    ['empty links',(h:ReturnType<typeof fixture>)=>{(h.node.exts as Row).formList=[]}],
    ['wrong linked ID',(h:ReturnType<typeof fixture>)=>{(h.node.exts as Row).formList=[{_id:'other',formDefId:'ext',state:1}]}],
    ['deleted reference',(h:ReturnType<typeof fixture>)=>{(h.node.exts as Row).formList=[{_id:'record',formDefId:'ext',state:-1}]}],
    ['wrong linked definition',(h:ReturnType<typeof fixture>)=>{(h.node.exts as Row).formList=[{_id:'record',formDefId:'other-ext',state:1}]}],
    ['deleted FormData',(h:ReturnType<typeof fixture>)=>{h.record.state=-1}],
    ['foreign FormData tenant',(h:ReturnType<typeof fixture>)=>{h.record.tenantId='other-tenant'}],
    ['foreign FormData run',(h:ReturnType<typeof fixture>)=>{h.record.workflowId='other-run'}],
    ['foreign FormData node',(h:ReturnType<typeof fixture>)=>{h.record.nodeId='other-node'}],
    ['changed writable value',(h:ReturnType<typeof fixture>)=>{(h.record.exts as Row).answer='changed by terminal response'}],
    ['changed readonly value',(h:ReturnType<typeof fixture>)=>{(h.record.exts as Row).readonlyValue='changed readonly'}],
    ['missing expected value',(h:ReturnType<typeof fixture>)=>{delete (h.record.exts as Row).answer;delete h.record.answer}],
  ] as const)('rejects closed node with %s and does not consume its lease',async(_name,mutate)=>{
    const h=fixture(),snapshot=await h.load();h.complete();mutate(h)
    await expect(h.reader.confirmFormsCompletion!(snapshot)).rejects.toThrow()
    expect(h.reader.isCurrent(snapshot)).toBe(true)
  })
  it('rejects an exact FormData read failure even after a closed-node ACK',async()=>{
    const h=fixture(),snapshot=await h.load();h.complete()
    h.hook(req=>{if(req.path==='biz/extForm/query/ext')throw Error('synthetic terminal read unavailable')})
    await expect(h.reader.confirmFormsCompletion!(snapshot)).rejects.toThrow()
    expect(h.reader.isCurrent(snapshot)).toBe(true)
  })
  it('allows unknown terminal node/record metadata changes while verifying supported business fields',async()=>{
    const h=fixture(),snapshot=await h.load();h.complete()
    ;(h.node.exts as Row).terminalAudit={generated:true};h.record.auditMetadata={actor:'terminal service',version:5}
    ;(h.record.exts as Row).newUnknown='terminal metadata'
    await expect(h.reader.confirmFormsCompletion!(snapshot)).resolves.toEqual({transitionVerified:true})
    expect(h.requests.filter(r=>r.path==='biz/extForm/query/ext').length).toBeGreaterThan(2)
  })
})

it('rejects terminal relationship drift while exact saved rows are being verified',async()=>{
 const h=fixture(),snapshot=await h.load();h.complete();let terminalReads=0
 h.hook(req=>{if(req.path==='basic/serviceAppointment/queryById/work'&&++terminalReads===2)(h.node.exts as Row).formList=[]})
 await expect(h.reader.confirmFormsCompletion!(snapshot)).rejects.toThrow()
 expect(terminalReads).toBe(2);expect(h.reader.isCurrent(snapshot)).toBe(true)
})


describe('raw terminal business state is never inferred through lossy display fallback',()=>{
 it.each([{broken:true},['saved'],[],undefined,Number.NaN,Number.POSITIVE_INFINITY,null,0,false,''])('rejects changed or unsupported EXTS value %j even when the root still matches',async value=>{
  const h=fixture();h.record.answer='saved';(h.record.exts as Row).answer='saved';const snapshot=await h.load();h.complete();(h.record.exts as Row).answer=value
  await expect(h.reader.confirmFormsCompletion!(snapshot)).rejects.toThrow();expect(h.reader.isCurrent(snapshot)).toBe(true)
 })
 it.each(['drop-exts-key','drop-root-key','drop-exts-container','add-root-copy','add-exts-copy']as const)('rejects known business-slot presence drift: %s',async kind=>{
  const h=fixture();h.record.answer='saved';(h.record.exts as Row).answer='saved'
  if(kind==='add-root-copy')delete h.record.answer
  if(kind==='add-exts-copy')delete (h.record.exts as Row).answer
  const snapshot=await h.load();h.complete()
  if(kind==='drop-exts-key')delete (h.record.exts as Row).answer
  if(kind==='drop-root-key')delete h.record.answer
  if(kind==='drop-exts-container')delete h.record.exts
  if(kind==='add-root-copy')h.record.answer='saved'
  if(kind==='add-exts-copy')(h.record.exts as Row).answer='saved'
  await expect(h.reader.confirmFormsCompletion!(snapshot)).rejects.toThrow();expect(h.reader.isCurrent(snapshot)).toBe(true)
 })
 it.each(['root-only','exts-only','same-copies','distinct-existing-copies','missing-optional','null-optional']as const)('accepts unchanged supported raw shape: %s while audit changes',async kind=>{
  const h=fixture();h.record.answer='saved';(h.record.exts as Row).answer='saved'
  if(kind==='root-only')delete (h.record.exts as Row).answer
  if(kind==='exts-only')delete h.record.answer
  if(kind==='distinct-existing-copies')h.record.answer='historical top copy'
  if(kind==='missing-optional'){delete h.record.readonlyValue;delete (h.record.exts as Row).readonlyValue}
  if(kind==='null-optional'){h.record.readonlyValue=null;(h.record.exts as Row).readonlyValue=null}
  const snapshot=await h.load();h.complete();h.record.auditMetadata={new:true};(h.record.exts as Row).unknownAudit={broken:true}
  await expect(h.reader.confirmFormsCompletion!(snapshot)).resolves.toEqual({transitionVerified:true});expect(h.reader.isCurrent(snapshot)).toBe(false)
 })
 it.each([{broken:true},['saved'],undefined,Number.NaN])('rejects unsupported root business value %j even if EXTS still supplies the saved display value',async value=>{
  const h=fixture();h.record.answer='saved';(h.record.exts as Row).answer='saved';const snapshot=await h.load();h.complete();h.record.answer=value
  await expect(h.reader.confirmFormsCompletion!(snapshot)).rejects.toThrow();expect(h.reader.isCurrent(snapshot)).toBe(true)
 })
})
