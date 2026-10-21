import { describe, expect, it } from 'vitest'
import {
  r1FormsAfterSaveProcess, r1FormsFinalizeProcess, r1RepeatBatchProcess,
} from '@adapters/api/r1-special-workflow-wires'
import { asOpaqueId } from '@shared/types'
const base = {
  workOrderId: asOpaqueId<'WorkOrderId'>('workorder-synthetic'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('runtime-node-synthetic'),
}
const formDef = asOpaqueId<'FormDefinitionId'>('form-def-synthetic')
const a = asOpaqueId<'FormDataId'>('saved-a')
const b = asOpaqueId<'FormDataId'>('saved-b')

describe('F1 source-matched R1 special node workflow/process wire builders (NOT executed)', () => {
  it('forms after updateExts ACK clears both IDs (R1 process(formDataId))', () => {
    const wire = r1FormsAfterSaveProcess({ ...base, sourceNodeType:'forms', updatedFormListAcknowledged:true })
    expect(wire).toEqual({ method:'POST', path:'workflow/process', body: {
      workflowNodeId:'runtime-node-synthetic',nodeFormDefId:'',nodeFormDataId:'',
      smodule:'serviceAppointment',sid:'workorder-synthetic',
    }})
    expect(() => r1FormsAfterSaveProcess({
      ...base,sourceNodeType:'forms',updatedFormListAcknowledged:false as true,
    })).toThrow('updateExts ACK')
  })
  it('forms completion carries formDefinition but empty data ID (R1 process complate)', () => {
    const wire = r1FormsFinalizeProcess({
      ...base,sourceNodeType:'forms',definitionId:formDef,availableFormDataIds:[a],
    })
    expect(wire.body).toEqual({
      workflowNodeId:'runtime-node-synthetic',nodeFormDefId:'form-def-synthetic',
      nodeFormDataId:'',smodule:'serviceAppointment',sid:'workorder-synthetic',
    })
    expect(() => r1FormsFinalizeProcess({
      ...base,sourceNodeType:'forms',definitionId:formDef,availableFormDataIds:[],
    })).toThrow('bounded form list')
  })
  it('repeat requires unique, saved IDs and joins exactly with comma (R1 doProcess)', () => {
    const wire = r1RepeatBatchProcess({
      ...base,sourceNodeType:'repeat',definitionId:formDef,savedFormDataIds:[a,b],
    })
    expect(wire.body).toMatchObject({nodeFormDataId:'saved-a,saved-b',nodeFormDefId:'form-def-synthetic'})
    for (const ids of [[a,a],[], Array.from({length:51},(_,i)=>asOpaqueId<'FormDataId'>(`saved-${i}`))]) {
      expect(() => r1RepeatBatchProcess({
        ...base,sourceNodeType:'repeat',definitionId:formDef,savedFormDataIds:ids,
      })).toThrow()
    }
  })
  it('source builders contain no endpoint for updateExts or business execution',()=>{
    const examples=[
      r1FormsAfterSaveProcess({ ...base,sourceNodeType:'forms',updatedFormListAcknowledged:true }),
      r1RepeatBatchProcess({ ...base,sourceNodeType:'repeat',definitionId:formDef,savedFormDataIds:[a] }),
    ]
    expect(examples.every(x=>x.method==='POST' && x.path==='workflow/process')).toBe(true)
  })
})
