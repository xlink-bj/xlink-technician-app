import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { useNormalFormActionPage, formHostHasDetailBack } from '@features/work-orders/normal-form-action-page'
import { createActionDraftRepository } from '@runtimes/action'
import { ref } from 'vue'
import { asOpaqueId } from '@shared/types'
import type { SessionSnapshot,StoragePort,TechnicianApiReadPort,TechnicianApiCommandPort,WorkOrderDetail } from '@shared/ports'
import type { DevMockDynamicFormWorkspaceResolver,DevMockDynamicFormWorkspaceContent } from '@features/work-orders/dev-mock-dynamic-form-workspace-content'
const id=asOpaqueId<'WorkOrderId'>('special'),nodeId=asOpaqueId<'WorkflowNodeRuntimeId'>('runtime')
const request={workOrderId:id,workflowNodeId:nodeId,actionIntent:'interact_with_form'}
function fixture(){
 let actor:SessionSnapshot={sessionRef:asOpaqueId<'SessionRef'>('session'),user:{id:asOpaqueId<'UserId'>('user')},currentRole:{id:asOpaqueId<'RoleId'>('role')},capabilityNames:[]}
 const detail:WorkOrderDetail={id,workflowNodes:[{id:nodeId,sourceNodeType:'forms',category:'forms',lifecycle:'active',displayName:'Existing special controller',formDefinitionId:asOpaqueId<'FormDefinitionId'>('definition'),visibility:{evidenceState:'verified',viewableRoleIds:[actor.currentRole!.id]}}]}
 const generic=vi.fn(),write=vi.fn(),back=vi.fn(async()=>{}),read=vi.fn(async()=>({state:'succeeded' as const,data:detail}))
 const storage={read:vi.fn(async()=>({state:'succeeded',data:null})),write,remove:vi.fn()} as unknown as StoragePort
 const resolve=vi.fn<DevMockDynamicFormWorkspaceResolver>(async input=>({node:input.detail.workflowNodes![0]!,kind:'forms',mode:'active'}))
 const store=useActionWorkspaceStore();store.configure({apiRead:{getWorkOrderDetail:read} as unknown as TechnicianApiReadPort,
  commandApi:{readDynamicForm:generic,readAppointmentForm:generic,submitDynamicForm:generic,completeWorkflow:generic} as unknown as TechnicianApiCommandPort,
  draftRepository:createActionDraftRepository(storage),storage,navigation:{navigate:vi.fn(async()=>{}),back},getSession:()=>actor,devMockDynamicFormResolver:resolve})
 return{store,detail,generic,write,back,read,resolve,setActor:()=>{actor={...actor,sessionRef:asOpaqueId<'SessionRef'>('replacement')}},get actor(){return actor}}
}
beforeEach(()=>setActivePinia(createPinia()))
describe('DEV special read-qualified content before generic action setup',()=>{
 it('hosts the existing controller without generic reads, draft identity or writable descriptor',async()=>{
  const f=fixture(),lease={};expect((await f.store.ensureLoaded({...request,pageLease:lease})).state).toBe('succeeded')
  expect(f.store.devMockDynamicFormContent?.node.id).toBe(nodeId);expect(f.store.normalFormNode).toBeNull()
  expect(f.store.descriptor?.execution).toBe('disabled');expect(f.store.dynamicForm).toBeNull();expect(f.store.canSubmit).toBe(false)
  await f.store.submit();expect(f.generic).not.toHaveBeenCalled();expect(f.write).not.toHaveBeenCalled()
 })
 it('admits only resolver-verified closed readonly or pending qualification without generic writes',async()=>{
  const f=fixture();Object.assign(f.detail.workflowNodes![0],{lifecycle:'closed'})
  f.resolve.mockResolvedValueOnce({node:f.detail.workflowNodes![0]!,kind:'forms',mode:'completed'})
  expect((await f.store.ensureLoaded({...request,pageLease:{}})).state).toBe('succeeded')
  expect(f.store.devMockDynamicFormContent?.mode).toBe('completed');expect(f.store.canSubmit).toBe(false)
  f.resolve.mockResolvedValueOnce({node:f.detail.workflowNodes![0]!,kind:'forms',mode:'pending'})
  expect((await f.store.ensureLoaded({...request,pageLease:{}})).state).toBe('succeeded')
  expect(f.generic).not.toHaveBeenCalled();expect(f.write).not.toHaveBeenCalled()
 })
 it('retains an owned completed readonly result after authoritative refresh, not from a route flag',async()=>{
  const f=fixture(),lease={};await f.store.ensureLoaded({...request,pageLease:lease});const action=f.store.descriptor
  Object.assign(f.detail.workflowNodes![0],{lifecycle:'closed'})
  f.resolve.mockResolvedValueOnce({node:f.detail.workflowNodes![0]!,kind:'forms',mode:'pending'})
  await f.store.refreshNormalContext(action,lease);expect(f.store.devMockDynamicFormContent?.mode).toBe('pending')
  f.resolve.mockResolvedValueOnce({node:f.detail.workflowNodes![0]!,kind:'forms',mode:'completed'})
  await f.store.refreshNormalContext(action,lease);expect(f.store.devMockDynamicFormContent?.mode).toBe('completed')
  expect(f.generic).not.toHaveBeenCalled()
 })
 it.each(['session','page'])('ignores late special resolution after %s replacement',async kind=>{
  const f=fixture(),lease={};let finish!:(v:DevMockDynamicFormWorkspaceContent)=>void
  f.resolve.mockImplementationOnce(()=>new Promise(r=>{finish=r}))
  const pending=f.store.ensureLoaded({...request,pageLease:lease});await Promise.resolve();await Promise.resolve()
  if(kind==='session')f.setActor();else f.store.leavePage(f.store.descriptor,lease)
  finish({node:f.detail.workflowNodes![0]!,kind:'forms',mode:'active'})
  expect((await pending).state).not.toBe('succeeded');expect(f.store.devMockDynamicFormContent).toBeNull();expect(f.generic).not.toHaveBeenCalled()
 })
 it('awaits the hosted Panel flush and keeps the page on failure without generic fallback',async()=>{
  const f=fixture(),lease={};await f.store.ensureLoaded({...request,pageLease:lease})
  const page=useNormalFormActionPage({workspace:f.store,pageLease:lease,isNavigating:ref(false),getAction:()=>f.store.descriptor,matchesRoute:()=>true})
  page.fromDetail.value=true;page.content.value={flushLocalDraft:async()=>false}
  expect(await page.exit()).toBe(true);expect(f.back).not.toHaveBeenCalled();expect(page.message.value).toContain('尚未安全保存')
  page.content.value={flushLocalDraft:async()=>true};expect(await page.exit()).toBe(true);expect(f.back).toHaveBeenCalledTimes(1)
  expect(f.generic).not.toHaveBeenCalled();expect(f.write).not.toHaveBeenCalled()
 })
})

it('cold/mismatched form-host navigation uses explicit Detail fallback, while warm same-order Back is retained',()=>{
 const route={id:'special',from:'detail'}
 expect(formHostHasDetailBack(route,[{route:'pages/work-orders/action-workspace',options:route}])).toBe(false)
 expect(formHostHasDetailBack(route,[{route:'pages/work-orders/detail',options:{id:'foreign'}},{route:'pages/work-orders/action-workspace'}])).toBe(false)
 expect(formHostHasDetailBack(route,[{route:'pages/work-orders/work-orders'},{route:'pages/work-orders/action-workspace'}])).toBe(false)
 expect(formHostHasDetailBack(route,[{route:'pages/work-orders/detail',options:{id:'special'}},{route:'pages/work-orders/action-workspace'}])).toBe(true)
})
