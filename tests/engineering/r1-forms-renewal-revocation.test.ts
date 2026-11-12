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

describe('controlled create renewal cannot mask observed external revocation',()=>{
 it.each((['choice','scalar'] as const).flatMap(mode=>(['before','after'] as const).map(stage=>({mode,stage}))))('control $mode $stage upsert keeps legitimate owned renewal usable',async({mode,stage})=>{
  const h=fixture();if(mode==='scalar')for(const f of h.fields){f.type='text';f.multiple=false;delete f.valueOption}
  const {a}=await h.start();expect(typeof a.updateCreateDraft).toBe('function');let ready!:()=>void,release!:()=>void,count=0
  const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
  h.hook(async path=>{if(path==='basic/serviceAppointment/queryById/s'&&++count===(stage==='before'?1:3)){ready();await gate}})
  const pending=a.saveOnly(mode==='scalar'?{renamedChecks:'plain',memo:'on'}:{renamedChecks:['c0'],renamedMulti:['c1']});await arrived
  expect(a.canCreate!()).toBe(false);release();await pending;expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it.each((['choice','scalar'] as const).flatMap(mode=>(['before','after'] as const).flatMap(stage=>(['switch','grant','actor'] as const).map(kind=>({mode,stage,kind})))))('observed $kind revocation in $mode while renewing $stage upsert remains revoked after restoration',async({mode,stage,kind})=>{
  const h=fixture();if(mode==='scalar')for(const f of h.fields){f.type='text';f.multiple=false;delete f.valueOption}
  const {a}=await h.start();expect(typeof a.updateCreateDraft).toBe('function');let ready!:()=>void,release!:()=>void,count=0
  const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
  h.hook(async path=>{if(path==='basic/serviceAppointment/queryById/s'&&++count===(stage==='before'?1:3)){ready();await gate}})
  const pending=a.saveOnly(mode==='scalar'?{renamedChecks:'plain',memo:'on'}:{renamedChecks:['c0'],renamedMulti:['c1']}),outcome=expect(pending).rejects.toThrow();await arrived
  if(kind==='switch')h.env.VITE_XLINK_R1_FORMS_ACTIONS='false'
  if(kind==='grant')h.env.VITE_XLINK_R1_FORMS_GRANT=''
  if(kind==='actor')h.role()
  expect(a.canCreate!()).toBe(false)
  if(kind==='switch')h.env.VITE_XLINK_R1_FORMS_ACTIONS='true'
  if(kind==='grant')h.grantUpdate()
  if(kind==='actor')h.restoreRole()
  release();await outcome;expect(wire.execute).toHaveBeenCalledTimes(stage==='before'?0:1)
  expect(a.locked()).toBe(true);const writes=wire.execute.mock.calls.length
  await expect(a.saveOnly({renamedChecks:['c0']})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(writes)
 })
})
