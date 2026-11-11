import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {createNormalNodeFormsReader} from '@app/r1-node-forms-read'
import {createNormalRepeatActionProvider} from '@app/r1-repeat-authorization'
import {createMediaQueueRepository,createMediaUploadQueue,InMemoryDurableMediaStore} from '@runtimes/media'
import {asOpaqueId,createCapabilityResult} from '@shared/types'
import type {StoragePort,UploadPort} from '@shared/ports'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
const wire=vi.hoisted(()=>({execute:vi.fn()}))
vi.mock('@adapters/api/uni-api-command-transport',()=>({createUniApiCommandTransport:()=>wire}))
const scope={tenantId:'tenant',userId:'user',roleId:'role',workOrderId:'work',workflowRunId:'run',runtimeNodeId:'node',formDefinitionId:'media-def'}
function setup(){
 const fields:any[]=['infraredImageList','images1'].map((name,i)=>({_id:`f${i}`,tenantId:'tenant',extId:'media-def',colName:'survey',name,nameDisp:name,state:1,enabled:1,type:'file',required:i?'1':'0',readOnly:0,preset:i?0:1,multiple:false,showList:['1','2','4'],showType:'1',operationType:'1',showFieldPreset:0,exts:{},showField:'',showValue:'',calculateConfig:'',frontEndConfig:JSON.stringify({max:i?10:4})}))
 const ext:any={_id:'media-def',tenantId:'tenant',state:1,type:'1',colName:'survey'}
 const actor:any={sessionRef:'synthetic',user:{id:'user'},currentRole:{id:'role'}}
 const grant:any={version:3,profile:'survey-media-first',scope,fieldIds:['f0','f1'],operations:['create'],expiresAt:'2099-01-01T00:00:00Z'}
 const env:any={DEV:true,PROD:false,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_AUTH_TENANT:'tenant',VITE_XLINK_API_BASE_URL:'http://127.0.0.1:5189/xlink/wm',VITE_XLINK_MOCK:'false',VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_REPEAT_ACTIONS:'true',VITE_XLINK_R1_REPEAT_GRANT:JSON.stringify(grant)}
 const node:any={_id:'node',tenantId:'tenant',workflowId:'run',workflowFormDataId:'work',workflowFormColName:'serviceAppointment',state:0,handlerIds:['role'],nodeDef:{nodeType:'repeat',formDefId:'media-def',formFieldIdsFill:['f0','f1'],formFieldIdsReadOnly:[]}}
 let saved:any=null,seq=0
 const commands=vi.fn(async(request:any)=>{saved={...JSON.parse(request.body.dataStr),_id:'saved',tenantId:'tenant'};delete saved.images1;return{success:true,status:1,data:structuredClone(saved)}});wire.execute.mockImplementation(commands)
 const rawRead=vi.fn(async(request:any):Promise<any>=>{
  if(request.path==='basic/serviceAppointment/queryById/work')return{success:true,status:1,data:{serviceAppointment:{_id:'work',tenantId:'tenant',workflowId:'run',state:1},workflow:{_id:'run',tenantId:'tenant',formDataId:'work',state:0},workflowNode:[structuredClone(node)]}}
  if(request.path==='biz/ext/queryById.do')return structuredClone(ext)
  if(request.path==='biz/extField/query')return{data:structuredClone(fields),total:2,page:1,size:50}
  if(request.path==='biz/extForm/query/media-def')return{data:saved?[structuredClone(saved)]:[],total:saved?1:0,page:1,size:request.body.rows,dataCount:saved?1:0}
  throw Error('Unexpected read')
 })
 const auth={getCurrentSession:()=>actor};const reader=createNormalNodeFormsReader({auth,read:{listWorkOrders:vi.fn(),isWorkOrderListedForCurrentSession:()=>true,getDynamicCodeOptions:vi.fn()},tenantId:'tenant',env,origin:'http://127.0.0.1:5189',transport:{execute:rawRead}})
 const memory=new Map<string,unknown>();const storage:StoragePort={read:async<T>(k:{key:string})=>({state:'succeeded',data:structuredClone(memory.get(k.key)??null) as T|null}),write:async(k,v)=>{memory.set(k.key,structuredClone(v));return{state:'succeeded'}},remove:async k=>{memory.delete(k.key);return{state:'succeeded'}},listKeys:async q=>({state:'succeeded',data:[...memory.keys()].filter(k=>!q.prefix||k.startsWith(q.prefix))})}
 const upload=vi.fn<UploadPort['upload']>(async m=>({state:'succeeded',data:{url:`https://upload.invalid/${m.ref}.png`,key:`${m.ref}.png`,extension:'png',mimeType:m.mimeType,source:m.source,uploadState:'uploaded'}}))
 const repository=createMediaQueueRepository(storage),queue=createMediaUploadQueue(new InMemoryDurableMediaStore(),repository,{upload})
 const picker={pick:vi.fn(async()=>createCapabilityResult('media_file_picker','granted',[{ref:asOpaqueId<'LocalMediaRef'>(`local-${++seq}`),mimeType:'image/png',source:'library' as const,localPath:`/synthetic/${seq}.png`,name:`${seq}.png`,size:100}]))}
 const provider=createNormalRepeatActionProvider({auth,reader,env,origin:'http://127.0.0.1:5189',media:{queue,picker}})
 async function start(){const s=await reader.load('work','node');return{s,actions:provider.forSnapshot(s)!}}
 async function filled(){const {s,actions}=await start();expect(actions).not.toBeNull();const root=await actions.fileMedia!.pick('f0',{});const image=await actions.fileMedia!.pick('f1',{infraredImageList:root});return{s,actions,values:{infraredImageList:root,images1:image}}}
 return{reader,provider,fields,ext,node,env,actor,commands,rawRead,upload,picker,queue,repository,start,filled,setSaved:(x:any)=>{saved=x},saved:()=>saved}
}
beforeEach(()=>{installLocalFixtureBrowser();wire.execute.mockReset()});afterEach(()=>vi.unstubAllGlobals())
describe('typed first media private reader and action',()=>{
 it('normal reader issues exact type1 source proof, never cloned/generic proof',async()=>{const h=setup(),{s}=await h.start(),p=h.reader.currentSurveyMediaSource!(s);expect(p,JSON.stringify(s)).toBeTruthy();expect(h.reader.isCurrentSurveyMediaSource!(s,p)).toBe(true);expect(h.reader.isCurrentSurveyMediaSource!(s,{...p})).toBe(false);expect(h.reader.currentNormalFileRoute!(s)).toBeNull()})
 it('sticky proof revocation after snapshot mutation, observed failure, then restoration',async()=>{const h=setup(),{s}=await h.start(),p=h.reader.currentSurveyMediaSource!(s);const f=s.definition.fields![0] as any;f.label+='changed';expect(h.reader.isCurrentSurveyMediaSource!(s,p)).toBe(false);f.label=f.label.replace('changed','');expect(h.reader.isCurrentSurveyMediaSource!(s,p)).toBe(false)})
 it('old provider cannot revive after observed grant loss and restoration',async()=>{const h=setup(),{actions}=await h.start();expect(actions.canCreate!()).toBe(true);h.env.VITE_XLINK_ENABLE_REAL_WRITES='false';expect(actions.canCreate!()).toBe(false);h.env.VITE_XLINK_ENABLE_REAL_WRITES='true';expect(actions.canCreate!()).toBe(false);expect(h.commands).not.toHaveBeenCalled()})
 it('saves exactly once with real queue-owned uploads and raw root/EXTS readback, never Process',async()=>{const h=setup(),{actions,values}=await h.filled();const result=await actions.saveOnly(values);expect(result.records).toHaveLength(1);expect(h.commands).toHaveBeenCalledTimes(1);expect(h.commands.mock.calls[0]![0].path).toBe('biz/extForm/upsert/media-def');expect(h.saved().infraredImageList).toEqual(values.infraredImageList);expect(h.saved().exts.images1).toEqual(values.images1);expect(h.saved().images1).toBeUndefined();await expect(actions.complete()).rejects.toThrow();await expect(actions.saveOnly(values)).rejects.toThrow();expect(h.commands).toHaveBeenCalledTimes(1)})
})

