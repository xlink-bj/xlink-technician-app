/**
 * Source-backed R1 special node functional candidate. This orchestrator has
 * deliberately NO production composition root: all execution is injected by
 * an isolated offline harness until #199 pilot evidence and separate approval.
 * Raw forms and full-fidelity EXTS stay transient and never enter receipts.
 */
import type { ApiCommandRequest } from '@adapters/api/technician-api-commands'
import { normalizeCommandResponse } from '@adapters/api/technician-api-commands'
import {
  r1FormsAfterSaveProcess, r1FormsFinalizeProcess, r1FormsUpdateExtsCommand,
  r1RepeatBatchProcess, r1RepeatRemoveCommand, r1SpecialFormUpsert,
} from '@adapters/api/r1-special-workflow-wires'
import { planR1FormsUpdateExts, type R1JsonObject } from '@features/work-orders/r1-forms-exts-plan'
import {
  executeR1MultiStepOffline, type R1MultiStepReceipt,
  type R1MultiStepScope, type R1MultiStepKind,
} from '@features/work-orders/r1-multistep-offline-transaction'
import type { StoragePort } from '@shared/ports'
import type { FormDataId, FormDefinitionId, WorkOrderId, WorkflowNodeRuntimeId, WorkflowRunId, OperationSnapshot } from '@shared/types'
import { createOperationError } from '@shared/types'

type Fields = Readonly<Record<string,string|number|boolean>>
interface Base { readonly scope:R1MultiStepScope }
type R1Stage1Intent =
  | (Base & {readonly kind:'forms_save';readonly sourceNodeType:'forms';
      readonly fields:Fields;readonly authoritativeExts:R1JsonObject;
      readonly title:string;readonly processActive:boolean;
      readonly authoritativeOriginal?:R1JsonObject;
      readonly existingFormDataId?:string})
  | (Base & {readonly kind:'forms_delete';readonly sourceNodeType:'forms';
      readonly existingFormDataId:string;readonly authoritativeExts:R1JsonObject;
      readonly sourceFormData:R1JsonObject})
  | (Base & {readonly kind:'forms_finalize';readonly sourceNodeType:'forms';
      readonly authoritativeSavedIds:readonly string[]})
  | (Base & {readonly kind:'repeat_save';readonly sourceNodeType:'repeat';
      readonly fields:Fields;readonly existingFormDataId?:string;
      readonly authoritativeOriginal?:R1JsonObject})
  | (Base & {readonly kind:'repeat_delete';readonly sourceNodeType:'repeat';
      readonly existingFormDataId:string})
  | (Base & {readonly kind:'repeat_batch';readonly sourceNodeType:'repeat';
      readonly forms:readonly Fields[]})
  | (Base & {readonly kind:'repeat_finalize';readonly sourceNodeType:'repeat';
      readonly authoritativeSavedIds:readonly string[]})

export interface R1OfflineSpecialCommandGateway {
  /** Must recheck actor/role/work-order/node for EVERY step, not once per flow. */
  revalidate(scope:R1MultiStepScope):Promise<boolean>
  /** ONLY for synthetic local test composition, NEVER wired to live UI. */
  dispatch(request:ApiCommandRequest):Promise<unknown>
}
function opaque<T extends string>(id:string):T {return id as T}
function failure(message:string):OperationSnapshot<R1MultiStepReceipt>{
  return {state:'failed_terminal',error:createOperationError('unsupported_capability',message)}
}
function savedId(raw:unknown):string {
  const response=normalizeCommandResponse(raw) as Record<string,unknown>
  const data=response.data
  const record=(data && typeof data==='object' && !Array.isArray(data)
    ? data : response.entity && typeof response.entity==='object' && !Array.isArray(response.entity)
      ? response.entity : response) as Record<string,unknown>
  const value=record._id??record.id??record.dataId
  if(typeof value!=='string'||!value.trim()||value.startsWith('local-'))
    throw new Error('R1 FormData upsert returned no authoritative saved identity')
  return value
}
function sourceRecord(id:string,title:string,formDefinitionId:string):R1JsonObject{
  return {_id:id,formDefId:formDefinitionId,formTitle:title,state:1}
}
/** Validate the full existing EXTS and the eventual list capacity before a
 * new FormData can be created. The placeholder is never dispatched/stored. */
