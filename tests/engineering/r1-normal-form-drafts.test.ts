import {describe,it,expect} from 'vitest'
import {asOpaqueId} from '@shared/types'
import {createR1NormalFormDraftProvider} from '@app/r1-normal-form-drafts'
import {r1NormalDraftValues} from '@features/work-orders/r1-normal-form-drafts'
import {createActionDraftRepository} from '@runtimes/action'
import type {StoragePort,StorageKey,SessionSnapshot} from '@shared/ports'
import type {R1NodeFormsSnapshot,R1NodeFormsReader} from '@features/work-orders/r1-node-forms-read'
import type {R1RepeatPageActions} from '@features/work-orders/r1-repeat-actions-port'

function fixture(){
 const data=new Map<string,unknown>()
 let readGate:Promise<void>|null=null,writeGate:Promise<void>|null=null,failRead=false,failWrite=false,failRemove=false
 const key=(k:StorageKey)=>k.namespace+':'+k.key
 const failed=()=>({state:'failed_terminal' as const})
 const storage:StoragePort={
  async read<T>(k:StorageKey){if(readGate)await readGate;if(failRead)return failed();return{state:'succeeded',data:structuredClone(data.get(key(k))??null) as T|null}},
  async write<T>(k:StorageKey,v:T){if(writeGate)await writeGate;if(failWrite)return failed();data.set(key(k),structuredClone(v));return{state:'succeeded',data:undefined}},
  async remove(k){if(failRemove)return failed();data.delete(key(k));return{state:'succeeded',data:undefined}},
  async listKeys(q){return{state:'succeeded',data:[...data.keys()].filter(k=>k.startsWith(q.namespace+':'+(q.prefix??''))).map(k=>k.slice(q.namespace.length+1))}},
 }
 let actor:SessionSnapshot={sessionRef:asOpaqueId<'SessionRef'>('secret-never-persist'),user:{id:asOpaqueId<'UserId'>('u')},currentRole:{id:asOpaqueId<'RoleId'>('r')},roleVersion:'v1',capabilityNames:[]}
 const source={workOrderId:'s',node:{id:'n',runId:'w',formDefinitionId:'e',sourceNodeType:'forms',formFieldIdsReadOnly:[],category:'forms',lifecycle:'active'},definition:{id:'e',fields:[
  {fieldId:'memo',valueKey:'memo',label:'备注',type:'text',required:false,readOnly:false},
  {fieldId:'count',valueKey:'count',label:'数量',type:'number',required:false,readOnly:false},
  {fieldId:'choice',valueKey:'choice',label:'选择',type:'select',multiple:true,required:false,readOnly:false,options:[{value:'a',label:'甲'},{value:'b',label:'乙'}]},
  {fieldId:'flag',valueKey:'flag',label:'开关',type:'switch',required:false,readOnly:false},
  {fieldId:'photo',valueKey:'photo',label:'图片',type:'file',required:false,readOnly:false},
 ]},fillableFieldIds:['memo','count','choice','flag','photo'],records:[]} as unknown as R1NodeFormsSnapshot
 let current:R1NodeFormsSnapshot|null=source,locked=false
 const reader={isCurrent:(s:R1NodeFormsSnapshot)=>s===current} as R1NodeFormsReader
 const actions={locked:()=>locked,canCreate:()=>true,projectFields:(values:Readonly<Record<string,unknown>>)=>source.definition.fields!.map(f=>({...f,options:f.options??[],multiple:!!f.multiple,supported:!f.readOnly&&!source.node.formFieldIdsReadOnly?.includes(f.fieldId),visible:!(f.valueKey==='memo'&&values.flag==='hidden')})),updateCreateDraft:(v:Record<string,unknown>,k:string,x:unknown)=>({...v,[k]:x})} as unknown as R1RepeatPageActions
 const repository=createActionDraftRepository(storage)
 const make=(tenantId='t')=>createR1NormalFormDraftProvider({auth:{getCurrentSession:()=>actor},reader,tenantId,repository})
 const provider=make()
 return{source,actions,data,repository,provider,make,setCurrent:(s:R1NodeFormsSnapshot|null)=>current=s,setActor:(s:SessionSnapshot)=>actor=s,get actor(){return actor},setLocked:(v:boolean)=>locked=v,
  gateRead:(v:Promise<void>|null)=>readGate=v,gateWrite:(v:Promise<void>|null)=>writeGate=v,failRead:()=>failRead=true,failWrite:()=>failWrite=true,failRemove:()=>failRemove=true,resetFailures:()=>{failRead=false;failWrite=false;failRemove=false},
  open:()=>provider.open(current!,actions)!,fresh:()=>{current=structuredClone(source);return current},}
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return{promise,resolve}}

