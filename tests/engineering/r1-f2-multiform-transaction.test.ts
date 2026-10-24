import { afterEach, describe, expect, it, vi } from 'vitest'
import { planR1FormsUpdateExts } from '@features/work-orders/r1-forms-exts-plan'
import {
  executeR1MultiStepOffline, inspectR1MultiStepReceipt,
  closeCompletedR1ReceiptAfterReadback, closeCompletedR1MutationReceiptAfterReadback,
  type R1MultiStepScope, type R1StepExecutor,
} from '@features/work-orders/r1-multistep-offline-transaction'
import type { StorageKey, StoragePort } from '@shared/ports'

const scope:R1MultiStepScope={
  userId:'tech-user',workOrderId:'synthetic-workorder',runtimeNodeId:'source-runtime-node',
  formDefinitionId:'source-form-definition',sourceNodeType:'forms',
  authorizationScope:'tech-user:scoped-role',
}
function repository() {
  const values=new Map<string,unknown>()
  const storage={
    read:vi.fn(async (key:StorageKey)=>({state:'succeeded' as const,data:values.get(key.key)??null})),
    write:vi.fn(async (key:StorageKey,value:unknown)=>{
      values.set(key.key,value)
      return {state:'succeeded' as const}
    }),
    remove:vi.fn(async (key:StorageKey)=>{
      values.delete(key.key)
      return {state:'succeeded' as const}
    }),
    listKeys:vi.fn(async()=>({state:'succeeded' as const,data:[...values.keys()]})),
  } as unknown as StoragePort
  return {values,storage}
}
const success: R1StepExecutor = vi.fn(async context=>({
  state:'succeeded' as const,
  data:context.step==='form_upsert'||context.step==='repeat_form_upsert'
    ? {savedFormDataId:'saved-'+context.stepIndex} : {},
}))

describe('F2 R1 forms full-fidelity source updateExts planner',()=>{
  it('keeps unknown ext attributes and exact existing records, replaces saved row by _id',()=>{
    const exts={
      unseenFlag:'server-owned',complex:{nested:[1,2]},
      formList:[{_id:'a',formDefId:'d',formTitle:'old',state:1,custom:'KEEP'},
        {_id:'b',formDefId:'e',formTitle:'other',state:1}],
    }
    const plan=planR1FormsUpdateExts({
      workflowNodeId:'runtime:node',sourceNodeType:'forms',authoritativeExts:exts,
      change:{kind:'saved',record:{_id:'a',formDefId:'d',formTitle:'new',state:1}},
    })
    expect(plan).toMatchObject({
      method:'POST',contentType:'application/json',
      path:'workflowNode/updateExts/runtime%3Anode',
      previousIds:['a','b'],updatedIds:['a','b'],
    })
    expect(plan.body).toEqual({
      unseenFlag:'server-owned',complex:{nested:[1,2]},
      formList:[{_id:'a',formDefId:'d',formTitle:'new',state:1,custom:'KEEP'},
        {_id:'b',formDefId:'e',formTitle:'other',state:1}],
    })
    expect(exts.formList[0]?.formTitle).toBe('old')
    expect(plan.body).not.toBe(exts)
  })
  it('appends a new saved row and soft-deletes an existing row',()=>{
    const ext={formList:[{_id:'a',state:1,custom:'keep'}],otherServerKey:17}
    const add=planR1FormsUpdateExts({
      workflowNodeId:'node',sourceNodeType:'forms',authoritativeExts:ext,
      change:{kind:'saved',record:{_id:'b',formTitle:'new'}},
    })
    expect(add.body.formList).toEqual([{_id:'a',state:1,custom:'keep'},{_id:'b',formTitle:'new',state:1}])
    const deleted=planR1FormsUpdateExts({
      workflowNodeId:'node',sourceNodeType:'forms',authoritativeExts:ext,
      change:{kind:'delete',recordId:'a'},
    })
    expect(deleted.body.formList).toEqual([{_id:'a',state:-1,custom:'keep'}])
    expect(deleted.body.otherServerKey).toBe(17)
  })
  it('never loses unknown metadata while updating an existing forms row',()=>{
    const original={formList:[{_id:'saved-a',formDefId:'def',formTitle:'旧标题',state:1,
      serverExtension:{hidden:'must-survive'},metadataOrder:3}],version:'keep'}
    const updated=planR1FormsUpdateExts({workflowNodeId:'node',sourceNodeType:'forms',
      authoritativeExts:original,
      change:{kind:'saved',record:{_id:'saved-a',formDefId:'def',formTitle:'新标题',state:1}}})
    expect(updated.body.formList).toEqual([{_id:'saved-a',formDefId:'def',formTitle:'新标题',
      state:1,serverExtension:{hidden:'must-survive'},metadataOrder:3}])
    expect(original.formList[0]?.formTitle).toBe('旧标题')
  })
  it('blocks redacted lists, duplicate IDs, malformed rows, and deletion of unknown ID',()=>{
    const cases=[
      {formList:[{_id:'same'},{_id:'same'}]},
      {formList:[{formDefId:'def'}]},
      {formList:'not-array'},
      {},
    ]
    for(const exts of cases)expect(()=>planR1FormsUpdateExts({
      workflowNodeId:'node',sourceNodeType:'forms',authoritativeExts:exts,
      change:{kind:'saved',record:{_id:'new'}},
    })).toThrow()
    expect(()=>planR1FormsUpdateExts({
      workflowNodeId:'node',sourceNodeType:'forms',authoritativeExts:{formList:[]},
      change:{kind:'delete',recordId:'unknown'},
    })).toThrow()
  })
})

