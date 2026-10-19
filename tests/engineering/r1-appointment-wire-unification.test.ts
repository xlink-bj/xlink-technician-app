import { describe, expect, it, vi } from 'vitest'
import {
  createTechnicianApiCommandAdapter, ApiCommandTransportError,
  type ApiCommandRequest, type ApiCommandTransport,
} from '@adapters/api/technician-api-commands'
import type { TechnicianApiReadPort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const workOrderId=asOpaqueId<'WorkOrderId'>('synthetic-appointment')
const workflowNodeId=asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-workflow-node')
const definitionId=asOpaqueId<'FormDefinitionId'>('synthetic-form-definition')
const formDataId=asOpaqueId<'FormDataId'>('synthetic-existing-form')
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
    const execute=vi.fn(async()=>savedEnvelope())
    const command=adapter(execute)
    const result=await command.saveDynamicForm({
      workOrderId,workflowNodeId,definitionId,formDataId,
      values:{need:'1',datetime:'2026-04-21 10:00',note:null},
    })
    expect(result).toMatchObject({state:'succeeded',data:'synthetic-upserted-form'})
    expect(execute).toHaveBeenCalledTimes(1)
    const request=execute.mock.calls[0]![0] as ApiCommandRequest
    expect(request.safety).toBeUndefined()
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
      workOrderId,workflowNodeId,visitIntent:'visit_required',
      values:{need:'1',datetime:'2026-04-21 10:00',note:null},
    })
    expect(result.state).toBe('succeeded')
    expect(execute).toHaveBeenCalledTimes(2)
    const [save,process]=execute.mock.calls.map(([x])=>x)
    expect(save.safety).toBeUndefined()
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
  it('deferred visit is encoded with one same FormData wire but flagged for transport-level denial',async()=>{
    const execute=vi.fn(async(request:ApiCommandRequest)=>{
      if(request.safety==='deferred_appointment_datetime_encoding_unknown') {
        throw new ApiCommandTransportError('R1 need=0 datetime encoding unknown','unsupported_capability')
      }
      return savedEnvelope()
    })
    const result=await adapter(execute).submitAppointment({
      workOrderId,workflowNodeId,visitIntent:'visit_deferred',
      values:{need:'0',note:null},
    })
    expect(result.state).toBe('failed_terminal')
    expect(execute).toHaveBeenCalledTimes(1)
    const req=execute.mock.calls[0]![0] as ApiCommandRequest
    expect(req.safety).toBe('deferred_appointment_datetime_encoding_unknown')
    expect(exactWire(req)).toMatchObject({
      need:'0',sid:workOrderId,smodule:'serviceAppointment',nodeId:workflowNodeId,state:1,
    })
    expect(exactWire(req)).not.toHaveProperty('datetime')
    expect(exactWire(req)).not.toHaveProperty('note')
    expect(execute.mock.calls.some(([x])=>(x as ApiCommandRequest).path==='workflow/process')).toBe(false)
  })
  it('save failure NEVER triggers Workflow Process or simulates appointment success',async()=>{
    const execute=vi.fn(async()=>{throw new ApiCommandTransportError('synthetic rejection','server_terminal')})
    const result=await adapter(execute).submitAppointment({
      workOrderId,workflowNodeId,visitIntent:'visit_required',
      values:{need:'1',datetime:'2026-04-21 10:00'},
    })
    expect(result.state).toBe('failed_terminal')
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
