import { describe, expect, it, vi } from 'vitest'
import { createTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { createTechnicianApiCommandAdapter } from '@adapters/api/technician-api-commands'
import { projectDetailWorkflow } from '@runtimes/workflow'
import { requiresR1SpecialWorkflowWire, asOpaqueId } from '@shared/types'
import type { FormMutationCheckpoints, TechnicianApiReadPort, WorkflowNodeRead } from '@shared/ports'

const userId=asOpaqueId<'UserId'>('a06b-user')
const workOrderId=asOpaqueId<'WorkOrderId'>('a06b-order')
const workflowNodeId=asOpaqueId<'WorkflowNodeRuntimeId'>('a06b-node')
const definitionId=asOpaqueId<'FormDefinitionId'>('a06b-formdef')
const formDataId=asOpaqueId<'FormDataId'>('a06b-formdata')
const mockMutation: FormMutationCheckpoints = {
  beforeFormDispatch: vi.fn(async()=>({state:'succeeded' as const})),
  afterFormSaved: vi.fn(async()=>({state:'succeeded' as const})),
  beforeWorkflowDispatch: vi.fn(async()=>({state:'succeeded' as const})),
  afterWorkflowCompleted: vi.fn(async()=>({state:'succeeded' as const})),
}
function node(sourceNodeType?: string): WorkflowNodeRead {
  return {
    id:workflowNodeId, category:sourceNodeType==='repeat'?'repeat':'forms',
    lifecycle:'active',displayName:'合成表单',formDefinitionId:definitionId,
    ...(sourceNodeType?{sourceNodeType}:{}),
    visibility:{evidenceState:'verified',selectableRoleIds:[asOpaqueId<'RoleId'>('synthetic-role')]},
  }
}
const actor={
  userId,roleIds:[asOpaqueId<'RoleId'>('synthetic-role')],organizationRoles:[],
}

describe('A06-B — preserve real R1 nodeType and deny incompatible one-ID commands',()=>{
  it.each(['forms','repeat','subflow','subflows','subworkflow'])('marks %s as non-single-record wire',sourceNodeType=>{
    expect(requiresR1SpecialWorkflowWire(sourceNodeType)).toBe(true)
  })
  it('does not mistake UI category alone for server proof',()=>{
    expect(requiresR1SpecialWorkflowWire(undefined)).toBe(false)
    const uiOnly=projectDetailWorkflow([node()],actor)
    expect(uiOnly).toMatchObject({selection:'selected',currentTask:{execution:'enabled'}})
    // The UI-only fixture is synthetic; a real adapter must add sourceNodeType.
  })
  it.each(['forms','repeat'])('preserves %s source type and disables ordinary form submission',sourceNodeType=>{
    const projection=projectDetailWorkflow([node(sourceNodeType)],actor)
    expect(projection).toMatchObject({
      selection:'selected',
      currentTask:{sourceNodeType,execution:'disabled_read_only'},
    })
  })
  it('keeps reading/navigation for real child-subworkflow without completing with the single-record command',()=>{
    const child:WorkflowNodeRead={...node('subflows'),category:'subworkflow'}
    const projection=projectDetailWorkflow([child],actor)
    expect(projection).toMatchObject({selection:'selected',currentTask:{
      sourceNodeType:'subflows',actionIntent:'open_subworkflow',execution:'enabled',
    }})
  })
  it.each(['forms','repeat','subflows'])('normalizes raw R1 nodeDef.nodeType=%s without conflating category',async sourceNodeType=>{
    const read=createTechnicianApiReadAdapter({
      execute:vi.fn(async()=>({data:{
        serviceAppointment:{_id:String(workOrderId)},
        workflowNode:[{_id:String(workflowNodeId),state:0,handlerIds:['a06b-user'],
          nodeDef:{nodeType:sourceNodeType,name:'合成节点',formDefId:String(definitionId),userChoose:'synthetic-role'}}],
      }})),
    })
    const result=await read.getWorkOrderDetail(workOrderId)
    expect(result.state).toBe('succeeded')
    const normalized=result.data?.workflowNodes?.[0]
    expect(normalized?.sourceNodeType).toBe(sourceNodeType)
    expect(normalized).not.toHaveProperty('nodeDef')
  })
  it.each(['forms','repeat','subflow','subflows'])('refuses %s direct FormData and Process adapters BEFORE checkpoints',async sourceNodeType=>{
    const execute=vi.fn(async()=>({success:true,data:{_id:formDataId}}))
    const adapter=createTechnicianApiCommandAdapter({execute},{} as TechnicianApiReadPort)
    const save=await adapter.saveDynamicForm!({
      workOrderId,workflowNodeId,definitionId,sourceNodeType,
      values:{synthetic:'1'},mutation:mockMutation,
    })
    const complete=await adapter.completeWorkflowNode!({
      workOrderId,workflowNodeId,definitionId,sourceNodeType,formDataId,mutation:mockMutation,
    })
    const appointment=await adapter.submitAppointment({
      workOrderId,workflowNodeId,sourceNodeType,visitIntent:'visit_required',
      values:{need:'1',datetime:'2026-10-21 11:00'},mutation:mockMutation,
    })
    expect([save,complete,appointment].map(r=>r.error?.category))
      .toEqual(['unsupported_capability','unsupported_capability','unsupported_capability'])
    expect(execute).not.toHaveBeenCalled()
    expect(mockMutation.beforeFormDispatch).not.toHaveBeenCalled()
    expect(mockMutation.beforeWorkflowDispatch).not.toHaveBeenCalled()
  })
})
