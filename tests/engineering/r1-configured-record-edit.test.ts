import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { existingRecordFixture } from '../support/r1-existing-record-edit-fixture'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

beforeEach(() => installLocalFixtureBrowser())
afterEach(() => vi.unstubAllGlobals())

it.each([false, true])('edits configured typed scalar fields through the actual normal reader/provider (alternate %s)', async alternate => {
  const h = existingRecordFixture(alternate), original = structuredClone(h.record), other = structuredClone(h.other)
  const snapshot = await h.load(), action = h.provider().forSnapshot(snapshot)
  expect(action).not.toBeNull()
  expect(action!.canEdit?.(h.record._id)).toBe(true)
  expect(action!.canEdit?.(h.other._id)).toBe(false)
  const initial = action!.initialValues!(h.record._id)!
  expect(initial).toEqual({ [h.keys[0]!]: 12.5, [h.keys[1]!]: '原说明' })
  const saved = await action!.saveOnly({ ...initial, [h.keys[1]!]: '修改后说明' }, h.record._id)
  expect(saved.records.map(r => r.id)).toEqual(['saved-edit', 'saved-other'])
  expect(h.writes).toHaveLength(1)
  expect(h.record._id).toBe(original._id)
  expect(h.record[h.keys[0]!]).toBe(12.5)
  expect(h.record.exts.preserved).toEqual(original.exts.preserved)
  expect(h.record.createTime).toBe(1700000000123)
  expect(alternate ? h.record.exts[h.keys[1]!] : h.record[h.keys[1]!]).toBe('修改后说明')
  if(alternate)expect(h.record).not.toHaveProperty(h.keys[1]!)
  expect(h.other).toEqual(other)
  expect(h.events.filter(e => /process|updateExts|upload/.test(e))).toEqual([])
})

it('uses the same controls/capability with an explicitly type0 Map storage strategy',async()=>{
  const h=existingRecordFixture(true);h.mapRoute();h.record.arbitraryRoot={keep:[3,2,1]}
  const s=await h.load(),a=h.provider().forSnapshot(s)!
  expect(a.canEdit!('saved-edit')).toBe(true)
  await a.saveOnly({...a.initialValues!('saved-edit'),width:0,visitComment:''},'saved-edit')
  expect(h.record).toMatchObject({width:0,visitComment:'',exts:{visitComment:'',preserved:{sequence:[1,2],empty:null}},arbitraryRoot:{keep:[3,2,1]}})
  expect(h.writes).toHaveLength(1)
})
it('keeps genuine Map Date provenance and follows the observed R1 wire without claiming millisecond preservation',async()=>{
  const h=existingRecordFixture(true);h.mapRoute();h.record.createTime=1700000000123;h.record.createDateTime=1700000000123
  const original=h.transport.execute.getMockImplementation()!
  h.transport.execute.mockImplementation(async req=>{
    const result:any=await original(req)
    if(req.path==='biz/extForm/query/'+h.scope.formDefinitionId)for(const row of result.data)if(typeof row.createDateTime==='number')row.createDateTime='2023-11-15 06:13:20'
    return result
  })
  const s=await h.load(),proof=h.reader.currentRecordEdit!(s,'saved-edit')!,a=h.provider().forSnapshot(s)!
  expect(proof.original.createTime).toBe(1700000000123)
  expect(proof.wireOriginal.createTime).toBe('2023-11-15 06:13:20')
  expect(proof.projectedAuditDateKeys).toEqual(['createTime','createDateTime'])
  expect(a.canEdit!('saved-edit')).toBe(true)
  await a.saveOnly({...a.initialValues!('saved-edit'),visitComment:'兼容保存'},'saved-edit')
  expect(h.record.createTime).toBe(proof.wireOriginal.createTime)
  expect(h.record.createDateTime).toBe(proof.wireOriginal.createDateTime)
  expect(h.record.exts.visitComment).toBe('兼容保存')
  expect(h.writes).toHaveLength(1) // R1-compatible audit conversion, NOT BSON-lossless.
})
it('does not fabricate dates for an existing Map original with absent audit values',async()=>{
  const h=existingRecordFixture(true);h.mapRoute();delete h.record.createTime;delete h.record.updateTime
  const s=await h.load(),p=h.reader.currentRecordEdit!(s,'saved-edit')!
  expect(p.original).not.toHaveProperty('createTime');expect(p.wireOriginal).not.toHaveProperty('createTime')
  expect(p.projectedAuditDateKeys).toEqual([]);expect(h.provider().forSnapshot(s)!.canEdit!('saved-edit')).toBe(true)
})
it.each(['unavailable','foreign-id','business-disagreement'] as const)('keeps Map readonly when its independent raw source is %s',async mode=>{
  const h=existingRecordFixture(true);h.mapRoute();const original=h.transport.execute.getMockImplementation()!
  h.transport.execute.mockImplementation(async req=>{
    const result:any=await original(req)
    if(req.path==='biz/extForm/findByIdWithWorkflow'){
      if(mode==='unavailable')throw Error('precision read unavailable')
      if(mode==='foreign-id')result.data.data._id='foreign'
      if(mode==='business-disagreement')result.data.data.exts.preserved.sequence.reverse()
    }
    return result
  })
  const s=await h.load();expect(s.records).toHaveLength(2)
  expect(h.provider().forSnapshot(s)).toBeNull();expect(h.writes).toEqual([])
})
it('cannot alter the private query wire to manufacture audit-date compatibility',async()=>{
  const h=existingRecordFixture(true);h.mapRoute();const s=await h.load(),p=h.reader.currentRecordEdit!(s,'saved-edit')!
  ;(p.wireOriginal as Record<string,unknown>).createTime='modified'
  expect(h.reader.isCurrentRecordEdit!(s,'saved-edit',p)).toBe(false)
  expect(h.writes).toEqual([])
})
it('does not allow a Map audit exception to mask other original/EXTS loss after dispatch',async()=>{
  const h=existingRecordFixture(true);h.mapRoute();h.record.createTime=1700000000123
  const a=h.provider().forSnapshot(await h.load())!,original=h.commands.execute.getMockImplementation()!
  h.commands.execute.mockImplementation(async req=>{const ack=await original(req);delete h.record.exts.preserved;return ack})
  await expect(a.saveOnly({...a.initialValues!('saved-edit'),visitComment:'new'},'saved-edit')).rejects.toThrow()
  expect(h.writes).toHaveLength(1)
  const next=h.provider().forSnapshot(await h.load())!;expect(next.canEdit!('saved-edit')).toBe(false)
})

