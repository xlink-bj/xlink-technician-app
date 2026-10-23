import { describe, expect, it, vi } from 'vitest'
import { executeR1Stage1FunctionalCandidate, type R1OfflineSpecialCommandGateway } from '@app/r1-stage1-functional-flow'
import { inspectR1MultiStepReceipt, closeCompletedR1ReceiptAfterReadback, type R1MultiStepScope } from '@features/work-orders/r1-multistep-offline-transaction'
import type { StorageKey, StoragePort } from '@shared/ports'
import type { ApiCommandRequest } from '@adapters/api/technician-api-commands'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'

function store(){
  const map=new Map<string,unknown>()
  const storage={
    read:vi.fn(async(k:StorageKey)=>({state:'succeeded' as const,data:map.get(k.key)??null})),
    write:vi.fn(async(k:StorageKey,value:unknown)=>{map.set(k.key,value);return {state:'succeeded' as const}}),
    remove:vi.fn(async(k:StorageKey)=>{map.delete(k.key);return {state:'succeeded' as const}}),
  } as unknown as StoragePort
  return {storage,map}
}
const forms:R1MultiStepScope={userId:'actor',workOrderId:'work-order-1',runtimeNodeId:'runtime-1',
  sourceNodeType:'forms',formDefinitionId:'form-def-1',authorizationScope:'actor:role-a'}
const repeat:R1MultiStepScope={...forms,sourceNodeType:'repeat',workflowRunId:'workflow-run-1'}
function gateway(){
  const called:ApiCommandRequest[]=[]
  const command:R1OfflineSpecialCommandGateway={
    revalidate:vi.fn(async()=>true),
    dispatch:vi.fn(async(request)=>{
      called.push(request)
      return request.path.startsWith('biz/extForm/upsert/')
        ? {success:true,data:{_id:request.body?.dataStr
          ? (JSON.parse(String(request.body.dataStr)) as { _id?:string })._id??`server-${called.length}`
          : `server-${called.length}`}}
        : {success:true,data:{ok:true}}
    }),
  }
  return {command,called}
}
const exts={formList:[],unrecognizedBackendKey:{keep:'yes'}}

