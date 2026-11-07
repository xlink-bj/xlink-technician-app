import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createR1RepeatActions, normalizeR1RepeatValues, r1RepeatActionsEnabled, type R1RepeatScope } from '@app/r1-repeat-actions'
import type { AuthSessionPort } from '@shared/ports'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'
const scope: R1RepeatScope = { tenantId:'tenant', userId:'user', roleId:'role', workOrderId:'sid', workflowRunId:'run', runtimeNodeId:'node', formDefinitionId:'ext' }
const origin = 'http://127.0.0.1:5189'
const env = { DEV:true, VITE_XLINK_ENVIRONMENT:'dev', VITE_XLINK_AUTH_TENANT:'tenant', VITE_XLINK_API_BASE_URL:origin+'/xlink/wm', VITE_XLINK_ENABLE_REAL_WRITES:'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'true', VITE_XLINK_MOCK:'false' }
const values = { need:'1', datetime:'2026-11-08 10:30', note:'hello' }
function setup() {
  let session = { sessionRef:'secret', user:{id:'user'}, currentRole:{id:'role'} }
  let snapshot = {workOrderId:'sid',node:{id:'node',runId:'run',formDefinitionId:'ext',sourceNodeType:'repeat',nodeTypeEvidence:'runtime_node_def',category:'repeat',lifecycle:'active',handlers:[{kind:'user',userId:'user'}],visibility:{evidenceState:'verified'}},definition:{id:'ext',fields:[
    {fieldId:'f1',valueKey:'need',type:'radio',label:'Need',required:true,readOnly:false,valueOption:'actual-code',options:[{value:'1',label:'Yes'},{value:'2',label:'No'}]},
    {fieldId:'f2',valueKey:'datetime',type:'datetime',label:'Time',required:true,readOnly:false},
    {fieldId:'f3',valueKey:'note',type:'text',label:'Note',required:false,readOnly:false},
  ]},records:[]} as unknown as R1NodeFormsSnapshot
  const readLatest = vi.fn(async () => structuredClone(snapshot))
  const transport = {execute:vi.fn(async (request) => {
    if (request.path === 'workflow/process') return {status:1,entity:{_id:'run'}}
    const data = JSON.parse(request.body.dataStr)
    snapshot = {...snapshot,records:[{id:'saved',definitionId:'ext',workflowRunId:'run',values:{need:data.need,datetime:data.datetime,note:data.note}}]} as unknown as R1NodeFormsSnapshot
    return {success:true,data:{_id:'saved'}}
  })}
  const hasExactGrant = vi.fn((s) => JSON.stringify(s) === JSON.stringify(scope))
  const input = {env:{...env},origin,getSession:() => session as unknown as ReturnType<AuthSessionPort['getCurrentSession']>,hasExactGrant,readLatest,transport}
  return {input,readLatest,transport,hasExactGrant,make:()=>createR1RepeatActions(input),get snapshot(){return snapshot},set snapshot(v){snapshot=v},changeRole:()=>{session={...session,currentRole:{id:'other'}}},changeSession:()=>{session={...session,sessionRef:'new'}}}
}
beforeEach(() => installLocalFixtureBrowser())
afterEach(() => vi.unstubAllGlobals())
describe('normal repeat create and explicit completion', () => {
  it('creates one, independently verifies fields, then separately processes only fresh saved IDs', async () => {
    const x=setup(), c=x.make();await c.saveOnly(scope,values)
    expect(x.transport.execute).toHaveBeenCalledTimes(1);expect(x.readLatest).toHaveBeenCalledTimes(2)
    expect(x.transport.execute.mock.calls[0]![0].path).toBe('biz/extForm/upsert/ext')
    expect(c.locked(scope)).toBe(false)
    await expect(c.saveOnly(scope,values)).rejects.toThrow()
    expect(await c.complete(scope)).toEqual({acknowledged:true,transitionVerified:false})
    expect(x.transport.execute.mock.calls[1]![0].body).toEqual({workflowNodeId:'node',nodeFormDefId:'ext',nodeFormDataId:'saved',smodule:'serviceAppointment',sid:'sid'})
    expect(c.completed(scope)).toBe(true);await expect(x.make().complete(scope)).rejects.toThrow()
    expect(x.transport.execute).toHaveBeenCalledTimes(2)
  })
  it.each(['role','session','scope','closed','rawtype','grant'])('rejects stale %s before dispatch', async kind => {
    const x=setup(), c=x.make()
    x.readLatest.mockImplementationOnce(async () => {
      if(kind==='role')x.changeRole();if(kind==='session')x.changeSession()
      if(kind==='scope')return {...x.snapshot,workOrderId:'other'}
      if(kind==='closed')return {...x.snapshot,node:{...x.snapshot.node,lifecycle:'closed'}} as unknown as R1NodeFormsSnapshot
      if(kind==='rawtype')return {...x.snapshot,node:{...x.snapshot.node,sourceNodeType:'forms'}}
      if(kind==='grant')x.hasExactGrant.mockReturnValue(false)
      return x.snapshot
    })
    await expect(c.saveOnly(scope,values)).rejects.toThrow();expect(x.transport.execute).not.toHaveBeenCalled()
  })
  it.each(['lost','unknown','readfail','mismatch','role'])('persists uncertain on %s and never retries even after recreation', async kind => {
    const x=setup(), c=x.make()
    if(kind==='lost')x.transport.execute.mockImplementationOnce(async()=>{throw Error('ACK lost')})
    if(kind==='unknown')x.transport.execute.mockResolvedValueOnce({data:{}} as never)
    if(kind==='readfail')x.readLatest.mockImplementationOnce(async()=>x.snapshot).mockRejectedValueOnce(Error('read failed'))
    if(kind==='mismatch')x.readLatest.mockImplementationOnce(async()=>x.snapshot).mockImplementationOnce(async()=>({...x.snapshot,records:[]}))
    if(kind==='role')x.transport.execute.mockImplementationOnce(async()=>{x.changeRole();return {success:true,data:{_id:'saved'}}})
    await expect(c.saveOnly(scope,values)).rejects.toThrow()
    expect(c.locked(scope)).toBe(true);await expect(x.make().saveOnly(scope,values)).rejects.toThrow()
    expect(x.transport.execute).toHaveBeenCalledTimes(1)
  })
  it.each([{success:true,data:{id:'saved',_id:'other'}},{success:true,status:0,data:{_id:'saved'}},{success:true,data:{_id:'saved',dataId:7}}])('locks contradictory create ACK %#',async ack=>{
    const x=setup(),c=x.make();x.transport.execute.mockResolvedValueOnce(ack as never)
    await expect(c.saveOnly(scope,values)).rejects.toThrow();expect(c.locked(scope)).toBe(true)
    await expect(x.make().saveOnly(scope,values)).rejects.toThrow();expect(x.transport.execute).toHaveBeenCalledTimes(1)
  })
  it.each([{success:true,status:0},{status:1,entity:{_id:'other'}},{status:1,entity:{_id:'run',id:'other'}},{success:true}])('locks contradictory process ACK %#',async ack=>{
    const x=setup(),c=x.make();await c.saveOnly(scope,values);x.transport.execute.mockResolvedValueOnce(ack as never)
    await expect(c.complete(scope)).rejects.toThrow();expect(c.locked(scope)).toBe(true);expect(c.completed(scope)).toBe(false)
    await expect(x.make().complete(scope)).rejects.toThrow();expect(x.transport.execute).toHaveBeenCalledTimes(2)
  })
  it.each([{success:true,status:1},{success:true,status:1,entity:null}])('accepts source-shaped process ACK without inventing transition evidence %#',async ack=>{
    const x=setup(),c=x.make();await c.saveOnly(scope,values);x.transport.execute.mockResolvedValueOnce(ack as never)
    expect(await c.complete(scope)).toEqual({acknowledged:true,transitionVerified:false})
    expect(c.completed(scope)).toBe(true);await expect(c.complete(scope)).rejects.toThrow();expect(x.transport.execute).toHaveBeenCalledTimes(2)
  })
  it('denies absent options, unknown values and all caller identity fields',async()=>{
    const x=setup();expect(()=>normalizeR1RepeatValues(x.snapshot,{...values,need:'bad'})).toThrow()
    expect(()=>normalizeR1RepeatValues(x.snapshot,{...values,sid:'sid'})).toThrow()
    x.snapshot={...x.snapshot,definition:{...x.snapshot.definition,fields:x.snapshot.definition.fields!.map(f=>({...f,options:undefined}))}}
    await expect(x.make().saveOnly(scope,values)).rejects.toThrow();expect(x.transport.execute).not.toHaveBeenCalled()
  })
  it('allows omitted hidden required create fields, rejects caller hidden values',()=>{
    const x=setup();x.snapshot={...x.snapshot,definition:{...x.snapshot.definition,fields:[...x.snapshot.definition.fields!,{fieldId:'modify',valueKey:'modifyReason',type:'text',label:'Why',required:true,readOnly:false,visibility:{kind:'exists',path:'_id',expected:true}}]}}
    expect(normalizeR1RepeatValues(x.snapshot,values)).toEqual(values)
    expect(()=>normalizeR1RepeatValues(x.snapshot,{...values,modifyReason:'hidden'})).toThrow()
  })
  it('cannot complete an empty list or create over an existing record',async()=>{
    const x=setup(),c=x.make();await expect(c.complete(scope)).rejects.toThrow()
    expect(x.transport.execute).not.toHaveBeenCalled()
    await c.saveOnly(scope,values);await expect(x.make().saveOnly(scope,values)).rejects.toThrow()
    expect(x.transport.execute).toHaveBeenCalledTimes(1)
  })
  it('denies readonly required fields',()=>{
    const x=setup();x.snapshot={...x.snapshot,node:{...x.snapshot.node,formFieldIdsReadOnly:['f1']}}
    expect(()=>normalizeR1RepeatValues(x.snapshot,{datetime:values.datetime})).toThrow()
  })
  it('fails closed in production, absent flags, nonloopback and auth override',()=>{
    expect(r1RepeatActionsEnabled(env,origin)).toBe(true)
    for(const changed of [{PROD:true},{DEV:false},{VITE_XLINK_ENVIRONMENT:'prod'},{VITE_XLINK_ENABLE_REAL_WRITES:undefined},{VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false'},{VITE_XLINK_MOCK:'true'},{VITE_XLINK_AUTH_API_BASE_URL:'https://auth'}]) expect(r1RepeatActionsEnabled({...env,...changed},origin)).toBe(false)
    expect(r1RepeatActionsEnabled(env,'https://example.com')).toBe(false)
  })
  it('blocks concurrent tabs and unknown process ACK without retry',async()=>{
    const x=setup(), a=x.make(), b=x.make();await a.saveOnly(scope,values)
    x.transport.execute.mockResolvedValueOnce({data:{}} as never)
    const first=a.complete(scope);await expect(b.complete(scope)).rejects.toThrow();await expect(first).rejects.toThrow()
    await expect(x.make().complete(scope)).rejects.toThrow();expect(x.transport.execute).toHaveBeenCalledTimes(2)
  })
})
