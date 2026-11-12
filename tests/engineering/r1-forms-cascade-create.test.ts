import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalFormsActionProvider } from '@app/r1-forms-authorization'
import { projectR1RepeatFields, updateR1FormDraftValue, normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'
const wire = vi.hoisted(() => ({ execute: vi.fn() }))
const external=vi.fn(()=>{throw Error('External network forbidden in synthetic Cascade tests')})
vi.mock('@adapters/api/uni-api-command-transport', () => ({ createUniApiCommandTransport: () => wire }))
const scope = { tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e' }
function fixture() {
 let actor:any = {sessionRef:'synthetic-choice-session',user:{id:'u'},currentRole:{id:'r'}}
 const fields:any[] = [
  {_id:'checks',name:'pathNorth',type:'cascade',multiple:false,preset:1},
  {_id:'multi',name:'regionPath',type:'cascade',multiple:false,preset:0},
  {_id:'memo',name:'memo',type:'text',multiple:false,preset:0},
 ].map(f=>({...f,tenantId:'t',extId:'e',colName:'syntheticChoices',state:1,required:'0',readOnly:0,nameDisp:f.name,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',...(f.type==='cascade'?{valueOption:'SYN_TREE'}:{})}))
 const ext:any={_id:'e',tenantId:'t',type:'0',state:1,colName:'syntheticChoices'}
 const node:any={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}},nodeDef:{nodeType:'forms',name:'合成多选',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 const grant:any={version:1,scope,fieldIds:fields.map(f=>f._id),operations:['create'],expiresAt:'2099-01-01T00:00:00Z'}
 const env:any={DEV:true,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_MOCK:'false',VITE_XLINK_API_BASE_URL:'http://127.0.0.1:5189/xlink/wm',VITE_XLINK_AUTH_TENANT:'t',VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_FORMS_ACTIONS:'true',VITE_XLINK_R1_FORMS_GRANT:JSON.stringify(grant)}
 let saved:any=null,listed=true,fault='',hook:((path:string)=>Promise<void>)|undefined
 const calls:string[]=[],codes:any=Object.fromEntries(Array.from({length:31},(_,i)=>['c'+i,'合成'+i]))
 const leaf=(id:string,value:string,parentId:string)=>({_id:id,value,name:'label-'+value,parentId,type:'SYN_TREE',children:[] as any[]})
 const root=leaf('N','north','G'),branch=leaf('B','branch','N');branch.children=[leaf('L','leaf','B')];root.children=[branch]
 const group={_id:'G',type:'SYN_TREE',tenantId:'t',children:[root,leaf('R','root-leaf','G')]}
 const rawRead=vi.fn(async(req:any)=>{
  calls.push(req.path);await hook?.(req.path)
  if(req.path==='basic/serviceAppointment/queryById/s')return{success:true,status:1,data:{serviceAppointment:{_id:'s',tenantId:'t',workflowId:'w',state:1},workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[structuredClone(node)]}}
  if(req.path==='biz/ext/queryById.do')return structuredClone(ext)
  if(req.path==='biz/extField/query')return{data:structuredClone(fields),total:fields.length,page:1,size:50}
  if(req.path==='i/code/selectMultistageCode.do')return[structuredClone(group)]
  if(req.path==='i/code/selectCode.do')return[{codeId:'SYN_CODES',eleid:'SYN_CODES',options:{a:'合成甲',b:'合成乙'}}]
  if(req.path==='biz/extForm/query/e')return{data:saved?[structuredClone(saved)]:[],total:saved?1:0,page:1,size:req.body.rows,dataCount:saved?1:0}
  throw Error('Unexpected synthetic read '+req.path)
 })
 wire.execute.mockImplementation(async(req:any)=>{
  await hook?.(req.path)
  if(req.path==='biz/extForm/upsert/e'){
   saved={...JSON.parse(req.body.dataStr),_id:'saved',tenantId:'t'}
   if(fault==='lost')throw Error('synthetic lost ACK')
   if(fault==='wrong-slot')saved.exts.regionPath=['c1']
   if(fault==='wrong-order')saved.pathNorth.reverse()
   if(fault==='optional-null')saved.regionPath=null
   if(fault==='wrong-scope')saved.nodeId='other'
   return{success:true,status:1,data:structuredClone(saved)}
  }
  if(req.path==='workflowNode/updateExts/n'){
   node.exts=structuredClone(req.jsonBody)
   if(fault==='readback')saved.regionPath=['INVALID']
   if(fault==='readback-root')saved.pathNorth=['INVALID']
   return{success:true,status:1}
  }
  throw Error('Forbidden synthetic command '+req.path)
 })
 const auth={getCurrentSession:()=>actor},reader=createNormalNodeFormsReader({auth,tenantId:'t',env,origin:'http://127.0.0.1:5189',transport:{execute:rawRead},read:{listWorkOrders:vi.fn(),isWorkOrderListedForCurrentSession:()=>listed,getDynamicCodeOptions:vi.fn()}})
 const provider=createNormalFormsActionProvider({auth,reader,env,origin:'http://127.0.0.1:5189'})
 const start=async()=>{const s=await reader.load('s','n');return{s,a:provider.forSnapshot(s)!}}
 return{rawRead,reader,provider,fields,ext,node,grant,env,start,calls,codes,group,saved:()=>saved,clearSaved:()=>{saved=null;node.exts.formList=[]},grantUpdate:()=>{env.VITE_XLINK_R1_FORMS_GRANT=JSON.stringify(grant)},fault:(f:string)=>{fault=f},role:()=>{actor={...actor,currentRole:{id:'other'}}},restoreRole:()=>{actor={...actor,currentRole:{id:'r'}}},unlist:()=>{listed=false},relist:()=>{listed=true},hook:(v:typeof hook)=>{hook=v}}
}
beforeEach(()=>{installLocalFixtureBrowser();wire.execute.mockReset();external.mockClear();vi.stubGlobal('fetch',external)})
afterEach(()=>{expect(external).not.toHaveBeenCalled();expect(wire.execute.mock.calls.some(([r])=>/Process|upload|upToken|delete/i.test(r.path))).toBe(false);vi.unstubAllGlobals()})
describe('ordinary single Cascade path create',()=>{
 it('projects complete paths from actual scoped reader/provider',async()=>{
  const h=fixture(),{s,a}=await h.start();expect(a).not.toBeNull()
  expect(projectR1RepeatFields(s,{}).filter(f=>f.supported).map(f=>f.valueKey)).toEqual(['pathNorth','regionPath','memo'])
  expect(wire.execute).not.toHaveBeenCalled()
 })
 it('validates renamed root/EXTS paths under the real create grant',async()=>{
  const h=fixture(),{a}=await h.start();expect(a).not.toBeNull()
  expect(a.validateDraft!({pathNorth:['north','branch','leaf'],regionPath:['root-leaf'],memo:' 0 '})).toBe(true)
  expect(wire.execute).not.toHaveBeenCalled()
 })
})

describe('complete leaf codec, source lease and exact two-phase protocol',()=>{
 it('creates two renamed paths in root/EXTS, retains zero and unknown node metadata',async()=>{
  const h=fixture();h.fields.push({...h.fields[2],_id:'zero',name:'measure',type:'number',preset:1});h.node.nodeDef.formFieldIdsFill.push('zero');h.grant.fieldIds.push('zero');h.grantUpdate()
  const {a}=await h.start(),after=await a.saveOnly({pathNorth:['north','branch','leaf'],regionPath:['root-leaf'],memo:' trim ',measure:0})
  expect(wire.execute.mock.calls.map(([r])=>r.path)).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
  expect(h.saved()).toMatchObject({pathNorth:['north','branch','leaf'],regionPath:['root-leaf'],measure:0,memo:'trim',exts:{regionPath:['root-leaf'],memo:'trim'}})
  expect(h.saved().exts).not.toHaveProperty('pathNorth');expect(h.saved().exts).not.toHaveProperty('measure')
  expect(h.node.exts.unknownNode).toEqual({keep:[0,false]});expect(after.records).toHaveLength(1)
  expect(a.canEdit!('saved')).toBe(false);expect(a.canComplete!()).toBe(false);expect(a.canSaveAndComplete!()).toBe(false);expect(h.provider.forSnapshot(after)).toBeNull()
  const request=h.rawRead.mock.calls.find(([r])=>r.path==='i/code/selectMultistageCode.do')![0];expect(request.body).toEqual({types:'SYN_TREE',tenantId:'t'})
 })
 it.each([1,3])('supports %i arbitrary reordered Cascade fields and scalar Code options',async count=>{
  const h=fixture(),base=h.fields[0];h.fields.splice(0,h.fields.length,{...h.fields[2],_id:'radio',name:'statusChoice',type:'radio',valueOption:'SYN_CODES'},...Array.from({length:count},(_,i)=>({...base,_id:'tree'+i,name:'arbitraryPath'+i,preset:i%2})))
  h.node.nodeDef.formFieldIdsFill=h.fields.map(f=>f._id);h.grant.fieldIds=[...h.node.nodeDef.formFieldIdsFill];h.grantUpdate();const {a}=await h.start()
  const value={statusChoice:'b',...Object.fromEntries(h.fields.slice(1).map(f=>[f.name,['north','branch','leaf']]))};await a.saveOnly(value);expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it('accepts repeated values at distinct ancestor identities without sorting/deduplication',async()=>{
  const h=fixture();h.group.children[0].value='same';h.group.children[0].children[0].value='same';const {a}=await h.start()
  await a.saveOnly({pathNorth:['same','same','leaf']});expect(h.saved().pathNorth).toEqual(['same','same','leaf'])
 })
 it.each([null,undefined,'north',0,false,{},['north'],['north','branch'],['leaf','branch','north'],['north','root-leaf'],['orphan'],['north','north','leaf'],['north','branch','leaf','leaf'],[' north','branch','leaf'],[''],['north',0],[['north']],['x'.repeat(257)],['north','branch','leaf\u0000']])('rejects malformed/incomplete own path %j with zero commands',async value=>{
  const h=fixture(),{a}=await h.start(),v={pathNorth:value,memo:'value'};expect(a.validateDraft!(v)).toBe(false);await expect(a.saveOnly(v)).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('omits optional []/true absence and rejects empty entire patch',async()=>{
  const h=fixture(),{a}=await h.start();expect(a.validateDraft!({})).toBe(false);expect(a.validateDraft!({pathNorth:[]})).toBe(false)
  await a.saveOnly({pathNorth:[],memo:'optional'});for(const k of ['pathNorth','regionPath']){expect(h.saved()).not.toHaveProperty(k);expect(h.saved().exts).not.toHaveProperty(k)}
 })
 it.each([undefined,[]])('required path refuses missing/empty %j',async v=>{const h=fixture();h.fields[0].required='1';const {a}=await h.start();await expect(a.saveOnly(v===undefined?{memo:'required'}:{pathNorth:v,memo:'required'})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()})
 it.each(['multiple','missing-multiple','string-multiple','condition','tool','file','checkbox','switch','readonly','hidden','unknown','typed','numeric-type','special','grant2','reserved','duplicate-key'])('validates the configured field contract for %s',async kind=>{
  const h=fixture()
  if(kind==='multiple')h.fields[0].multiple=true
  if(kind==='missing-multiple')delete h.fields[0].multiple
  if(kind==='string-multiple')h.fields[0].multiple='false'
  if(kind==='condition')Object.assign(h.fields[0],{showType:'3',showField:'memo',showValue:'on',showFieldPreset:0})
  if(kind==='tool')h.fields[0].frontEndConfig='{"changeOnSelect":true}'
  if(['file','checkbox','switch','unknown'].includes(kind))h.fields[2].type=kind
  if(kind==='readonly')h.fields[0].readOnly=1
  if(kind==='hidden')h.fields[0].showList=['5']
  if(kind==='typed')h.ext.type='1'
  if(kind==='numeric-type')h.ext.type=0
  if(kind==='special'){h.ext.colName='survey';h.fields.forEach(f=>f.colName='survey')}
  if(kind==='grant2'){h.grant.version=2;h.grant.recordIds=[];h.grantUpdate()}
  if(kind==='reserved')h.fields[0].name='sessionRef'
  if(kind==='duplicate-key')h.fields[1].name=h.fields[0].name
  const {a}=await h.start();if(kind==='switch'){expect(a).not.toBeNull();expect(a.validateDraft!({pathNorth:['north','branch','leaf'],memo:'0'})).toBe(true);expect(a.validateDraft!({pathNorth:['north','branch','leaf'],memo:false})).toBe(false)}else expect(!a||!a.validateDraft!({pathNorth:['north','branch','leaf']})).toBe(true);expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each(['sibling','id','parent','provider','tenant','missing-children','depth','count'])('rejects invalid scoped tree %s in the actual reader',async kind=>{
  const h=fixture(),root=h.group.children[0]
  if(kind==='sibling')h.group.children.push(structuredClone(root))
  if(kind==='id')root.children[0]._id=root._id
  if(kind==='parent')root.children[0].parentId='orphan'
  if(kind==='provider')h.group.type='OTHER'
  if(kind==='tenant')h.group.tenantId='other'
  if(kind==='missing-children')delete (root.children[0].children[0] as any).children
  if(kind==='depth'){let n=root;for(let i=0;i<21;i++){const c:any={_id:'deep'+i,value:'deep'+i,name:'depth',parentId:n._id,type:'SYN_TREE',children:[]};n.children=[c];n=c}}
  if(kind==='count')h.group.children=Array.from({length:5001},(_,i)=>({_id:'node'+i,value:'v'+i,name:'label',parentId:'G',type:'SYN_TREE',children:[]}))
  await expect(h.start()).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('accepts actual depth20/value256 bounds without confusing wire array30 with path depth',async()=>{
  const h=fixture(),path:string[]=[];let n=h.group.children[0];n.value='x'.repeat(256);path.push(n.value)
  for(let i=1;i<20;i++){const c:any={_id:'depth'+i,value:'v'+i,name:'label',parentId:n._id,type:'SYN_TREE',children:[]};n.children=[c];n=c;path.push(c.value)}
  const {a}=await h.start();await a.saveOnly({pathNorth:path});expect(h.saved().pathNorth).toEqual(path)
 })
 it.each(['required','preset','tree-label','tree-path','grant','readonly','field-id','record'])('rejects fresh %s drift before first upsert',async kind=>{
  const h=fixture(),{a}=await h.start()
  if(kind==='required')h.fields[0].required='1'
  if(kind==='preset')h.fields[0].preset=0
  if(kind==='tree-label')h.group.children[0].name='changed'
  if(kind==='tree-path')h.group.children[0].children[0].value='changed'
  if(kind==='grant'){h.grant.fieldIds=['memo'];h.grantUpdate()}
  if(kind==='readonly')h.fields[0].readOnly=1
  if(kind==='field-id')h.fields[0]._id='changed'
  if(kind==='record')h.node.exts.formList=[{_id:'other',formDefId:'e',state:1}]
  await expect(a.saveOnly({pathNorth:['north','branch','leaf']})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it.each(['wrong-slot','wrong-order','lost','readback','readback-root','wrong-scope','optional-null'])('locks %s with no automatic replay',async fault=>{
  const h=fixture(),{a}=await h.start();h.fault(fault);await expect(a.saveOnly({pathNorth:['north','branch','leaf'],...(fault==='optional-null'?{}:{regionPath:['root-leaf']})})).rejects.toThrow();expect(a.locked()).toBe(true);const n=wire.execute.mock.calls.length
  expect(n).toBe(fault.startsWith('readback')?2:1);await expect(a.saveOnly({pathNorth:['root-leaf']})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(n)
 })
 it('clones/freezes arrays before await, denies multi-click and preserves original caller draft',async()=>{
  const h=fixture(),{s,a}=await h.start();let ready!:()=>void,release!:()=>void,once=true;const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
  const raw=['north','branch','leaf'],draft=updateR1FormDraftValue(s,{},'pathNorth',raw);expect(Object.isFrozen(draft.pathNorth)).toBe(true)
  const normalized=normalizeR1RepeatValues(s,draft);expect(Object.isFrozen(normalized.pathNorth)).toBe(true)
  h.hook(async path=>{if(once&&path==='basic/serviceAppointment/queryById/s'){once=false;ready();await gate}})
  const values={pathNorth:raw},pending=a.saveOnly(values);await arrived;raw.splice(0,3,'root-leaf');await expect(a.saveOnly(values)).rejects.toThrow();release();await pending;expect(h.saved().pathNorth).toEqual(['north','branch','leaf']);expect(raw).toEqual(['root-leaf']);expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it.each([1,3])('permanently rejects observed action-switch revocation during fresh-read pause%i',async nth=>{
  const h=fixture(),{a}=await h.start();let ready!:()=>void,release!:()=>void,count=0;const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
  h.hook(async path=>{if(path==='basic/serviceAppointment/queryById/s'&&++count===nth){ready();await gate}})
  const pending=a.saveOnly({pathNorth:['root-leaf']}),failed=expect(pending).rejects.toThrow();await arrived;h.env.VITE_XLINK_R1_FORMS_ACTIONS='false';expect(a.canCreate!()).toBe(false);h.env.VITE_XLINK_R1_FORMS_ACTIONS='true';release();await failed;expect(wire.execute).toHaveBeenCalledTimes(nth===1?0:1);expect(a.locked()).toBe(true)
 })
 it.each(['grant','role','listed'])('permanently rejects observed %s revocation/restoration',async kind=>{
  const h=fixture(),{a}=await h.start();const old=h.env.VITE_XLINK_R1_FORMS_GRANT
  if(kind==='grant')h.env.VITE_XLINK_R1_FORMS_GRANT=''
  if(kind==='role')h.role()
  if(kind==='listed')h.unlist()
  expect(a.canCreate!()).toBe(false);h.env.VITE_XLINK_R1_FORMS_GRANT=old;h.restoreRole();h.relist();expect(a.canCreate!()).toBe(false)
  await expect(a.saveOnly({pathNorth:['root-leaf']})).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled();expect((await h.start()).a.canCreate!()).toBe(true)
 })
 it('does not authorize copied snapshots or revive observed mutated schema after restoration',async()=>{
  const h=fixture(),{s,a}=await h.start();expect(projectR1RepeatFields({...s},{})).toEqual([]);expect(()=>normalizeR1RepeatValues({...s},{pathNorth:['root-leaf']})).toThrow()
  const field=s.definition.fields![0]!,old=field.label;(field as any).label='mutated';expect(projectR1RepeatFields(s,{})).toEqual([]);(field as any).label=old;expect(projectR1RepeatFields(s,{})).toEqual([]);expect(a.canCreate!()).toBe(false)
 })
})

describe('bounded metadata and intermediate uncertainty',()=>{
 it('accepts5000 verified root leaves',async()=>{
  const h=fixture();h.group.children=Array.from({length:5000},(_,i)=>({_id:'node'+i,value:'v'+i,name:'label'+i,parentId:'G',type:'SYN_TREE',children:[]}));const {a}=await h.start();await a.saveOnly({pathNorth:['v4999']});expect(h.saved().pathNorth).toEqual(['v4999'])
 })
 it('rejects51 metadata rows without filtering or manufacturing a smaller grant',async()=>{
  const k=fixture(),base=k.fields[2];k.fields.push(...Array.from({length:48},(_,i)=>({...base,_id:'extra'+i,name:'extra'+i})));k.node.nodeDef.formFieldIdsFill=k.fields.map(f=>f._id);k.grant.fieldIds=k.fields.map(f=>f._id);k.grantUpdate();await expect(k.reader.load('s','n')).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('refuses an already listed record instead of appending',async()=>{
  const h=fixture();h.node.exts.formList=[{_id:'saved',formDefId:'e',state:1}];await expect(h.start()).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('locks after upsert when a tree changes before the second command',async()=>{
  const h=fixture(),{a}=await h.start();h.hook(async path=>{if(path==='biz/extForm/upsert/e')h.group.children[0].name='changed after upsert'})
  await expect(a.saveOnly({pathNorth:['root-leaf']})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(1);expect(a.locked()).toBe(true)
 })
 it('stops a late ACK after role change with exactly one command and no replay',async()=>{
  const h=fixture(),{a}=await h.start();let ready!:()=>void,release!:()=>void;const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
  h.hook(async path=>{if(path==='biz/extForm/upsert/e'){ready();await gate}});const pending=a.saveOnly({pathNorth:['root-leaf']}),failed=expect(pending).rejects.toThrow();await arrived;h.role();release();await failed;expect(wire.execute).toHaveBeenCalledTimes(1);expect(a.locked()).toBe(true)
 })
})

it('keeps a controlled renewal valid when the old projection is observed during its temporary reader gap',async()=>{
 const h=fixture(),{s,a}=await h.start();let ready!:()=>void,release!:()=>void,once=true;const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
 h.hook(async path=>{if(once&&path==='basic/serviceAppointment/queryById/s'){once=false;ready();await gate}})
 const pending=a.saveOnly({pathNorth:['root-leaf']}),out=pending.then(v=>({ok:true,v}),e=>({ok:false,e}));await arrived
 expect(projectR1RepeatFields(s,{})).toEqual([]);expect(a.canCreate!()).toBe(false);release();const result=await out;expect(result.ok).toBe(true);expect(wire.execute).toHaveBeenCalledTimes(2)
})

it('permanently cancels the active create when schema invalidation is observed during its owned gap',async()=>{
 const h=fixture(),{s,a}=await h.start();let ready!:()=>void,release!:()=>void,once=true;const arrived=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r)
 h.hook(async path=>{if(once&&path==='basic/serviceAppointment/queryById/s'){once=false;ready();await gate}})
 const pending=a.saveOnly({pathNorth:['root-leaf']}),failed=expect(pending).rejects.toThrow();await arrived
 const f=s.definition.fields![0]!,label=f.label;(f as any).label='observed-invalid';expect(projectR1RepeatFields(s,{})).toEqual([]);(f as any).label=label
 release();await failed;expect(wire.execute).not.toHaveBeenCalled();expect(a.canCreate!()).toBe(false)
})
