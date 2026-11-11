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
  {_id:'checks',name:'arbitraryToggle',type:'switch',multiple:false,preset:1},
  {_id:'multi',name:'arbitraryScore',type:'rate',multiple:false,preset:0},
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
   if(fault==='wrong-slot')delete saved.exts.arbitraryScore
   if(fault==='coerced')saved.arbitraryToggle=false
   if(fault==='extra-omitted'){saved.arbitraryScore=null;saved.exts.arbitraryScore=null}
   return{success:true,status:1,data:structuredClone(saved)}
  }
  if(req.path==='workflowNode/updateExts/n'){
   node.exts=structuredClone(req.jsonBody)
   if(fault==='readback')saved.exts.arbitraryScore=2
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

describe('ordinary configured Switch/Rate first-create',()=>{
 it('projects and saves arbitrary scalar keys from normal reader/provider with exact root/EXTS types',async()=>{
  const h=fixture(),{s,a}=await h.start();expect(a).not.toBeNull()
  expect(projectR1RepeatFields(s,{}).filter(f=>f.supported).map(f=>f.valueKey)).toEqual(['arbitraryToggle','arbitraryScore','memo'])
  expect(a.validateDraft!({arbitraryToggle:'0',arbitraryScore:5,memo:' keep '})).toBe(true)
  const after=await a.saveOnly({arbitraryToggle:'0',arbitraryScore:5,memo:' keep '})
  expect(after.records).toHaveLength(1);expect(h.saved()).toMatchObject({arbitraryToggle:'0',arbitraryScore:5,memo:'keep',exts:{arbitraryScore:5,memo:'keep'}})
  expect(wire.execute.mock.calls.map(([r])=>r.path)).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
  expect(h.provider.forSnapshot(after)).toBeNull();expect(a.canComplete!()).toBe(false)
 })
 it('omits optional absence and explicit empty without inventing initial score zero',async()=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!({arbitraryScore:'',memo:'empty'})).toBe(true)
  await a.saveOnly({arbitraryScore:'',memo:'empty'});expect(h.saved()).not.toHaveProperty('arbitraryScore');expect(h.saved().exts).not.toHaveProperty('arbitraryScore');expect(h.saved()).not.toHaveProperty('arbitraryToggle')
 })
 it.each(['switch','rate'])('keeps a single renamed %s field configuration driven',async type=>{
  const h=fixture(),f=h.fields.find(f=>f.type===type);h.fields.splice(0,h.fields.length,{...f,name:'renamed',preset:0})
  h.node.nodeDef.formFieldIdsFill=[f._id];h.grant.fieldIds=[f._id];h.grantUpdate()
  const {a}=await h.start();await a.saveOnly({renamed:type==='switch'?'1':3});expect(h.saved().renamed).toBe(type==='switch'?'1':3);expect(h.saved().exts.renamed).toBe(h.saved().renamed)
 })
})

