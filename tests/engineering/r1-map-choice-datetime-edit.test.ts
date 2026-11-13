import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {mapChoiceDatetimeFixture} from '../support/r1-map-choice-datetime-fixture'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
beforeEach(()=>installLocalFixtureBrowser())
afterEach(()=>vi.unstubAllGlobals())

it.each([false,true])('renamed configured radio/local datetime use one Map editor and same-ID save-only (inline %s)',async inline=>{
 const h=mapChoiceDatetimeFixture(inline),other=structuredClone(h.other),a=h.provider().forSnapshot(await h.load())
 expect(a?.canEdit?.('saved-edit')).toBe(true)
 const values=a!.initialValues!('saved-edit')!
 await a!.saveOnly({...values,contactMode:'remote',windowStart:'2027-03-05 10:20:23',visitNotes:''},'saved-edit')
 expect(h.record).toMatchObject({contactMode:'remote',windowStart:'2027-03-05 10:20:23',visitNotes:'',exts:{windowStart:'2027-03-05 10:20:23'}})
 expect(h.other).toEqual(other);expect(h.writes).toHaveLength(1)
 expect(h.events.filter(x=>/process|updateExts|upload|delete/i.test(x))).toEqual([])
})

it.each(['unknown-option','array-radio','impossible-date','partial-date'] as const)('invalid configured value %s sends no command',async mode=>{
 const h=mapChoiceDatetimeFixture(),a=h.provider().forSnapshot(await h.load())!
 expect(a).not.toBeNull()
 const v={...a.initialValues!('saved-edit'),...(mode==='unknown-option'?{contactMode:'unknown'}:mode==='array-radio'?{contactMode:['onsite']}:{windowStart:mode==='impossible-date'?'2027-02-30 10:00:00':'2027-03-05'})}
 await expect(a.saveOnly(v,'saved-edit')).rejects.toThrow();expect(h.writes).toEqual([])
})

it.each(['options','readonly','submit-hidden','record','actor'] as const)('fresh %s change rejects the old editor before dispatch',async mode=>{
 const h=mapChoiceDatetimeFixture(),a=h.provider().forSnapshot(await h.load())!
 expect(a).not.toBeNull();const v=a.initialValues!('saved-edit')!
 if(mode==='options')h.setOptions({onsite:'现场',remote:'新名称'})
 if(mode==='readonly'){h.fields[1].readOnly=1;h.node.nodeDef.formFieldIdsReadOnly=['time-field']}
 if(mode==='submit-hidden')h.node.nodeDef.submitHideNodeId='another-node'
 if(mode==='record')h.record._id='different-record'
 if(mode==='actor')h.changeActor()
 await expect(a.saveOnly(v,'saved-edit')).rejects.toThrow();expect(h.writes).toEqual([])
})

it('a submit-hidden appointment never issues an editing capability',async()=>{
 const h=mapChoiceDatetimeFixture();h.node.nodeDef.submitHideNodeId='another-node'
 expect(h.provider().forSnapshot(await h.load())).toBeNull();expect(h.writes).toEqual([])
})

it.each(['missing-options','duplicate-options','typed'] as const)('unsupported source %s cannot gain this Map-only capability',async mode=>{
 const h=mapChoiceDatetimeFixture(mode==='duplicate-options')
 if(mode==='missing-options')h.setOptions({})
 if(mode==='duplicate-options')h.fields[0].options[1].value='onsite'
 if(mode==='typed'){h.ext.type='1';h.ext.colName='survey';h.fields.forEach(f=>f.colName='survey')}
 const s=await h.load();expect(h.provider().forSnapshot(s)?.canEdit?.('saved-edit')??false).toBe(false);expect(h.writes).toEqual([])
})

it.each(['lost','wrong-id','readback-loss'] as const)('ambiguous %s remains uncertain without a second send',async mode=>{
 const h=mapChoiceDatetimeFixture(),a=h.provider().forSnapshot(await h.load())!
 expect(a).not.toBeNull();const execute=h.commands.execute.getMockImplementation()!
 h.commands.execute.mockImplementation(async req=>{const ack:any=await execute(req);if(mode==='lost')throw Error('lost');if(mode==='wrong-id')ack.data.id='foreign';if(mode==='readback-loss')delete h.record.exts.preserved;return ack})
 await expect(a.saveOnly({...a.initialValues!('saved-edit'),visitNotes:'once'},'saved-edit')).rejects.toThrow()
 expect(h.writes).toHaveLength(1);const next=h.provider().forSnapshot(await h.load())!
 expect(next.canEdit!('saved-edit')).toBe(false);expect(h.writes).toHaveLength(1)
})

it('does not accept a numeric radio ID or contradictory inline aliases',async()=>{
 const h=mapChoiceDatetimeFixture(),a=h.provider().forSnapshot(await h.load())!
 await expect(a.saveOnly({...a.initialValues!('saved-edit'),contactMode:1},'saved-edit')).rejects.toThrow()
 expect(h.writes).toEqual([])
 const inline=mapChoiceDatetimeFixture(true);inline.fields[0].options[0].code='different'
 expect(inline.provider().forSnapshot(await inline.load())).toBeNull();expect(inline.writes).toEqual([])
})

it.each(['actor','new-read'] as const)('late raw during %s cannot renew an old editor',async mode=>{
 const h=mapChoiceDatetimeFixture(),first=await h.load(),a=h.provider().forSnapshot(first)!,v=a.initialValues!('saved-edit')!
 const execute=h.transport.execute.getMockImplementation()!
 let entered!:()=>void,release!:()=>void,held=true
 const started=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r)
 h.transport.execute.mockImplementation(async req=>{const response=await execute(req);if(held&&req.path==='biz/extForm/findByIdWithWorkflow'){held=false;entered();await wait}return response})
 const pending=a.saveOnly(v,'saved-edit');const rejected=expect(pending).rejects.toThrow();await started
 if(mode==='actor')h.changeActor();else await h.load()
 release();await rejected;expect(h.writes).toEqual([])
})
