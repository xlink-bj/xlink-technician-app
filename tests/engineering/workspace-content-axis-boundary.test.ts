import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {createPinia,setActivePinia} from 'pinia'
import {useActionWorkspaceStore} from '@features/work-orders/action-workspace'
import {detailWorkflowProjectionFor} from '@features/work-orders/detail-workflow'
import {createActionDraftRepository} from '@runtimes/action'
import {asOpaqueId,type OperationSnapshot} from '@shared/types'
import type {AppointmentFormRead,DynamicFormRead,SessionSnapshot,StoragePort,TechnicianApiReadPort,TechnicianApiCommandPort,WorkOrderDetail} from '@shared/ports'
import type {DevMockDynamicFormWorkspaceResolver} from '@features/work-orders/dev-mock-dynamic-form-workspace-content'
const id=asOpaqueId<'WorkOrderId'>('axis-order'),nodeId=asOpaqueId<'WorkflowNodeRuntimeId'>('axis-node'),definitionId=asOpaqueId<'FormDefinitionId'>('axis-definition')
const session:SessionSnapshot={sessionRef:asOpaqueId<'SessionRef'>('axis-session'),user:{id:asOpaqueId<'UserId'>('axis-user')},currentRole:{id:asOpaqueId<'RoleId'>('axis-role')},capabilityNames:[]}
const success=<T>(data:T):OperationSnapshot<T>=>({state:'succeeded',data})
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{promise,resolve}}
function fixture(kind:'appointment'|'survey'|'forms'|'repeat'='appointment',registered=true){
 const normal=kind==='forms'||kind==='repeat',appointment=kind==='appointment'
 const detail:WorkOrderDetail={id,workflowNodes:[{id:nodeId,category:kind==='repeat'?'repeat':'forms',...(normal?{sourceNodeType:kind}:{}),lifecycle:'active',displayName:'Existing content',formPurpose:appointment?'appointment':kind==='survey'?'survey':undefined,formDefinitionId:definitionId,visibility:{evidenceState:'verified',viewableRoleIds:[session.currentRole!.id]}}]}
 const appointmentForm:AppointmentFormRead={definitionId,fields:[{fieldId:'need',valueKey:'need',label:'Need visit',type:'radio',required:true,readOnly:false,options:[{value:'1',label:'Yes'},{value:'0',label:'No'}]},{fieldId:'datetime',valueKey:'datetime',label:'Visit time',type:'datetime',required:true,readOnly:false},{fieldId:'note',valueKey:'note',label:'Note',type:'textarea',required:false,readOnly:false}],values:{}}
 // Same verified experience contract as survey-leakage-cause.test.ts; not a new profile.
 const survey:DynamicFormRead={definitionId,purpose:'survey',fields:[{fieldId:'trigger',valueKey:'leakageCauseSelect',label:'Select cause',type:'select',required:false,readOnly:false,showList:['4'],visibility:{kind:'includes',path:'part',value:'roof'}},{fieldId:'value',valueKey:'leakageCause',label:'Selected causes',type:'data',required:true,multiple:true,readOnly:false,showList:['4'],visibility:{kind:'includes',path:'part',value:'roof'}}],values:{part:'roof'}}
 const values=new Map<string,unknown>(),storage:StoragePort={read:vi.fn(async k=>success((values.get(k.key)??null) as never)),write:vi.fn(async(k,v)=>{values.set(k.key,v);return success(undefined)}),remove:vi.fn(async k=>{values.delete(k.key);return success(undefined)}),listKeys:vi.fn(async()=>success([...values.keys()]))}
 const read=vi.fn(async(_requested?:unknown)=>success(detail)),readAppointment=vi.fn(async()=>success(structuredClone(appointmentForm))),readDynamic=vi.fn(async()=>success(structuredClone(survey))),execute=vi.fn(async()=>({state:'failed_terminal' as const})),resolver=vi.fn<DevMockDynamicFormWorkspaceResolver>(async()=>null),navigate=vi.fn(async(_url:string)=>{}),back=vi.fn(async()=>{})
 const store=useActionWorkspaceStore();store.configure({apiRead:{getWorkOrderDetail:read} as unknown as TechnicianApiReadPort,commandApi:{readAppointmentForm:readAppointment,readDynamicForm:readDynamic,submitAppointment:execute,saveDynamicForm:execute,completeWorkflowNode:execute} as unknown as TechnicianApiCommandPort,draftRepository:createActionDraftRepository(storage),storage,navigation:{navigate,replace:navigate,back},getSession:()=>session,debounceMs:60000,normalFormContentEnabled:()=>normal,...(registered?{devMockDynamicFormResolver:resolver}:{}),surveyLeakageCauseProvider:{query:vi.fn(async()=>success([{part:'roof',id:'cause-roof-1',label:'Roof detail'}]))}})
 const request={workOrderId:id,workflowNodeId:nodeId,actionIntent:appointment?'set_appointment':'interact_with_form'}
 return{store,detail,request,read,readAppointment,readDynamic,execute,resolver,storage,values,navigate,back,appointmentForm}
}
beforeEach(()=>setActivePinia(createPinia()))
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks()})
describe('data adapter and content experience are independent of a registered DEV resolver',()=>{
 it.each([false,true])('preserves enabled appointment time/confirmation and local values with resolver registration=%s',async registered=>{
  const f=fixture('appointment',registered);try{
   expect(detailWorkflowProjectionFor(f.detail,session).currentTask?.execution).toBe('enabled')
   const page={};expect((await f.store.ensureLoaded({...f.request,pageLease:page})).state).toBe('succeeded')
   expect(f.store.appointmentForm).not.toBeNull();expect(f.store.normalFormNode).toBeNull();expect(f.store.devMockDynamicFormContent).toBeNull()
   for(const [key,value] of [['need','1'],['datetime','2028-02-29 10:00'],['note','keep on time-page return']])expect(f.store.setField(key!,value!).state).toBe('succeeded')
   expect((await f.store.openAppointmentTimeSelection()).state).toBe('succeeded')
   expect(f.navigate.mock.calls[0]?.[0]).toContain('/action-time?')
   // Actual child pages call ensureLoaded without a pageLease.
   expect((await f.store.ensureLoaded(f.request)).state).toBe('succeeded')
   expect((await f.store.continueToConfirmation()).state).toBe('succeeded')
   expect(f.navigate.mock.calls[1]?.[0]).toContain('/action-confirmation?')
   expect((await f.store.ensureLoaded({...f.request,pageLease:{}})).state).toBe('succeeded')
   expect(f.store.appointmentForm?.values.note).toBe('keep on time-page return');expect(f.readAppointment).toHaveBeenCalledTimes(1)
   expect(f.execute).not.toHaveBeenCalled()
  }finally{f.store.clear()}
 })
 it('retains the existing Survey-specific experience when the DEV resolver returns null',async()=>{
  const f=fixture('survey');try{
   expect(detailWorkflowProjectionFor(f.detail,session).currentTask?.execution).toBe('enabled')
   expect((await f.store.ensureLoaded({...f.request,pageLease:{}})).state).toBe('succeeded')
   expect(f.store.dynamicForm?.purpose).toBe('survey');expect(f.store.surveyLeakageCauseExperience).toMatchObject({triggerField:{fieldId:'trigger'},valueField:{fieldId:'value'}})
   expect(f.store.normalFormNode).toBeNull();expect(f.store.devMockDynamicFormContent).toBeNull();expect(f.readDynamic).toHaveBeenCalledTimes(1);expect(f.execute).not.toHaveBeenCalled()
  }finally{f.store.clear()}
 })
 it.each(['forms','repeat'] as const)('keeps disabled normal %s on its original provider host and freshly rereads same page',async kind=>{
  const f=fixture(kind),page={};try{
   expect(detailWorkflowProjectionFor(f.detail,session).currentTask?.execution).toBe('disabled_read_only')
   expect((await f.store.ensureLoaded({...f.request,pageLease:page})).state).toBe('succeeded');const old=f.store.descriptor
   expect((await f.store.ensureLoaded({...f.request,pageLease:page})).state).toBe('succeeded')
   expect(f.read).toHaveBeenCalledTimes(2);expect(f.store.descriptor).not.toBe(old);expect(f.store.normalFormNode?.sourceNodeType).toBe(kind)
   expect(f.readAppointment).not.toHaveBeenCalled();expect(f.readDynamic).not.toHaveBeenCalled();expect(f.execute).not.toHaveBeenCalled();expect(f.store.canSubmit).toBe(false)
  }finally{f.store.clear()}
 })
 it('ignores an old delayed-null resolver after a newer page obtains the enabled appointment',async()=>{
  const f=fixture(),arrived=deferred<void>(),done=deferred<null>(),old={},fresh={};try{
   f.resolver.mockImplementationOnce(()=>{arrived.resolve();return done.promise})
   const pending=f.store.ensureLoaded({...f.request,pageLease:old});await arrived.promise
   expect((await f.store.ensureLoaded({...f.request,pageLease:fresh})).state).toBe('succeeded');const action=f.store.descriptor
   done.resolve(null);expect(await pending).toMatchObject({error:{category:'cancelled'}});f.store.leavePage(null,old)
   expect(f.store.descriptor).toBe(action);expect(f.store.appointmentForm).not.toBeNull();expect(f.readAppointment).toHaveBeenCalledTimes(1);expect(f.execute).not.toHaveBeenCalled()
  }finally{f.store.clear()}
 })
 it('does not commit a delayed null resolver after its owning page left',async()=>{
  const f=fixture(),arrived=deferred<void>(),done=deferred<null>(),page={};try{
   f.resolver.mockImplementationOnce(()=>{arrived.resolve();return done.promise})
   const pending=f.store.ensureLoaded({...f.request,pageLease:page});await arrived.promise;f.store.leavePage(null,page);done.resolve(null)
   expect(await pending).toMatchObject({error:{category:'cancelled'}});expect(f.store.descriptor).toBeNull();expect(f.readAppointment).not.toHaveBeenCalled();expect(f.execute).not.toHaveBeenCalled()
  }finally{f.store.clear()}
 })
 it.each([false,true])('does not commit a late enabled form read after page departure (resolver=%s)',async registered=>{
  const f=fixture('appointment',registered),arrived=deferred<void>(),done=deferred<OperationSnapshot<AppointmentFormRead>>(),page={};try{
   f.readAppointment.mockImplementationOnce(()=>{arrived.resolve();return done.promise})
   const pending=f.store.ensureLoaded({...f.request,pageLease:page});await arrived.promise
   f.store.leavePage(null,page);done.resolve(success({...f.appointmentForm,values:{note:'late wrong page'}}))
   expect(await pending).toMatchObject({error:{category:'cancelled'}});expect(f.store.descriptor).toBeNull();expect(f.store.appointmentForm).toBeNull();expect(f.execute).not.toHaveBeenCalled()
  }finally{f.store.clear()}
 })
 it('lets the newer page own an enabled form read after the resolver already returned null',async()=>{
  const f=fixture(),arrived=deferred<void>(),done=deferred<OperationSnapshot<AppointmentFormRead>>(),old={},fresh={};try{
   f.readAppointment.mockImplementationOnce(()=>{arrived.resolve();return done.promise})
   const pending=f.store.ensureLoaded({...f.request,pageLease:old});await arrived.promise
   const newer=await f.store.ensureLoaded({...f.request,pageLease:fresh})
   done.resolve(success({...f.appointmentForm,values:{note:'old response'}}))
   expect(newer.state).toBe('succeeded');expect(await pending).toMatchObject({error:{category:'cancelled'}})
   expect(f.store.appointmentForm?.values.note).not.toBe('old response');expect(f.execute).not.toHaveBeenCalled()
  }finally{f.store.clear()}
 })

 it('qualifies only the actual existing DEV synthetic scope through its real resolver and source',async()=>{
  const {setBusinessMockMode,resetBusinessMockCache}=await import('@adapters/api/mock/config')
  const {resetMockCommandState}=await import('@adapters/api/mock/command-state')
  const {resetMockJourney}=await import('@adapters/api/mock/journey')
  const {tryMockRead}=await import('@adapters/api/mock/router')
  const protocol=await import('@adapters/api/mock/r1-special-protocol')
  const {workOrderDetail}=await import('@adapters/api/read-models/work-order')
  const {mockR1FormsWorkOrderId}=await import('@adapters/api/mock/fixtures')
  const {resolveAStageDynamicFormMockWorkspace}=await import('@app/a-stage-dynamic-form-mock-ui')
  vi.stubEnv('VITE_XLINK_ENVIRONMENT','dev');vi.stubEnv('VITE_XLINK_H5_MOCK_E2E','true');vi.stubEnv('VITE_XLINK_MOCK','true')
  const memory=new Map<string,unknown>();vi.stubGlobal('uni',{getStorageSync:(k:string)=>memory.get(k),setStorageSync:(k:string,v:unknown)=>memory.set(k,v),removeStorageSync:(k:string)=>memory.delete(k),getStorage:(o:any)=>memory.has(o.key)?o.success({data:memory.get(o.key)}):o.fail({}),getStorageInfo:(o:any)=>o.success({keys:[...memory.keys()]}),setStorage:(o:any)=>{memory.set(o.key,o.data);o.success?.()},removeStorage:(o:any)=>{memory.delete(o.key);o.success?.()}})
  resetBusinessMockCache();setBusinessMockMode('data');resetMockCommandState();resetMockJourney()
  const f=fixture('forms'),commands=vi.spyOn(protocol,'tryMockR1SpecialCommand')
  try{
   const raw=await tryMockRead('basic/serviceAppointment/queryById/'+mockR1FormsWorkOrderId,{}, {latencyMs:0})
   const detail=workOrderDetail(raw,asOpaqueId<'WorkOrderId'>(mockR1FormsWorkOrderId),new Map(),new Map()),node=detail.workflowNodes!.find(n=>n.sourceNodeType==='forms')!
   const actualSession:SessionSnapshot={...session,user:{id:asOpaqueId<'UserId'>('synthetic-user')},currentRole:{id:asOpaqueId<'RoleId'>('synthetic-role')}}
   f.store.configure({apiRead:{getWorkOrderDetail:async()=>success(detail)} as unknown as TechnicianApiReadPort,commandApi:{readDynamicForm:f.readDynamic,readAppointmentForm:f.readAppointment} as unknown as TechnicianApiCommandPort,storage:f.storage,draftRepository:createActionDraftRepository(f.storage),getSession:()=>actualSession,navigation:{navigate:f.navigate},devMockDynamicFormResolver:resolveAStageDynamicFormMockWorkspace})
   const request={workOrderId:detail.id,workflowNodeId:node.id,actionIntent:'interact_with_form',pageLease:{}}
   expect((await f.store.ensureLoaded(request)).state).toBe('succeeded');expect(f.store.devMockDynamicFormContent?.mode).toBe('active');expect(f.store.normalFormNode).toBeNull();expect(f.store.descriptor?.execution).toBe('disabled')
   vi.stubEnv('VITE_XLINK_H5_MOCK_E2E','false')
   expect((await f.store.ensureLoaded({...request,pageLease:{}})).state).not.toBe('succeeded')
   expect(f.store.devMockDynamicFormContent).toBeNull();expect(commands).not.toHaveBeenCalled();expect(f.readAppointment).not.toHaveBeenCalled();expect(f.readDynamic).not.toHaveBeenCalled()
  }finally{f.store.clear();resetBusinessMockCache()}
 })

 it.each(['depart','supersede'] as const)('cancels an ordinary preload awaiting the previous local draft write after %s',async mode=>{
  const f=fixture(),arrived=deferred<void>(),writeDone=deferred<void>(),pageA={},pageB={},pageC={}
  const bId=asOpaqueId<'WorkOrderId'>('axis-preload-B'),cId=asOpaqueId<'WorkOrderId'>('axis-preload-C')
  const bNode=asOpaqueId<'WorkflowNodeRuntimeId'>('axis-preload-node-B'),cNode=asOpaqueId<'WorkflowNodeRuntimeId'>('axis-preload-node-C')
  try{
   expect((await f.store.ensureLoaded({...f.request,pageLease:pageA})).state).toBe('succeeded')
   expect(f.store.setField('note','A local draft write in progress').state).toBe('succeeded')
   const original=vi.mocked(f.storage.write).getMockImplementation()!
   vi.mocked(f.storage.write).mockImplementationOnce(async(key,value)=>{arrived.resolve();await writeDone.promise;return original(key,value)})
   const writing=f.store.saveDraft();await arrived.promise
   f.read.mockImplementation(async requested=>success({...f.detail,id:requested as typeof id,workflowNodes:[{...f.detail.workflowNodes![0]!,id:requested===bId?bNode:cNode}]}))
   const enteringB=f.store.ensureLoaded({workOrderId:bId,workflowNodeId:bNode,actionIntent:'set_appointment',pageLease:pageB})
   for(let i=0;i<30;i++)await Promise.resolve()
   expect(f.read).toHaveBeenCalledTimes(1);expect(f.store.loadState).toBe('succeeded')
   const enteringC=mode==='supersede'?f.store.ensureLoaded({workOrderId:cId,workflowNodeId:cNode,actionIntent:'set_appointment',pageLease:pageC}):null
   if(mode==='depart')f.store.leavePage(null,pageB)
   writeDone.resolve();await writing
   if(enteringC){expect((await enteringC).state).toBe('succeeded');expect(f.store.setField('note','C current owned draft').state).toBe('succeeded')}
   expect(await enteringB).toMatchObject({error:{category:'cancelled'}})
   expect(f.read.mock.calls.filter(([requested])=>requested===bId)).toHaveLength(0)
   if(enteringC){expect(f.store.descriptor?.workOrderId).toBe(cId);expect(f.store.appointmentForm?.values.note).toBe('C current owned draft')}
   else expect(f.store.descriptor?.workOrderId).toBe(id)
   expect(f.execute).not.toHaveBeenCalled()
  }finally{writeDone.resolve();f.store.clear()}
 })

})