describe('typed source rejects incomplete or wrong raw evidence without a command',()=>{
 const cases:Array<[string,(h:ReturnType<typeof setup>)=>void]>=[
  ['type0',h=>{h.ext.type='0'}],['numeric type',h=>{h.ext.type=1}],['missing type',h=>{delete h.ext.type}],['wrong col',h=>{h.ext.colName='other'}],['foreign tenant',h=>{h.ext.tenantId='other'}],['wrong definition',h=>{h.ext._id='other'}],['collection alias',h=>{h.ext.collectionName='other'}],
  ['original images1 empty config is not newly proven max10',h=>{h.fields[1].frontEndConfig='{}'}],['unknown calculateConfig',h=>{delete h.fields[1].calculateConfig}],['nonempty calculateConfig',h=>{h.fields[1].calculateConfig='unknown'}],['duplicate max',h=>{h.fields[1].frontEndConfig='{"max":11,"max":10}'}],['duplicate hidden config',h=>{h.fields[1].frontEndConfig='{"max":10,"surveyTool":true,"surveyTool":false}'}],['unknown config',h=>{h.fields[1].frontEndConfig='{"max":10,"fileType":"image"}'}],
  ['wrong preset',h=>{h.fields[1].preset=1}],['wrong required',h=>{h.fields[1].required='0'}],['wrong infrared max',h=>{h.fields[0].frontEndConfig='{"max":5}'}],['missing multiple raw',h=>{delete h.fields[0].multiple}],['conditional rule',h=>{h.fields[1].showType='3';h.fields[1].showField='unknown'}],['provider unknown',h=>{h.fields[1].valueOption='unknown'}],['third field',h=>{h.fields.push({...h.fields[1],_id:'f2',name:'images2'})}],['duplicate identity',h=>{h.fields[1]._id='f0'}],['readOnly field',h=>{h.fields[1].readOnly=1}],['explicit undefined enabled',h=>{h.fields[1].enabled=undefined}],['explicit undefined raw readOnly',h=>{h.fields[1].readOnly=undefined}],['missing showFieldPreset',h=>{delete h.fields[1].showFieldPreset}],['unknown exts rule',h=>{h.fields[1].exts={requiredCondition:'unknown'}}],['excluded mobile',h=>{h.fields[1].showList=[]}],['wrong source node',h=>{h.node.nodeDef.nodeType='forms'}],['readonly node',h=>{h.node.nodeDef.formFieldIdsReadOnly=['f1']}],['fill identity mismatch',h=>{h.node.nodeDef.formFieldIdsFill=['f0','other']}],
 ]
 it.each(cases)('%s',async(_name,change)=>{const h=setup();change(h);let result:Awaited<ReturnType<typeof h.start>>|undefined;try{result=await h.start()}catch{/* Only parser/source load failures are caught; assertions below cannot be swallowed. */}if(result){expect(result.actions).toBeNull();expect(h.reader.currentSurveyMediaSource!(result.s)).toBeNull()};expect(h.commands).not.toHaveBeenCalled()})
})