describe('F2 R1 durable multistep offline simulator, no real transport',()=>{
  afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks()})
  it('persists before EACH of three forms steps, records server ID and completes',async()=>{
    const {storage,values}=repository()
    const calls: string[]=[]
    const executor:R1StepExecutor=vi.fn(async ({step,savedFormDataIds})=>{
      const receipt=[...values.values()][0] as {state:string,stepIndex:number,savedFormDataIds:string[]}
      expect(receipt.state).toBe('may_have_dispatched')
      if(step!=='form_upsert')expect(savedFormDataIds).toEqual(['saved-form-id'])
      calls.push(step)
      return {state:'succeeded' as const,data:step==='form_upsert'?{savedFormDataId:'saved-form-id'}:{}}
    })
    const result=await executeR1MultiStepOffline(storage,scope,
      ['form_upsert','forms_exts_update','workflow_process'],executor)
    expect(result).toMatchObject({state:'succeeded',data:{
      state:'completed',stepIndex:2,savedFormDataIds:['saved-form-id'],
    }})
    expect(calls).toEqual(['form_upsert','forms_exts_update','workflow_process'])
    expect(storage.write).toHaveBeenCalledTimes(6)
    // Even completed client receipt needs authoritative backend readback.
    expect((await executeR1MultiStepOffline(storage,scope,
      ['form_upsert','forms_exts_update','workflow_process'],executor)).state).toBe('failed_terminal')
    expect(executor).toHaveBeenCalledTimes(3)
  })
  it('repeat batches ACK unique saved IDs then one workflow Process',async()=>{
    const s={...scope,sourceNodeType:'repeat' as const}
    const {storage}=repository()
    const executor:R1StepExecutor=vi.fn(async ({step,stepIndex,savedFormDataIds})=>{
      if(step==='workflow_process')expect(savedFormDataIds).toEqual(['f-0','f-1'])
      return {state:'succeeded' as const,data:step==='workflow_process'?{}:{savedFormDataId:'f-'+stepIndex}}
    })
    expect((await executeR1MultiStepOffline(storage,s,
      ['repeat_form_upsert','repeat_form_upsert','workflow_process'],executor)).state).toBe('succeeded')
    expect(executor).toHaveBeenCalledTimes(3)
  })
  it('does not conflate a saved form with completed Workflow and requires field+EXTS readback',async()=>{
    const {storage}=repository()
    const executor:R1StepExecutor=vi.fn(async({step})=>({state:'succeeded' as const,
      data:step==='form_upsert'?{savedFormDataId:'saved-1'}:{}}))
    expect((await executeR1MultiStepOffline(storage,scope,
      ['form_upsert','forms_exts_update'],executor)).state).toBe('succeeded')
    expect(await closeCompletedR1ReceiptAfterReadback(storage,scope,{
      workOrderId:scope.workOrderId,runtimeNodeId:scope.runtimeNodeId,
      sourceNodeType:'forms',savedFormDataIds:['saved-1'],workflowCompleted:true,
    })).toBe(false)
    const readback={workOrderId:scope.workOrderId,runtimeNodeId:scope.runtimeNodeId,
      formDefinitionId:scope.formDefinitionId,sourceNodeType:'forms' as const,
      formData:{_id:'saved-1',sid:scope.workOrderId,nodeId:scope.runtimeNodeId,
        smodule:'serviceAppointment',state:1,note:'new'},expectedFields:{note:'new'},
      formsExts:{formList:[{_id:'saved-1',state:1}]}}
    expect(await closeCompletedR1MutationReceiptAfterReadback(storage,scope,{
      ...readback,expectedFields:{note:'stale'},
    })).toBe(false)
    expect(await closeCompletedR1MutationReceiptAfterReadback(storage,scope,{
      ...readback,formsExts:{formList:[]},
    })).toBe(false)
    expect((await inspectR1MultiStepReceipt(storage,scope)).data).not.toBeNull()
    expect(await closeCompletedR1MutationReceiptAfterReadback(storage,scope,readback)).toBe(true)
    expect((await inspectR1MultiStepReceipt(storage,scope)).data).toBeNull()
  })
  it('requires BOTH FormData and node EXTS readback for forms soft-delete',async()=>{
    const {storage}=repository()
    const executor:R1StepExecutor=vi.fn(async()=>({state:'succeeded' as const,data:{}}))
    expect((await executeR1MultiStepOffline(storage,scope,
      ['forms_exts_update','forms_soft_delete'],executor,[],'deleted-1')).state).toBe('succeeded')
    const readback={workOrderId:scope.workOrderId,runtimeNodeId:scope.runtimeNodeId,
      formDefinitionId:scope.formDefinitionId,sourceNodeType:'forms' as const,
      formsExts:{formList:[{_id:'deleted-1',state:-1}]},
      formData:{_id:'deleted-1',sid:scope.workOrderId,nodeId:scope.runtimeNodeId,state:-1}}
    expect(await closeCompletedR1MutationReceiptAfterReadback(storage,scope,{
      ...readback,formData:{...readback.formData,state:1},
    })).toBe(false)
    expect(await closeCompletedR1MutationReceiptAfterReadback(storage,scope,{
      ...readback,formsExts:{formList:[{_id:'deleted-1',state:1}]},
    })).toBe(false)
    expect(await closeCompletedR1MutationReceiptAfterReadback(storage,scope,readback)).toBe(true)
  })
  it('requires an exact complete workflow-scoped repeat list after remove',async()=>{
    const s={...scope,sourceNodeType:'repeat' as const,workflowRunId:'repeat-run-1'}
    const {storage}=repository()
    const executor:R1StepExecutor=vi.fn(async()=>({state:'succeeded' as const,data:{}}))
    expect((await executeR1MultiStepOffline(storage,s,
      ['repeat_remove'],executor,[],'removed-1')).state).toBe('succeeded')
    const readback={workOrderId:s.workOrderId,runtimeNodeId:s.runtimeNodeId,
      formDefinitionId:s.formDefinitionId,workflowRunId:s.workflowRunId,
      sourceNodeType:'repeat' as const,
      repeatList:{complete:true as const,workflowRunId:s.workflowRunId,savedIds:['other-1']}}
    expect(await closeCompletedR1MutationReceiptAfterReadback(storage,s,{
      ...readback,repeatList:{...readback.repeatList,savedIds:['removed-1']},
    })).toBe(false)
    expect(await closeCompletedR1MutationReceiptAfterReadback(storage,s,{
      ...readback,repeatList:{...readback.repeatList,workflowRunId:'another-run'},
    })).toBe(false)
    expect(await closeCompletedR1MutationReceiptAfterReadback(storage,s,readback)).toBe(true)
  })
  it('never creates a delete receipt without an exact server target identity',async()=>{
    const {storage}=repository(),executor=vi.fn(success)
    expect((await executeR1MultiStepOffline(storage,scope,
      ['forms_exts_update','forms_soft_delete'],executor)).state).toBe('failed_terminal')
    expect(executor).not.toHaveBeenCalled()
    expect(storage.write).not.toHaveBeenCalled()
  })
  it.each(['form_upsert','forms_exts_update','workflow_process'] as const)(
    'holds after an unknown %s ACK even across another process instance and role change',
    async failedStep=>{
      const {storage}=repository()
      const executor=vi.fn<R1StepExecutor>(async ({step})=>
        step===failedStep ? {state:'failed_retryable',error:{category:'network_retryable',message:'synthetic timeout',retryable:true}}
          : {state:'succeeded' as const,data:step==='form_upsert'?{savedFormDataId:'saved-on-server'}:{}}
      )
      expect((await executeR1MultiStepOffline(storage,scope,
        ['form_upsert','forms_exts_update','workflow_process'],executor)).state).toBe('failed_terminal')
      const receipt=await inspectR1MultiStepReceipt(storage,scope)
      expect(receipt).toMatchObject({state:'succeeded',data:{state:'may_have_dispatched'}})
      expect((await inspectR1MultiStepReceipt(storage,{...scope,authorizationScope:'other-role'})).state).toBe('failed_terminal')
      expect((await executeR1MultiStepOffline({...storage},scope,
        ['form_upsert','forms_exts_update','workflow_process'],executor)).state).toBe('failed_terminal')
    },
  )
  it('refuses to call executor when storage write fails before a step',async()=>{
    const {storage}=repository()
    vi.mocked(storage.write).mockResolvedValueOnce({state:'failed_terminal',error:{
      category:'server_terminal',message:'storage denied',retryable:false,
    }})
    const executor=vi.fn(success)
    expect((await executeR1MultiStepOffline(storage,scope,
      ['form_upsert','forms_exts_update','workflow_process'],executor)).state).toBe('failed_terminal')
    expect(executor).not.toHaveBeenCalled()
  })
  it('does not send the next mutation when saving a previous ACK receipt fails',async()=>{
    const {storage,values}=repository()
    // First pre-dispatch ACK must genuinely persist, even in the failure harness.
    vi.mocked(storage.write).mockImplementationOnce(async(key,value)=>{
      values.set(key.key,value)
      return {state:'succeeded'}
    })
      .mockImplementationOnce(async()=>({state:'failed_terminal',error:{
        category:'server_terminal',message:'disk failed',retryable:false,
      }}))
    const executor:R1StepExecutor=vi.fn(async()=>({state:'succeeded' as const,data:{savedFormDataId:'real-ack-id'}}))
    expect((await executeR1MultiStepOffline(storage,scope,
      ['form_upsert','forms_exts_update','workflow_process'],executor)).state).toBe('failed_terminal')
    expect(executor).toHaveBeenCalledTimes(1)
    expect((await inspectR1MultiStepReceipt(storage,scope)).data)
      .toMatchObject({state:'may_have_dispatched',stepIndex:0})
  })
  it('refuses corrupted receipts and invalid stage plans',async()=>{
    const {storage,values}=repository()
    values.set(['r1-multistep:v1',scope.userId,scope.workOrderId,scope.runtimeNodeId,scope.formDefinitionId]
      .map(encodeURIComponent).join(':'),{state:'tampered'})
    expect((await inspectR1MultiStepReceipt(storage,scope)).state).toBe('failed_terminal')
    const fresh=repository()
    const executor=vi.fn(success)
    expect((await executeR1MultiStepOffline(fresh.storage,scope,
      ['workflow_process','forms_exts_update'],executor)).state).toBe('failed_terminal')
    expect(executor).not.toHaveBeenCalled()
  })
  it('fails closed for H5 without Web Locks even if wx bridge injected',async()=>{
    vi.stubGlobal('window',{})
    vi.stubGlobal('wx',{sdk:true})
    vi.stubGlobal('navigator',{})
    const {storage}=repository()
    const executor=vi.fn(success)
    expect((await executeR1MultiStepOffline(storage,scope,
      ['form_upsert','forms_exts_update','workflow_process'],executor)).state).toBe('failed_terminal')
    expect(storage.write).not.toHaveBeenCalled()
    expect(executor).not.toHaveBeenCalled()
  })
})