describe('R1 Stage 1 source-backed offline choreography',()=>{
  it('forms save keeps full EXTS and only processes AFTER acknowledged Exts update',async()=>{
    const {storage,map}=store(),{command,called}=gateway()
    const result=await executeR1Stage1FunctionalCandidate(storage,{
      kind:'forms_save',sourceNodeType:'forms',scope:forms,
      fields:{customerNote:'test'},title:'勘察表',authoritativeExts:exts,processActive:true,
    },command)
    expect(result).toMatchObject({state:'succeeded',data:{savedFormDataIds:['server-1'],state:'completed'}})
    expect(called.map(x=>x.path)).toEqual([
      'biz/extForm/upsert/form-def-1','workflowNode/updateExts/runtime-1','workflow/process',
    ])
    expect(called[1]?.jsonBody).toEqual({unrecognizedBackendKey:{keep:'yes'},
      formList:[{_id:'server-1',formDefId:'form-def-1',formTitle:'勘察表',state:1}]})
    expect(called[2]?.body).toMatchObject({nodeFormDefId:'',nodeFormDataId:''})
    expect([...map.values()][0]).not.toHaveProperty('customerNote')
    expect(command.revalidate).toHaveBeenCalledTimes(3)
  })
  it('forms save does not Process on inactive node',async()=>{
    const {storage}=store(),{command,called}=gateway()
    expect((await executeR1Stage1FunctionalCandidate(storage,{
      kind:'forms_save',sourceNodeType:'forms',scope:forms,
      fields:{},title:'调查表',authoritativeExts:exts,processActive:false,
    },command)).state).toBe('succeeded')
    expect(called.map(x=>x.path)).toEqual(['biz/extForm/upsert/form-def-1','workflowNode/updateExts/runtime-1'])
  })
  it('forms delete updates source state=-1 and JSON EXTS without Process',async()=>{
    const {storage}=store(),{command,called}=gateway()
    const result=await executeR1Stage1FunctionalCandidate(storage,{
      kind:'forms_delete',sourceNodeType:'forms',scope:forms,existingFormDataId:'server-existing',
      sourceFormData:{title:'existing'},authoritativeExts:{formList:[{_id:'server-existing',state:1}],foreign:'untouched'},
    },command)
    expect(result.state).toBe('succeeded')
    expect(called).toHaveLength(2)
    expect(JSON.parse(String(called[0]?.body?.dataStr))).toMatchObject({_id:'server-existing',state:-1,
      sid:'work-order-1',nodeId:'runtime-1'})
    expect(called[1]?.jsonBody).toMatchObject({foreign:'untouched',formList:[{_id:'server-existing',state:-1}]})
  })
  it('forms finalize needs server ids and sends definition with blank data ID',async()=>{
    const {storage}=store(),{command,called}=gateway()
    const result=await executeR1Stage1FunctionalCandidate(storage,{
      kind:'forms_finalize',sourceNodeType:'forms',scope:forms,
      authoritativeSavedIds:['server-record-a'],
    },command)
    expect(result.state).toBe('succeeded')
    expect(called[0]?.body).toMatchObject({nodeFormDefId:'form-def-1',nodeFormDataId:''})
    const closed=await closeCompletedR1ReceiptAfterReadback(storage,forms,{
      workOrderId:forms.workOrderId,runtimeNodeId:forms.runtimeNodeId,sourceNodeType:'forms',
      savedFormDataIds:['server-record-a'],workflowCompleted:true,
    })
    expect(closed).toBe(true)
    expect((await inspectR1MultiStepReceipt(storage,forms)).data).toBe(null)
  })
  it('repeat batch saves every row and passes comma-joined server IDs to Process',async()=>{
    const {storage}=store(),{command,called}=gateway()
    const result=await executeR1Stage1FunctionalCandidate(storage,{
      kind:'repeat_batch',sourceNodeType:'repeat',scope:repeat,
      forms:[{note:'row-a'},{note:'row-b'}],
    },command)
    expect(result).toMatchObject({state:'succeeded',data:{savedFormDataIds:['server-1','server-2']}})
    expect(called.map(x=>x.path)).toEqual([
      'biz/extForm/upsert/form-def-1','biz/extForm/upsert/form-def-1','workflow/process',
    ])
    expect(called[2]?.body).toMatchObject({nodeFormDataId:'server-1,server-2'})
  })
  it('repeat single save and remove are independent, no implicit Process',async()=>{
    const {storage}=store(),{command,called}=gateway()
    expect((await executeR1Stage1FunctionalCandidate(storage,{
      kind:'repeat_save',sourceNodeType:'repeat',scope:repeat,fields:{note:'row'},
    },command)).state).toBe('succeeded')
    expect(called).toHaveLength(1)
    const separate={...repeat,runtimeNodeId:'another-runtime'}
    expect((await executeR1Stage1FunctionalCandidate(storage,{
      kind:'repeat_delete',sourceNodeType:'repeat',scope:separate,existingFormDataId:'saved-b',
    },command)).state).toBe('succeeded')
    expect(called[1]).toMatchObject({path:'biz/extForm/remove/form-def-1',body:{formDataId:'saved-b'}})
  })
  it('fails closed when an ACK is unknown and blocks silent replay',async()=>{
    const {storage}=store(),{command}=gateway()
    vi.mocked(command.dispatch).mockRejectedValueOnce(new Error('socket closed after send'))
    const intent={kind:'forms_save' as const,sourceNodeType:'forms' as const,
      scope:forms,fields:{},title:'表单',authoritativeExts:exts,processActive:true}
    expect((await executeR1Stage1FunctionalCandidate(storage,intent,command)).state).toBe('failed_terminal')
    expect((await inspectR1MultiStepReceipt(storage,forms)).data).toMatchObject({state:'may_have_dispatched'})
    expect((await executeR1Stage1FunctionalCandidate(storage,intent,command)).state).toBe('failed_terminal')
    expect(command.dispatch).toHaveBeenCalledTimes(1)
  })
  it('blocks local IDs and an actor-role mismatch before dispatch',async()=>{
    const {storage}=store(),{command}=gateway()
    expect((await executeR1Stage1FunctionalCandidate(storage,{
      kind:'forms_finalize',sourceNodeType:'forms',scope:forms,
      authoritativeSavedIds:['local-1'],
    },command)).state).toBe('failed_terminal')
    expect(command.dispatch).not.toHaveBeenCalled()
    const invalid={...forms,sourceNodeType:'repeat' as const}
    expect((await executeR1Stage1FunctionalCandidate(storage,{
      kind:'forms_save',sourceNodeType:'forms',scope:invalid,
      fields:{},title:'表单',authoritativeExts:exts,processActive:true,
    },command)).state).toBe('failed_terminal')
    expect(command.dispatch).not.toHaveBeenCalled()
  })
})

describe('R1 Stage 1 separate Real transport safety fence',()=>{
  it('rejects source special routes even if generic Real business writes are enabled',async()=>{
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','test')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES','true')
    vi.stubEnv('VITE_XLINK_ENABLE_R1_SPECIAL_WRITES','false')
    const request=vi.fn()
    const transport=createUniApiCommandTransport({apiBaseUrl:'https://example.invalid',
      getSessionRef:()=> 'synthetic-session' as never,request})
    await expect(transport.execute({method:'POST',path:'workflowNode/updateExts/runtime',
      r1Special:true,jsonBody:{formList:[]}})).rejects.toThrow('explicitly enabled')
    await expect(transport.execute({method:'POST',path:'biz/extForm/remove/form-def',
      body:{formDataId:'server-a'}})).rejects.toThrow('transaction authorization')
    expect(request).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
  it('serializes verified Exts with JSON only in an explicitly synthetic opt-in harness',async()=>{
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','test')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES','true')
    vi.stubEnv('VITE_XLINK_ENABLE_R1_SPECIAL_WRITES','true')
    const request=vi.fn((options:{success?:(response:unknown)=>void})=>
      options.success?.({statusCode:200,data:{success:true,data:{ok:true}}}))
    const transport=createUniApiCommandTransport({apiBaseUrl:'https://example.invalid',
      getSessionRef:()=> 'synthetic-session' as never,request:request as never})
    await transport.execute({method:'POST',path:'workflowNode/updateExts/runtime',
      r1Special:true,jsonBody:{formList:[{_id:'server-a',state:1}]}})
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      data:JSON.stringify({formList:[{_id:'server-a',state:1}]}),
      header:expect.objectContaining({'Content-Type':'application/json'}),
    })
    vi.unstubAllEnvs()
  })
})