describe('owned upload lifecycle and save-only revocation',()=>{
 it('caller URLs without this instance upload receipts never save',async()=>{const h=setup(),{actions}=await h.start();const arbitrary=[{url:'https://upload.invalid/forged.png',name:'forged.png',extname:'png'}];await expect(actions.saveOnly({infraredImageList:arbitrary,images1:arbitrary})).rejects.toThrow();expect(h.commands).not.toHaveBeenCalled()})
 it('proof mutation followed by restoration cannot be washed by a new read before save',async()=>{const h=setup(),{s,actions,values}=await h.filled(),proof=h.reader.currentSurveyMediaSource!(s);(s.node as any).lifecycle='finished';expect(h.reader.isCurrentSurveyMediaSource!(s,proof)).toBe(false);(s.node as any).lifecycle='active';await h.reader.load('work','node');await expect(actions.saveOnly(values)).rejects.toThrow();expect(h.commands).not.toHaveBeenCalled()})
 it('cancel invalidates owned receipt and does not delete a saved business record',async()=>{const h=setup(),{actions,values}=await h.filled();expect(await actions.fileMedia!.cancel()).toBe(true);await expect(actions.saveOnly(values)).rejects.toThrow();expect(h.commands).not.toHaveBeenCalled()})
 it('foreign durable uploaded queue entries are never adopted into a new instance',async()=>{const h=setup(),{actions}=await h.filled();actions.fileMedia!.dispose();const next=await h.start();expect(await next.actions.fileMedia!.inspect()).toBe(false);expect(next.actions.fileMedia!.ready({})).toBe(false);expect(h.commands).not.toHaveBeenCalled()})
 it('camera cannot bypass the deferred remote watermark policy',async()=>{const h=setup(),{actions}=await h.start();h.picker.pick.mockResolvedValueOnce(createCapabilityResult('media_file_picker','granted',[{ref:'camera' as never,source:'camera',mimeType:'image/png',localPath:'/synthetic/c.png',name:'c.png',size:100}]) as any);expect(await actions.fileMedia!.pick('f1',{})).toBeNull();expect(h.upload).not.toHaveBeenCalled();expect(h.commands).not.toHaveBeenCalled()})
 it('late upload response after grant loss/restoration does not revive the old provider',async()=>{const h=setup(),{actions}=await h.start();let release!:(x:any)=>void;h.upload.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));const pending=actions.fileMedia!.pick('f0',{});await vi.waitFor(()=>expect(release).toBeTypeOf('function'));h.env.VITE_XLINK_ENABLE_REAL_WRITES='false';expect(actions.canCreate!()).toBe(false);h.env.VITE_XLINK_ENABLE_REAL_WRITES='true';release({state:'succeeded',data:{url:'https://upload.invalid/late.png',key:'late.png',extension:'png',mimeType:'image/png',source:'library',uploadState:'uploaded'}});expect(await pending).toBeNull();expect(actions.canCreate!()).toBe(false);expect(h.commands).not.toHaveBeenCalled()})
 it('existing record rejects typed first-create provider',async()=>{const h=setup();h.setSaved({_id:'existing',tenantId:'tenant',sid:'work',nodeId:'node',workflowId:'run',state:1,infraredImageList:[],exts:{images1:[]}});const {actions}=await h.start();expect(actions).toBeNull();expect(h.commands).not.toHaveBeenCalled()})
 it('an existing-record ID is never turned into create or edit',async()=>{const h=setup(),{actions,values}=await h.filled();await expect(actions.saveOnly(values,'existing')).rejects.toThrow();expect(h.commands).not.toHaveBeenCalled()})
 it.each(['root-shadow','ext-shadow','wrong-media','foreign-identity','false-ack','lost-ack'])('uncertain %s stops after one dispatch with no replay',async mode=>{const h=setup(),{actions,values}=await h.filled();const normal=h.commands.getMockImplementation()!;h.commands.mockImplementationOnce(async req=>{const ack=await normal(req);if(mode==='root-shadow')ack.data.images1=ack.data.exts.images1;if(mode==='ext-shadow')ack.data.exts.infraredImageList=ack.data.infraredImageList;if(mode==='wrong-media')ack.data.exts.images1[0].name='other.png';if(mode==='foreign-identity')ack.data.tenantId='foreign';if(mode==='false-ack')ack.success=false;if(mode==='lost-ack')throw Error('Synthetic response lost after persistence');return ack});await expect(actions.saveOnly(values)).rejects.toThrow();await expect(actions.saveOnly(values)).rejects.toThrow();expect(h.commands).toHaveBeenCalledTimes(1);expect(actions.locked()).toBe(true)})
})

