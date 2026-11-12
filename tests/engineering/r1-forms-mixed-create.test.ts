import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalFormsActionProvider } from '@app/r1-forms-authorization'
import { projectR1RepeatFields, updateR1FormDraftValue, normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
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
 ].map(f=>({...f,tenantId:'t',extId:'e',colName:'syntheticChoices',state:1,required:'0',readOnly:0,nameDisp:f.name,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',...(['select','checkbox'].includes(f.type)?{valueOption:'SYN_CODES'}:{})}))
 const ext:any={_id:'e',tenantId:'t',type:'0',state:1,colName:'syntheticChoices'}
 const node:any={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}},nodeDef:{nodeType:'forms',name:'合成多选',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 const grant:any={version:1,scope,fieldIds:fields.map(f=>f._id),operations:['create'],expiresAt:'2099-01-01T00:00:00Z'}
 const env:any={DEV:true,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_MOCK:'false',VITE_XLINK_API_BASE_URL:'http://127.0.0.1:5189/xlink/wm',VITE_XLINK_AUTH_TENANT:'t',VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_FORMS_ACTIONS:'true',VITE_XLINK_R1_FORMS_GRANT:JSON.stringify(grant)}
 let membershipCalls=0,falseMembershipCalls=0
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
 const provider=createNormalFormsActionProvider({auth,reader,env,origin:'http://127.0.0.1:5189'})
 const start=async()=>{const s=await reader.load('s','n');return{s,a:provider.forSnapshot(s)!}}
 return{membership:()=>({calls:membershipCalls,falseCalls:falseMembershipCalls}),user:()=>{actor={...actor,user:{...actor.user,id:'other'}}},restoreUser:()=>{actor={...actor,user:{...actor.user,id:'u'}}},rawRead,reader,provider,fields,ext,node,grant,env,start,calls,codes,saved:()=>saved,clearSaved:()=>{saved=null;node.exts.formList=[]},grantUpdate:()=>{env.VITE_XLINK_R1_FORMS_GRANT=JSON.stringify(grant)},fault:(f:string)=>{fault=f},role:()=>{actor={...actor,currentRole:{id:'other'}}},restoreRole:()=>{actor={...actor,currentRole:{id:'r'}}},unlist:()=>{listed=false},relist:()=>{listed=true},hook:(v:typeof hook)=>{hook=v}}
}
beforeEach(()=>{installLocalFixtureBrowser();wire.execute.mockReset();external.mockClear();vi.stubGlobal('fetch',external)})
afterEach(()=>{expect(external).not.toHaveBeenCalled();expect(wire.execute.mock.calls.some(([r])=>/process|upload|delete|upToken/i.test(r.path))).toBe(false);vi.unstubAllGlobals()})
describe('ordinary per-field mixed create plan',()=>{
 it.each(['base','renamed'])('opens real reader/provider for %s Switch/Rate and Code arrays',async mode=>{
  const h=fixture();if(mode==='renamed')h.fields.forEach((f,i)=>f.name='arbitrary'+i)
  const {s,a}=await h.start();expect(a).not.toBeNull()
  expect(projectR1RepeatFields(s,{}).filter(f=>f.supported)).toHaveLength(5)
  const values=Object.fromEntries(h.fields.map(f=>[f.name,f.type==='checkbox'||f.multiple?['c0']:f.type==='switch'?'0':f.type==='rate'?4:'synthetic']))
  expect(a.validateDraft!(values)).toBe(true);expect(wire.execute).not.toHaveBeenCalled()
 })
})

const validValues=()=>({renamedChecks:['c2','c0'],renamedMulti:['c1'],memo:' synthetic ',independentFlag:'0',evidenceScore:4})
describe('each mixed per-field guard after a real supported positive',()=>{
 it.each([0,1])('saves ordered arrays and exact Switch/Rate with flipped preset storage%i',async flip=>{
  const h=fixture();h.fields.forEach(f=>f.preset=flip?1-f.preset:f.preset);const {s,a}=await h.start(),v=validValues();expect(a.validateDraft!(v)).toBe(true)
  const out=normalizeR1RepeatValues(s,v);expect(Object.isFrozen(out.renamedChecks)).toBe(true)
  const after=await a.saveOnly(v);expect(after.records).toHaveLength(1);expect(after.records[0]!.values).toMatchObject({...v,memo:'synthetic'});expect(h.saved()).toMatchObject({...v,memo:'synthetic'})
  for(const f of h.fields)if(f.preset===0)expect(h.saved().exts[f.name]).toEqual(h.saved()[f.name]);else expect(h.saved().exts).not.toHaveProperty(f.name)
  expect(wire.execute.mock.calls.map(([r])=>r.path)).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n']);expect(h.node.exts.unknownNode).toEqual({keep:[0,false]})
  expect(a.canComplete!()).toBe(false);expect(a.canSaveAndComplete!()).toBe(false);expect(a.canEdit!('saved')).toBe(false);expect(h.provider.forSnapshot(after)).toBeNull()
  const request=h.rawRead.mock.calls.find(([r])=>r.path==='i/code/selectCode.do')![0];expect(request.body).toEqual({jsonPara:JSON.stringify([{codeId:'SYN_CODES',eleid:'SYN_CODES'}]),tenantId:'t'})
 })
 it.each([['checkbox','switch'],['select','rate'],['checkbox','rate'],['select','switch']])('plans minimal renamed %s/%s metadata with scalar0',async(arrayType,stateType)=>{
  const h=fixture(),array=h.fields[0],state=h.fields.find(f=>f.type===stateType)!,scalar={...h.fields[2],_id:'zero',name:'zeroValue',type:'number',preset:1}
  h.fields.splice(0,h.fields.length,{...array,name:'anyArray',type:arrayType,multiple:arrayType==='select'},{...state,name:'anyState'},scalar);h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id);h.grant.fieldIds=[...h.node.nodeDef.formFieldIdsFill];h.grantUpdate()
  const {a}=await h.start();const v={anyArray:['c2','c0'],anyState:stateType==='switch'?'1':5,zeroValue:0};expect(a.validateDraft!(v)).toBe(true);await a.saveOnly(v);expect(h.saved()).toMatchObject(v);expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it.each([true,false,0,1,'true','false',' 0','0 ',null,undefined,[],{},'2'])('rejects Switch literal %j independently of valid arrays/rate',async value=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);const v={...validValues(),independentFlag:value};expect(a.validateDraft!(v)).toBe(false);await expect(a.saveOnly(v)).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each([0,-1,6,2.5,NaN,Infinity,-Infinity,'4',true,false,null,undefined,[],{}])('rejects Rate %j independently of valid Switch/arrays',async value=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);const v={...validValues(),evidenceScore:value};expect(a.validateDraft!(v)).toBe(false);await expect(a.saveOnly(v)).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 for(const key of ['renamedChecks','renamedMulti'])it.each([null,undefined,'c0',false,0,['UNKNOWN'],['c0','c0'],[' c0'],['c0 '],[''],['c0',0],[{}],[['c0']],['c0\u0000'],Array.from({length:31},(_,i)=>'c'+i)])('rejects '+key+' malformed array %j independently',async value=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);const v={...validValues(),[key]:value};expect(a.validateDraft!(v)).toBe(false);await expect(a.saveOnly(v)).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('accepts30 exact Code IDs without sorting and omits all optional state/array empties',async()=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);const ids=Array.from({length:30},(_,i)=>'c'+(29-i));await a.saveOnly({renamedChecks:ids,renamedMulti:[],independentFlag:'',evidenceScore:'',memo:'optional'})
  expect(h.saved().renamedChecks).toEqual(ids);for(const k of ['renamedMulti','independentFlag','evidenceScore']){expect(h.saved()).not.toHaveProperty(k);expect(h.saved().exts).not.toHaveProperty(k)}
 })
 it('rejects empty whole wire instead of inserting Switch/Rate defaults',async()=>{
  const h=fixture(),{a}=await h.start();for(const v of [{},{renamedChecks:[],renamedMulti:[],independentFlag:'',evidenceScore:''}]){expect(a.validateDraft!(v)).toBe(false);await expect(a.saveOnly(v)).rejects.toThrow()};expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each(['renamedChecks','renamedMulti','independentFlag','evidenceScore','memo'])('required %s cannot be absent/empty with other fields valid',async key=>{
  const h=fixture();h.fields.find(f=>f.name===key)!.required='1';const {a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true)
  const omitted:any=validValues();delete omitted[key];expect(a.validateDraft!(omitted)).toBe(false);const empty={...validValues(),[key]:key.startsWith('renamed')?[]:''};await expect(a.saveOnly(empty)).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each(['required','preset','readonly','hidden','unknown-type','file','cascade','condition','provider','options','label','field-id','key','duplicate-key','unknown-row','grant','tenant','tool','switch-config','rate-config'])('rejects fresh %s after a supported initial plan',async kind=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true)
  if(kind==='required')h.fields[0].required='1'
  if(kind==='preset')h.fields[0].preset=0
  if(kind==='readonly')h.fields[0].readOnly=1
  if(kind==='hidden')h.fields[0].showList=['5']
  if(['unknown-type','file','cascade'].includes(kind))h.fields[2].type=kind
  if(kind==='condition')Object.assign(h.fields[0],{showType:'3',showField:'memo',showValue:'on',showFieldPreset:0})
  if(kind==='provider')h.fault('provider')
  if(kind==='options')delete h.codes.c0
  if(kind==='label')h.codes.c0='changed label'
  if(kind==='field-id')h.fields[0]._id='changed'
  if(kind==='key')h.fields[0].name='changed'
  if(kind==='duplicate-key')h.fields[1].name=h.fields[0].name
  if(kind==='unknown-row')h.fields.push({...h.fields[0],_id:'extra',name:'extra',type:'unknown'})
  if(kind==='grant'){h.grant.fieldIds=['memo'];h.grantUpdate()}
  if(kind==='tenant')h.env.VITE_XLINK_AUTH_TENANT='other'
  if(kind==='tool')h.fields[0].frontEndConfig='{"componentType":"custom"}'
  if(kind==='switch-config')h.fields[3].activeValue=true
  if(kind==='rate-config')h.fields[4].allowHalf=true
  await expect(a.saveOnly(validValues())).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each(['wrong-slot','wrong-order','lost','rate-string','rate-fraction','switch-boolean','switch-number','optional-null','scope','readback','readback-scalar'])('locks exact raw ACK/readback mismatch %s with no replay',async fault=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);h.fault(fault);const v:any=validValues();if(fault==='optional-null')delete v.renamedMulti
  await expect(a.saveOnly(v)).rejects.toThrow();const n=wire.execute.mock.calls.length;expect(n).toBe(fault.startsWith('readback')?2:1);expect(a.locked()).toBe(true);await expect(a.saveOnly(validValues())).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(n)
 })
 it('snapshots/freeze arrays and forbids duplicate clicks while own fresh read is pending',async()=>{
  const h=fixture(),{s,a}=await h.start();let ready!:()=>void,release!:()=>void,once=true;const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
  const v=validValues(),draft=updateR1FormDraftValue(s,{},'renamedChecks',v.renamedChecks);expect(Object.isFrozen(draft.renamedChecks)).toBe(true);expect(Object.isFrozen(normalizeR1RepeatValues(s,v).renamedChecks)).toBe(true)
  h.hook(async p=>{if(once&&p==='basic/serviceAppointment/queryById/s'){once=false;ready();await gate}});const pending=a.saveOnly(v);await arrived;v.renamedChecks.push('c1');await expect(a.saveOnly(v)).rejects.toThrow();release();await pending;expect(h.saved().renamedChecks).toEqual(['c2','c0']);expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 for(const kind of ['switch','grant','role','tenant','user'])it.each([1,3])('observed '+kind+' revocation/restoration at read%i never revives',async nth=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);let ready!:()=>void,release!:()=>void,count=0;const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r);h.hook(async p=>{if(p==='basic/serviceAppointment/queryById/s'&&++count===nth){ready();await gate}})
  const pending=a.saveOnly(validValues()),failed=expect(pending).rejects.toThrow();await arrived;const raw=h.env.VITE_XLINK_R1_FORMS_GRANT
  if(kind==='switch')h.env.VITE_XLINK_R1_FORMS_ACTIONS='false';if(kind==='grant')h.env.VITE_XLINK_R1_FORMS_GRANT='';if(kind==='role')h.role();if(kind==='user')h.user();if(kind==='tenant')h.env.VITE_XLINK_AUTH_TENANT='other'
  expect(a.canCreate!()).toBe(false);h.env.VITE_XLINK_R1_FORMS_ACTIONS='true';h.env.VITE_XLINK_R1_FORMS_GRANT=raw;h.env.VITE_XLINK_AUTH_TENANT='t';h.restoreRole();h.restoreUser();release();await failed;expect(wire.execute).toHaveBeenCalledTimes(nth===1?0:1);expect(a.locked()).toBe(true)
 })
 it.each([1,3])('owned renewal%i permits progress after old projection/canCreate observation without external revocation',async nth=>{
  const h=fixture(),{s,a}=await h.start();let ready!:()=>void,release!:()=>void,count=0;const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r);h.hook(async p=>{if(p==='basic/serviceAppointment/queryById/s'&&++count===nth){ready();await gate}})
  const pending=a.saveOnly(validValues());await arrived;if(nth===1)expect(projectR1RepeatFields(s,{})).toEqual([]);expect(a.canCreate!()).toBe(false);release();await pending;expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it('does not revive an observed modified snapshot or authorize a copy',async()=>{
  const h=fixture(),{s,a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);expect(projectR1RepeatFields({...s},{})).toEqual([]);expect(()=>normalizeR1RepeatValues({...s},validValues())).toThrow()
  const f=s.definition.fields![0]!,old=f.label;(f as any).label='observed';expect(projectR1RepeatFields(s,{})).toEqual([]);(f as any).label=old;expect(projectR1RepeatFields(s,{})).toEqual([]);expect(a.canCreate!()).toBe(false);expect(wire.execute).not.toHaveBeenCalled()
 })
 it('listed-ID revocation observed outside an owned gap remains sticky',async()=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);h.unlist();expect(a.canCreate!()).toBe(false);expect(h.membership().falseCalls).toBeGreaterThan(0);h.relist();expect(a.canCreate!()).toBe(false);await expect(a.saveOnly(validValues())).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('consumes one first-create receipt even if a later authorized read is empty',async()=>{
  const h=fixture(),{a}=await h.start();await a.saveOnly(validValues());expect(wire.execute).toHaveBeenCalledTimes(2);h.clearSaved();const {a:next}=await h.start();expect(next.locked()).toBe(true);await expect(next.saveOnly(validValues())).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(2)
 })
})

it('observed schema mutation/restoration during controlled own read permanently cancels the old mixed action',async()=>{
 const h=fixture(),{s,a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);let ready!:()=>void,release!:()=>void,once=true;const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
 h.hook(async p=>{if(once&&p==='basic/serviceAppointment/queryById/s'){once=false;ready();await gate}})
 const pending=a.saveOnly(validValues()),failed=expect(pending).rejects.toThrow();await arrived;const f=s.definition.fields![0]!,label=f.label;(f as any).label='observed';expect(projectR1RepeatFields(s,{})).toEqual([]);(f as any).label=label;release();await failed;expect(wire.execute).not.toHaveBeenCalled();expect(a.locked()).toBe(true)
})

describe('positive mixed source cannot widen into other storage or metadata domains',()=>{
 it.each(['typed','numeric-type','survey','inspectionAppointment','serviceAppointment','missing-multiple','string-multiple','field-collection','operation','reserved-key','duplicate-field-id'])('rejects fresh %s on previously supported source',async kind=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true)
  if(kind==='typed')h.ext.type='1';if(kind==='numeric-type')h.ext.type=0
  if(['survey','inspectionAppointment','serviceAppointment'].includes(kind)){h.ext.colName=kind;h.fields.forEach(f=>f.colName=kind)}
  if(kind==='missing-multiple')delete h.fields[3].multiple
  if(kind==='string-multiple')h.fields[1].multiple='true'
  if(kind==='field-collection')h.fields[0].colName='other'
  if(kind==='operation')h.fields[0].operationType='0'
  if(kind==='reserved-key')h.fields[0].name='sessionRef'
  if(kind==='duplicate-field-id')h.fields[1]._id=h.fields[0]._id
  await expect(a.saveOnly(validValues())).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('refuses a complete51-field fresh configuration without filtering a smaller grant',async()=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);const base=h.fields[2]
  h.fields.push(...Array.from({length:46},(_,i)=>({...base,_id:'extra'+i,name:'extra'+i})));h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id)
  await expect(a.saveOnly(validValues())).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('keeps Runtime Switch compatibility outside the exact ordinary plan',async()=>{
  const {normalizeFieldValue}=await import('@runtimes/dynamic-form')
  expect(normalizeFieldValue('switch',true)).toMatchObject({ok:true});expect(normalizeFieldValue('switch',false)).toMatchObject({ok:true})
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true);expect(a.validateDraft!({...validValues(),independentFlag:false})).toBe(false);expect(wire.execute).not.toHaveBeenCalled()
 })
})

it('does not turn a mixed create grant into edit/append/save-finish/Process authority',async()=>{
 const h=fixture(),{a}=await h.start();expect(a.validateDraft!(validValues())).toBe(true)
 await expect(a.complete!()).rejects.toThrow();await expect(a.saveAndComplete!(validValues())).rejects.toThrow();await expect(a.saveOnly(validValues(),'unlisted-record')).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 await a.saveOnly(validValues());expect(wire.execute.mock.calls.map(([r])=>r.path)).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
})
