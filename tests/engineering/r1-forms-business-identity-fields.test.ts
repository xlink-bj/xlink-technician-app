import {it,expect} from 'vitest'
import {normalizeR1FormsEditValues} from '@features/work-orders/r1-forms-edit-values'
import {normalizeR1RepeatValues} from '@features/work-orders/r1-repeat-form'
import {r1SpecialFormUpsert} from '@adapters/api/r1-special-workflow-wires'
import type {R1NodeFormsSnapshot} from '@features/work-orders/r1-node-forms-read'
import {asOpaqueId} from '@shared/types'
const aliases=['workflowRunId','runId','formDefinitionId','workflow','runtimeNodeId','workOrderId']
it.each(aliases)('same granted field ID cannot change its business valueKey to %s',key=>{
 const s={definition:{id:'e',fields:[{fieldId:'same-granted-id',valueKey:key,type:'text',label:'Injected identity',required:false}]},node:{formFieldIdsReadOnly:[]}} as unknown as R1NodeFormsSnapshot
 expect(()=>normalizeR1RepeatValues(s,{[key]:'foreign'})).toThrow()
 expect(()=>normalizeR1FormsEditValues(s,{[key]:'foreign',exts:{[key]:'foreign'}},{[key]:'foreign'})).toThrow()
})
it.each(aliases)('wire itself rejects %s as patch and as explicit clear, before any transport',key=>{
 const input={sourceNodeType:'forms' as const,definitionId:asOpaqueId<'FormDefinitionId'>('e'),workOrderId:asOpaqueId<'WorkOrderId'>('s'),workflowNodeId:asOpaqueId<'WorkflowNodeRuntimeId'>('n'),workflowRunId:asOpaqueId<'WorkflowRunId'>('w'),state:1 as const}
 expect(()=>r1SpecialFormUpsert({...input,formData:{[key]:'foreign'}})).toThrow()
 expect(()=>r1SpecialFormUpsert({...input,formData:{},existingFormDataId:asOpaqueId<'FormDataId'>('r'),authoritativeOriginal:{_id:'r',[key]:'foreign',exts:{[key]:'foreign'}},clearedFieldKeys:[key]})).toThrow()
})

it.each([{workflowRunId:'foreign'},{runId:'foreign'},{smodule:'foreign'},{workflow:{workflowId:'foreign'}},{workflow:{workflowRunId:'foreign'}},{workflow:{runId:'foreign'}}])('scoped discovery refuses explicit conflicting ownership aliases %j',async extra=>{
 const {createR1ScopedFormReader}=await import('@adapters/api/r1-scoped-form-read')
 const raw={_id:'r',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',state:1,...extra}
 const reader=createR1ScopedFormReader({scope:{tenantId:'t',workOrderId:'s',runtimeNodeId:'n',workflowRunId:'w',formDefinitionId:'e',sourceNodeType:'forms'},isCurrent:()=>true,
  formList:{source:'exts.formList',evidence:'available',entries:[{id:asOpaqueId<'FormDataId'>('r'),state:'active',formDefinitionId:asOpaqueId<'FormDefinitionId'>('e')}],truncated:false},
  transport:{execute:async()=>({data:[raw],total:1,page:1,size:2})}})
 await expect(reader.discover()).rejects.toThrow()
})