function preflightFormsSaveExts(intent:Extract<R1Stage1Intent,{kind:'forms_save'}>):void{
  const list=intent.authoritativeExts.formList
  const occupied=new Set(Array.isArray(list)
    ? list.map(x=>x && typeof x==='object' && !Array.isArray(x)
      ? (x as Record<string,unknown>)._id : undefined) : [])
  let placeholder='__r1_preflight_only__'
  while(occupied.has(placeholder))placeholder+='x'
  const recordId=intent.existingFormDataId??placeholder
  const plan=planR1FormsUpdateExts({
    workflowNodeId:intent.scope.runtimeNodeId,sourceNodeType:'forms',
    authoritativeExts:intent.authoritativeExts,
    change:{kind:'saved',record:sourceRecord(recordId,intent.title,intent.scope.formDefinitionId)},
  })
  if(intent.existingFormDataId){
    if(!plan.previousIds.includes(intent.existingFormDataId))
      throw new Error('R1 original FormData missing from authoritative EXTS')
    const row=Array.isArray(list)?list.find(x=>x && typeof x==='object'
      && !Array.isArray(x) && (x as Record<string,unknown>)._id===intent.existingFormDataId):null
    if(!row || (row as Record<string,unknown>).state===-1)
      throw new Error('Deleted R1 FormData cannot be edited')
  }
}
function sourceWire(scope:R1MultiStepScope,ids:readonly string[],kind:'forms'|'repeat',finalize:boolean){
  const base={workOrderId:opaque<WorkOrderId>(scope.workOrderId),
    workflowNodeId:opaque<WorkflowNodeRuntimeId>(scope.runtimeNodeId)}
  return kind==='forms'
    ? finalize
      ? r1FormsFinalizeProcess({...base,sourceNodeType:'forms',
          definitionId:opaque<FormDefinitionId>(scope.formDefinitionId),
          availableFormDataIds:ids.map(x=>opaque<FormDataId>(x))})
      : r1FormsAfterSaveProcess({...base,sourceNodeType:'forms',updatedFormListAcknowledged:true})
    : r1RepeatBatchProcess({...base,sourceNodeType:'repeat',
        definitionId:opaque<FormDefinitionId>(scope.formDefinitionId),
        savedFormDataIds:ids.map(x=>opaque<FormDataId>(x))})
}

/** Execution is deliberately not exported via application composition or UI.
 * A staged future live integration requires explicit pilot authorization. */