describe('normal nonmedia draft boundary',()=>{
 it('restores text and choices after a new controller/read, with no persisted session or media',async()=>{
  const f=fixture(),s=f.open();expect(await s.read()).toEqual({state:'empty'})
  await s.save({memo:'  原文  ',count:0,flag:false,choice:['b'],photo:[{url:'must-not-persist',receipt:'private'}]})
  expect(JSON.stringify([...f.data.values()])).not.toMatch(/secret-never-persist|must-not-persist|receipt/)
  const fresh=f.fresh(),next=f.provider.open(fresh,f.actions)!;expect(await next.read()).toEqual({state:'recoverable',values:{memo:'  原文  ',count:0,flag:false,choice:['b']}})
 })
 it.each([{memo:''},{count:0},{flag:false},{choice:[]}])('keeps an explicit empty/false/zero draft %j',async values=>{
  const f=fixture(),s=f.open();await s.read();await s.save(values)
  expect(await f.open().read()).toEqual({state:'recoverable',values})
 })
 it.each(['__proto__','constructor','prototype','unknown'])('rejects unsafe/unknown key %s',key=>{
  const f=fixture();expect(()=>r1NormalDraftValues(f.source,f.actions,JSON.parse(`{"${key}":"bad"}`))).toThrow()
 })
 it('rejects file wire values on recovery and invalid choice/type values without silently dropping them',()=>{
  const f=fixture();for(const values of [{photo:[]},{choice:['missing']},{count:'NaN'},{memo:{secret:true}},{count:Infinity}])expect(()=>r1NormalDraftValues(f.source,f.actions,values,true)).toThrow()
 })
 it.each(['readOnly','options','type','hidden','records','fillable'])('preserves and blocks after fresh %s drift',async mode=>{
  const f=fixture(),s=f.open();await s.read();await s.save({memo:'draft',choice:['a']});const before=JSON.stringify([...f.data])
  const next=f.fresh() as any
  if(mode==='readOnly')next.definition.fields[0].readOnly=true
  if(mode==='options')next.definition.fields[2].options=[{value:'b',label:'乙'}]
  if(mode==='type')next.definition.fields[0].type='number'
  if(mode==='hidden')next.definition.fields[0].visibility={kind:'equals',path:'flag',value:'hidden'}
  if(mode==='records')next.records=[{id:'saved',definitionId:'e',values:{memo:'server'}}]
  if(mode==='fillable')next.fillableFieldIds=['choice']
  expect((await f.provider.open(next,f.actions)!.read()).state).toBe('blocked');expect(JSON.stringify([...f.data])).toBe(before)
 })
 it('does not share drafts across tenant, user, role, run, definition, node or order',async()=>{
  const f=fixture(),s=f.open();await s.read();await s.save({memo:'private'})
  expect(await f.make('other-tenant').open(f.source,f.actions)!.read()).toEqual({state:'empty'})
  for(const changes of [{user:{id:'other-user'}},{currentRole:{id:'other-role'}}]){
   const old=f.actor;f.setActor({...old,...changes} as SessionSnapshot);expect(await f.open().read()).toEqual({state:'empty'});f.setActor(old)
  }
  for(const [field,value] of [['workOrderId','other-order'],['node.id','other-node'],['node.runId','other-run'],['definition.id','other-definition']]){
   const next=f.fresh() as any;if(field.includes('.')){const [a,b]=field.split('.');next[a][b]=value;if(field==='definition.id')next.node.formDefinitionId=value}else next[field]=value
   expect(await f.provider.open(next,f.actions)!.read()).toEqual({state:'empty'})
  }
 })
 it('does not block existing edit or append when no first-create draft exists',async()=>{
  const f=fixture(),source=f.source as any;source.records=[{id:'existing',definitionId:'e',values:{memo:'server'}}]
  const edit={...f.actions,canCreate:()=>false,canEdit:()=>true}
  expect(await f.provider.open(source,edit)!.read()).toEqual({state:'empty'})
  expect(await f.provider.open(source,f.actions)!.read()).toEqual({state:'empty'})
  expect(f.data.size).toBe(0)
 })
 it('rejects missing tenant/run/role and observed revocation; no cached writer is reconstructed',async()=>{
  const f=fixture();expect(f.make('').open(f.source,f.actions)).toBeNull()
  const s=f.open();await s.read();await s.save({memo:'safe'});f.setLocked(true);await expect(s.save({memo:'x'})).rejects.toThrow();expect((await s.read()).state).toBe('blocked')
  f.setLocked(false);f.setActor({...f.actor,currentRole:undefined});expect(f.provider.open(f.source,f.actions)).toBeNull()
 })
 it('finishes an accepted slow local write before remount reads, then rejects late old callbacks',async()=>{
  const f=fixture(),s=f.open();await s.read();const gate=deferred();f.gateWrite(gate.promise)
  const write=s.save({memo:'rapid navigation'});const next=f.provider.open(f.fresh(),f.actions)!,read=next.read();gate.resolve();await write
  expect(await read).toEqual({state:'recoverable',values:{memo:'rapid navigation'}})
  await expect(s.save({memo:'late overwrite'})).rejects.toThrow()
 })
 it.each(['discard','complete'] as const)('orders slow writes before %s and never revives the deleted draft',async method=>{
  const f=fixture(),s=f.open();await s.read();const gate=deferred();f.gateWrite(gate.promise)
  const write=s.save({memo:'pending'}),done=s[method]();gate.resolve();await write;await done
  expect(await f.open().read()).toEqual({state:'empty'});await expect(s.save({memo:'late'})).rejects.toThrow()
 })
 it('preserves uncertain writes across restart and refuses save/discard replay',async()=>{
  const f=fixture(),s=f.open();await s.read();await s.save({memo:'draft'});await s.markUncertain({memo:'draft'})
  const next=f.make().open(f.fresh(),f.actions)!
  expect((await next.read()).state).toBe('uncertain');await expect(next.save({memo:'duplicate'})).rejects.toThrow();await expect(next.discard()).rejects.toThrow()
  expect(JSON.stringify([...f.data])).toContain('draft')
 })
 it('keeps a non-recoverable tombstone if success cleanup removal fails',async()=>{
  const f=fixture(),s=f.open();await s.read();await s.save({memo:'draft'});f.failRemove();await expect(s.complete()).rejects.toThrow()
  expect((await f.open().read()).state).toBe('blocked')
 })
 it.each(['write','remove'])('retries local cleanup after transient %s failure without replaying commands',async stage=>{
  const f=fixture(),s=f.open();await s.read();await s.save({memo:'local'})
  if(stage==='write')f.failWrite();else f.failRemove()
  await expect(s.discard()).rejects.toThrow();f.resetFailures();await s.discard();expect(await f.open().read()).toEqual({state:'empty'})
 })
 it('persists the uncertain fence before invoking any business writer could lock the action',async()=>{
  const f=fixture(),s=f.open();await s.read();await s.markUncertain({memo:'before command'});f.setLocked(true)
  const next=f.make().open(f.fresh(),f.actions)!;expect((await next.read()).state).toBe('uncertain');await expect(next.discard()).rejects.toThrow()
 })
 it('exposes read/write failures and does not claim local success',async()=>{
  const f=fixture();f.failRead();expect((await f.open().read()).state).toBe('failed')
  const g=fixture(),s=g.open();await s.read();g.failWrite();await expect(s.save({memo:'not persisted'})).rejects.toThrow();expect(g.data.size).toBe(0)
 })
 it('rejects another runtime revision without overwriting its only copy',async()=>{
  const f=fixture(),a=f.open();await a.read();const b=f.make().open(f.source,f.actions)!;await b.read();await b.save({memo:'other runtime'})
  await expect(a.save({memo:'stale'})).rejects.toThrow();expect(JSON.stringify([...f.data])).toContain('other runtime')
 })
 it('does not treat in-place session object mutation as the old actor',async()=>{
  const f=fixture(),s=f.open();await s.read();(f.actor.user as any).id='new-user';await expect(s.save({memo:'must not cross accounts'})).rejects.toThrow();expect(f.data.size).toBe(0)
 })
 it('a late read after actor revocation never offers recovery',async()=>{
  const f=fixture(),s=f.open();await s.read();await s.save({memo:'draft'});const next=f.open(),gate=deferred();f.gateRead(gate.promise)
  const read=next.read();f.setActor({...f.actor,sessionRef:'other-session' as SessionSnapshot['sessionRef']});gate.resolve();expect((await read).state).toBe('blocked')
 })
})
