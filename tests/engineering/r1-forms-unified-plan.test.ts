import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalFormsActionProvider } from '@app/r1-forms-authorization'
import { projectR1RepeatFields, updateR1FormDraftValue, normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
import { createMediaQueueRepository, createMediaUploadQueue, InMemoryDurableMediaStore } from '@runtimes/media'
import { createCapabilityResult, asOpaqueId } from '@shared/types'
import type {StoragePort} from '@shared/ports'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'
const wire = vi.hoisted(() => ({ execute: vi.fn() }))
const external=vi.fn(()=>{throw Error('External network forbidden in synthetic mixed plan')})
vi.mock('@adapters/api/uni-api-command-transport', () => ({ createUniApiCommandTransport: () => wire }))
const scope = { tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e' }
function fixture() {
 let actor:any = {sessionRef:'synthetic-choice-session',user:{id:'u'},currentRole:{id:'r'}}
 const fields:any[] = [
  {_id:'checks',name:'renamedChecks',type:'checkbox',multiple:false,preset:1},
  {_id:'multi',name:'renamedMulti',type:'select',multiple:true,preset:0},
  {_id:'memo',name:'memo',type:'text',multiple:false,preset:0},
  {_id:'toggle',name:'independentFlag',type:'switch',multiple:false,preset:1},
  {_id:'score',name:'evidenceScore',type:'rate',multiple:false,preset:0},
  {_id:'photo',name:'sitePhoto',type:'file',multiple:false,preset:0},
  {_id:'path',name:'chosenPath',type:'cascade',multiple:false,preset:1,valueOption:'SYN_TREE'},
 ].map(f=>({...f,tenantId:'t',extId:'e',colName:'syntheticChoices',state:1,required:'0',readOnly:0,nameDisp:f.name,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',...(['select','checkbox'].includes(f.type)?{valueOption:'SYN_CODES'}:{})}))
 const ext:any={_id:'e',tenantId:'t',type:'0',state:1,colName:'syntheticChoices'}
 const node:any={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}},nodeDef:{nodeType:'forms',name:'合成多选',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 const grant:any={version:1,scope,fieldIds:fields.map(f=>f._id),operations:['create'],expiresAt:'2099-01-01T00:00:00Z'}
 const env:any={DEV:true,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_MOCK:'false',VITE_XLINK_API_BASE_URL:'http://127.0.0.1:5189/xlink/wm',VITE_XLINK_AUTH_TENANT:'t',VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_FORMS_ACTIONS:'true',VITE_XLINK_R1_FORMS_GRANT:JSON.stringify(grant)}
 let membershipCalls=0,falseMembershipCalls=0
 let saved:any=null,listed=true,fault='',hook:((path:string)=>Promise<void>)|undefined
 const calls:string[]=[],codes:any=Object.fromEntries(Array.from({length:31},(_,i)=>['c'+i,'合成'+i]))
 const group:any={_id:'G',type:'SYN_TREE',tenantId:'t',children:[{_id:'N',value:'same',name:'root',parentId:'G',type:'SYN_TREE',children:[{_id:'B',value:'same',name:'branch',parentId:'N',type:'SYN_TREE',children:[{_id:'L',value:'leaf',name:'leaf',parentId:'B',type:'SYN_TREE',children:[]}]}]},{_id:'R',value:'root-leaf',name:'root-leaf',parentId:'G',type:'SYN_TREE',children:[]}]}
 const rawRead=vi.fn(async(req:any)=>{
  calls.push(req.path);await hook?.(req.path)
  if(req.path==='basic/serviceAppointment/queryById/s')return{success:true,status:1,data:{serviceAppointment:{_id:'s',tenantId:'t',workflowId:'w',state:1},workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[structuredClone(node)]}}
  if(req.path==='biz/ext/queryById.do')return structuredClone(ext)
  if(req.path==='biz/extField/query')return{data:structuredClone(fields),total:fields.length,page:1,size:50}
  if(req.path==='i/code/selectMultistageCode.do')return[structuredClone(group)]
  if(req.path==='i/code/selectCode.do')return[{codeId:fault==='provider'?'OTHER':'SYN_CODES',eleid:'SYN_CODES',options:{...codes}}]
  if(req.path==='biz/extForm/query/e')return{data:saved?[structuredClone(saved)]:[],total:saved?1:0,page:1,size:req.body.rows,dataCount:saved?1:0}
  throw Error('Unexpected synthetic read '+req.path)
 })
 wire.execute.mockImplementation(async(req:any)=>{
  await hook?.(req.path)
  if(req.path==='biz/extForm/upsert/e'){
   saved={...JSON.parse(req.body.dataStr),_id:'saved',tenantId:'t'}
   if(fault==='lost')throw Error('synthetic lost ACK')
   if(fault==='wrong-slot')saved.exts.renamedMulti=['c7']
   if(fault==='wrong-order')saved.renamedChecks.reverse()
   if(fault==='rate-string')saved.evidenceScore=saved.exts.evidenceScore='4'
   if(fault==='rate-fraction')saved.evidenceScore=saved.exts.evidenceScore=2.5
   if(fault==='switch-boolean')saved.independentFlag=false
   if(fault==='switch-number')saved.independentFlag=0
   if(fault==='optional-null')saved.renamedMulti=null
   if(fault==='scope')saved.nodeId='other'
   return{success:true,status:1,data:structuredClone(saved)}
  }
  if(req.path==='workflowNode/updateExts/n'){
   node.exts=structuredClone(req.jsonBody)
   if(fault==='readback')saved.renamedMulti=['c7']
   if(fault==='readback-scalar')saved.evidenceScore=saved.exts.evidenceScore=5
   return{success:true,status:1}
  }
  throw Error('Forbidden synthetic command '+req.path)
 })
 const auth={getCurrentSession:()=>actor},reader=createNormalNodeFormsReader({auth,tenantId:'t',env,origin:'http://127.0.0.1:5189',transport:{execute:rawRead},read:{listWorkOrders:vi.fn(),isWorkOrderListedForCurrentSession:()=>{membershipCalls++;if(!listed)falseMembershipCalls++;return listed},getDynamicCodeOptions:vi.fn()}})
 const memory=new Map<string,unknown>();const storage:StoragePort={read:async<T>(k:{key:string})=>({state:'succeeded',data:structuredClone(memory.get(k.key)??null) as T|null}),write:async(k,v)=>{memory.set(k.key,structuredClone(v));return{state:'succeeded'}},remove:async k=>{memory.delete(k.key);return{state:'succeeded'}},listKeys:async()=>({state:'succeeded',data:[...memory.keys()]})}
 const repository=createMediaQueueRepository(storage),queue=createMediaUploadQueue(new InMemoryDurableMediaStore(),repository,{upload:async media=>({state:'succeeded',data:{url:'https://upload.invalid/'+media.ref+'.png',key:media.ref+'.png',extension:'png',mimeType:'image/png',source:media.source,uploadState:'uploaded'}})})
 let sequence=0;const picker={pick:vi.fn(async()=>createCapabilityResult('media_file_picker','granted',[{ref:asOpaqueId<'LocalMediaRef'>('synthetic-'+(++sequence)),source:'library' as const,mimeType:'image/png',localPath:'/synthetic/'+sequence+'.png',name:sequence+'.png',size:100}]))}
 const provider=createNormalFormsActionProvider({auth,reader,env,origin:'http://127.0.0.1:5189',media:{picker,queue}})
 const start=async()=>{const s=await reader.load('s','n');return{s,a:provider.forSnapshot(s)!}}
 return{group,queue,picker,repository,membership:()=>({calls:membershipCalls,falseCalls:falseMembershipCalls}),user:()=>{actor={...actor,user:{...actor.user,id:'other'}}},restoreUser:()=>{actor={...actor,user:{...actor.user,id:'u'}}},rawRead,reader,provider,fields,ext,node,grant,env,start,calls,codes,saved:()=>saved,clearSaved:()=>{saved=null;node.exts.formList=[]},grantUpdate:()=>{env.VITE_XLINK_R1_FORMS_GRANT=JSON.stringify(grant)},fault:(f:string)=>{fault=f},role:()=>{actor={...actor,currentRole:{id:'other'}}},restoreRole:()=>{actor={...actor,currentRole:{id:'r'}}},unlist:()=>{listed=false},relist:()=>{listed=true},hook:(v:typeof hook)=>{hook=v}}
}
beforeEach(()=>{installLocalFixtureBrowser();wire.execute.mockReset();external.mockClear();vi.stubGlobal('fetch',external)})
afterEach(()=>{expect(external).not.toHaveBeenCalled();expect(wire.execute.mock.calls.some(([r])=>/process|upload|delete|upToken/i.test(r.path))).toBe(false);vi.unstubAllGlobals()})

const values=()=>({renamedChecks:['c2','c0'],renamedMulti:['c1'],memo:' synthetic ',independentFlag:'0',evidenceScore:4,chosenPath:['same','same','leaf']})
describe('ordinary unified field plan through real reader/provider',()=>{
 it.each(['configured','renamed-reordered'])('opens all configured fields together %s',async mode=>{
  const h=fixture();if(mode==='renamed-reordered'){h.fields.reverse();h.fields.forEach((f,i)=>f.name='arbitrary_'+i)}
  const {s,a}=await h.start();expect(a).not.toBeNull();expect(projectR1RepeatFields(s,{}).filter(f=>f.supported)).toHaveLength(7);expect(a.fileMedia).toBeDefined();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('normalizes and saves file Code state and complete path in one receipt pipeline',async()=>{
  const h=fixture(),{s,a}=await h.start();expect(a).not.toBeNull();const files=await a.fileMedia!.pick('photo',values());expect(files).toHaveLength(1)
  const v={...values(),sitePhoto:files};expect(a.fileMedia!.ready(v)).toBe(true);expect(a.validateDraft!(v)).toBe(true)
  const out=await a.saveOnly(v);expect(out.records).toHaveLength(1);expect(h.saved().chosenPath).toEqual(['same','same','leaf']);expect(h.saved().exts.renamedMulti).toEqual(['c1']);expect(h.saved().exts.sitePhoto).toEqual(files);expect(wire.execute).toHaveBeenCalledTimes(2)
 })
})

describe('per-field guards on the same eligible ordinary plan',()=>{
 const supported=async(h=fixture())=>{const {s,a}=await h.start();expect(a).not.toBeNull();expect(a.validateDraft!(values())).toBe(true);return{h,s,a}}
 it.each(['text','switch','rate','checkbox','select','cascade','file'])('single configured %s uses the same provider pipeline',async kind=>{
  const h=fixture(),f=h.fields.find(f=>f.type===kind)!;h.fields.splice(0,h.fields.length,f);h.grant.fieldIds=[f._id];h.node.nodeDef.formFieldIdsFill=[f._id];h.grantUpdate();const {a}=await h.start();expect(a).not.toBeNull()
  let value:any=kind==='file'?(await a.fileMedia!.pick(f._id,{})):kind==='switch'?'0':kind==='rate'?4:kind==='cascade'?['same','same','leaf']:['checkbox','select'].includes(kind)?['c2','c0']:' scalar '
  await a.saveOnly({[f.name]:value});expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it.each([true,false,0,1,'true','false',' 0',null,undefined,{},[]])('strict Switch rejects %j after full mixed positive',async bad=>{
  const {a}=await supported();const v={...values(),independentFlag:bad};expect(a.validateDraft!(v)).toBe(false);await expect(a.saveOnly(v)).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each([0,6,-1,1.5,NaN,Infinity,'4',false,null,undefined])('strict Rate rejects %j',async bad=>{
  const {a}=await supported();await expect(a.saveOnly({...values(),evidenceScore:bad})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each(['renamedChecks','renamedMulti'])('scoped Code membership/order/duplicate guards for %s',async key=>{
  const {a}=await supported();for(const bad of [['UNKNOWN'],['c0','c0'],[' c0'],[''],[0],null,undefined,'c0',Array.from({length:31},(_,i)=>'c'+i)]){
   expect(a.validateDraft!({...values(),[key]:bad})).toBe(false);await expect(a.saveOnly({...values(),[key]:bad})).rejects.toThrow()
  }expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each([['same'],['same','same'],['leaf','same'],['same','leaf'],['root-leaf','leaf'],['other'],null,undefined,'root-leaf',[],['same','same','leaf','leaf']])('full-path validator rejects malformed/incomplete required %j',async bad=>{
  const h=fixture();h.fields.find(f=>f.type==='cascade')!.required='1';const {a}=await supported(h);await expect(a.saveOnly({...values(),chosenPath:bad})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('root leaf and optional omissions preserve both slots without defaults',async()=>{
  const h=fixture();h.fields.find(f=>f.type==='cascade')!.preset=0;const {a}=await supported(h);await a.saveOnly({memo:'kept',chosenPath:['root-leaf'],renamedChecks:[],renamedMulti:[],independentFlag:'',evidenceScore:'',sitePhoto:[]})
  expect(h.saved().chosenPath).toEqual(['root-leaf']);expect(h.saved().exts.chosenPath).toEqual(['root-leaf']);for(const k of ['renamedChecks','renamedMulti','independentFlag','evidenceScore','sitePhoto']){expect(h.saved()).not.toHaveProperty(k);expect(h.saved().exts).not.toHaveProperty(k)}
 })
 it.each(['renamedChecks','renamedMulti','independentFlag','evidenceScore','chosenPath','sitePhoto'])('required %s may not omit or clear',async key=>{
  const h=fixture();h.fields.find(f=>f.name===key)!.required='1';const {a}=await h.start();expect(a).not.toBeNull();let good:any=values();if(key==='sitePhoto')good.sitePhoto=await a.fileMedia!.pick('photo',good);expect(a.validateDraft!(good)).toBe(true)
  const missing={...good};delete missing[key];expect(a.validateDraft!(missing)).toBe(false);expect(a.validateDraft!({...good,[key]:['independentFlag','evidenceScore'].includes(key)?'':[]})).toBe(false);expect(wire.execute).not.toHaveBeenCalled()
 })
 it('requires exact session receipts even for structurally valid URLs and omitted optional fields',async()=>{
  const {a}=await supported();const forged=[{url:'https://upload.invalid/not-owned.png',name:'not-owned.png',extname:'png'}]
  expect(a.validateDraft!({...values(),sitePhoto:forged})).toBe(true);await expect(a.saveOnly({...values(),sitePhoto:forged})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('does not bypass an owned completed file by omitting its optional key',async()=>{
  const {a}=await supported();expect(await a.fileMedia!.pick('photo',values())).toHaveLength(1);expect(a.fileMedia!.ready(values())).toBe(false);await expect(a.saveOnly(values())).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('clones caller arrays before fresh read and serializes a duplicate save once',async()=>{
  const {h,a}=await supported();let release!:()=>void,ready!:()=>void;const gate=new Promise<void>(r=>release=r),arrived=new Promise<void>(r=>ready=r);let once=false
  h.hook(async path=>{if(!once&&path==='basic/serviceAppointment/queryById/s'){once=true;ready();await gate}});const v=values(),p=a.saveOnly(v);await arrived;v.renamedChecks.reverse();v.chosenPath.reverse();const duplicate=expect(a.saveOnly(v)).rejects.toThrow();release();await p;await duplicate
  expect(h.saved().renamedChecks).toEqual(['c2','c0']);expect(h.saved().chosenPath).toEqual(['same','same','leaf']);expect(wire.execute).toHaveBeenCalledTimes(2);await expect(a.saveOnly(values())).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it.each(['switch','grant','actor','listed'])('observed %s revocation/restoration stays closed',async kind=>{
  const {h,a}=await supported();if(kind==='switch')h.env.VITE_XLINK_R1_FORMS_ACTIONS='false';if(kind==='grant')h.env.VITE_XLINK_R1_FORMS_GRANT='';if(kind==='actor')h.role();if(kind==='listed')h.unlist();expect(a.canCreate!()).toBe(false)
  if(kind==='switch')h.env.VITE_XLINK_R1_FORMS_ACTIONS='true';if(kind==='grant')h.grantUpdate();if(kind==='actor')h.restoreRole();if(kind==='listed')h.relist();await expect(a.saveOnly(values())).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each([1,3])('observed switch withdrawal during owned read%i cannot revive',async pause=>{
  const {h,a}=await supported();let release!:()=>void,ready!:()=>void,count=0;const gate=new Promise<void>(r=>release=r),arrived=new Promise<void>(r=>ready=r)
  h.hook(async path=>{if(path==='basic/serviceAppointment/queryById/s'&&++count===pause){ready();await gate}});const p=a.saveOnly(values()),rejected=expect(p).rejects.toThrow();await arrived;h.env.VITE_XLINK_R1_FORMS_ACTIONS='false';expect(a.canCreate!()).toBe(false);h.env.VITE_XLINK_R1_FORMS_ACTIONS='true';release();await rejected;expect(wire.execute).toHaveBeenCalledTimes(pause===1?0:1);expect(a.locked()).toBe(true)
 })
 it.each(['required','preset','readonly','Code','tree','max','type','tool','grant','records'])('fresh %s drift stops before first command',async kind=>{
  const {h,a}=await supported();if(kind==='required')h.fields[0].required='1';if(kind==='preset')h.fields[0].preset=0;if(kind==='readonly')h.fields[0].readOnly=1;if(kind==='Code')delete h.codes.c0;if(kind==='tree')h.group.children[0].children[0].children[0].name='changed';if(kind==='max')h.fields.find(f=>f.type==='file')!.frontEndConfig='{"max":1}';if(kind==='type')h.fields[0].type='map';if(kind==='tool')h.fields[0].surveyTool=true;if(kind==='grant'){h.grant.fieldIds.pop();h.grantUpdate()};if(kind==='records')h.node.exts.formList=[{_id:'unknown',formDefId:'e',state:1}]
  await expect(a.saveOnly(values())).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each(['wrong-slot','wrong-order','rate-string','switch-boolean','optional-null','readback','readback-scalar','lost'])('raw ACK/readback %s locks exact uncertain boundary',async fault=>{
  const {h,a}=await supported();h.fault(fault);await expect(a.saveOnly(values())).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(fault.startsWith('readback')?2:1);expect(a.locked()).toBe(true);await expect(a.saveOnly(values())).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(fault.startsWith('readback')?2:1)
 })
 it('file ACK type mismatch fails even when the mapper retains a valid EXTS copy',async()=>{
  const {h,a}=await supported();const f=await a.fileMedia!.pick('photo',values());const execute=wire.execute.getMockImplementation()!;wire.execute.mockImplementation(async req=>{const v:any=await execute(req);if(req.path.includes('upsert'))v.data.sitePhoto=[];return v});await expect(a.saveOnly({...values(),sitePhoto:f})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(1)
 })
 it('conditional scalar/array states clean hidden drafts and reject trim/omission revival atomically',async()=>{
  const h=fixture();h.fields.find(f=>f.name==='renamedChecks')!.showType='3';Object.assign(h.fields[0],{showField:'memo',showValue:'on',showFieldPreset:0});const {s,a}=await h.start();expect(a).not.toBeNull();const initial:any={memo:'on',renamedChecks:['c0'],independentFlag:'0'}
  expect(a.updateCreateDraft!(initial,'memo','off')).toEqual({memo:'off',independentFlag:'0'});expect(initial.renamedChecks).toEqual(['c0']);expect(()=>a.updateCreateDraft!(initial,'memo',' on ')).toThrow();expect(initial).toEqual({memo:'on',renamedChecks:['c0'],independentFlag:'0'});expect(normalizeR1RepeatValues(s,{memo:'off',independentFlag:'0'})).toEqual({memo:'off',independentFlag:'0'})
 })
})

it('retains only existing default-image raw defaults, never transfers them to another field',async()=>{
 const h=fixture(),photo=h.fields.find(f=>f.type==='file')!;delete photo.multiple;delete photo.operationType;photo.required=0;const {a}=await h.start();expect(a).not.toBeNull();const f=await a.fileMedia!.pick('photo',values());await a.saveOnly({...values(),sitePhoto:f});expect(wire.execute).toHaveBeenCalledTimes(2)
})
it.each(['switch','rate','checkbox','cascade'])('does not infer omitted raw multiple for %s from a neighboring image',async type=>{
 const h=fixture();delete h.fields.find(f=>f.type===type)!.multiple;const {a}=await h.start();expect(a).toBeNull();expect(wire.execute).not.toHaveBeenCalled()
})
it.each(['{"max":1}','{"max":0}'])('validates file max config %s independently of other field kinds',async config=>{
 const h=fixture();h.fields.find(f=>f.type==='file')!.frontEndConfig=config;const {a}=await h.start();expect(a).not.toBeNull();if(config==='{"max":0}'){expect(a.fileMedia!.canPick('photo',values())).toBe(false);await a.saveOnly(values())}else{const f=await a.fileMedia!.pick('photo',values());expect(f).toHaveLength(1);expect(a.fileMedia!.canPick('photo',{...values(),sitePhoto:f})).toBe(false);await a.saveOnly({...values(),sitePhoto:f})};expect(wire.execute).toHaveBeenCalledTimes(2)
})
it.each(['{"fileType":"image"}','{"surveyTool":true}','{"max":11}','{"max":"1"}','{"unknown":true}'])('unknown file capability %s stays closed before picker',async config=>{
 const h=fixture();h.fields.find(f=>f.type==='file')!.frontEndConfig=config;const {a}=await h.start();expect(a).toBeNull();expect(h.picker.pick).not.toHaveBeenCalled();expect(wire.execute).not.toHaveBeenCalled()
})
it('observed metadata restoration does not revive old proof, a fresh load gets a new proof',async()=>{
 const h=fixture(),{s,a}=await h.start();expect(a).not.toBeNull();const old=s.definition.fields![0]!.label;Object.assign(s.definition.fields![0]!,{label:'changed'});expect(projectR1RepeatFields(s,{})).toEqual([]);Object.assign(s.definition.fields![0]!,{label:old});expect(projectR1RepeatFields(s,{})).toEqual([]);expect(a.canCreate!()).toBe(false);const fresh=await h.start();expect(fresh.a).not.toBeNull();expect(fresh.a.validateDraft!(values())).toBe(true);expect(projectR1RepeatFields(s,{})).toEqual([]);expect(wire.execute).not.toHaveBeenCalled()
})

it('actual mapped exists condition rejects raw whitespace becoming empty/omitted wire context',async()=>{
 const h=fixture();Object.assign(h.fields[0],{showType:'2',showField:'memo',showValue:'$exist',showFieldPreset:0})
 const {s,a}=await h.start();expect(a).not.toBeNull();expect(s.definition.fields![0]!.visibility).toEqual({kind:'exists',path:'memo',expected:true})
 const before:any={memo:'on',renamedChecks:['c0'],independentFlag:'0'};expect(()=>a.updateCreateDraft!(before,'memo',' ')).toThrow();expect(before).toEqual({memo:'on',renamedChecks:['c0'],independentFlag:'0'});expect(wire.execute).not.toHaveBeenCalled()
})

it.each(['scalar-required','scalar-operation','scalar-multiple','choice-required','choice-operation','choice-multiple','custom-tool'])('file default compatibility never repairs unrelated %s metadata',async kind=>{
 const h=fixture(),file=h.fields.find(f=>f.type==='file')!;delete file.multiple;delete file.operationType;file.required=0
 const baseline=await h.start();expect(baseline.a).not.toBeNull();expect(baseline.a.validateDraft!(values())).toBe(true)
 const f=h.fields.find(f=>f.type===(kind.startsWith('choice')?'checkbox':'text'))!
 if(kind.endsWith('required'))delete f.required;if(kind.endsWith('operation'))delete f.operationType;if(kind.endsWith('multiple'))delete f.multiple;if(kind==='custom-tool')f.componentType='unknown'
 await expect(baseline.a.saveOnly(values())).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
})
it('v2 never selects the new field capability at provider creation',async()=>{
 const h=fixture();h.grant.version=2;h.grant.recordIds=[];h.grantUpdate();const {a}=await h.start();expect(a).toBeNull();expect(wire.execute).not.toHaveBeenCalled()
})
it.each([1,3])('fresh v2 grant cannot replace v1 during owned read%i',async pause=>{
 const h=fixture(),{a}=await h.start();expect(a).not.toBeNull();let release!:()=>void,ready!:()=>void,count=0;const gate=new Promise<void>(r=>release=r),arrived=new Promise<void>(r=>ready=r)
 h.hook(async path=>{if(path==='basic/serviceAppointment/queryById/s'&&++count===pause){ready();await gate}});const p=a.saveOnly(values()),rejected=expect(p).rejects.toThrow();await arrived;h.grant.version=2;h.grant.recordIds=[];h.grantUpdate();expect(a.canCreate!()).toBe(false);h.grant.version=1;delete h.grant.recordIds;h.grantUpdate();release();await rejected;expect(wire.execute).toHaveBeenCalledTimes(pause===1?0:1);expect(a.locked()).toBe(true)
})

it('a bare ID ACK cannot replace exact raw declared slots before the second write',async()=>{
 const h=fixture(),{a}=await h.start();expect(a).not.toBeNull();wire.execute.mockResolvedValueOnce({success:true,status:1,data:{_id:'saved'}});await expect(a.saveOnly(values())).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(1);expect(a.locked()).toBe(true)
})
it('file max3 accepts three exact owned receipts and blocks a fourth without changing Code semantics',async()=>{
 const h=fixture();h.fields.find(f=>f.type==='file')!.frontEndConfig='{"max":3}';const {a}=await h.start();expect(a).not.toBeNull()
 h.picker.pick.mockResolvedValueOnce(createCapabilityResult('media_file_picker','granted',Array.from({length:3},(_,i)=>({ref:asOpaqueId<'LocalMediaRef'>('max-'+i),source:'library' as const,mimeType:'image/png',localPath:'/synthetic/max-'+i+'.png',name:'max-'+i+'.png',size:100}))))
 const files=await a.fileMedia!.pick('photo',values());expect(files).toHaveLength(3);expect(a.fileMedia!.canPick('photo',{...values(),sitePhoto:files})).toBe(false);await a.saveOnly({...values(),sitePhoto:files});expect(h.saved().sitePhoto).toEqual(files);expect(wire.execute).toHaveBeenCalledTimes(2)
})
it('an optional pending picker cannot be hidden by omission and a cancelled late picker never creates a receipt',async()=>{
 const h=fixture(),{a}=await h.start();expect(a).not.toBeNull();let release!:(v:any)=>void;const gate=new Promise<any>(r=>release=r);h.picker.pick.mockImplementationOnce(()=>gate)
 const picking=a.fileMedia!.pick('photo',values());await vi.waitFor(()=>expect(h.picker.pick).toHaveBeenCalledTimes(1));expect(a.fileMedia!.ready(values())).toBe(false)
 await expect(a.saveOnly(values())).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled();const cancelled=a.fileMedia!.cancel();release(createCapabilityResult('media_file_picker','cancelled'));await picking;expect(await cancelled).toBe(true);expect(a.fileMedia!.values('photo')).toEqual([])
})

it('conditional file omission cannot silently hide an owned receipt; provider leaves draft atomic',async()=>{
 const h=fixture();Object.assign(h.fields.find(f=>f.type==='file')!,{showType:'3',showField:'memo',showValue:'on',showFieldPreset:0});const {a}=await h.start();expect(a).not.toBeNull();const initial:any={...values(),memo:'on'};const files=await a.fileMedia!.pick('photo',initial);expect(files).toHaveLength(1);initial.sitePhoto=files
 expect(()=>a.updateCreateDraft!(initial,'memo','off')).toThrow();expect(initial.memo).toBe('on');expect(initial.sitePhoto).toEqual(files);expect(wire.execute).not.toHaveBeenCalled();expect(await a.fileMedia!.cancel()).toBe(true)
 expect(a.updateCreateDraft!({...initial,sitePhoto:[]},'memo','off')).toMatchObject({memo:'off'});expect(wire.execute).not.toHaveBeenCalled()
})

it.each(['Code','path'])('unchanged owned file receipt cannot mask %s drift before second command',async kind=>{
 const h=fixture(),{a}=await h.start();expect(a).not.toBeNull();const files=await a.fileMedia!.pick('photo',values());let count=0
 h.hook(async path=>{if(path==='basic/serviceAppointment/queryById/s'&&++count===3){if(kind==='Code')delete h.codes.c0;else h.group.children[0].children[0].children[0].value='different-leaf'}})
 await expect(a.saveOnly({...values(),sitePhoto:files})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(1);expect(h.saved().sitePhoto).toEqual(files);expect(a.locked()).toBe(true);await expect(a.saveOnly({...values(),sitePhoto:files})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(1)
})
it('copies file descriptors before the first await just like ordered string arrays',async()=>{
 const h=fixture(),{a}=await h.start();expect(a).not.toBeNull();const files=await a.fileMedia!.pick('photo',values());const caller:any={...values(),sitePhoto:files!.map(f=>({...f}))};let release!:()=>void,ready!:()=>void,once=false;const gate=new Promise<void>(r=>release=r),arrived=new Promise<void>(r=>ready=r)
 h.hook(async path=>{if(!once&&path==='basic/serviceAppointment/queryById/s'){once=true;ready();await gate}});const saving=a.saveOnly(caller);await arrived;caller.sitePhoto[0].url='https://upload.invalid/forged.png';caller.renamedChecks.reverse();release();await saving;expect(h.saved().sitePhoto).toEqual(files);expect(h.saved().renamedChecks).toEqual(['c2','c0']);expect(wire.execute).toHaveBeenCalledTimes(2)
})
it('a copied receipt cannot move to a different configured field',async()=>{
 const h=fixture(),file={...h.fields.find(f=>f.type==='file'),_id:'other-photo',name:'otherPhoto',nameDisp:'otherPhoto'};h.fields.push(file);h.grant.fieldIds.push(file._id);h.node.nodeDef.formFieldIdsFill.push(file._id);h.grantUpdate();const {a}=await h.start();expect(a).not.toBeNull();const files=await a.fileMedia!.pick('photo',values()),draft={...values(),sitePhoto:files,otherPhoto:files};expect(a.fileMedia!.ready(draft)).toBe(false);await expect(a.saveOnly(draft)).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
})
it('receipts from the previous cancelled epoch cannot authorize the new draft',async()=>{
 const h=fixture(),{a}=await h.start();expect(a).not.toBeNull();const old=await a.fileMedia!.pick('photo',values());expect(await a.fileMedia!.cancel()).toBe(true);const fresh=await a.fileMedia!.pick('photo',values());expect(fresh).not.toEqual(old);expect(a.fileMedia!.ready({...values(),sitePhoto:old})).toBe(false);await expect(a.saveOnly({...values(),sitePhoto:old})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled();await a.saveOnly({...values(),sitePhoto:fresh});expect(wire.execute).toHaveBeenCalledTimes(2)
})

it('observed unsealable schema during owned renewal must remain revoked after restoration',async()=>{
 const h=fixture(),{s,a}=await h.start();expect(a).not.toBeNull();let ready!:()=>void,release!:()=>void,count=0;const gate=new Promise<void>(r=>release=r),arrived=new Promise<void>(r=>ready=r)
 h.hook(async path=>{if(path==='basic/serviceAppointment/queryById/s'&&++count===1){ready();await gate}})
 const pending=a.saveOnly(values()),rejected=expect(pending).rejects.toThrow();await arrived
 ;(s.definition as any).cycle=s.definition;expect(projectR1RepeatFields(s,{})).toEqual([]);delete (s.definition as any).cycle;release();await rejected;expect(wire.execute).not.toHaveBeenCalled()
})