describe('own pending lease must tolerate observational UI interleavings',()=>{
 it.each(['none','canCreate','projectFields','validateDraft','ready','grant-loss','external-read'])('%s',async mode=>{
  const h=setup(),{actions,values}=await h.filled(),normal=h.rawRead.getMockImplementation()!;let release!:()=>void
  h.rawRead.mockImplementationOnce(async req=>{await new Promise<void>(resolve=>{release=resolve});return normal(req)})
  const result=actions.saveOnly(values).then(()=> 'saved',()=> 'rejected')
  await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
  if(mode==='canCreate')actions.canCreate!()
  if(mode==='projectFields')actions.projectFields!(values)
  if(mode==='validateDraft')actions.validateDraft!(values)
  if(mode==='ready')actions.fileMedia!.ready(values)
  if(mode==='grant-loss'){h.env.VITE_XLINK_ENABLE_REAL_WRITES='false';actions.canCreate!();h.env.VITE_XLINK_ENABLE_REAL_WRITES='true'}
  if(mode==='external-read')await h.reader.load('work','node')
  release();const expected=['grant-loss','external-read'].includes(mode)?'rejected':'saved'
  expect(await result).toBe(expected);expect(h.commands).toHaveBeenCalledTimes(expected==='saved'?1:0)
  if(expected==='rejected'){expect(actions.canCreate!()).toBe(false);await expect(actions.saveOnly(values)).rejects.toThrow();expect(h.commands).not.toHaveBeenCalled()}
 })
})

