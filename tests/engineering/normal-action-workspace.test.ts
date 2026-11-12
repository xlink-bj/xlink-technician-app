import { ref } from 'vue'
import { useNormalFormActionPage } from '@features/work-orders/normal-form-action-page'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { detailWorkflowProjectionFor } from '@features/work-orders/detail-workflow'
import { createActionDraftRepository } from '@runtimes/action'
import { asOpaqueId } from '@shared/types'
import type { SessionSnapshot, StoragePort, TechnicianApiReadPort, TechnicianApiCommandPort, WorkOrderDetail } from '@shared/ports'
const id=asOpaqueId<'WorkOrderId'>('ordinary'),node=asOpaqueId<'WorkflowNodeRuntimeId'>('node')
const request={workOrderId:id,workflowNodeId:node,actionIntent:'interact_with_form'}
function fixture(){
 let enabled=true
 let actor:SessionSnapshot={sessionRef:asOpaqueId<'SessionRef'>('session'),user:{id:asOpaqueId<'UserId'>('user')},currentRole:{id:asOpaqueId<'RoleId'>('role')},capabilityNames:[]}
 const detail:WorkOrderDetail={id,displayNumber:'SYNTHETIC',workflowNodes:[{id:node,category:'forms',sourceNodeType:'forms',lifecycle:'active',displayName:'Configured fields',formDefinitionId:asOpaqueId<'FormDefinitionId'>('definition'),visibility:{evidenceState:'verified',viewableRoleIds:[actor.currentRole!.id]}}]}
 const read=vi.fn(async()=>({state:'succeeded' as const,data:detail})),generic=vi.fn(),execute=vi.fn(),write=vi.fn(async()=>({state:'succeeded' as const,data:undefined}))
 const storage={read:vi.fn(async()=>({state:'succeeded',data:null})),write,remove:vi.fn(async()=>({state:'succeeded',data:undefined}))} as unknown as StoragePort
 const back=vi.fn(async()=>{}),store=useActionWorkspaceStore()
 store.configure({apiRead:{getWorkOrderDetail:read} as unknown as TechnicianApiReadPort,commandApi:{readDynamicForm:generic,readAppointmentForm:generic,submitDynamicForm:execute,completeWorkflow:execute} as unknown as TechnicianApiCommandPort,draftRepository:createActionDraftRepository(storage),storage,navigation:{navigate:vi.fn(async()=>{}),back},getSession:()=>actor,normalFormContentEnabled:()=>enabled})
 return{store,detail,read,generic,execute,write,back,disable:()=>{enabled=false},actor:()=>actor,setActor:(next:SessionSnapshot)=>{actor=next}}
}
beforeEach(()=>setActivePinia(createPinia()))
describe('normal controller content host is read-side eligibility only',()=>{
 it('opens the normal branch without a generic form read/draft or command permission',async()=>{
  const f=fixture();expect(detailWorkflowProjectionFor(f.detail,f.actor()).currentTask?.execution).toBe('disabled_read_only')
  const result=await f.store.ensureLoaded({...request,pageLease:{}})
  expect(result.state).toBe('succeeded');expect(f.store.normalFormNode?.id).toBe(node)
  expect(f.store.descriptor?.execution).toBe('disabled');expect(f.store.dynamicForm).toBeNull();expect(f.store.canSubmit).toBe(false)
  await f.store.submit();await f.store.saveDynamicForm()
  expect(f.generic).not.toHaveBeenCalled();expect(f.execute).not.toHaveBeenCalled();expect(f.write).not.toHaveBeenCalled()
 })
 it('hosts the existing normal appointment Repeat controller without a generic appointment adapter',async()=>{
  const f=fixture();Object.assign(f.detail.workflowNodes![0],{sourceNodeType:'repeat',category:'repeat',formPurpose:'appointment'})
  const task=detailWorkflowProjectionFor(f.detail,f.actor()).currentTask!
  expect(task.actionIntent).toBe('set_appointment');expect(task.execution).toBe('disabled_read_only')
  const result=await f.store.ensureLoaded({...request,actionIntent:'set_appointment',pageLease:{}})
  expect(result.state).toBe('succeeded');expect(f.store.normalFormNode?.sourceNodeType).toBe('repeat')
  expect(f.store.descriptor?.execution).toBe('disabled');expect(f.generic).not.toHaveBeenCalled();expect(f.execute).not.toHaveBeenCalled()
 })
 it('freshly reloads the same normal route and ignores the departed page lease',async()=>{
  const f=fixture(),old={},fresh={};await f.store.ensureLoaded({...request,pageLease:old});const previous=f.store.descriptor
  await f.store.ensureLoaded({...request,pageLease:fresh});const current=f.store.descriptor
  expect(f.read).toHaveBeenCalledTimes(2);f.store.leavePage(previous,old)
  expect(f.store.descriptor).toBe(current);expect(f.store.ownsPage(current,fresh)).toBe(true)
  f.store.leavePage(current,fresh);expect(f.store.normalFormNode).toBeNull()
 })
 it.each(['wrong-node','wrong-action','closed','no-definition'])('does not open %s via the read-only exception',async kind=>{
  const f=fixture();if(kind==='closed')Object.assign(f.detail.workflowNodes![0],{lifecycle:'closed'});if(kind==='no-definition')Object.assign(f.detail.workflowNodes![0],{formDefinitionId:undefined})
  const result=await f.store.ensureLoaded({...request,...(kind==='wrong-node'?{workflowNodeId:asOpaqueId<'WorkflowNodeRuntimeId'>('wrong')}:{}),...(kind==='wrong-action'?{actionIntent:'place_order'}:{})})
  expect(result.state).not.toBe('succeeded');expect(f.generic).not.toHaveBeenCalled();expect(f.execute).not.toHaveBeenCalled()
 })
 it('rereads authoritative task after changed and closes a replaced or failed host without granting a generic command',async()=>{
  const f=fixture(),lease={};await f.store.ensureLoaded({...request,pageLease:lease});const action=f.store.descriptor
  const page=useNormalFormActionPage({workspace:f.store,pageLease:lease,isNavigating:ref(false),getAction:()=>action,matchesRoute:()=>true})
  expect(page.isContent.value).toBe(true)
  await f.store.refreshNormalContext(action,lease);expect(f.read).toHaveBeenCalledTimes(2);expect(f.store.normalFormNode?.id).toBe(node)
  Object.assign(f.detail.workflowNodes![0],{lifecycle:'closed'})
  await f.store.refreshNormalContext(action,lease);expect(f.store.normalFormNode).toBeNull();expect(f.store.canSubmit).toBe(false)
  expect(await page.exit()).toBe(false) // Own closed content may use the ordinary safe page exit.
  expect(f.execute).not.toHaveBeenCalled();expect(f.generic).not.toHaveBeenCalled()
 })
 it('rejects a late authoritative read after an observed session change',async()=>{
  const f=fixture();let finish!:(v:any)=>void;f.read.mockImplementation(()=>new Promise(r=>{finish=r}))
  const old=f.actor(),pending=f.store.ensureLoaded({...request,pageLease:{}});f.setActor({...old,sessionRef:asOpaqueId<'SessionRef'>('new-session')});finish({state:'succeeded',data:f.detail})
  expect((await pending).state).not.toBe('succeeded');f.setActor(old)
  expect(f.store.normalFormNode).toBeNull();expect(f.store.canSubmit).toBe(false);expect(f.execute).not.toHaveBeenCalled()
 })
 it('awaits normal persistence on platform Back and allows only one navigation for duplicate exits',async()=>{
  const f=fixture(),lease={};await f.store.ensureLoaded({...request,pageLease:lease})
  const page=useNormalFormActionPage({workspace:f.store,pageLease:lease,isNavigating:ref(false),getAction:()=>f.store.descriptor,matchesRoute:()=>true})
  page.fromDetail.value=true;let finish!:(ok:boolean)=>void
  page.content.value={flushLocalDraft:()=>new Promise(r=>{finish=r})}
  expect(page.backPress({from:'backbutton'})).toBe(true)
  expect(await page.exit()).toBe(true);expect(f.back).not.toHaveBeenCalled()
  finish(true);await Promise.resolve();await Promise.resolve()
  expect(f.back).toHaveBeenCalledTimes(1);expect(page.backPress({from:'navigateBack'})).toBe(false)
  expect(f.execute).not.toHaveBeenCalled();expect(f.write).not.toHaveBeenCalled()
 })
 it('keeps a failed local flush on the normal page and never falls through to generic exit',async()=>{
  const f=fixture(),lease={};await f.store.ensureLoaded({...request,pageLease:lease})
  const page=useNormalFormActionPage({workspace:f.store,pageLease:lease,isNavigating:ref(false),getAction:()=>f.store.descriptor,matchesRoute:()=>true})
  page.content.value={flushLocalDraft:async()=>false}
  expect(await page.exit()).toBe(true);expect(page.message.value).toContain('尚未安全保存')
  expect(page.isContent.value).toBe(true);expect(f.back).not.toHaveBeenCalled();expect(f.execute).not.toHaveBeenCalled()
 })
 it('does not let an old pending exit navigate away from a newer action page',async()=>{
  const f=fixture(),lease={};await f.store.ensureLoaded({...request,pageLease:lease});const action=f.store.descriptor
  const page=useNormalFormActionPage({workspace:f.store,pageLease:lease,isNavigating:ref(false),getAction:()=>action,matchesRoute:()=>true})
  let finish!:(ok:boolean)=>void;page.content.value={flushLocalDraft:()=>new Promise(r=>{finish=r})}
  const pending=page.exit();await f.store.ensureLoaded({...request,pageLease:{}});finish(true)
  expect(await pending).toBe(true);expect(f.back).not.toHaveBeenCalled();expect(f.store.descriptor).not.toBe(action)
  expect(f.execute).not.toHaveBeenCalled()
 })

 it('consumes an already superseded normal page exit instead of falling through to generic exit',async()=>{
  const f=fixture(),lease={};await f.store.ensureLoaded({...request,pageLease:lease});const action=f.store.descriptor
  const page=useNormalFormActionPage({workspace:f.store,pageLease:lease,isNavigating:ref(false),getAction:()=>action,matchesRoute:()=>true})
  expect(page.isContent.value).toBe(true)
  await f.store.ensureLoaded({...request,pageLease:{}})
  expect(page.isContent.value).toBe(false)
  expect(await page.exit()).toBe(true)
  expect(f.back).not.toHaveBeenCalled();expect(f.execute).not.toHaveBeenCalled()
 })

 it('does not let an older overlapping changed refresh replace the newer authoritative task view',async()=>{
  const f=fixture(),lease={};await f.store.ensureLoaded({...request,pageLease:lease});const action=f.store.descriptor
  let oldDone!:(v:any)=>void,newDone!:(v:any)=>void
  f.read.mockImplementationOnce(()=>new Promise(r=>{oldDone=r})).mockImplementationOnce(()=>new Promise(r=>{newDone=r}))
  const older=f.store.refreshNormalContext(action,lease),newer=f.store.refreshNormalContext(action,lease)
  const detail=(name:string)=>({...f.detail,workflowNodes:[{...f.detail.workflowNodes![0],displayName:name}]})
  newDone({state:'succeeded',data:detail('newer-authoritative')});await newer
  expect(f.store.normalFormNode?.displayName).toBe('newer-authoritative')
  oldDone({state:'succeeded',data:detail('older-response')});await older
  expect(f.store.normalFormNode?.displayName).toBe('newer-authoritative')
  expect(f.execute).not.toHaveBeenCalled();expect(f.write).not.toHaveBeenCalled()
 })

 it('rejects a foreign Detail identity before replacing the normal host',async()=>{
  const f=fixture(),lease={};await f.store.ensureLoaded({...request,pageLease:lease});const action=f.store.descriptor
  f.read.mockResolvedValueOnce({state:'succeeded',data:{...f.detail,id:asOpaqueId<'WorkOrderId'>('foreign-order')}})
  await f.store.refreshNormalContext(action,lease)
  expect(f.store.detail?.id).toBe(id);expect(f.store.normalFormNode).toBeNull();expect(f.store.loadState).toBe('blocked')
  expect(f.execute).not.toHaveBeenCalled();expect(f.generic).not.toHaveBeenCalled()
 })
 it('rechecks the current reader gate on changed rather than retaining the old host',async()=>{
  const f=fixture(),lease={};await f.store.ensureLoaded({...request,pageLease:lease});const action=f.store.descriptor
  f.disable();await f.store.refreshNormalContext(action,lease)
  expect(f.store.normalFormNode).toBeNull();expect(f.store.loadState).toBe('blocked');expect(f.execute).not.toHaveBeenCalled()
 })
 it.each([false,true])('owns and cancels an action-omitted normal route (pending=%s)',async pending=>{
  const f=fixture(),lease={};let finish!:(v:any)=>void
  if(pending)f.read.mockImplementationOnce(()=>new Promise(r=>{finish=r}))
  const load=f.store.ensureLoaded({workOrderId:id,workflowNodeId:node,pageLease:lease})
  if(!pending){expect((await load).state).toBe('succeeded');expect(f.store.normalFormNode?.id).toBe(node)}
  f.store.leavePage(f.store.descriptor,lease)
  if(pending){finish({state:'succeeded',data:f.detail});expect((await load).state).not.toBe('succeeded')}
  expect(f.store.normalFormNode).toBeNull();expect(f.store.descriptor).toBeNull();expect(f.execute).not.toHaveBeenCalled()
 })

})
