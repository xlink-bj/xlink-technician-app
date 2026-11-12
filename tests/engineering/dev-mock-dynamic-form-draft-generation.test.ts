import { beforeEach,afterEach,describe,expect,it,vi } from 'vitest'
import { createAStageDynamicFormMockController } from '@app/a-stage-dynamic-form-mock-ui'
import { setBusinessMockMode,resetBusinessMockCache } from '@adapters/api/mock/config'
import { resetMockCommandState } from '@adapters/api/mock/command-state'
import { resetMockJourney } from '@adapters/api/mock/journey'
import type { StoragePort } from '@shared/ports'
const form='mock-form-definition-inspection'
const actor={userId:'synthetic-user',roleId:'synthetic-role',identity:'owned'}
const values=(memo:string)=>({inspectionSummary:memo,inspectionResult:'follow_up'})
function fixture(){
 const data=new Map<string,any>();let predicate:(value:any)=>boolean=()=>false,release!:(()=>void),arrived!:(()=>void)
 let reached:Promise<void>=Promise.resolve()
 const port:StoragePort={
  read:async k=>({state:'succeeded',data:structuredClone(data.get(k.namespace+':'+k.key)??null)}),
  write:async(k,v)=>{if(predicate(v)){predicate=()=>false;arrived();await new Promise<void>(r=>{release=r})}data.set(k.namespace+':'+k.key,structuredClone(v));return{state:'succeeded'}},
  remove:async k=>{data.delete(k.namespace+':'+k.key);return{state:'succeeded'}},
  listKeys:async q=>({state:'succeeded',data:[...data.keys()].filter(k=>k.startsWith(q.namespace+':'+(q.prefix??''))).map(k=>k.slice(q.namespace.length+1))}),
 }
 const make=()=>createAStageDynamicFormMockController({kind:'forms',workOrderId:'mock-work-order-020-local-forms',getActor:()=>actor,storage:port})
 const hold=(match:(v:any)=>boolean)=>{predicate=match;reached=new Promise<void>(r=>{arrived=r});return reached}
 return{data,make,hold,release:()=>release()}
}
beforeEach(()=>{vi.stubEnv('VITE_XLINK_H5_MOCK_E2E','true');vi.stubEnv('VITE_XLINK_MOCK','true');vi.stubEnv('VITE_XLINK_ENVIRONMENT','dev');const memory=new Map<string,unknown>();vi.stubGlobal('uni',{getStorageSync:(k:string)=>memory.get(k),setStorageSync:(k:string,v:unknown)=>memory.set(k,v),removeStorageSync:(k:string)=>memory.delete(k)});resetBusinessMockCache();setBusinessMockMode('data');resetMockCommandState();resetMockJourney()})
afterEach(()=>{resetBusinessMockCache();vi.unstubAllEnvs();vi.unstubAllGlobals()})
describe('actual special controller draft generation serialization',()=>{
 it('an old autosave held inside storage cannot overwrite a later submission seal',async()=>{
  const f=fixture(),old=f.make(),fresh=f.make()
  expect(await old.writeDraft(form,values('initial'))).toBe(true);await fresh.readDraft(form)
  const arrived=f.hold(v=>v.status==='unfinished'&&v.values.inspectionSummary==='old held')
  const pending=old.writeDraft(form,values('old held'));await arrived
  let sealed=false;const seal=fresh.sealDraftForSubmission(form,values('sealed new input')).then(v=>{sealed=true;return v})
  for(let i=0;i<50;i++)await Promise.resolve()
  const passedOldWrite=sealed;f.release()
  expect(await pending).toBe(true);expect(await seal).toBe(true);expect(passedOldWrite).toBe(false)
  const records=[...f.data.values()];expect(records.some(v=>v.specialSubmissionPending===true&&v.values.inspectionSummary==='sealed new input')).toBe(true)
  expect(await old.writeDraft(form,values('must not clear seal'))).toBe(false)
 })
 it('queued old writes cannot recreate a completed generation, while a deliberate new generation remains writable',async()=>{
  const f=fixture(),live=f.make(),old=f.make()
  expect(await live.writeDraft(form,values('initial'))).toBe(true);await old.readDraft(form)
  const arrived=f.hold(v=>v.status==='completed');const cleanup=live.removeDraft(form);await arrived
  const captured=values('late old input');const stale=cleanup.then(()=>old.writeDraft(form,captured));f.release()
  expect(await cleanup).toBe(true);expect(await stale).toBe(false)
  expect(await live.writeDraft(form,values('new legitimate input'))).toBe(true)
  expect(await f.make().readDraft(form)).toEqual(values('new legitimate input'))
  expect([...f.data.values()].some(v=>v.status==='completed'&&v.specialDraftGeneration===1)).toBe(true)
 })
 it('a cold controller retains sealed input read-only before any business receipt exists',async()=>{
  const f=fixture(),live=f.make();expect(await live.writeDraft(form,values('not dispatched'))).toBe(true)
  expect(await live.sealDraftForSubmission(form,values('not dispatched'))).toBe(true)
  const cold=f.make();expect(await cold.isDraftSubmissionPending(form)).toBe(true)
  await expect(cold.readDraft(form)).rejects.toThrow()
  expect(await cold.readSealedDraft(form)).toEqual(values('not dispatched'))
  expect(await cold.writeDraft(form,values('do not reopen'))).toBe(false)
 })
 it.each(['marker','generation'] as const)('malformed %s metadata is not an ordinary unfinished draft',async kind=>{
  const f=fixture(),live=f.make();await live.writeDraft(form,values('retained'))
  const row=[...f.data.values()][0]
  if(kind==='marker')row.specialSubmissionPending={unknown:true};else row.specialDraftGeneration=null
  const cold=f.make();await expect(cold.readDraft(form)).rejects.toThrow()
  expect(await cold.writeDraft(form,values('blocked'))).toBe(false)
  expect(await cold.sealDraftForSubmission(form,values('blocked'))).toBe(false)
 })

 it('a corrupt submission marker on a completed base clock cannot open a fresh generation',async()=>{
  const f=fixture(),live=f.make();await live.writeDraft(form,values('old'));expect(await live.removeDraft(form)).toBe(true)
  const clock=[...f.data.values()].find(v=>v.specialDraftGeneration===1);clock.specialSubmissionPending={unknown:true}
  const cold=f.make();await expect(cold.readDraft(form)).rejects.toThrow()
  expect(await cold.writeDraft(form,values('blocked'))).toBe(false)
 })

})
