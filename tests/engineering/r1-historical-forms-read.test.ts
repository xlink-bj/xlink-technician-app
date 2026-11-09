import { describe, expect, it, vi } from 'vitest'
import { createHistoricalFormsReader } from '@app/r1-historical-forms-read'
import { canReadHistoricalForms } from '@app/r1-historical-forms-policy'
import type { SessionSnapshot, TechnicianApiReadPort } from '@shared/ports'
import type { ApiReadRequest } from '@adapters/api/technician-api'
const origin = 'http://127.0.0.1:5189'
const env = { DEV: true, VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_MOCK: 'false', VITE_XLINK_API_BASE_URL: `${origin}/xlink/wm`, VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false' }
function harness(override: Record<string, unknown> = {}) {
  let session = { sessionRef: 'session', user: { id: 'user' }, currentRole: { id: 'role' }, capabilityNames: [] } as unknown as SessionSnapshot
  let listed = false
  const node = { _id: 'node', nodeId: 'definition-node', tenantId: 'tenant', workflowId: 'workflow', workflowFormDataId: 'work', workflowFormColName: 'serviceAppointment', state: 10, handlerIds: ['user'], nodeDef: { nodeType: 'forms', formDefId: 'ext', name: 'Finished', userChoose: ['role'], viewableRoleIds: [] as string[] }, exts: { unknown: 'preserve', formList: [{ _id: 'record', formDefId: 'ext', state: 1, formTitle: 'Saved title' }] } }
  const detail = { success: true, status: 1, data: { serviceAppointment: { _id: 'work', tenantId: 'tenant', state: 1, workflowId: 'workflow' }, workflow: { _id: 'workflow', tenantId: 'tenant', formDataId: 'work', state: 10 }, workflowNode: [node] } }
  const ext = { _id: 'ext', tenantId: 'tenant', state: 1, type: '0', colName: 'synthetic' }
  const field = { _id: 'field', tenantId: 'tenant', extId: 'ext', state: 1, name: 'note', nameDisp: '说明', type: 'text', preset: 1, showList: ['2','4'], showType: '1', frontEndConfig: '{}' }
  const fieldPage = { data: [field], total: 1, page: 1, size: 50 }
  const record = { _id: 'record', tenantId: 'tenant', sid: 'work', nodeId: 'node', workflowId: 'workflow', state: 1, note: 'saved' }
  const list = { items: [{ id: 'work' }], totalCount: 1, page: 1, pageSize: 20 }
  const calls: ApiReadRequest[] = []
  let hook: ((request: ApiReadRequest) => void | Promise<void>) | undefined
  const execute = vi.fn(async (request: ApiReadRequest) => {
    calls.push(request); await hook?.(request)
    if (request.path.startsWith('basic/serviceAppointment/')) { expect(request.body).toEqual({}); return structuredClone(detail) }
    if (request.path === 'biz/ext/queryById.do') return structuredClone(ext)
    if (request.path === 'biz/extField/query') return structuredClone(fieldPage)
    if (request.path === 'biz/extForm/query/ext') return { data: [structuredClone(record)], total: 1, page: 1, size: request.body?.rows, dataCount: 1 }
    throw Error('Unexpected request')
  })
  const read = { listWorkOrders: vi.fn<TechnicianApiReadPort['listWorkOrders']>(async () => { listed = list.items.some(x => x.id === 'work'); return { state: 'succeeded', data: list } as never }), isWorkOrderListedForCurrentSession: () => listed }
  const reader = createHistoricalFormsReader({ auth: { getCurrentSession: () => session }, read, tenantId: 'tenant', env: { ...env, ...override }, origin, transport: { execute } })
  return { reader, node, detail, ext, field, fieldPage, record, list, calls, read, hook: (fn: typeof hook) => { hook = fn }, unlist: () => { listed = false }, setListed: (value: boolean) => { listed = value }, changeRole: () => { session = { ...session, currentRole: { ...session.currentRole!, id: 'other' as never } } }, changeSession: () => { session = { ...session, sessionRef: 'changed' as never } } }
}
describe('separate completed forms read capability', () => {
  it('normal role list → fresh detail targets → exact records → stable complete references, without action authority', async () => {
    const h = harness(), [target] = await h.reader.discover('work')
    expect(h.read.listWorkOrders).toHaveBeenCalledOnce(); expect(target?.kind).toBe('completed-forms-reference')
    const result = await h.reader.read(target!)
    expect(result.record.values?.note).toBe('saved'); expect(h.reader.isCurrent(result)).toBe(true)
    expect(Object.keys(result).sort()).toEqual(['definition','kind','record','target'])
    expect(Object.keys(h.reader).sort()).toEqual(['clear','discover','enabled','isCurrent','read'])
    expect(h.calls.filter(c => c.path.includes('extForm/')).map(c => c.body?.['is:_id|string#and'])).toEqual(['record','record'])
    expect(h.calls.some(c => /upsert|updateExts|process|upload/.test(c.path))).toBe(false)
  })
  it.each([{VITE_XLINK_ENVIRONMENT:'production'},{VITE_XLINK_ENVIRONMENT:'beta'},{DEV:false},{VITE_XLINK_MOCK:'true'},{VITE_XLINK_ENABLE_REAL_WRITES:'true'},{VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true'}])('closes unsupported environment %j', async override => { const h=harness(override);expect(h.reader.enabled()).toBe(false);await expect(h.reader.discover('work')).rejects.toThrow();expect(h.calls).toHaveLength(0) })
  it('never treats a caller-cloned target as read authority', async () => { const h=harness(),[target]=await h.reader.discover('work');await expect(h.reader.read({...target!})).rejects.toThrow();expect(h.calls).toHaveLength(1) })
  it('cannot discover an unlisted work order or use direct IDs', async () => { const h=harness();h.list.items=[];h.list.totalCount=0;await expect(h.reader.discover('work')).rejects.toThrow();expect(h.calls).toHaveLength(0) })
  it.each(['changeRole','changeSession','unlist'] as const)('hides and rejects after %s', async change => { const h=harness(),[target]=await h.reader.discover('work');h[change]();expect(h.reader.isCurrent(target!)).toBe(false);await expect(h.reader.read(target!)).rejects.toThrow() })
  it('clear invalidates previously discovered targets', async () => { const h=harness(),[target]=await h.reader.discover('work');h.reader.clear();await expect(h.reader.read(target!)).rejects.toThrow() })
  it('late role change rejects a detail result', async () => { const h=harness();h.hook(()=>h.changeRole());await expect(h.reader.discover('work')).rejects.toThrow() })
  it('late unlisting rejects a field result and consumes no record read', async () => { const h=harness(),[t]=await h.reader.discover('work');h.hook(r=>{if(r.path==='biz/extField/query')h.unlist()});await expect(h.reader.read(t!)).rejects.toThrow();expect(h.calls.some(r=>r.path.includes('extForm/'))).toBe(false) })
  it.each(['tenant','workflow','state','references','permission','unknownMetadata'])('rereads and rejects %s drift before record request', async drift=>{const h=harness(),[t]=await h.reader.discover('work');if(drift==='tenant')h.node.tenantId='other';if(drift==='workflow')h.detail.data.workflow._id='other';if(drift==='state')h.node.state=0;if(drift==='references')h.node.exts.formList=[];if(drift==='permission'){h.node.handlerIds=[];h.node.nodeDef.userChoose=[]}if(drift==='unknownMetadata')h.node.exts.unknown='changed';await expect(h.reader.read(t!)).rejects.toThrow();expect(h.calls.some(r=>r.path.includes('extForm/'))).toBe(false)})
  it('rechecks permission after exact record read and rejects late revocation', async()=>{const h=harness(),[t]=await h.reader.discover('work');h.hook(r=>{if(r.path.includes('extForm/')){h.node.handlerIds=[];h.node.nodeDef.userChoose=[]}});await expect(h.reader.read(t!)).rejects.toThrow();expect(h.reader.isCurrent(t!)).toBe(false)})
  it.each(['tenantId','sid','nodeId','workflowId','_id'] as const)('rejects record %s mismatch',async key=>{const h=harness(),[t]=await h.reader.discover('work');h.record[key]='foreign';await expect(h.reader.read(t!)).rejects.toThrow();expect(h.reader.isCurrent(t!)).toBe(false)})
  it('deleted references are not queried',async()=>{const h=harness();h.node.exts.formList[0]!.state=-1;expect(await h.reader.discover('work')).toEqual([]);expect(h.calls).toHaveLength(1)})
  it('duplicate/unknown references fail instead of silently showing zero',async()=>{const h=harness();h.node.exts.formList.push({...h.node.exts.formList[0]!});await expect(h.reader.discover('work')).rejects.toThrow()})
  it('missing complete EXTS is unknown',async()=>{const h=harness();delete (h.node as Partial<typeof h.node>).exts;await expect(h.reader.discover('work')).rejects.toThrow()})
  it('a completed node in an active workflow is readable, not writable',async()=>{const h=harness();h.detail.data.workflow.state=0;expect(await h.reader.discover('work')).toHaveLength(1)})
})
describe('R1 historical visibility is independent of current-action visibility',()=>{
  it.each(['handler','choose','view'])('accepts verified %s membership', mode=>{const h=harness();h.node.handlerIds=mode==='handler'?['user']:[];h.node.nodeDef.userChoose=mode==='choose'?['role']:[];h.node.nodeDef.viewableRoleIds=mode==='view'?['role']:[];expect(canReadHistoricalForms(h.node,{userId:'user',roleId:'role'})).toBe(true)})
  it('does not reinterpret a handler role as a user or use handleUserId alone',()=>{const h=harness();h.node.handlerIds=['role'];h.node.nodeDef.userChoose=[];Object.assign(h.node,{handleUserId:'user'});expect(canReadHistoricalForms(h.node,{userId:'user',roleId:'role'})).toBe(false)})
  it('does not infer creator-index exception or system access',()=>{const h=harness();h.node.nodeId='0';expect(canReadHistoricalForms(h.node,{userId:'user',roleId:'role'})).toBe(false)})
  it('does not grant access from malformed role evidence',()=>{const h=harness();Object.assign(h.node.nodeDef,{viewableRoleIds:'role'});expect(canReadHistoricalForms(h.node,{userId:'user',roleId:'role'})).toBe(false)})
})
it.each(['saId','workflowIdAlias','nodeIdAlias','nodeRunAlias','definitionAlias'])('rejects contradictory historical %s',async kind=>{const h=harness();if(kind==='saId')Object.assign(h.detail.data.serviceAppointment,{id:'foreign'});if(kind==='workflowIdAlias')Object.assign(h.detail.data.workflow,{id:'foreign'});if(kind==='nodeIdAlias')Object.assign(h.node,{id:'foreign'});if(kind==='nodeRunAlias')Object.assign(h.node,{runId:'foreign'});if(kind==='definitionAlias')Object.assign(h.node.nodeDef,{formDefinitionId:'foreign'});await expect(h.reader.discover('work')).rejects.toThrow()})
it('preserves the full EXTS binding and rejects unrelated list metadata drift after record reads',async()=>{const h=harness(),[t]=await h.reader.discover('work');h.hook(r=>{if(r.path.includes('extForm/'))h.node.exts.unknown='changed'});await expect(h.reader.read(t!)).rejects.toThrow()})
it('schema pagination holes are not shown as an empty historical form',async()=>{const h=harness(),[t]=await h.reader.discover('work');h.fieldPage.total=2;await expect(h.reader.read(t!)).rejects.toThrow();expect(h.calls.some(r=>r.path.includes('extForm/'))).toBe(false)})
it('a historical reference can select its own definition without replacing the node default definition',async()=>{const h=harness();h.node.nodeDef.formDefId='default-definition';const[t]=await h.reader.discover('work');expect(t?.formDefinitionId).toBe('ext');expect((await h.reader.read(t!)).record.values?.note).toBe('saved')})

describe('cold historical discovery uses explicit authorized all-category list', () => {
  it('passes the exact category contract without overriding role HTTP scope or using the todo default', async () => {
    const h = harness(); await h.reader.discover('work')
    expect(h.read.listWorkOrders.mock.calls).toEqual([[{ page: 1, pageSize: 20, category: 'all' }]])
    expect(h.calls[0]).toEqual({ method: 'POST', path: 'basic/serviceAppointment/queryById/work', body: {} })
  })
  it('uses existing current listed provenance without issuing another category query on a warm page', async () => {
    const h = harness(); h.setListed(true); await h.reader.discover('work')
    expect(h.read.listWorkOrders).not.toHaveBeenCalled()
  })
  it.each(['failed_terminal','failed_retryable'] as const)('does not fall back to another scope after %s', async state => {
    const h = harness(); h.read.listWorkOrders.mockResolvedValueOnce({ state })
    await expect(h.reader.discover('work')).rejects.toThrow()
    expect(h.read.listWorkOrders.mock.calls).toEqual([[{ page: 1, pageSize: 20, category: 'all' }]])
    expect(h.calls).toHaveLength(0)
  })
  it('rejects a row returned without authoritative adapter membership', async () => {
    const h = harness(); h.read.listWorkOrders.mockResolvedValueOnce({ state: 'succeeded', data: h.list } as never)
    await expect(h.reader.discover('work')).rejects.toThrow(); expect(h.calls).toHaveLength(0)
  })
  it('preserves explicit all on every bounded page and reads detail only after target membership', async () => {
    const h = harness(), original = h.read.listWorkOrders.getMockImplementation()!
    h.read.listWorkOrders.mockImplementation(async query => {
      h.list.page = query.page; h.list.totalCount = 21
      h.list.items = query.page === 1 ? Array.from({ length: 20 }, (_, i) => ({ id: `other-${i}` })) : [{ id: 'work' }]
      return original(query)
    })
    expect(await h.reader.discover('work')).toHaveLength(1)
    expect(h.read.listWorkOrders.mock.calls).toEqual([[{ page: 1, pageSize: 20, category: 'all' }],[{ page: 2, pageSize: 20, category: 'all' }]])
    expect(h.calls).toHaveLength(1)
  })
  it.each(['total-drift','duplicate-row','wrong-page','short-page'] as const)('rejects %s before any detail access', async fault => {
    const h = harness(), original = h.read.listWorkOrders.getMockImplementation()!
    h.read.listWorkOrders.mockImplementation(async query => {
      h.list.totalCount = fault === 'total-drift' && query.page === 2 ? 22 : 21
      h.list.page = fault === 'wrong-page' ? 9 : query.page
      h.list.items = query.page === 1 ? Array.from({ length: fault === 'short-page' ? 19 : 20 }, (_, i) => ({ id: `other-${i}` }))
        : [{ id: fault === 'duplicate-row' ? 'other-0' : 'work' }]
      return original(query)
    })
    await expect(h.reader.discover('work')).rejects.toThrow(); expect(h.calls).toHaveLength(0)
    expect(h.read.listWorkOrders.mock.calls.every(([query]) => query.category === 'all')).toBe(true)
  })
  it.each(['changeRole','changeSession'] as const)('stops after %s while page is pending', async change => {
    const h = harness(), original = h.read.listWorkOrders.getMockImplementation()!
    h.read.listWorkOrders.mockImplementationOnce(async query => { const data = await original(query); h[change](); return data })
    await expect(h.reader.discover('work')).rejects.toThrow(); expect(h.calls).toHaveLength(0)
    expect(h.read.listWorkOrders).toHaveBeenCalledOnce()
  })
  it('stops a paginated rebuild on an unavailable next page, without default-scope retries', async () => {
    const h = harness(), original = h.read.listWorkOrders.getMockImplementation()!
    h.read.listWorkOrders.mockImplementation(async query => {
      if (query.page === 2) return { state: 'failed_retryable' }
      h.list.totalCount = 21; h.list.items = Array.from({ length: 20 }, (_, i) => ({ id: `other-${i}` }))
      return original(query)
    })
    await expect(h.reader.discover('work')).rejects.toThrow(); expect(h.calls).toHaveLength(0)
    expect(h.read.listWorkOrders.mock.calls).toEqual([[{ page: 1, pageSize: 20, category: 'all' }],[{ page: 2, pageSize: 20, category: 'all' }]])
  })
  it('cannot turn an old read lease into authority if the next all scope is revoked', async () => {
    const h = harness(), [old] = await h.reader.discover('work'); h.unlist()
    h.read.listWorkOrders.mockResolvedValueOnce({ state: 'failed_terminal' })
    await expect(h.reader.discover('work')).rejects.toThrow(); expect(h.reader.isCurrent(old!)).toBe(false)
    await expect(h.reader.read(old!)).rejects.toThrow(); expect(h.calls).toHaveLength(1)
  })
  it('does not continue past the existing 200-row bound', async () => {
    const h = harness(); h.list.totalCount = 201; h.list.items = Array.from({ length: 20 }, (_, i) => ({ id: `other-${i}` }))
    await expect(h.reader.discover('work')).rejects.toThrow(); expect(h.read.listWorkOrders).toHaveBeenCalledOnce(); expect(h.calls).toHaveLength(0)
  })
})

describe('Survey attachments in completed historical records', () => {
  function mediaHarness() {
    const h = harness(); h.ext.colName = 'Survey'
    Object.assign(h.field, { colName: 'Survey', name: 'images1', type: 'file', preset: 0, multiple: false })
    Object.assign(h.record, { exts: { images1: [{ url: 'https://media.example.test/photo?token=PRIVATE', name: 'object-key', extname: 'png' }] } })
    return h
  }
  it('decodes only after scoped definition and exact saved-record checks', async () => {
    const h = mediaHarness(), [target] = await h.reader.discover('work'), result = await h.reader.read(target!)
    expect(result.record.values?.images1).toEqual([{ url: 'https://media.example.test/photo?token=PRIVATE', objectKey: 'object-key', extension: 'png' }])
    expect(h.calls.some(request => /upload|upsert|process/.test(request.path))).toBe(false)
    expect(Object.keys(h.reader).sort()).toEqual(['clear','discover','enabled','isCurrent','read'])
  })
  it.each(['collection', 'unsafe-url', 'tenant', 'definition'])('rejects %s without displaying partial media', async mismatch => {
    const h = mediaHarness(), [target] = await h.reader.discover('work')
    if (mismatch === 'collection') h.ext.colName = 'other'
    if (mismatch === 'unsafe-url') Object.assign(h.record, { exts: { images1: [{ url: 'http://media.example.test/photo' }] } })
    if (mismatch === 'tenant') h.record.tenantId = 'foreign'
    if (mismatch === 'definition') Object.assign(h.record, { extId: 'foreign' })
    await expect(h.reader.read(target!)).rejects.toThrow(); expect(h.reader.isCurrent(target!)).toBe(false)
  })
  it.each(['changeRole','changeSession','unlist','clear'] as const)('rejects late media response after %s', async change => {
    const h = mediaHarness(), [target] = await h.reader.discover('work')
    h.hook(async request => { if (!request.path.includes('extForm/')) return; await Promise.resolve()
      if (change === 'clear') h.reader.clear(); else h[change]()
    })
    await expect(h.reader.read(target!)).rejects.toThrow(); expect(h.reader.isCurrent(target!)).toBe(false)
  })
})

it.each([false, true, null])('rejects ambiguous historical root/EXTS media slots (equal=%s)', async equal => {
  const h = harness(); h.ext.colName = 'Survey'
  Object.assign(h.field, { colName: 'Survey', name: 'images1', type: 'file', preset: 0 })
  const images1 = [{ url: 'https://media.example.test/photo', name: 'key', extname: 'jpg' }]
  Object.assign(h.record, { images1, exts: { images1: equal === null ? null : equal ? images1 : [] } })
  const [target] = await h.reader.discover('work')
  await expect(h.reader.read(target!)).rejects.toThrow(/unverified/); expect(h.reader.isCurrent(target!)).toBe(false)
})


describe('Survey historical EXTS integrity follows the active read contract', () => {
  function surveyHarness() {
    const h = harness(); h.ext.colName = 'Survey'
    Object.assign(h.field, { colName: 'Survey' })
    return h
  }
  it.each([{}, { nested: 'not a scalar' }, [{ nested: 'not a choice' }], [null]])(
    'rejects malformed known EXTS rather than displaying the old root copy: %j', async value => {
      const h = surveyHarness(); Object.assign(h.record, { exts: { note: value } })
      const [target] = await h.reader.discover('work')
      await expect(h.reader.read(target!)).rejects.toThrow()
      expect(h.reader.isCurrent(target!)).toBe(false)
      expect(h.calls.some(request => /upsert|updateExts|process|upload/.test(request.path))).toBe(false)
    })
  it.each([null, '', false, 0, [], ['new'], [0, false]])('retains the supported EXTS value %j without root fallback', async value => {
    const h = surveyHarness(); Object.assign(h.record, { exts: { note: value, audit: { preserve: ['unknown'] } } })
    const [target] = await h.reader.discover('work'), result = await h.reader.read(target!)
    expect(result.record.values?.note).toEqual(value)
    expect(h.reader.isCurrent(result)).toBe(true)
  })
  it('requires explicit rediscovery after rejection, then reads the repaired server value', async () => {
    const h = surveyHarness(); Object.assign(h.record, { exts: { note: { invalid: true } } })
    const [old] = await h.reader.discover('work')
    await expect(h.reader.read(old!)).rejects.toThrow()
    Object.assign(h.record, { exts: { note: 'repaired' } })
    const calls = h.calls.length
    await expect(h.reader.read(old!)).rejects.toThrow(); expect(h.calls).toHaveLength(calls)
    const [fresh] = await h.reader.discover('work')
    expect((await h.reader.read(fresh!)).record.values?.note).toBe('repaired')
  })
})
