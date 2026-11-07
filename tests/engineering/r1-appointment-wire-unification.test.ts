import { describe, expect, it, vi } from 'vitest'
import {
  createTechnicianApiCommandAdapter, ApiCommandTransportError,
  type ApiCommandRequest, type ApiCommandTransport,
} from '@adapters/api/technician-api-commands'
import type { FormMutationCheckpoints, TechnicianApiReadPort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const workOrderId=asOpaqueId<'WorkOrderId'>('synthetic-appointment')
const workflowNodeId=asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-workflow-node')
const definitionId=asOpaqueId<'FormDefinitionId'>('synthetic-form-definition')
const formDataId=asOpaqueId<'FormDataId'>('synthetic-existing-form')
const wireCheckpoints: FormMutationCheckpoints = {
  beforeFormDispatch: async () => ({ state: 'succeeded' }),
  afterFormSaved: async () => ({ state: 'succeeded' }),
  beforeWorkflowDispatch: async () => ({ state: 'succeeded' }),
  afterWorkflowCompleted: async () => ({ state: 'succeeded' }),
}
function adapter(execute: (request:ApiCommandRequest)=>Promise<unknown>) {
  return createTechnicianApiCommandAdapter({execute} as ApiCommandTransport, {} as TechnicianApiReadPort)
}
function savedEnvelope(id='synthetic-upserted-form') {return {success:true,data:{_id:id}}}
function exactWire(request:ApiCommandRequest) {
  expect(request.path).toMatch(/^biz\/extForm\/upsert\//)
  expect(request.method).toBe('POST')
  const wire=(request.body as {dataStr:string}).dataStr
  return JSON.parse(wire) as Record<string,unknown>
}
describe('R1 A03 single authoritative appointment FormData serializer',()=>{
  it('saveOnly persists FormData once with no Workflow Complete and filters null values',async()=>{
    const execute=vi.fn(async(_request:ApiCommandRequest)=>savedEnvelope())
    const command=adapter(execute)
    const result=await command.saveDynamicForm!({
      workOrderId,workflowNodeId,definitionId,formDataId,mutation:wireCheckpoints,
      values:{need:'1',datetime:'2026-04-21 10:00',note:null},
    })
    expect(result).toMatchObject({state:'succeeded',data:'synthetic-upserted-form'})
    expect(execute).toHaveBeenCalledTimes(1)
    const request=execute.mock.calls[0]![0] as ApiCommandRequest
    expect(exactWire(request)).toMatchObject({
      need:'1',datetime:'2026-04-21 10:00',sid:workOrderId,
      smodule:'serviceAppointment',nodeId:workflowNodeId,
      _id:formDataId,state:1,
    })
    expect(exactWire(request)).not.toHaveProperty('note')
    expect(execute.mock.calls.some(([x])=>(x as ApiCommandRequest).path==='workflow/process')).toBe(false)
  })
  it('required visit uses the SAME serializer, then Workflow Process exactly once after save response',async()=>{
    const execute=vi.fn(async(request:ApiCommandRequest)=>
      request.path.startsWith('biz/extForm/upsert')?savedEnvelope():{success:true})
    const command=adapter(execute)
    const result=await command.submitAppointment({
      workOrderId,workflowNodeId,visitIntent:'visit_required',mutation:wireCheckpoints,
      values:{need:'1',datetime:'2026-04-21 10:00',note:''},
    })
    expect(result.state).toBe('succeeded')
    expect(execute).toHaveBeenCalledTimes(2)
    const [save,process]=execute.mock.calls.map(([x])=>x)
    expect(exactWire(save)).toMatchObject({
      need:'1',datetime:'2026-04-21 10:00',
      sid:workOrderId,smodule:'serviceAppointment',nodeId:workflowNodeId,state:1,
    })
    expect(process).toMatchObject({
      method:'POST',path:'workflow/process',
      body:{workflowNodeId,nodeFormDataId:'synthetic-upserted-form',
        smodule:'serviceAppointment',sid:workOrderId},
    })
    expect((process.body as Record<string,unknown>).nodeFormDefId).toBeTruthy()
  })
  it('preserves a selected datetime for deferred R1 FormData and then processes the saved record',async()=>{
    const execute=vi.fn(async (request:ApiCommandRequest)=>
      request.path.startsWith('biz/extForm/upsert')?savedEnvelope():{success:true})
    const beforeFormDispatch=vi.fn(async()=>({state:'succeeded' as const}))
    const mutation={...wireCheckpoints,beforeFormDispatch}
    const command=adapter(execute)
    const result=await command.submitAppointment({
      workOrderId,workflowNodeId,visitIntent:'visit_deferred',mutation,
      values:{need:'0',datetime:'2026-04-21 10:00',note:''},
    })
    expect(result.state).toBe('succeeded')
    expect(beforeFormDispatch).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledTimes(2)
    const [save,process]=execute.mock.calls.map(([request])=>request)
    expect(exactWire(save)).toMatchObject({need:'0',datetime:'2026-04-21 10:00'})
    expect(exactWire(save).note).toBe('')
    expect(process).toMatchObject({
      method:'POST',path:'workflow/process',
      body:{workflowNodeId,nodeFormDataId:'synthetic-upserted-form',
        smodule:'serviceAppointment',sid:workOrderId},
    })
  })
  it('omits datetime when a deferred visit has never had a selected time',async()=>{
    const execute=vi.fn(async (request:ApiCommandRequest)=>
      request.path.startsWith('biz/extForm/upsert')?savedEnvelope():{success:true})
    const command=adapter(execute)
    const result=await command.submitAppointment({
      workOrderId,workflowNodeId,visitIntent:'visit_deferred',mutation:wireCheckpoints,
      values:{need:'0'},
    })
    expect(result.state).toBe('succeeded')
    const save=execute.mock.calls[0]![0] as ApiCommandRequest
    expect(exactWire(save)).toMatchObject({need:'0'})
    expect(exactWire(save)).not.toHaveProperty('datetime')
    expect(execute).toHaveBeenCalledTimes(2)
  })
  it('persists verified no-visit 2 unchanged through the same checkpoints and serializer',async()=>{
    const execute=vi.fn(async(request:ApiCommandRequest)=>
      request.path.startsWith('biz/extForm/upsert')?savedEnvelope():{success:true})
    const result=await adapter(execute).submitAppointment({
      workOrderId,workflowNodeId,visitIntent:'visit_deferred',mutation:wireCheckpoints,
      values:{need:'2',reasons1:'synthetic-reason'},
    })
    expect(result.state).toBe('succeeded')
    expect(execute).toHaveBeenCalledTimes(2)
    expect(exactWire(execute.mock.calls[0]![0])).toMatchObject({need:'2',reasons1:'synthetic-reason'})
    expect(execute.mock.calls[1]![0].path).toBe('workflow/process')
  })
  it('keeps no-visit 2 behind intent, special-node and durable checkpoint guards',async()=>{
    const execute=vi.fn(async(_request:ApiCommandRequest)=>savedEnvelope())
    const beforeFormDispatch=vi.fn(async()=>({state:'succeeded' as const}))
    const command=adapter(execute)
    const base={workOrderId,workflowNodeId,values:{need:'2'},mutation:{...wireCheckpoints,beforeFormDispatch}}
    for (const input of [
      {...base,visitIntent:'visit_required' as const},
      {...base,visitIntent:'unknown' as const},
      {...base,visitIntent:'visit_deferred' as const,mutation:undefined},
      {...base,visitIntent:'visit_deferred' as const,sourceNodeType:'forms' as const},
      {...base,visitIntent:'visit_deferred' as const,values:{need:'unknown'}},
    ]) expect((await command.submitAppointment(input)).state).toBe('failed_terminal')
    expect(beforeFormDispatch).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
  it('rejects an intent that does not match the R1 need value before checkpoint or transport',async()=>{
    const execute=vi.fn(async (_request:ApiCommandRequest)=>savedEnvelope())
    const beforeFormDispatch=vi.fn(async()=>({state:'succeeded' as const}))
    const command=adapter(execute)
    const result=await command.submitAppointment({
      workOrderId,workflowNodeId,visitIntent:'visit_required',
      mutation:{...wireCheckpoints,beforeFormDispatch},values:{need:'0'},
    })
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('unsupported_capability')
    expect(beforeFormDispatch).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
  it('save failure NEVER triggers Workflow Process or simulates appointment success',async()=>{
    const execute=vi.fn(async()=>{throw new ApiCommandTransportError('synthetic rejection','server_terminal')})
    const result=await adapter(execute).submitAppointment({
      workOrderId,workflowNodeId,visitIntent:'visit_required',mutation:wireCheckpoints,
      values:{need:'1',datetime:'2026-04-21 10:00'},
    })
    expect(result.state).toBe('failed_terminal')
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