describe('post-dispatch pending lease and sticky phase changes',()=>{
 it.each(['canCreate','projectFields','validateDraft','ready'])('post-ACK %s is observational',async mode=>{
  const h=setup(),{actions,values}=await h.filled(),normal=h.rawRead.getMockImplementation()!;let details=0,release!:()=>void
  h.rawRead.mockImplementation(async req=>{if(req.path.includes('/queryById/')&&++details===3)await new Promise<void>(resolve=>{release=resolve});return normal(req)})
  const result=actions.saveOnly(values);await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
  if(mode==='canCreate')actions.canCreate!();if(mode==='projectFields')actions.projectFields!(values);if(mode==='validateDraft')actions.validateDraft!(values);if(mode==='ready')actions.fileMedia!.ready(values)
  release();expect((await result).records).toHaveLength(1);expect(h.commands).toHaveBeenCalledTimes(1)
 })
 it('mutation observed while command is in flight remains revoked after byte restoration and ACK',async()=>{
  const h=setup(),{s,actions,values}=await h.filled(),normal=h.commands.getMockImplementation()!;let release!:()=>void,active=s
  const load=h.reader.load.bind(h.reader);vi.spyOn(h.reader,'load').mockImplementation(async(...args)=>{active=await load(...args);return active})
  h.commands.mockImplementationOnce(async req=>{await new Promise<void>(resolve=>{release=resolve});return normal(req)})
  const result=actions.saveOnly(values);const rejected=expect(result).rejects.toThrow();await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
  // The action renewed its read lease; revoke the currently owned reader source.
  const proof=h.reader.currentSurveyMediaSource!(active);(active.definition.fields![0] as any).label+='changed';expect(h.reader.isCurrentSurveyMediaSource!(active,proof)).toBe(false);(active.definition.fields![0] as any).label=(active.definition.fields![0] as any).label.replace('changed','');expect(actions.canCreate!()).toBe(false)
  release();await rejected;expect(h.commands).toHaveBeenCalledTimes(1);expect(actions.locked()).toBe(true);await expect(actions.saveOnly(values)).rejects.toThrow();expect(h.commands).toHaveBeenCalledTimes(1)
 })
})

describe('fixed Java ExtField DTO omission contract',()=>{
 it('real ExtField response shape without nonexistent enabled/readOnly fields retains positive typed proof',async()=>{const h=setup();for(const f of h.fields){delete f.enabled;delete f.readOnly}const {s,actions}=await h.start();const proof=h.reader.currentSurveyMediaSource!(s);expect(proof).toBeTruthy();expect(h.reader.isCurrentSurveyMediaSource!(s,proof)).toBe(true);expect(actions).not.toBeNull();expect(h.commands).not.toHaveBeenCalled()})
 it.each([['enabled',0],['enabled',true],['enabled','1'],['enabled',null],['readOnly',1],['readOnly',false],['readOnly','0'],['readOnly',null]] as const)('explicit %s=%j contradicts the narrow contract',async(key,value)=>{const h=setup();h.fields[0][key]=value;let result:Awaited<ReturnType<typeof h.start>>|undefined;try{result=await h.start()}catch{}if(result){expect(result.actions).toBeNull();expect(h.reader.currentSurveyMediaSource!(result.s)).toBeNull()}expect(h.commands).not.toHaveBeenCalled()})
})