export async function executeR1Stage1FunctionalCandidate(
  storage:StoragePort, intent:R1Stage1Intent, gateway:R1OfflineSpecialCommandGateway,
):Promise<OperationSnapshot<R1MultiStepReceipt>>{
  const scope=intent.scope
  if(scope.sourceNodeType!==intent.sourceNodeType || !scope.authorizationScope.trim())
    return failure('R1 node type or actor scope mismatch')
  const finalize=intent.kind==='forms_finalize'||intent.kind==='repeat_finalize'
  const authoritativeIds=finalize ? intent.authoritativeSavedIds : []
  let steps:readonly R1MultiStepKind[]
  switch(intent.kind){
    case 'forms_save':steps=intent.processActive
      ? ['form_upsert','forms_exts_update','workflow_process']
      : ['form_upsert','forms_exts_update'];break
    // R1 first removes the EXTS reference and then soft-deletes FormData.
    // An unknown outcome at either step is a manual reconciliation fence.
    case 'forms_delete':steps=['forms_exts_update','forms_soft_delete'];break
    case 'forms_finalize':steps=['workflow_process'];break
    case 'repeat_save':steps=['repeat_form_upsert'];break
    case 'repeat_delete':steps=['repeat_remove'];break
    case 'repeat_batch':
      if(intent.forms.length===0||intent.forms.length>49)return failure('Repeat batch requires bounded rows')
      steps=[...intent.forms.map(()=>'repeat_form_upsert' as const),'workflow_process'];break
    case 'repeat_finalize':steps=['workflow_process'];break
  }
  if(['forms_finalize','repeat_finalize'].includes(intent.kind)
    && authoritativeIds.length===0)return failure('Empty R1 form list cannot finalize')
  // Validate every source-only request that can be built before reserving the
  // first transaction receipt. Missing full originals must never surface only
  // after an earlier EXTS write has already reached the backend.
  try {
    if(intent.kind==='forms_save'||intent.kind==='repeat_save'){
      r1SpecialFormUpsert({sourceNodeType:intent.sourceNodeType,
        definitionId:opaque<FormDefinitionId>(scope.formDefinitionId),
        formData:intent.fields,workOrderId:opaque<WorkOrderId>(scope.workOrderId),
        workflowNodeId:opaque<WorkflowNodeRuntimeId>(scope.runtimeNodeId),
        ...(scope.workflowRunId?{workflowRunId:opaque<WorkflowRunId>(scope.workflowRunId)}:{}),
        ...(intent.existingFormDataId?{existingFormDataId:opaque<FormDataId>(intent.existingFormDataId)}:{}),
        ...(intent.authoritativeOriginal?{authoritativeOriginal:intent.authoritativeOriginal}:{}),state:1})
    }
    if(intent.kind==='forms_save')preflightFormsSaveExts(intent)
    if(intent.kind==='forms_delete'){
      planR1FormsUpdateExts({workflowNodeId:scope.runtimeNodeId,sourceNodeType:'forms',
        authoritativeExts:intent.authoritativeExts,
        change:{kind:'delete',recordId:intent.existingFormDataId}})
      r1SpecialFormUpsert({sourceNodeType:'forms',
        definitionId:opaque<FormDefinitionId>(scope.formDefinitionId),
        formData:{},authoritativeOriginal:intent.sourceFormData,
        workOrderId:opaque<WorkOrderId>(scope.workOrderId),
        workflowNodeId:opaque<WorkflowNodeRuntimeId>(scope.runtimeNodeId),
        ...(scope.workflowRunId?{workflowRunId:opaque<WorkflowRunId>(scope.workflowRunId)}:{}),
        existingFormDataId:opaque<FormDataId>(intent.existingFormDataId),state:-1})
    }
    if(intent.kind==='repeat_batch'){
      for(const fields of intent.forms){
        r1SpecialFormUpsert({sourceNodeType:'repeat',
          definitionId:opaque<FormDefinitionId>(scope.formDefinitionId),formData:fields,
          workOrderId:opaque<WorkOrderId>(scope.workOrderId),
          workflowNodeId:opaque<WorkflowNodeRuntimeId>(scope.runtimeNodeId),
          ...(scope.workflowRunId?{workflowRunId:opaque<WorkflowRunId>(scope.workflowRunId)}:{}),
          state:1})
      }
    }
    if(intent.kind==='repeat_delete'){
      r1RepeatRemoveCommand({sourceNodeType:'repeat',
        definitionId:opaque<FormDefinitionId>(scope.formDefinitionId),
        formDataId:opaque<FormDataId>(intent.existingFormDataId)})
    }
    if(finalize)sourceWire(scope,authoritativeIds,intent.sourceNodeType,
      intent.kind==='forms_finalize')
  }catch{return failure('R1 原始记录或命令身份不完整，事务未启动。')}
  return executeR1MultiStepOffline(storage,scope,steps,async({step,stepIndex,savedFormDataIds})=>{
    if(!await gateway.revalidate(scope))
      return {state:'failed_terminal',error:createOperationError('authorization_denied',
        'Actor/node authorization changed during transaction')}
    let request:ApiCommandRequest
    switch(step){
      case 'form_upsert':
      case 'repeat_form_upsert':{
        const fields=intent.kind==='forms_save'||intent.kind==='repeat_save'
          ? intent.fields : intent.kind==='repeat_batch' ? intent.forms[stepIndex] : undefined
        if(!fields)throw new Error('R1 form fields unavailable')
        const existingId=intent.kind==='forms_save'||intent.kind==='repeat_save'
          ? intent.existingFormDataId : undefined
        request=r1SpecialFormUpsert({sourceNodeType:intent.sourceNodeType,
          definitionId:opaque<FormDefinitionId>(scope.formDefinitionId),
          formData:fields,workOrderId:opaque<WorkOrderId>(scope.workOrderId),
          workflowNodeId:opaque<WorkflowNodeRuntimeId>(scope.runtimeNodeId),
          ...(scope.workflowRunId?{workflowRunId:opaque<WorkflowRunId>(scope.workflowRunId)}:{}),
          ...(intent.kind==='forms_save'||intent.kind==='repeat_save'
            ? intent.authoritativeOriginal?{authoritativeOriginal:intent.authoritativeOriginal}:{}:{}),
          ...(existingId?{existingFormDataId:opaque<FormDataId>(existingId)}:{}),state:1})
        const id=savedId(await gateway.dispatch(request))
        if(existingId&&existingId!==id)throw new Error('Existing R1 form identity unexpectedly changed')
        return {state:'succeeded',data:{savedFormDataId:id}}
      }
      case 'forms_soft_delete':{
        if(intent.kind!=='forms_delete')throw new Error('R1 soft-delete contract mismatch')
        request=r1SpecialFormUpsert({sourceNodeType:'forms',
          definitionId:opaque<FormDefinitionId>(scope.formDefinitionId),
          workOrderId:opaque<WorkOrderId>(scope.workOrderId),
          workflowNodeId:opaque<WorkflowNodeRuntimeId>(scope.runtimeNodeId),
          ...(scope.workflowRunId?{workflowRunId:opaque<WorkflowRunId>(scope.workflowRunId)}:{}),
          formData:{},
          authoritativeOriginal:intent.sourceFormData,
          existingFormDataId:opaque<FormDataId>(intent.existingFormDataId),state:-1})
        const id=savedId(await gateway.dispatch(request))
        if(id!==intent.existingFormDataId)throw new Error('R1 delete ACK identity changed')
        return {state:'succeeded',data:{}}
      }
      case 'forms_exts_update':{
        if(intent.kind!=='forms_save'&&intent.kind!=='forms_delete')
          throw new Error('R1 Exts contract mismatch')
        const change=intent.kind==='forms_save'
          ? {kind:'saved' as const,record:sourceRecord(savedFormDataIds[0]!,intent.title,scope.formDefinitionId)}
          : {kind:'delete' as const,recordId:intent.existingFormDataId}
        const planned=planR1FormsUpdateExts({workflowNodeId:scope.runtimeNodeId,
          sourceNodeType:'forms',authoritativeExts:intent.authoritativeExts,change})
        request=r1FormsUpdateExtsCommand({sourceNodeType:'forms',planned})
        normalizeCommandResponse(await gateway.dispatch(request))
        return {state:'succeeded',data:{}}
      }
      case 'repeat_remove':{
        if(intent.kind!=='repeat_delete')throw new Error('R1 repeat-delete contract mismatch')
        request=r1RepeatRemoveCommand({sourceNodeType:'repeat',
          definitionId:opaque<FormDefinitionId>(scope.formDefinitionId),
          formDataId:opaque<FormDataId>(intent.existingFormDataId)})
        normalizeCommandResponse(await gateway.dispatch(request))
        return {state:'succeeded',data:{}}
      }
      case 'workflow_process':{
        const ids=finalize?authoritativeIds:savedFormDataIds
        request=sourceWire(scope,ids,intent.sourceNodeType,intent.kind==='forms_finalize')
        normalizeCommandResponse(await gateway.dispatch(request))
        return {state:'succeeded',data:{}}
      }
    }
  },authoritativeIds,
  intent.kind==='forms_save'||intent.kind==='repeat_save'
    || intent.kind==='forms_delete'||intent.kind==='repeat_delete'
    ? intent.existingFormDataId : undefined)
}
