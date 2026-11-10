import { beforeEach,afterEach,it,expect,vi } from 'vitest'
import { createNormalFormsActionProvider } from '@app/r1-forms-authorization'
import { genericMapFixture } from '../fixtures/generic-map-route'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'
const command=vi.hoisted(()=>({execute:vi.fn()}))
vi.mock('@adapters/api/uni-api-command-transport',()=>({createUniApiCommandTransport:()=>command}))
beforeEach(()=>{installLocalFixtureBrowser();command.execute.mockReset()})
afterEach(()=>vi.unstubAllGlobals())
async function harness(setup?:(h:ReturnType<typeof genericMapFixture>)=>void){
 const h=genericMapFixture(true),writes:string[]=[];let onWrite:((path:string)=>void)|undefined
 h.record.formTitle='Original independent title';h.node.exts.formList[0].formTitle='Different list title'
 h.node.exts.formList.push({_id:'deleted',formDefId:'e',state:-1,audit:{keep:true}})
 command.execute.mockImplementation(async req=>{writes.push(req.path)
  if(req.path==='biz/extForm/upsert/e'){const body=JSON.parse(req.body.dataStr);Object.keys(h.record).forEach(k=>delete h.record[k]);Object.assign(h.record,body);onWrite?.(req.path);return{success:true,status:1,data:{_id:'v'}}}
  if(req.path==='workflowNode/updateExts/n'){h.node.exts=structuredClone(req.jsonBody);return{success:true,status:1}}
  throw Error('Unknown command '+req.path)
 })
 setup?.(h)
 const snapshot=await h.reader.load('s','n'),provider=()=>createNormalFormsActionProvider({reader:h.reader,auth:h.auth,env:h.env,origin:h.origin})
 return{...h,snapshot,provider,writes,onWrite:(fn:(path:string)=>void)=>{onWrite=fn}}
}
it('edits through the actual reader/provider/actions only with private type0 route proof',async()=>{
 const h=await harness(),a=h.provider().forSnapshot(h.snapshot)!,before=structuredClone(h.record),oldExts=structuredClone(h.node.exts)
 expect(a.canEdit!('v')).toBe(true);expect(a.initialValues!('v')).toEqual({memo:'old'})
 const after=await a.saveOnly({memo:'new'},'v')
 expect(after.records[0]?.values?.memo).toBe('new')
 expect(h.record).toEqual({...before,memo:'new',smodule:'serviceAppointment',exts:{...before.exts,memo:'new'}})
 expect(h.node.exts).toEqual(oldExts);expect(h.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
})
it.each(['typed','numeric0','missing-colName','conflicting-colName','privacy','ext-id-alias','fake-marker'])('keeps %s existing records closed before transport',async kind=>{
 const h=await harness(h=>{
  if(kind==='typed'||kind==='fake-marker')h.ext.type='1'
  if(kind==='numeric0')h.ext.type=0
  if(kind==='missing-colName')delete h.fields[20].colName
  if(kind==='conflicting-colName')h.fields[20].colName='other'
  if(kind==='privacy'){h.ext.colName='serviceAppointment';h.fields.forEach(f=>{f.colName='serviceAppointment'})}
  if(kind==='ext-id-alias')h.ext.id='wrong'
  if(kind==='fake-marker'){h.ext.generic=true;h.record._class='generic';h.record.storageType='0'}
 });const a=h.provider().forSnapshot(h.snapshot)!
 ;(h.snapshot as any).generic=true
 expect(a.canEdit!('v')).toBe(false);expect(a.validateDraft!({memo:'new'},'v')).toBe(false)
 await expect(a.saveOnly({memo:'new'},'v')).rejects.toThrow();expect(h.writes).toEqual([])
})
it.each(['type','numeric0','colName','readonly','fillable','purpose','tenant','record','role','logout','grant'])('refuses fresh %s drift before the first write',async kind=>{
 const h=await harness(),a=h.provider().forSnapshot(h.snapshot)!
 if(kind==='type')h.ext.type='1'
 if(kind==='numeric0')h.ext.type=0
 if(kind==='colName'){h.ext.colName='other';h.fields.forEach(f=>{f.colName='other'})}
 if(kind==='readonly')h.fields[0].readOnly=1
 if(kind==='fillable')h.node.nodeDef.formFieldIdsFill=[]
 if(kind==='purpose'){h.ext.colName='survey';h.fields.forEach(f=>{f.colName='survey'})}
 if(kind==='tenant')h.ext.tenantId='other'
 if(kind==='record')h.record.sid='other'
 if(kind==='role')h.role()
 if(kind==='logout')h.logout()
 if(kind==='grant')h.env.VITE_XLINK_R1_FORMS_GRANT='{}'
 await expect(a.saveOnly({memo:'new'},'v')).rejects.toThrow();expect(h.writes).toEqual([])
})
it.each(['type','colName','readonly','purpose','role'])('keeps uncertain and stops EXTS after post-upsert %s drift',async kind=>{
 const h=await harness(),a=h.provider().forSnapshot(h.snapshot)!
 h.onWrite(()=>{
  if(kind==='type')h.ext.type='1'
  if(kind==='colName'){h.ext.colName='other';h.fields.forEach(f=>{f.colName='other'})}
  if(kind==='readonly')h.fields[0].readOnly=1
  if(kind==='purpose'){h.ext.colName='survey';h.fields.forEach(f=>{f.colName='survey'})}
  if(kind==='role')h.role()
 })
 await expect(a.saveOnly({memo:'new'},'v')).rejects.toThrow();expect(h.writes).toEqual(['biz/extForm/upsert/e']);expect(a.locked()).toBe(true)
 await expect(a.saveOnly({memo:'new'},'v')).rejects.toThrow();expect(h.writes).toHaveLength(1)
})
it('requires explicit fresh read for pre-dispatch recovery and never grants Workflow completion',async()=>{
 const h=await harness(),a=h.provider().forSnapshot(h.snapshot)!
 h.ext.type='1';await expect(a.saveOnly({memo:'new'},'v')).rejects.toThrow();expect(h.writes).toEqual([])
 h.ext.type='0';const fresh=await h.reader.load('s','n'),b=h.provider().forSnapshot(fresh)!
 expect(b.canEdit!('v')).toBe(true);expect(b.canComplete!()).toBe(false);expect(b.canSaveAndComplete!()).toBe(false)
 await expect(b.saveAndComplete!({memo:'new'},'v')).rejects.toThrow();expect(h.writes).toEqual([])
 await b.saveOnly({memo:'new'},'v');expect(h.writes).toHaveLength(2)
})
it('rejects ungranted and ACK-only IDs without changing the record',async()=>{
 const h=await harness(),a=h.provider().forSnapshot(h.snapshot)!
 for(const id of ['unknown','ack-only'])await expect(a.saveOnly({memo:'new'},id)).rejects.toThrow()
 expect(h.writes).toEqual([])
})
it('clears only the proven optional root/EXTS slots through the actual wire',async()=>{
 const h=await harness(h=>{h.fields[1].name='note';h.fields[1].readOnly=0;h.fields[1].preset=0;h.node.nodeDef.formFieldIdsFill.push('ro-1');h.node.nodeDef.formFieldIdsReadOnly=h.node.nodeDef.formFieldIdsReadOnly.filter((id:string)=>id!=='ro-1');const g=JSON.parse(h.env.VITE_XLINK_R1_FORMS_GRANT);g.fieldIds.push('ro-1');h.env.VITE_XLINK_R1_FORMS_GRANT=JSON.stringify(g);h.record.note='old optional';h.record.exts.note='old optional'})
 const a=h.provider().forSnapshot(h.snapshot)!,before=structuredClone(h.record);await a.saveOnly({note:'   '},'v')
 delete before.note;delete before.exts.note;expect(h.record).toEqual({...before,smodule:'serviceAppointment'});expect(h.writes).toHaveLength(2)
})
it('rejects a copied reader proof even when every visible property matches',async()=>{
 const h=await harness(),issue=h.reader.currentGenericMapRoute!.bind(h.reader)
 h.reader.currentGenericMapRoute=(s,id)=>{const e=issue(s,id);return e?{...e}:null}
 const a=h.provider().forSnapshot(h.snapshot)!;expect(a.canEdit!('v')).toBe(false)
 await expect(a.saveOnly({memo:'new'},'v')).rejects.toThrow();expect(h.writes).toEqual([])
})
it('does not resend unchanged original values as a no-op edit',async()=>{
 const h=await harness(),a=h.provider().forSnapshot(h.snapshot)!
 expect(a.validateDraft!({memo:'old'},'v')).toBe(false);await expect(a.saveOnly({memo:'old'},'v')).rejects.toThrow();expect(h.writes).toEqual([])
})
it('an unknown ACK cannot be replayed after a new authoritative read',async()=>{
 const h=await harness(),a=h.provider().forSnapshot(h.snapshot)!,execute=command.execute.getMockImplementation()!
 command.execute.mockImplementationOnce(async req=>{await execute(req);return{success:true,status:1,data:{_id:'wrong'}}})
 await expect(a.saveOnly({memo:'new'},'v')).rejects.toThrow();expect(a.locked()).toBe(true)
 const fresh=await h.reader.load('s','n'),b=h.provider().forSnapshot(fresh)!
 expect(b.locked()).toBe(true);await expect(b.saveOnly({memo:'another'},'v')).rejects.toThrow();expect(h.writes).toHaveLength(1)
})