it.each([null,undefined,0,1,true,false,'true','false',' 1 ','yes',[],{},NaN,Infinity])('rejects nonliteral Switch %j without commands',async value=>{
 const h=fixture(),{a}=await h.start();expect(a.validateDraft!({arbitraryToggle:value,memo:'keep'})).toBe(false);await expect(a.saveOnly({arbitraryToggle:value,memo:'keep'})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
})
it.each([null,undefined,0,6,-1,2.5,NaN,Infinity,-Infinity,true,false,'3','3.0',' 3 ',[],{}])('rejects noninteger or wrong-type Rate %j without commands',async value=>{
 const h=fixture(),{a}=await h.start();expect(a.validateDraft!({arbitraryScore:value,memo:'keep'})).toBe(false);await expect(a.saveOnly({arbitraryScore:value,memo:'keep'})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
})
it.each([1,2,3,4,5])('accepts exact integer score %i without changing its type',async score=>{const h=fixture(),{a}=await h.start();await a.saveOnly({arbitraryScore:score});expect(h.saved().arbitraryScore).toBe(score);expect(typeof h.saved().exts.arbitraryScore).toBe('number')})
it.each(['switch','rate'])('enforces required %s omission and blank but accepts its valid nonempty domain',async type=>{
 const h=fixture(),f=h.fields.find(f=>f.type===type);f.required='1';const {a}=await h.start()
 for(const values of [{memo:'missing'},{[f.name]:'',memo:'empty'}]){expect(a.validateDraft!(values)).toBe(false);await expect(a.saveOnly(values)).rejects.toThrow()}
 expect(wire.execute).not.toHaveBeenCalled();await a.saveOnly({[f.name]:type==='switch'?'0':1});expect(wire.execute).toHaveBeenCalledTimes(2)
})
it('preserves mixed scalar zero and verified Code single choice on arbitrary reordered fields',async()=>{
 const h=fixture(),base=h.fields[2];h.fields.unshift({...base,_id:'number',name:'zeroProof',type:'number',preset:1},{...base,_id:'pick',name:'codePick',type:'select',valueOption:'SYN_CODES',preset:0})
 h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id);h.grant.fieldIds=h.fields.map(f=>f._id);h.grantUpdate()
 const {a}=await h.start();await a.saveOnly({arbitraryToggle:'1',arbitraryScore:2,zeroProof:0,codePick:'c0'})
 expect(h.saved()).toMatchObject({zeroProof:0,codePick:'c0',exts:{codePick:'c0',arbitraryScore:2}})
})
it.each(['typed','special','repeat','v2','records','file','array','large','conditional','readonly','unknown-type','unknown-provider','front-config','rate-count','rate-half','switch-values','raw-alias','bad-slot','duplicate-key','duplicate-id'])('keeps %s outside this narrow capability',async kind=>{
 const h=fixture()
 if(kind==='typed')h.ext.type='1'
 if(kind==='special'){h.ext.colName='survey';h.fields.forEach(f=>f.colName='survey')}
 if(kind==='repeat')h.node.nodeDef.nodeType='repeat'
 if(kind==='v2'){h.grant.version=2;h.grant.recordIds=[];h.grantUpdate()}
 if(kind==='records')h.node.exts.formList=[{_id:'existing',formDefId:'e',state:1}]
 if(kind==='file')h.fields[2].type='file'
 if(kind==='array'){h.fields[2].type='select';h.fields[2].multiple=true;h.fields[2].valueOption='SYN_CODES'}
 if(kind==='large'){for(let i=3;i<51;i++)h.fields.push({...h.fields[2],_id:'field'+i,name:'value'+i});h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id)}
 if(kind==='conditional')Object.assign(h.fields[1],{showType:'3',showField:'arbitraryToggle',showValue:'1',showFieldPreset:1})
 if(kind==='readonly')h.fields[1].readOnly=1
 if(kind==='unknown-type')h.fields[2].type='unknown'
 if(kind==='unknown-provider')h.fields[1].valueOption='UNKNOWN'
 if(kind==='front-config')h.fields[1].frontEndConfig='{"count":10}'
 if(kind==='rate-count')h.fields[1].count=10
 if(kind==='rate-half')h.fields[1].allowHalf=true
 if(kind==='switch-values')h.fields[0].activeValue=true
 if(kind==='raw-alias'){delete h.fields[1].type;h.fields[1].fieldType='rate';h.fields[1].allowHalf=true}
 if(kind==='bad-slot')h.fields[1].preset='0'
 if(kind==='duplicate-key')h.fields[2].name=h.fields[1].name
 if(kind==='duplicate-id')h.fields[2]._id=h.fields[1]._id
 const result=await h.start().catch(()=>null)
 if(result)expect(result.a?.canCreate?.()??false).toBe(false)
 else expect(h.calls.length).toBeGreaterThan(0)
 expect(wire.execute).not.toHaveBeenCalled()
})
it.each(['required','readonly','preset','type','grant','field-id','options','config'])('rejects fresh %s drift before upsert',async kind=>{
 const h=fixture(),{a}=await h.start()
 if(kind==='required')h.fields[1].required='1'
 if(kind==='readonly')h.fields[1].readOnly=1
 if(kind==='preset')h.fields[1].preset=1
 if(kind==='type')h.fields[1].type='digit'
 if(kind==='field-id')h.fields[1]._id='changed'
 if(kind==='grant'){h.grant.fieldIds=['memo'];h.grantUpdate()}
 if(kind==='options')h.fields[1].valueOption='SYN_CODES'
 if(kind==='config')h.fields[1].frontEndConfig='{"allowHalf":true}'
 await expect(a.saveOnly({arbitraryToggle:'1',arbitraryScore:3})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
})
it.each(['coerced','wrong-slot','lost','readback','extra-omitted'])('locks %s receipt and never replays',async fault=>{
 const h=fixture(),{a}=await h.start();h.fault(fault)
 await expect(a.saveOnly(fault==='extra-omitted'?{arbitraryToggle:'1'}:{arbitraryToggle:'0',arbitraryScore:3})).rejects.toThrow()
 const n=wire.execute.mock.calls.length;expect(n).toBe(fault==='readback'?2:1);expect(a.locked()).toBe(true)
 await expect(a.saveOnly({arbitraryToggle:'0',arbitraryScore:3})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(n)
})
it.each(['before','after'])('owns its pending renewal and prevents duplicate save %s upsert',async stage=>{
 const h=fixture(),{a}=await h.start();let arrived!:()=>void,release!:()=>void,count=0
 const ready=new Promise<void>(r=>arrived=r),gate=new Promise<void>(r=>release=r)
 h.hook(async path=>{if(path==='basic/serviceAppointment/queryById/s'&&++count===(stage==='before'?1:3)){arrived();await gate}})
 const p=a.saveOnly({arbitraryToggle:'0',arbitraryScore:3});await ready;await expect(a.saveOnly({arbitraryToggle:'1'})).rejects.toThrow();release();await p;expect(wire.execute).toHaveBeenCalledTimes(2)
})
it.each(['before','after'].flatMap(stage=>['switch','grant','actor'].map(kind=>({stage,kind}))))('permanently invalidates observed $kind withdrawal $stage upsert',async({stage,kind})=>{
 const h=fixture(),{a}=await h.start();let arrived!:()=>void,release!:()=>void,count=0
 const ready=new Promise<void>(r=>arrived=r),gate=new Promise<void>(r=>release=r)
 h.hook(async path=>{if(path==='basic/serviceAppointment/queryById/s'&&++count===(stage==='before'?1:3)){arrived();await gate}})
 const p=a.saveOnly({arbitraryToggle:'0',arbitraryScore:3}),out=expect(p).rejects.toThrow();await ready
 if(kind==='switch')h.env.VITE_XLINK_R1_FORMS_ACTIONS='false';if(kind==='grant')h.env.VITE_XLINK_R1_FORMS_GRANT='';if(kind==='actor')h.role()
 expect(a.canCreate!()).toBe(false)
 if(kind==='switch')h.env.VITE_XLINK_R1_FORMS_ACTIONS='true';if(kind==='grant')h.grantUpdate();if(kind==='actor')h.restoreRole()
 release();await out;expect(wire.execute).toHaveBeenCalledTimes(stage==='before'?0:1);expect(a.locked()).toBe(true)
})
it('copies and stale callbacks do not acquire or recover normalizer authority',async()=>{
 const h=fixture(),{s,a}=await h.start();expect(a.updateCreateDraft!({},'arbitraryToggle','0')).toEqual({arbitraryToggle:'0'})
 expect(()=>normalizeR1RepeatValues({...s},{arbitraryToggle:'0'})).toThrow()
 h.unlist();expect(()=>a.updateCreateDraft!({},'arbitraryToggle','1')).toThrow();h.relist();expect(()=>a.updateCreateDraft!({},'arbitraryToggle','1')).toThrow()
 const fresh=await h.start();expect(fresh.a.updateCreateDraft!({},'arbitraryScore',2)).toEqual({arbitraryScore:2})
 expect(()=>a.updateCreateDraft!({},'arbitraryScore',2)).toThrow();expect(wire.execute).not.toHaveBeenCalled()
})
it('never converts edit/append/complete grants from the new first-create capability',async()=>{
 const h=fixture(),{a}=await h.start();await expect(a.complete()).rejects.toThrow();await expect(a.saveAndComplete!({arbitraryScore:3})).rejects.toThrow();await expect(a.saveOnly({arbitraryScore:3},'existing')).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
})
