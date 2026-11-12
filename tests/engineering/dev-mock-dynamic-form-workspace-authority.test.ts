import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { setBusinessMockMode,resetBusinessMockCache } from '@adapters/api/mock/config'
import { resetMockCommandState } from '@adapters/api/mock/command-state'
import { resetMockJourney } from '@adapters/api/mock/journey'
import { tryMockRead } from '@adapters/api/mock/router'
import * as commands from '@adapters/api/mock/r1-special-protocol'
import { workOrderDetail } from '@adapters/api/read-models/work-order'
import { mockR1FormsWorkOrderId,mockR1RepeatWorkOrderId } from '@adapters/api/mock/fixtures'
import { resolveAStageDynamicFormMockWorkspace,createAStageDynamicFormMockControllerForActor } from '@app/a-stage-dynamic-form-mock-ui'
import { asOpaqueId } from '@shared/types'
const memory=new Map<string,unknown>()
const actor={userId:'synthetic-user',roleId:'synthetic-role',identity:'owned-session'}
beforeEach(()=>{
 vi.stubEnv('VITE_XLINK_ENVIRONMENT','dev');vi.stubEnv('VITE_XLINK_H5_MOCK_E2E','true');vi.stubEnv('VITE_XLINK_MOCK','true')
 memory.clear();vi.stubGlobal('uni',{
  getStorageSync:(k:string)=>memory.get(k),setStorageSync:(k:string,v:unknown)=>memory.set(k,v),removeStorageSync:(k:string)=>memory.delete(k),
  getStorage:(o:any)=>memory.has(o.key)?o.success({data:memory.get(o.key)}):o.fail({}),getStorageInfo:(o:any)=>o.success({keys:[...memory.keys()]}),
  setStorage:(o:any)=>{memory.set(o.key,o.data);o.success?.()},removeStorage:(o:any)=>{memory.delete(o.key);o.success?.()},
 });resetBusinessMockCache();setBusinessMockMode('data');resetMockCommandState();resetMockJourney()
})
afterEach(()=>{resetBusinessMockCache();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks()})
async function input(kind:'forms'|'repeat'='forms'){
 const id=kind==='forms'?mockR1FormsWorkOrderId:mockR1RepeatWorkOrderId
 const raw=await tryMockRead('basic/serviceAppointment/queryById/'+id,{}, {latencyMs:0})
 const detail=workOrderDetail(raw,asOpaqueId<'WorkOrderId'>(id),new Map(),new Map())
 const node=detail.workflowNodes!.find(n=>n.sourceNodeType===kind)!
 return{detail,runtimeNodeId:String(node.id),actionIntent:'interact_with_form',getActor:()=>actor}
}
describe('actual app-owned DEV special host read qualification',()=>{
 it.each(['forms','repeat'] as const)('qualifies existing active %s without issuing a command',async kind=>{
  const spy=vi.spyOn(commands,'tryMockR1SpecialCommand');const i=await input(kind)
  expect(await resolveAStageDynamicFormMockWorkspace(i)).toMatchObject({kind,mode:'active',node:{id:i.runtimeNodeId}})
  expect(spy).not.toHaveBeenCalled()
 })
 it.each(['node','run','definition','order','actor','action','environment'])('refuses unverified %s before mounting a controller',async variant=>{
  const i=await input();const n=i.detail.workflowNodes![0]!
  if(variant==='node')i.runtimeNodeId='foreign'
  if(variant==='run')Object.assign(n,{runId:'foreign'})
  if(variant==='definition')Object.assign(n,{formDefinitionId:'foreign'})
  if(variant==='order')Object.assign(i.detail,{id:'foreign'})
  if(variant==='actor')i.getActor=()=>({...actor,userId:'other'})
  if(variant==='action')i.actionIntent='place_order'
  if(variant==='environment')vi.stubEnv('VITE_XLINK_H5_MOCK_E2E','false')
  expect(await resolveAStageDynamicFormMockWorkspace(i)).toBeNull()
 })
 it('closed source state10 yields readonly summary; mapped closed without matching source is not proof',async()=>{
  const stale=await input();Object.assign(stale.detail.workflowNodes![0],{lifecycle:'closed'})
  expect(await resolveAStageDynamicFormMockWorkspace(stale)).toBeNull()
  const ui=createAStageDynamicFormMockControllerForActor({kind:'forms',workOrderId:mockR1FormsWorkOrderId,getActor:()=>actor})
  expect((await ui.execute({kind:'save_finish',fields:{inspectionSummary:'synthetic source closed',inspectionResult:'follow_up'}})).state).toBe('succeeded')
  expect(await resolveAStageDynamicFormMockWorkspace(await input())).toMatchObject({mode:'completed'})
 })
 it('keeps closed may-have-dispatched pending, unresolved and non-recoverable without resending',async()=>{
  const actual=commands.tryMockR1SpecialCommand
  const spy=vi.spyOn(commands,'tryMockR1SpecialCommand').mockImplementation(async(...args)=>{
   const result=await actual(...args);if(args[0].path==='workflow/process')throw Error('lost Process acknowledgement');return result
  })
  const ui=createAStageDynamicFormMockControllerForActor({kind:'forms',workOrderId:mockR1FormsWorkOrderId,getActor:()=>actor})
  expect((await ui.execute({kind:'save_finish',fields:{inspectionSummary:'synthetic closed pending',inspectionResult:'follow_up'}})).state).toBe('uncertain')
  const count=spy.mock.calls.length
  expect(await resolveAStageDynamicFormMockWorkspace(await input())).toMatchObject({mode:'pending'})
  expect(await ui.load()).toMatchObject({nodeActive:false,nodeClosed:true,receiptPending:true,pendingRecoverable:false})
  expect(spy).toHaveBeenCalledTimes(count)
 })
 it('a sealed submitted draft survives failed tombstone and cannot become a new editable draft on cold controller',async()=>{
  const args={kind:'forms' as const,workOrderId:mockR1FormsWorkOrderId,getActor:()=>actor}
  const ui=createAStageDynamicFormMockControllerForActor(args),view=await ui.load(),fields={inspectionSummary:'sealed once',inspectionResult:'follow_up'}
  const formId=String(view.definition.id);expect(await ui.writeDraft(formId,fields)).toBe(true)
  expect(await ui.sealDraftForSubmission(formId,fields)).toBe(true)
  const spy=vi.spyOn(commands,'tryMockR1SpecialCommand')
  expect((await ui.execute({kind:'save',fields})).state).toBe('succeeded');const count=spy.mock.calls.length
  const api=uni as any,original=api.setStorage
  api.setStorage=(o:any)=>JSON.parse(o.data).status==='completed'?o.fail({}):original(o)
  expect(await ui.removeDraft(formId)).toBe(false)
  const cold=createAStageDynamicFormMockControllerForActor(args)
  expect(await cold.isDraftSubmissionPending(formId)).toBe(true)
  await expect(cold.readDraft(formId)).rejects.toThrow()
  expect(await cold.writeDraft(formId,{inspectionSummary:'must not overwrite sealed input'})).toBe(false)
  expect(await cold.sealDraftForSubmission(formId,fields)).toBe(false)
  expect(spy).toHaveBeenCalledTimes(count)
 })

})
