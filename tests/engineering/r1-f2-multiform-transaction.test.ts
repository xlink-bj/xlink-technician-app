import { afterEach, describe, expect, it, vi } from 'vitest'
import { planR1FormsUpdateExts } from '@features/work-orders/r1-forms-exts-plan'
import {
  executeR1MultiStepOffline, inspectR1MultiStepReceipt,
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
  const storage:StoragePort={
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
  }
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
      formList:[{_id:'a',formDefId:'d',formTitle:'new',state:1},
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
      return {state:'succeeded',data:step==='form_upsert'?{savedFormDataId:'saved-form-id'}:{}}
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
      return {state:'succeeded',data:step==='workflow_process'?{}:{savedFormDataId:'f-'+stepIndex}}
    })
    expect((await executeR1MultiStepOffline(storage,s,
      ['repeat_form_upsert','repeat_form_upsert','workflow_process'],executor)).state).toBe('succeeded')
    expect(executor).toHaveBeenCalledTimes(3)
  })
  it.each(['form_upsert','forms_exts_update','workflow_process'] as const)(
    'holds after an unknown %s ACK even across another process instance and role change',
    async failedStep=>{
      const {storage}=repository()
      const executor=vi.fn<R1StepExecutor>(async ({step})=>
        step===failedStep ? {state:'failed_retryable',error:{category:'network_retryable',message:'synthetic timeout',retryable:true}}
          : {state:'succeeded',data:step==='form_upsert'?{savedFormDataId:'saved-on-server'}:{}}
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
    const {storage}=repository()
    vi.mocked(storage.write).mockImplementationOnce(async()=>({state:'succeeded'}))
      .mockImplementationOnce(async()=>({state:'failed_terminal',error:{
        category:'server_terminal',message:'disk failed',retryable:false,
      }}))
    const executor:R1StepExecutor=vi.fn(async()=>({state:'succeeded',data:{savedFormDataId:'real-ack-id'}}))
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
