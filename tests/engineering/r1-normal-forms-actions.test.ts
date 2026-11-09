import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {createNormalFormsActionProvider,createNormalNodeFormActionProvider,parseR1FormsGrant} from '@app/r1-forms-authorization'
import {normalNodeFormsReadEnabled} from '@app/r1-node-forms-read'
import type {R1NodeFormsSnapshot} from '@features/work-orders/r1-node-forms-read'
import {installLocalFixtureBrowser} from './local-fixture-lock-test-support'
const wire=vi.hoisted(()=>({execute:vi.fn()}))
vi.mock('@adapters/api/uni-api-command-transport',()=>({createUniApiCommandTransport:()=>wire}))
const scope={tenantId:'t',userId:'u',roleId:'r',workOrderId:'s',workflowRunId:'w',runtimeNodeId:'n',formDefinitionId:'e'}
const origin='http://127.0.0.1:5189'
const grant={version:1,scope,expiresAt:'2099-01-01T00:00:00Z',fieldIds:['area'],operations:['create']}
function setup(){
 let session={sessionRef:'synthetic',user:{id:'u'},currentRole:{id:'r'}}
 let exts:any={formList:[{_id:'old-deleted',formDefId:'e',state:-1,unknownRow:{retain:true}}],unknownNode:{retain:[1,'yes']}}
 const original=structuredClone(exts)
 let row:any=null,readFault='',readCount=0
 const base={workOrderId:'s',node:{id:'n',runId:'w',formDefinitionId:'e',sourceNodeType:'forms',nodeTypeEvidence:'runtime_node_def',lifecycle:'active',handlers:[{kind:'user',userId:'u'}],visibility:{evidenceState:'verified',viewableRoleIds:['r']},formFieldIdsReadOnly:[]},definition:{id:'e',fields:[{fieldId:'area',valueKey:'area',type:'digit',label:'Area',required:true,readOnly:false}]},fillableFieldIds:['area'],records:[]} as unknown as R1NodeFormsSnapshot
 let current:R1NodeFormsSnapshot|null=base
 const reader={enabled:()=>true,clear:()=>{current=null},isCurrent:(s:R1NodeFormsSnapshot)=>s===current,
  currentFormsExts:(s:R1NodeFormsSnapshot)=>s===current?structuredClone(exts):null,
  load:vi.fn(async()=>{
   readCount++
   if(readFault==='preflight'){current=null;throw Error('synthetic read failure')}
   const records=(base.node.sourceNodeType==='repeat'||exts.formList.some((r:any)=>r._id==='saved'))&&row?[{id:'saved',definitionId:'e',workflowRunId:'w',values:{area:row.area}}]:[]
   if(readFault==='missing'&&readCount>1)records.length=0
   current=structuredClone({...base,records}) as unknown as R1NodeFormsSnapshot;return current!
  })}
 wire.execute.mockImplementation(async(req:any)=>{
  if(req.path==='biz/extForm/upsert/e'){row=JSON.parse(String(req.body.dataStr));return {success:true,status:1,data:{_id:'saved'}}}
  if(req.path==='workflowNode/updateExts/n'){exts=structuredClone(req.jsonBody);return {success:true,status:1}}
  throw Error('Unexpected command')
 })
 const env:any={DEV:true,VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_AUTH_TENANT:'t',VITE_XLINK_API_BASE_URL:origin+'/xlink/wm',VITE_XLINK_MOCK:'false',VITE_XLINK_ENABLE_REAL_WRITES:'true',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true',VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_R1_FORMS_ACTIONS:'true',VITE_XLINK_R1_FORMS_GRANT:JSON.stringify(grant)}
 const dependencies={env,origin,reader,auth:{getCurrentSession:()=>session as never}}
 const provider=()=>createNormalFormsActionProvider(dependencies)
 const combined=()=>createNormalNodeFormActionProvider(dependencies)
 return {base,reader,env,provider,combined,original,get exts(){return exts},setFault:(s:string)=>{readFault=s},changeUser:()=>{session={...session,user:{id:'other'}}},moveAway:()=>{current=structuredClone({...base,workOrderId:'other'});return current}}
}
beforeEach(()=>{installLocalFixtureBrowser();wire.execute.mockReset()})
afterEach(()=>vi.unstubAllGlobals())
describe('normal forms local create-only integration',()=>{
 it('uses forms upsert and full EXTS, preserves old metadata, exact reads, and never processes',async()=>{
  const h=setup(),action=h.provider().forSnapshot(h.base)!
  const after=await action.saveOnly({area:3})
  expect(after.records[0]?.id).toBe('saved');expect(h.reader.isCurrent(after)).toBe(true)
  expect(wire.execute.mock.calls.map(([r])=>r.path)).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
  expect(h.exts.unknownNode).toEqual(h.original.unknownNode);expect(h.exts.formList[0]).toEqual(h.original.formList[0])
  expect(h.exts.formList[1]).toMatchObject({_id:'saved',formDefId:'e',state:1})
  expect(h.reader.load).toHaveBeenCalledTimes(3)
  expect(h.provider().forSnapshot(after)).toBeNull()
  await expect(action.complete()).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it.each([{}, {area:'invalid'}, {area:-1,tenantId:'foreign'}, {area:3,_id:'existing'}])('rejects invalid/extra fields before dispatch %j',async values=>{
  const h=setup(),a=h.provider().forSnapshot(h.base)!
  await expect(a.saveOnly(values)).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled();expect(a.locked()).toBe(false)
 })
 it('revokes the failed preflight lease and saves the unchanged draft only through a new action after explicit reread',async()=>{
  const h=setup(),a=h.provider().forSnapshot(h.base)!,values={area:3};h.setFault('preflight')
  await expect(a.saveOnly(values)).rejects.toThrow();expect(a.locked()).toBe(true);expect(values).toEqual({area:3})
  const reads=h.reader.load.mock.calls.length
  await expect(a.saveOnly(values)).rejects.toThrow();expect(h.reader.load).toHaveBeenCalledTimes(reads)
  expect(wire.execute).not.toHaveBeenCalled()
  h.setFault('');const fresh=await h.reader.load(),renewed=h.provider().forSnapshot(fresh)!
  expect(renewed.locked()).toBe(false);expect(wire.execute).not.toHaveBeenCalled()
  await renewed.saveOnly(values);expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it('delegates a server-typed repeat snapshot and save to the original Repeat provider through the normal wrapper',async()=>{
  const h=setup();Object.assign(h.base.node,{sourceNodeType:'repeat'})
  delete h.env.VITE_XLINK_R1_FORMS_ACTIONS;delete h.env.VITE_XLINK_R1_FORMS_GRANT
  h.env.VITE_XLINK_R1_REPEAT_ACTIONS='true'
  h.env.VITE_XLINK_R1_REPEAT_GRANT=JSON.stringify({...grant,operations:['create','complete']})
  const a=h.combined().forSnapshot(h.base)!
  expect(a).not.toBeNull();expect((await a.saveOnly({area:3})).records[0]?.id).toBe('saved')
  expect(wire.execute.mock.calls.map(([req])=>req.path)).toEqual(['biz/extForm/upsert/e'])
  expect(h.reader.load).toHaveBeenCalledTimes(2);expect(h.exts).toEqual(h.original)
 })
 it.each([{success:true,status:0,data:{_id:'saved'}},{success:true,status:1,data:{_id:'saved',id:'other'}},{success:true,status:1,data:{}},{success:false,status:0}])('locks unknown or contradictory upsert ACK without EXTS or replay %j',async ack=>{
  const h=setup(),a=h.provider().forSnapshot(h.base)!;wire.execute.mockResolvedValueOnce(ack)
  await expect(a.saveOnly({area:3})).rejects.toThrow();expect(a.locked()).toBe(true)
  await expect(a.saveOnly({area:3})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(1)
  expect(h.provider().forSnapshot(h.reader.isCurrent(h.base)?h.base:await h.reader.load())?.locked()).toBe(true)
 })
 it('holds an EXTS ACK failure with saved ID in a persistent receipt',async()=>{
  const h=setup(),a=h.provider().forSnapshot(h.base)!,execute=wire.execute.getMockImplementation()!
  wire.execute.mockImplementation(async r=>r.path.includes('updateExts')?{success:true,status:0}:execute(r))
  await expect(a.saveOnly({area:3})).rejects.toThrow();expect(a.locked()).toBe(true)
  const receipt=JSON.parse(localStorage.getItem('xlink:r1-forms-receipt:'+JSON.stringify(Object.values(scope)))!)
  expect(receipt).toEqual({version:1,stage:'exts_may_have_dispatched',savedId:'saved'})
  expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it('locks acknowledged saves when the independent record read is missing',async()=>{
  const h=setup(),a=h.provider().forSnapshot(h.base)!;h.setFault('missing')
  await expect(a.saveOnly({area:3})).rejects.toThrow();expect(a.locked()).toBe(true);expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it.each(['handler','exts','fieldReadOnly'])('stops before EXTS if %s changes during the upsert',async kind=>{
  const h=setup(),a=h.provider().forSnapshot(h.base)!,execute=wire.execute.getMockImplementation()!
  wire.execute.mockImplementationOnce(async r=>{
   const ack=await execute(r)
   if(kind==='handler')Object.assign(h.base.node,{handlers:[{kind:'user',userId:'other'}]})
   else if(kind==='exts')h.exts.unknownNode.retain.push('changed')
   else Object.assign(h.base.definition.fields![0]!,{readOnly:true})
   return ack
  })
  await expect(a.saveOnly({area:3})).rejects.toThrow();expect(a.locked()).toBe(true)
  expect(wire.execute).toHaveBeenCalledTimes(1)
 })
 it.each(['page','user'])('rejects late upsert ACK after %s changes before EXTS or old reread',async kind=>{
  const h=setup(),a=h.provider().forSnapshot(h.base)!;let release!:(v:unknown)=>void
  wire.execute.mockReturnValueOnce(new Promise(resolve=>{release=resolve}))
  const pending=a.saveOnly({area:3}),outcome=expect(pending).rejects.toThrow()
  await vi.waitFor(()=>expect(wire.execute).toHaveBeenCalledTimes(1))
  if(kind==='page')h.moveAway();else h.changeUser()
  const count=h.reader.load.mock.calls.length;release({success:true,status:1,data:{_id:'saved'}});await outcome
  expect(h.reader.load).toHaveBeenCalledTimes(count);expect(wire.execute).toHaveBeenCalledTimes(1);expect(a.locked()).toBe(true)
 })
 it('rejects concurrent duplicate click rather than queues another save',async()=>{
  const h=setup(),a=h.provider().forSnapshot(h.base)!;let release!:(v:unknown)=>void
  const original=wire.execute.getMockImplementation()!;wire.execute.mockImplementationOnce(async r=>{await new Promise(resolve=>{release=resolve});return original(r)})
  const first=a.saveOnly({area:3});await vi.waitFor(()=>expect(wire.execute).toHaveBeenCalledTimes(1))
  await expect(a.saveOnly({area:3})).rejects.toThrow();release(null);await first;expect(wire.execute).toHaveBeenCalledTimes(2)
 })
 it.each(['production','noFlag','wrongNode','noExts','readOnly','repeat','existing','wrongFields','viewOnly','closed'])('does not offer forms actions for %s',kind=>{
  const h=setup()
  if(kind==='production')h.env.VITE_XLINK_ENVIRONMENT='production'
  if(kind==='noFlag')delete h.env.VITE_XLINK_R1_FORMS_ACTIONS
  if(kind==='wrongNode')Object.assign(h.base.node,{id:'other'})
  if(kind==='noExts')h.reader.currentFormsExts=()=>null
  if(kind==='readOnly')Object.assign(h.base.node,{formFieldIdsReadOnly:['area']})
  if(kind==='repeat')Object.assign(h.base.node,{sourceNodeType:'repeat'})
  if(kind==='existing')Object.assign(h.base,{records:[{id:'old'}]})
  if(kind==='wrongFields')Object.assign(h.base,{fillableFieldIds:[]})
  if(kind==='viewOnly')Object.assign(h.base.node,{handlers:[{kind:'user',userId:'someone-else'}]})
  if(kind==='closed')Object.assign(h.base.node,{lifecycle:'completed'})
  expect(h.provider().forSnapshot(h.base)).toBeNull();expect(wire.execute).not.toHaveBeenCalled()
 })
 it('requires a forms create-only grant independently of repeat or complete permissions',()=>{
  const h=setup();expect(normalNodeFormsReadEnabled(h.env,origin)).toBe(true)
  expect(parseR1FormsGrant(JSON.stringify({...grant,operations:['create','complete']}))).toBeNull()
  expect(parseR1FormsGrant(JSON.stringify({...grant,expiresAt:'2000-01-01'}))).toBeNull()
  expect(parseR1FormsGrant(JSON.stringify({...grant,scope:{...scope,extra:'x'}}))).toBeNull()
  expect(parseR1FormsGrant(JSON.stringify({...grant,fieldIds:['area','area']}))).toBeNull()
 })
 it.each([
  {area:3,choice:'invalid'},
  {area:3,choice:'yes'},
  {area:3,choice:'no',reason:'hidden submission'},
 ])('rejects illegal options, conditional required or hidden submitted fields %j',async values=>{
  const h=setup(),fields=[...h.base.definition.fields!,
   {fieldId:'choice',valueKey:'choice',type:'radio',label:'Choice',required:true,readOnly:false,options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]},
   {fieldId:'reason',valueKey:'reason',type:'text',label:'Reason',required:true,readOnly:false,visibility:{kind:'equals',path:'choice',value:'yes'}}]
  Object.assign(h.base.definition,{fields});Object.assign(h.base,{fillableFieldIds:['area','choice','reason']})
  h.env.VITE_XLINK_R1_FORMS_GRANT=JSON.stringify({...grant,fieldIds:['area','choice','reason']})
  const a=h.provider().forSnapshot(h.base)!
  await expect(a.saveOnly(values)).rejects.toThrow();expect(wire.execute).not.toHaveBeenCalled();expect(a.locked()).toBe(false)
 })
})

describe('selected FormData ACK ownership before linking EXTS',()=>{
 const variants=['data','entity','root'] as const
 const matching={tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',workflowRunId:'w',runId:'w',definitionId:'e',extId:'e',formDefId:'e',formDefinitionId:'e',smodule:'serviceAppointment',state:1}
 for(const container of variants){
  const envelope=(record:Record<string,unknown>)=>container==='root'?{success:true,status:1,...record}:{success:true,status:1,[container]:record}
  it.each(Object.keys(matching))(`${container}: rejects contradictory %s before EXTS and retains the pending lock`,async key=>{
   const h=setup(),a=h.provider().forSnapshot(h.base)!,execute=wire.execute.getMockImplementation()!
   wire.execute.mockImplementationOnce(async req=>{await execute(req);return envelope({_id:'saved',[key]:key==='state'?-1:'foreign'})})
   await expect(a.saveOnly({area:3})).rejects.toThrow()
   expect(wire.execute.mock.calls.map(([req])=>req.path)).toEqual(['biz/extForm/upsert/e'])
   expect(a.locked()).toBe(true)
   await expect(a.saveOnly({area:3})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(1)
  })
  it(`${container}: accepts optional ownership when matching and a unique saved identity`,async()=>{
   const h=setup(),a=h.provider().forSnapshot(h.base)!,execute=wire.execute.getMockImplementation()!
   wire.execute.mockImplementationOnce(async req=>{await execute(req);return envelope({_id:'saved',id:'saved',dataId:'saved',...matching,
    workflow:{workflowId:'w',workflowRunId:'w',runId:'w',_id:'workflow-entity-not-formdata'}})})
   expect((await a.saveOnly({area:3})).records[0]?.id).toBe('saved')
   expect(wire.execute).toHaveBeenCalledTimes(2)
  })
  it(`${container}: does not require optional ownership absent from an ID-only ACK`,async()=>{
   const h=setup(),a=h.provider().forSnapshot(h.base)!,execute=wire.execute.getMockImplementation()!
   wire.execute.mockImplementationOnce(async req=>{await execute(req);return envelope({_id:'saved'})})
   expect((await a.saveOnly({area:3})).records[0]?.id).toBe('saved')
  })
  it(`${container}: rejects conflicting saved ID aliases before EXTS`,async()=>{
   const h=setup(),a=h.provider().forSnapshot(h.base)!,execute=wire.execute.getMockImplementation()!
   wire.execute.mockImplementationOnce(async req=>{await execute(req);return envelope({_id:'saved',dataId:'another-form'})})
   await expect(a.saveOnly({area:3})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(1);expect(a.locked()).toBe(true)
  })
  it.each(['workflowId','workflowRunId','runId'])(`${container}: rejects contradictory nested Workflow %s before EXTS`,async key=>{
   const h=setup(),a=h.provider().forSnapshot(h.base)!,execute=wire.execute.getMockImplementation()!
   wire.execute.mockImplementationOnce(async req=>{await execute(req);return envelope({_id:'saved',workflow:{[key]:'foreign-run'}})})
   await expect(a.saveOnly({area:3})).rejects.toThrow();expect(wire.execute).toHaveBeenCalledTimes(1);expect(a.locked()).toBe(true)
  })
 }
 it('does not conflate unrelated envelope/entity metadata with the selected data record',async()=>{
  const h=setup(),a=h.provider().forSnapshot(h.base)!,execute=wire.execute.getMockImplementation()!
  wire.execute.mockImplementationOnce(async req=>{await execute(req);return {success:true,status:1,
   data:{_id:'saved',...matching},entity:{_id:'workflow-envelope',tenantId:'outer-metadata'},_id:'envelope-id',tenantId:'envelope-metadata'}})
  expect((await a.saveOnly({area:3})).records[0]?.id).toBe('saved');expect(wire.execute).toHaveBeenCalledTimes(2)
 })
})


it('copies explicit preset=0 through the normal action wire without granting more fields',async()=>{
 const h=setup();Object.assign(h.base.definition.fields![0]!,{preset:false})
 await h.provider().forSnapshot(h.base)!.saveOnly({area:0})
 const data=JSON.parse(String(wire.execute.mock.calls[0]![0].body?.dataStr))
 expect(data).toMatchObject({area:0,exts:{area:0}})
 expect(wire.execute).toHaveBeenCalledTimes(2)
})
it('keeps the persistent lock and sends no EXTS when preset storage changes after upsert',async()=>{
 const h=setup();Object.assign(h.base.definition.fields![0]!,{preset:false})
 const original=h.reader.load.getMockImplementation()!;let reads=0
 h.reader.load.mockImplementation(async()=>{const s=await original();if(++reads>1)Object.assign(s.definition.fields![0]!,{preset:true});return s})
 const a=h.provider().forSnapshot(h.base)!
 await expect(a.saveOnly({area:3})).rejects.toThrow()
 expect(wire.execute).toHaveBeenCalledTimes(1);expect(a.locked()).toBe(true)
})
