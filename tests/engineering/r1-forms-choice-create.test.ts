import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalFormsActionProvider } from '@app/r1-forms-authorization'
import { projectR1RepeatFields, updateR1FormDraftValue, normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'
const wire = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@adapters/api/uni-api-command-transport', () => ({ createUniApiCommandTransport: () => wire }))
const scope = { tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e' }
function fixture() {
 let actor:any = {sessionRef:'synthetic-choice-session',user:{id:'u'},currentRole:{id:'r'}}
 const fields:any[] = [
  {_id:'checks',name:'renamedChecks',type:'checkbox',multiple:true,preset:1},
  {_id:'multi',name:'renamedMulti',type:'select',multiple:true,preset:0},
  {_id:'memo',name:'memo',type:'text',multiple:false,preset:0},
 ].map(f=>({...f,tenantId:'t',extId:'e',colName:'syntheticChoices',state:1,required:'0',readOnly:0,nameDisp:f.name,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',...(['select','checkbox'].includes(f.type)?{valueOption:'SYN_CODES'}:{})}))
 const ext:any={_id:'e',tenantId:'t',type:'0',state:1,colName:'syntheticChoices'}
 const node:any={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}},nodeDef:{nodeType:'forms',name:'合成多选',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 const grant:any={version:1,scope,fieldIds:fields.map(f=>f._id),operations:['create'],expiresAt:'2099-01-01T00:00:00Z'}
 const env:any={DEV:true,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_MOCK:'false',VITE_XLINK_API_BASE_URL:'http://127.0.0.1:5189/xlink/wm',VITE_XLINK_AUTH_TENANT:'t',VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_FORMS_ACTIONS:'true',VITE_XLINK_R1_FORMS_GRANT:JSON.stringify(grant)}
 let saved:any=null,listed=true,fault='',hook:((path:string)=>Promise<void>)|undefined
 const calls:string[]=[],codes:any=Object.fromEntries(Array.from({length:31},(_,i)=>['c'+i,'合成'+i]))
 const rawRead=vi.fn(async(req:any)=>{
  calls.push(req.path);await hook?.(req.path)
  if(req.path==='basic/serviceAppointment/queryById/s')return{success:true,status:1,data:{serviceAppointment:{_id:'s',tenantId:'t',workflowId:'w',state:1},workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[structuredClone(node)]}}
  if(req.path==='biz/ext/queryById.do')return structuredClone(ext)
  if(req.path==='biz/extField/query')return{data:structuredClone(fields),total:fields.length,page:1,size:50}
  if(req.path==='i/code/selectCode.do')return[{codeId:fault==='provider'?'OTHER':'SYN_CODES',eleid:'SYN_CODES',options:{...codes}}]
  if(req.path==='biz/extForm/query/e')return{data:saved?[structuredClone(saved)]:[],total:saved?1:0,page:1,size:req.body.rows,dataCount:saved?1:0}
  throw Error('Unexpected synthetic read '+req.path)
 })
 wire.execute.mockImplementation(async(req:any)=>{
  await hook?.(req.path)
  if(req.path==='biz/extForm/upsert/e'){
   saved={...JSON.parse(req.body.dataStr),_id:'saved',tenantId:'t'}
   if(fault==='lost')throw Error('synthetic lost ACK')
   if(fault==='wrong-slot')saved.exts.renamedMulti=['c1']
   if(fault==='wrong-order')saved.renamedChecks.reverse()
   return{success:true,status:1,data:structuredClone(saved)}
  }
  if(req.path==='workflowNode/updateExts/n'){
   node.exts=structuredClone(req.jsonBody)
   if(fault==='readback')saved.renamedMulti=['c7']
   return{success:true,status:1}
  }
  throw Error('Forbidden synthetic command '+req.path)
 })
 const auth={getCurrentSession:()=>actor},reader=createNormalNodeFormsReader({auth,tenantId:'t',env,origin:'http://127.0.0.1:5189',transport:{execute:rawRead},read:{listWorkOrders:vi.fn(),isWorkOrderListedForCurrentSession:()=>listed,getDynamicCodeOptions:vi.fn()}})
 const provider=createNormalFormsActionProvider({auth,reader,env,origin:'http://127.0.0.1:5189'})
 const start=async()=>{const s=await reader.load('s','n');return{s,a:provider.forSnapshot(s)!}}
 return{reader,provider,fields,ext,node,grant,env,start,calls,codes,saved:()=>saved,clearSaved:()=>{saved=null;node.exts.formList=[]},grantUpdate:()=>{env.VITE_XLINK_R1_FORMS_GRANT=JSON.stringify(grant)},fault:(f:string)=>{fault=f},role:()=>{actor={...actor,currentRole:{id:'other'}}},restoreRole:()=>{actor={...actor,currentRole:{id:'r'}}},unlist:()=>{listed=false},relist:()=>{listed=true},hook:(v:typeof hook)=>{hook=v}}
}
beforeEach(()=>{installLocalFixtureBrowser();wire.execute.mockReset()})
afterEach(()=>vi.unstubAllGlobals())
describe('normal non-special type0 forms choice first-create',()=>{
 it('creates renamed Code arrays with scalar mixing through normal reader/provider and two-phase save',async()=>{
  const h=fixture(),{s,a}=await h.start();expect(a).not.toBeNull()
  expect(projectR1RepeatFields(s,{}).filter(f=>f.supported).map(f=>f.valueKey)).toEqual(['renamedChecks','renamedMulti','memo'])
  expect(a.validateDraft!({renamedChecks:['c2','c0'],renamedMulti:['c1'],memo:' synthetic '})).toBe(true)
  const after=await a.saveOnly({renamedChecks:['c2','c0'],renamedMulti:['c1'],memo:' synthetic '})
  expect(after.records).toHaveLength(1);expect(after.records[0]!.values).toMatchObject({renamedChecks:['c2','c0'],renamedMulti:['c1'],memo:'synthetic'})
  expect(h.saved()).toMatchObject({renamedChecks:['c2','c0'],renamedMulti:['c1'],exts:{renamedMulti:['c1'],memo:'synthetic'}})
  expect(wire.execute.mock.calls.map(([r])=>r.path)).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
  expect(h.node.exts.unknownNode).toEqual({keep:[0,false]})
  expect(h.provider.forSnapshot(after)).toBeNull();expect(a.canComplete!()).toBe(false)
 })
 it.each([1,3])('supports %i arbitrary configured arrays in reordered scalar mixtures',async count=>{
  const h=fixture(),base=h.fields[0];h.fields.splice(0,h.fields.length,...Array.from({length:count},(_,i)=>({...base,_id:'choice'+i,name:'arbitrary'+i,type:i%2?'select':'checkbox',preset:i%2})),{...base,_id:'text',name:'caption',type:'text',multiple:false,valueOption:''})
  h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id);h.grant.fieldIds=h.fields.map(f=>f._id);h.grantUpdate()
  const {a}=await h.start(),values=Object.fromEntries(h.fields.map(f=>[f.name,f.type==='text'?' synthetic ':['c2','c0']]))
  await a.saveOnly(values);expect(wire.execute).toHaveBeenCalledTimes(2)
  for(const f of h.fields){expect(h.saved()[f.name]).toEqual(f.type==='text'?'synthetic':['c2','c0']);if(f.preset===0)expect(h.saved().exts[f.name]).toEqual(h.saved()[f.name])}
 })
 it.each([null,undefined,'c0',0,false,['c0','c0'],[' c0'],[''],['UNKNOWN'],['c0',0],[{}],[['c0']],Array.from({length:31},(_,i)=>'c'+i)])('rejects malformed submitted array %j before any command',async value=>{
  const h=fixture(),{a}=await h.start(),v={renamedChecks:value,memo:'value'}
  expect(a.validateDraft!(v)).toBe(false);await expect(a.saveOnly(v)).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('omits optional empty and absent arrays but never emits null or an empty array wire',async()=>{
  const h=fixture(),{a}=await h.start();await a.saveOnly({renamedChecks:[],memo:'optional'})
  for(const k of ['renamedChecks','renamedMulti']){expect(h.saved()).not.toHaveProperty(k);expect(h.saved().exts).not.toHaveProperty(k)}
  expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it.each([undefined,[]])('required array rejects omission/empty %j',async value=>{
  const h=fixture();h.fields[0].required='1';const {a}=await h.start();await expect(a.saveOnly(value===undefined?{memo:'required'}:{renamedChecks:value,memo:'required'})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('accepts the existing 30-ID transport ceiling without sorting',async()=>{
  const h=fixture(),{a}=await h.start(),v=Array.from({length:30},(_,i)=>'c'+(29-i));await a.saveOnly({renamedChecks:v});expect(h.saved().renamedChecks).toEqual(v)
 })
 it.each(['survey','inspectionAppointment','serviceAppointment','typed','numeric-type','wrong-field-collection'])('does not infer an ordinary Map route from %s',async kind=>{
  const h=fixture();if(kind==='typed')h.ext.type='1';else if(kind==='numeric-type')h.ext.type=0;else if(kind==='wrong-field-collection')h.fields[0].colName='other';else{h.ext.colName=kind;h.fields.forEach(f=>f.colName=kind)}
  const {a}=await h.start();expect(a).toBeNull();expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each(['required','readonly','preset','provider-options','field-id','grant','hidden'])('rejects fresh %s drift before the first write',async kind=>{
  const h=fixture(),{a}=await h.start()
  if(kind==='required')h.fields[0].required='1'
  if(kind==='readonly')h.fields[0].readOnly=1
  if(kind==='preset')h.fields[0].preset=0
  if(kind==='provider-options')h.codes.c0='changed label'
  if(kind==='field-id')h.fields[0]._id='changed'
  if(kind==='grant'){h.grant.fieldIds=['memo'];h.grantUpdate()}
  if(kind==='hidden')h.fields[0].showList=['5']
  await expect(a.saveOnly({renamedChecks:['c0'],memo:'drift'})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each(['wrong-slot','wrong-order','lost','readback'])('locks %s outcomes and never automatically replays',async fault=>{
  const h=fixture(),{a}=await h.start();h.fault(fault)
  await expect(a.saveOnly({renamedChecks:['c2','c0'],renamedMulti:['c0']})).rejects.toThrow()
  expect(a.locked()).toBe(true);const n=wire.execute.mock.calls.length
  await expect(a.saveOnly({renamedChecks:['c0']})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(n)
  expect(n).toBe(fault==='readback'?2:1)
 })
 it('snapshots the draft arrays before an await and refuses duplicate clicks',async()=>{
  const h=fixture(),{a}=await h.start();let ready!:()=>void,release!:()=>void,once=true
  const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
  h.hook(async path=>{if(once&&path==='basic/serviceAppointment/queryById/s'){once=false;ready();await gate}})
  const values={renamedChecks:['c0']},pending=a.saveOnly(values);await arrived;values.renamedChecks.push('c1')
  await expect(a.saveOnly(values)).rejects.toThrow();release();await pending;expect(h.saved().renamedChecks).toEqual(['c0']);expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it('stops a late ACK after a role change before association or further reads',async()=>{
  const h=fixture(),{a}=await h.start();let ready!:()=>void,release!:()=>void
  const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
  h.hook(async path=>{if(path==='biz/extForm/upsert/e'){ready();await gate}})
  const pending=a.saveOnly({renamedChecks:['c0']}),out=expect(pending).rejects.toThrow();await arrived;h.role();release();await out;expect(wire.execute).toHaveBeenCalledTimes(1);expect(a.locked()).toBe(true)
 })
 it('rejects copied route evidence and permanently observed revoked source until a fresh load',async()=>{
  const h=fixture(),{s,a}=await h.start(),proof=h.reader.currentFormsCreateRoute!(s)!
  expect(h.reader.isCurrentFormsCreateRoute!(s,{...proof})).toBe(false)
  h.unlist();expect(h.reader.isCurrentFormsCreateRoute!(s,proof)).toBe(false);h.relist()
  expect(h.reader.isCurrentFormsCreateRoute!(s,proof)).toBe(false);expect(a.canCreate!()).toBe(false)
  expect((await h.start()).a?.canCreate!()).toBe(true);expect(wire.execute).not.toHaveBeenCalled()
 })
 it('clears only newly hidden first-create draft fields and keeps the writer strict',async()=>{
  const h=fixture();Object.assign(h.fields[0],{required:'1',showType:'3',showField:'memo',showValue:'on',showFieldPreset:0})
  const {s,a}=await h.start(),v={memo:'on',renamedChecks:['c0']};expect(a.validateDraft!(v)).toBe(true)
  const next=updateR1FormDraftValue(s,v,'memo','off');expect(next).toEqual({memo:'off'})
  expect(a.validateDraft!({memo:'off',renamedChecks:['c0']})).toBe(false)
  await a.saveOnly(next);expect(h.saved()).not.toHaveProperty('renamedChecks')
 })

 it.each(['provider','duplicate-key','duplicate-id','readonly','tool','raw-multiple','v2','expired','extra-draft'])('keeps %s unsupported without writes',async kind=>{
  const h=fixture()
  if(kind==='provider')h.fault('provider')
  if(kind==='duplicate-key')h.fields[1].name=h.fields[0].name
  if(kind==='duplicate-id')h.fields[1]._id=h.fields[0]._id
  if(kind==='readonly')h.fields[0].readOnly=1
  if(kind==='tool')h.fields[0].frontEndConfig='{"componentType":"unknown"}'
  if(kind==='raw-multiple')h.fields[1].multiple='true'
  if(kind==='v2'){h.grant.version=2;h.grant.recordIds=[];h.grantUpdate()}
  if(kind==='expired'){h.grant.expiresAt='2000-01-01T00:00:00Z';h.grantUpdate()}
  if(['provider','duplicate-id','expired'].includes(kind)){await expect(h.start()).rejects.toThrow()}
  else{const {a}=await h.start();if(kind==='extra-draft')await expect(a.saveOnly({renamedChecks:['c0'],tenantId:'foreign'})).rejects.toThrow();else expect(a).toBeNull()}
  expect(wire.execute).not.toHaveBeenCalled()
 })
 it('supports Checkbox with its Java default multiple=false and keeps completion/edit/append closed',async()=>{
  const h=fixture();h.fields[0].multiple=false;const {a}=await h.start()
  await expect(a.complete()).rejects.toThrow();await expect(a.saveAndComplete!({renamedChecks:['c0']})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
  await a.saveOnly({renamedChecks:['c0']});expect(wire.execute).toHaveBeenCalledTimes(2)
  await expect(a.saveOnly({renamedChecks:['c1']},'saved')).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(2)
 })

 it.each(['roleIds','calculateConfig','router'])('rejects unverified %s field behavior instead of dropping it',async key=>{
  const h=fixture();h.fields[0][key]=key==='roleIds'?['r']:'unknown behavior'
  expect((await h.start()).a).toBeNull();expect(wire.execute).not.toHaveBeenCalled()
 })

 it.each(['role','listed'])('does not revive the action after observed %s revocation and restoration',async kind=>{
  const h=fixture(),{a}=await h.start()
  if(kind==='role')h.role();else h.unlist()
  expect(a.canCreate!()).toBe(false)
  if(kind==='role')h.restoreRole();else h.relist()
  expect(a.canCreate!()).toBe(false)
  await expect(a.saveOnly({renamedChecks:['c0']})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
  expect((await h.start()).a?.canCreate!()).toBe(true)
 })

 it('consumes the create receipt durably even if a later synthetic list becomes empty',async()=>{
  const h=fixture(),{a}=await h.start();await a.saveOnly({renamedChecks:['c0']});expect(wire.execute).toHaveBeenCalledTimes(2)
  h.clearSaved();const renewed=(await h.start()).a!;expect(renewed.locked()).toBe(true)
  await expect(renewed.saveOnly({renamedChecks:['c1']})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(2)
 })

 it('atomically rejects trim-driven visibility revival using the real reader and normalizer',async()=>{
  const h=fixture();Object.assign(h.fields[0],{required:'1',showType:'3',showField:'memo',showValue:'on',showFieldPreset:0})
  const {s,a}=await h.start(),before={memo:'on',renamedChecks:['c0']};expect(a.validateDraft!(before)).toBe(true)
  expect(()=>updateR1FormDraftValue(s,before,'memo',' on ')).toThrow()
  expect(before).toEqual({memo:'on',renamedChecks:['c0']});expect(a.validateDraft!(before)).toBe(true)
  expect(()=>normalizeR1RepeatValues(s,{memo:' on '})).toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('atomically rejects empty omission changing a raw mapped exists(true) condition',async()=>{
  const h=fixture();Object.assign(h.fields[0],{required:'1',showType:'2',showField:'memo',showFieldPreset:0})
  const {s,a}=await h.start(),before={memo:'on',renamedChecks:['c0']}
  expect(s.definition.fields![0]!.visibility).toEqual({kind:'exists',path:'memo',expected:true})
  expect(a.validateDraft!(before)).toBe(true);expect(()=>updateR1FormDraftValue(s,before,'memo','')).toThrow()
  expect(before).toEqual({memo:'on',renamedChecks:['c0']});expect(wire.execute).not.toHaveBeenCalled()
 })
 it('guards exists(false) at the actual pure normalizer/updater seam without forging write proof',async()=>{
  const h=fixture(),{s}=await h.start()
  // Current raw mapper emits exists(true), not false. Explicit known schema
  // seam only; copied snapshot is never passed to a command provider.
  const copy={...s,definition:{...s.definition,fields:s.definition.fields!.map((f,i)=>i?f:{...f,required:true,visibility:{kind:'exists' as const,path:'memo',expected:false}})}}
  const before={renamedChecks:['c0']};expect(normalizeR1RepeatValues(copy,before)).toEqual(before)
  expect(()=>updateR1FormDraftValue(copy,before,'memo','')).toThrow()
  expect(before).toEqual({renamedChecks:['c0']});expect(()=>normalizeR1RepeatValues(copy,{memo:''})).toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('allows incomplete required drafts when no controlling visibility changes',async()=>{
  const h=fixture();h.fields[0].required='1';const {s}=await h.start()
  expect(updateR1FormDraftValue(s,{},'memo','typing')).toEqual({memo:'typing'})
  expect(()=>normalizeR1RepeatValues(s,{memo:'typing'})).toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })

})