it.each(['squareMeter','memo'] as const)('respects configured required and accepts valid zero/empty %s',async key=>{
  const h=existingRecordFixture(),a=h.provider().forSnapshot(await h.load())!
  expect(a.validateDraft!({...a.initialValues!('saved-edit'),[key]:key==='memo'?'':0},'saved-edit')).toBe(true)
  await a.saveOnly({...a.initialValues!('saved-edit'),[key]:key==='memo'?'':0},'saved-edit')
  expect(h.record[key]).toBe(key==='memo'?'':0)
})
it('refuses missing required numeric data, undeclared inputs, and foreign record IDs before dispatch',async()=>{
  const h=existingRecordFixture(),a=h.provider().forSnapshot(await h.load())!
  for(const values of [{squareMeter:'',memo:'x'},{squareMeter:0,memo:'x',_id:'foreign'},{squareMeter:false,memo:'x'}])await expect(a.saveOnly(values,'saved-edit')).rejects.toThrow()
  await expect(a.saveOnly({squareMeter:1,memo:'x'},'saved-other')).rejects.toThrow()
  expect(h.writes).toEqual([])
})
it.each(['field-permission','raw-original','storage-preset','handler','definition-type','record-set'] as const)('fresh %s changes refuse the old editor with zero commands',async change=>{
  const h=existingRecordFixture(),a=h.provider().forSnapshot(await h.load())!,v=a.initialValues!('saved-edit')!
  if(change==='field-permission')h.node.nodeDef.formFieldIdsReadOnly=['configured-1']
  if(change==='raw-original')h.record.exts.preserved.sequence.reverse()
  if(change==='storage-preset')h.fields[1].preset=0
  if(change==='handler')h.node.handlerIds=['someone-else']
  if(change==='definition-type')h.ext.type='0'
  if(change==='record-set')h.other._id='different-record'
  await expect(a.saveOnly({...v,memo:'changed'},'saved-edit')).rejects.toThrow();expect(h.writes).toEqual([])
})
it.each(['actor','listed','grant'] as const)('observed %s withdrawal cannot revive the old capability',async change=>{
  const h=existingRecordFixture(),s=await h.load(),a=h.provider().forSnapshot(s)!
  if(change==='actor')h.changeActor();if(change==='listed')h.unlist();if(change==='grant')h.env.VITE_XLINK_R1_REPEAT_ACTIONS='false'
  expect(a.canEdit!('saved-edit')).toBe(false)
  if(change==='grant'){h.env.VITE_XLINK_R1_REPEAT_ACTIONS='true';expect(h.provider().forSnapshot(s)).toBeNull()}
  await expect(a.saveOnly({squareMeter:0,memo:'x'},'saved-edit')).rejects.toThrow();expect(h.writes).toEqual([])
})
it.each(['unknown-root','explicit-null','slot-conflict','date-string'] as const)('blocks unpreservable typed %s without stripping it',async mode=>{
  const h=existingRecordFixture()
  if(mode==='unknown-root')h.record.unknown={secret:'keep'}
  if(mode==='explicit-null')h.record.address=null
  if(mode==='slot-conflict')h.record.exts.memo='conflicting copy'
  if(mode==='date-string')h.record.createTime='2026-11-07 13:04:09'
  const a=h.provider().forSnapshot(await h.load())!
  expect(a.canEdit!('saved-edit')).toBe(false);expect(h.writes).toEqual([])
})
it('requires actual private reader evidence rather than copied source objects',async()=>{
  const h=existingRecordFixture(),s=await h.load(),e=h.reader.currentRecordEdit!(s,'saved-edit')!
  expect(h.reader.isCurrentRecordEdit!(s,'saved-edit',{...e})).toBe(false)
  expect(h.reader.currentRecordEdit!({...s},'saved-edit')).toBeNull()
  expect(h.writes).toEqual([])
})
it('cross-checks readonly/fill/grant fields and preserves a configured readonly value',async()=>{
  const h=existingRecordFixture();h.fields[1].readOnly=1;h.node.nodeDef.formFieldIdsReadOnly=['configured-1'];h.node.nodeDef.formFieldIdsFill=['configured-0'];h.grant.fieldIds=['configured-0'];h.setGrant()
  const a=h.provider().forSnapshot(await h.load())!,v=a.initialValues!('saved-edit')!
  await expect(a.saveOnly({...v,memo:'forbidden'},'saved-edit')).rejects.toThrow();expect(h.writes).toEqual([])
  await a.saveOnly({...v,squareMeter:0},'saved-edit');expect(h.record).toMatchObject({squareMeter:0,memo:'原说明'})
})
it.each(['overlap','missing-operation','wrong-collection','unsafe-number'] as const)('does not reinterpret unsupported raw metadata/original: %s',async mode=>{
  const h=existingRecordFixture()
  if(mode==='overlap')h.node.nodeDef.formFieldIdsReadOnly=['configured-1']
  if(mode==='missing-operation')delete h.fields[0].operationType
  if(mode==='wrong-collection')h.fields[0].colName='other'
  if(mode==='unsafe-number')h.record.exts.preserved.counter=Number.MAX_SAFE_INTEGER+1
  const a=h.provider().forSnapshot(await h.load())
  expect(a?.canEdit?.('saved-edit')??false).toBe(false);expect(h.writes).toEqual([])
})
it.each(['lost-response','wrong-ack','missing-ack-id','ack-envelope','readback-loss','other-record-change','precision-loss'] as const)('retains durable uncertainty after %s, including a new provider',async mode=>{
  const h=existingRecordFixture(),a=h.provider().forSnapshot(await h.load())!
  const original=h.commands.execute.getMockImplementation()!
  h.commands.execute.mockImplementation(async req=>{
    const ack=await original(req)
    if(mode==='lost-response')throw Error('synthetic response lost')
    if(mode==='wrong-ack')ack.data.id='foreign'
    if(mode==='missing-ack-id')delete ack.data._id
    if(mode==='ack-envelope')ack.success=false
    if(mode==='readback-loss')delete h.record.exts.preserved
    if(mode==='other-record-change')h.other.address='changed elsewhere'
    if(mode==='precision-loss')h.record.createTime=1700000000000
    return ack
  })
  await expect(a.saveOnly({...a.initialValues!('saved-edit'),memo:'changed'},'saved-edit')).rejects.toThrow()
  expect(h.writes).toHaveLength(1)
  const renewed=h.provider().forSnapshot(await h.load())!
  expect(renewed.canEdit!('saved-edit')).toBe(false)
  await expect(renewed.saveOnly({squareMeter:0,memo:'again'},'saved-edit')).rejects.toThrow();expect(h.writes).toHaveLength(1)
})
it('dispatches nothing when the pre-dispatch uncertain fence cannot persist',async()=>{
  const browser=installLocalFixtureBrowser(),h=existingRecordFixture(),a=h.provider().forSnapshot(await h.load())!
  browser.local.setItem.mockImplementation(()=>{throw Error('disk failed')})
  await expect(a.saveOnly({...a.initialValues!('saved-edit'),memo:'x'},'saved-edit')).rejects.toThrow();expect(h.writes).toEqual([])
})
it('allows at most one command for simultaneous clicks and never replays a verified save',async()=>{
  const h=existingRecordFixture(),a=h.provider().forSnapshot(await h.load())!,v={...a.initialValues!('saved-edit'),memo:'once'}
  const results=await Promise.allSettled([a.saveOnly(v,'saved-edit'),a.saveOnly(v,'saved-edit')]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(h.writes).toHaveLength(1)
  const next=h.provider().forSnapshot(await h.load())!;expect(next.canEdit!('saved-edit')).toBe(false)
})
