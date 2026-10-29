import { afterEach, describe, expect, it, vi } from 'vitest'
import { createR1Stage1PilotCommandGateway } from '@app/r1-stage1-scoped-gateway'
import { executeR1Stage1FunctionalCandidate } from '@app/r1-stage1-functional-flow'
import { inspectR1MultiStepReceipt, type R1MultiStepScope } from '@features/work-orders/r1-multistep-offline-transaction'
import type { ApiCommandRequest, ApiCommandTransport } from '@adapters/api/technician-api-commands'
import type { SessionSnapshot, StorageKey, StoragePort, TechnicianApiReadPort, WorkflowNodeRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const scope:R1MultiStepScope={
  userId:'synthetic-user',workOrderId:'synthetic-work-order',runtimeNodeId:'synthetic-node',
  workflowRunId:'synthetic-run',formDefinitionId:'synthetic-definition',
  sourceNodeType:'forms',authorizationScope:'synthetic-role:one',
}
const role=asOpaqueId<'RoleId'>('synthetic-role')
const session:SessionSnapshot={
  sessionRef:asOpaqueId<'SessionRef'>('synthetic-session'),
  user:{id:asOpaqueId<'UserId'>('synthetic-user')} as SessionSnapshot['user'],
  currentRole:{id:role} as SessionSnapshot['currentRole'],
  roleVersion:'one',capabilityNames:[],
}
function node(overrides:Partial<WorkflowNodeRead>={}):WorkflowNodeRead{
  return {
    id:asOpaqueId<'WorkflowNodeRuntimeId'>(scope.runtimeNodeId),
    runId:asOpaqueId<'WorkflowRunId'>(scope.workflowRunId!),
    formDefinitionId:asOpaqueId<'FormDefinitionId'>(scope.formDefinitionId),
    sourceNodeType:'forms',nodeTypeEvidence:'runtime_node_def',
    category:'forms',lifecycle:'active',
    visibility:{evidenceState:'verified',selectableRoleIds:[role]},
    ...overrides,
  }
}
function storagePort():StoragePort{
  const data=new Map<string,unknown>()
  return {
    read:vi.fn(async(k:StorageKey)=>({state:'succeeded' as const,data:data.get(k.key)??null})),
    write:vi.fn(async(k:StorageKey,r:unknown)=>{data.set(k.key,r);return {state:'succeeded' as const}}),
    remove:vi.fn(async(k:StorageKey)=>{data.delete(k.key);return {state:'succeeded' as const}}),
  } as unknown as StoragePort
}
function harness(overrides?:{
  session?:()=>SessionSnapshot|null;node?:WorkflowNodeRead;
  read?:Partial<TechnicianApiReadPort>; environment?:string;apiBaseUrl?:string;
  scope?:R1MultiStepScope;
  childParentRuntimeId?:string;grant?:()=>boolean;onDispatch?:(request:ApiCommandRequest)=>void;
}){
  const target=overrides?.scope??scope
  const read={
    isWorkOrderListedForCurrentSession:vi.fn(()=>true),
    getWorkOrderDetail:vi.fn(async()=>({state:'succeeded' as const,data:{
      id:asOpaqueId<'WorkOrderId'>(target.workOrderId),
      workflowRunId:asOpaqueId<'WorkflowRunId'>(target.workflowRunId!),
      workflowNodes:overrides?.childParentRuntimeId
        ? [{...node(),id:asOpaqueId<'WorkflowNodeRuntimeId'>(overrides.childParentRuntimeId),
          category:'subworkflow' as const,sourceNodeType:'subflows'}]
        : [overrides?.node??node()],
    }})),
    getChildWorkflowNodes:vi.fn(async()=>({state:'succeeded' as const,
      data:[overrides?.node??node()]})),
    ...overrides?.read,
  } as unknown as TechnicianApiReadPort
  const called:ApiCommandRequest[]=[]
  const command={execute:vi.fn(async(request:ApiCommandRequest)=>{
    called.push(request)
    overrides?.onDispatch?.(request)
    return request.path.startsWith('biz/extForm/upsert/')
      ? {success:true,data:{_id:`synthetic-saved-${called.length}`}} : {success:true,data:{}}
  })} satisfies ApiCommandTransport
  const gateway=createR1Stage1PilotCommandGateway({
    scope:target,node:overrides?.childParentRuntimeId
      ? {kind:'child',parentRuntimeNodeId:overrides.childParentRuntimeId}
      : {kind:'main'},
    environment:overrides?.environment??'test',
    apiBaseUrl:overrides?.apiBaseUrl??'https://isolated-beta.invalid',
    getSession:overrides?.session??(()=>session),read,command,
    isExplicitPilotWriteAuthorized:overrides?.grant??(()=>true),
  })
  return {read,called,gateway,command}
}
afterEach(()=>vi.unstubAllEnvs())

describe('R1 Stage 1 bounded pilot command gateway (injected only)',()=>{
  it('executes the complete forms Save→EXTS→Process sequence only after a fresh scoped read per step',async()=>{
    const {gateway,read,called}=harness()
    const receipt=await executeR1Stage1FunctionalCandidate(storagePort(),{
      scope,sourceNodeType:'forms',kind:'forms_save',fields:{note:'synthetic'},
      title:'合成表单',authoritativeExts:{formList:[]},processActive:true,
    },gateway)
    expect(receipt.state,JSON.stringify(receipt)).toBe('succeeded')
    expect(read.getWorkOrderDetail).toHaveBeenCalledTimes(4) // preflight + each of three writes
    expect(read.isWorkOrderListedForCurrentSession).toHaveBeenCalledTimes(4)
    expect(called.map(x=>x.path)).toEqual([
      'biz/extForm/upsert/synthetic-definition',
      'workflowNode/updateExts/synthetic-node','workflow/process',
    ])
    expect(called.every(x=>x.r1Special===true)).toBe(true)
  })

  it('no grant and Production target are denied before any command or transaction receipt',async()=>{
    for(const overrides of [
      {grant:()=>false},
      {environment:'prod',grant:()=>true},
      {apiBaseUrl:'https://xlink.fsgo365.cn',grant:()=>true},
    ]){
      const {gateway,command}=harness(overrides)
      const storage=storagePort()
      const result=await executeR1Stage1FunctionalCandidate(storage,{
        scope,sourceNodeType:'forms',kind:'forms_save',fields:{},title:'合成',
        authoritativeExts:{formList:[]},processActive:false,
      },gateway)
      expect(result.state).toBe('failed_terminal')
      expect(command.execute).not.toHaveBeenCalled()
      expect(storage.write).not.toHaveBeenCalled()
    }
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','prod')
    const disguised=harness({environment:'test',apiBaseUrl:'https://isolated-beta.invalid'})
    expect(await disguised.gateway.revalidate(scope)).toBe(false)
    expect(disguised.command.execute).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('rejects wrong, missing, invisible and inactive source nodes before a command',async()=>{
    for(const candidate of [
      node({sourceNodeType:undefined,nodeTypeEvidence:'unresolved'}),
      node({formDefinitionId:asOpaqueId<'FormDefinitionId'>('other-definition')}),
      node({lifecycle:'closed'}),
      node({visibility:{evidenceState:'unknown'}}),
      node({visibility:{evidenceState:'verified',selectableRoleIds:[]}}),
      node({runId:asOpaqueId<'WorkflowRunId'>('other-run')}),
    ]){
      const {gateway,command}=harness({node:candidate})
      expect(await gateway.revalidate(scope)).toBe(false)
      expect(command.execute).not.toHaveBeenCalled()
    }
  })

  it('stops between FormData and EXTS if the role changes after the first command',async()=>{
    let current= session
    const next={...session,roleVersion:'two'}
    const {gateway,called}=harness({session:()=>current,onDispatch:()=>{current=next}})
    const storage=storagePort()
    const result=await executeR1Stage1FunctionalCandidate(storage,{
      scope,sourceNodeType:'forms',kind:'forms_save',fields:{note:'synthetic'},
      title:'合成表单',authoritativeExts:{formList:[]},processActive:true,
    },gateway)
    expect(result.state).toBe('failed_terminal')
    expect(called).toHaveLength(1)
    expect((await inspectR1MultiStepReceipt(storage,scope)).data).not.toBe(null)
  })

  it('consumes one verified read per command and rejects unrelated routes and JSON identities',async()=>{
    const {gateway,command}=harness()
    expect(await gateway.revalidate(scope)).toBe(true)
    await expect(gateway.dispatch({method:'POST',path:'basic/order/upsert',r1Special:true})).rejects.toThrow()
    await expect(gateway.dispatch({method:'POST',path:'workflow/process',r1Special:true,
      body:{sid:scope.workOrderId,workflowNodeId:scope.runtimeNodeId,
        nodeFormDefId:'',nodeFormDataId:'',smodule:'serviceAppointment'}})).rejects.toThrow()
    expect(await gateway.revalidate({...scope})).toBe(true)
    await expect(gateway.dispatch({method:'POST',path:'biz/extForm/upsert/synthetic-definition',
      r1Special:true,body:{dataStr:JSON.stringify({sid:'another-order',
        nodeId:scope.runtimeNodeId,workflowId:scope.workflowRunId,state:1,smodule:'serviceAppointment'})}}))
      .rejects.toThrow()
    expect(command.execute).not.toHaveBeenCalled()
  })

  it('rejects Process that mixes the verified forms scope with an unrelated form definition',async()=>{
    const {gateway,command}=harness()
    expect(await gateway.revalidate(scope)).toBe(true)
    await expect(gateway.dispatch({method:'POST',path:'workflow/process',r1Special:true,
      body:{sid:scope.workOrderId,workflowNodeId:scope.runtimeNodeId,
        nodeFormDefId:'unrelated-definition',nodeFormDataId:'',smodule:'serviceAppointment'}}))
      .rejects.toThrow()
    expect(command.execute).not.toHaveBeenCalled()
  })

  it('child subflow must prove outer parent node, then exact child identity',async()=>{
    const invalid=harness({childParentRuntimeId:'synthetic-parent',node:node({nodeTypeEvidence:'unresolved'})})
    expect(await invalid.gateway.revalidate(scope)).toBe(false)
    const valid=harness({childParentRuntimeId:'synthetic-parent'})
    expect(await valid.gateway.revalidate(scope)).toBe(true)
    expect(valid.read.getChildWorkflowNodes).toHaveBeenCalledOnce()
  })

  it('runs a repeat batch under the exact runtime/run identity, without falling back to single-form Process',async()=>{
    const repeat={...scope,sourceNodeType:'repeat' as const}
    const targetNode=node({sourceNodeType:'repeat',category:'repeat'})
    const {gateway,called,read}=harness({scope:repeat,node:targetNode})
    const receipt=await executeR1Stage1FunctionalCandidate(storagePort(),{
      scope:repeat,sourceNodeType:'repeat',kind:'repeat_batch',
      forms:[{note:'row-a'},{note:'row-b'}],
    },gateway)
    expect(receipt.state,JSON.stringify(receipt)).toBe('succeeded')
    expect(read.getWorkOrderDetail).toHaveBeenCalledTimes(4)
    expect(called.map(x=>x.path)).toEqual([
      'biz/extForm/upsert/synthetic-definition',
      'biz/extForm/upsert/synthetic-definition','workflow/process',
    ])
    expect(called.at(-1)?.body).toMatchObject({
      sid:scope.workOrderId,workflowNodeId:scope.runtimeNodeId,
      nodeFormDataId:'synthetic-saved-1,synthetic-saved-2',
    })
  })
})
