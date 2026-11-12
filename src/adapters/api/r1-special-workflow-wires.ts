import { projectR1PresetStorage, type R1FieldStorage } from './r1-field-storage'
/**
 * SOURCE-ONLY R1 workflow/process body encoders for special form nodes.
 *
 * These functions are deliberately NOT connected to a command Adapter.
 * They do not execute writes, reserve receipts or claim server equivalence.
 * R1 ServiceAppointment saveNodeExts/process/doProcess has three DISTINCT
 * branches; the original one-FormData workflowCompleteCommand is ineligible.
 */
import type { ApiCommandRequest } from './technician-api-commands'
import { isR1FileWireArray, type R1FileWireValue, type FormDataId, type FormDefinitionId, type WorkOrderId, type WorkflowNodeRuntimeId, type WorkflowRunId } from '@shared/types'

interface R1Base {
  readonly workOrderId: WorkOrderId
  /** Actual runtime node, not nodeDef/parent child workflow ID. */
  readonly workflowNodeId: WorkflowNodeRuntimeId
}
function id(value: unknown, kind: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing source-verified ${kind}`)
  return value.trim()
}
function wire(input: R1Base, definition: string, data: string): ApiCommandRequest {
  return {
    method: 'POST', path: 'workflow/process', r1Special: true,
    body: {
      workflowNodeId: id(input.workflowNodeId, 'runtime node'),
      nodeFormDefId: definition, nodeFormDataId: data,
      smodule: 'serviceAppointment', sid: id(input.workOrderId, 'WorkOrder'),
    },
  }
}
/** R1 process(formDataId) for forms, after an ACK from updateExts.
 * Both single-form ID slots are intentionally blank in this path.
 */
export function r1FormsAfterSaveProcess(input: R1Base & {
  readonly sourceNodeType: 'forms'
  readonly updatedFormListAcknowledged: true
}): ApiCommandRequest {
  if (input.sourceNodeType !== 'forms' || input.updatedFormListAcknowledged !== true)
    throw new Error('R1 forms cannot Process before authoritative updateExts ACK')
  return wire(input, '', '')
}
/** R1 process('complate'): Complete an existing forms node with >=1 record. */
export function r1FormsFinalizeProcess(input: R1Base & {
  readonly sourceNodeType: 'forms'
  readonly definitionId: FormDefinitionId
  readonly availableFormDataIds: readonly FormDataId[]
}): ApiCommandRequest {
  if (input.sourceNodeType !== 'forms' || input.availableFormDataIds.length < 1
    || input.availableFormDataIds.length > 50)
    throw new Error('R1 forms completion requires an authoritative bounded form list')
  for (const dataId of input.availableFormDataIds) id(dataId, 'saved FormData')
  return wire(input, id(input.definitionId, 'form definition'), '')
}
/** Root workflow Repeat uses R1 process('complate'), not child doProcess.
 * Available IDs prove a nonempty fully read list; they are not sent as data IDs.
 * Caller must own the authoritative root-node reader and completion grant.
 */
export function r1MainRepeatFinalizeProcess(input: R1Base & {
  readonly sourceNodeType: 'repeat'
  readonly definitionId: FormDefinitionId
  readonly availableFormDataIds: readonly FormDataId[]
}): ApiCommandRequest {
  if (input.sourceNodeType !== 'repeat' || input.availableFormDataIds.length < 1
    || input.availableFormDataIds.length > 50)
    throw new Error('R1 main repeat completion requires an authoritative bounded form list')
  const identifiers = input.availableFormDataIds.map(value => id(value, 'saved FormData'))
  if (new Set(identifiers).size !== identifiers.length) throw new Error('Duplicate main repeat FormData ID')
  return wire(input, id(input.definitionId, 'repeat definition'), '')
}
/** R1 doProcess(subNode): Repeat completion with comma-joined saved IDs. */
export function r1RepeatBatchProcess(input: R1Base & {
  readonly sourceNodeType: 'repeat'
  readonly definitionId: FormDefinitionId
  readonly savedFormDataIds: readonly FormDataId[]
}): ApiCommandRequest {
  if (input.sourceNodeType !== 'repeat' || input.savedFormDataIds.length < 1
    || input.savedFormDataIds.length > 50)
    throw new Error('R1 repeat batch requires bounded authoritative IDs')
  const identifiers = input.savedFormDataIds.map(x => id(x, 'repeat FormData'))
  if (new Set(identifiers).size !== identifiers.length) throw new Error('Duplicate repeat FormData ID')
  return wire(input, id(input.definitionId, 'repeat definition'), identifiers.join(','))
}

/** R1 biz/extForm/upsert, one record per POST. Raw FormData values are transient. */
export function r1SpecialFormUpsert(input: {
  readonly sourceNodeType: 'forms' | 'repeat'
  readonly definitionId: FormDefinitionId
  readonly formData: Readonly<Record<string, string | number | boolean | readonly string[] | readonly R1FileWireValue[]>>
  /** Optional fields explicitly cleared from a full existing R1 FormData.
   * JSON omission in a full upsert; never encode a null magic value. */
  readonly clearedFieldKeys?: readonly string[]
  /** Source-read preset metadata; this does not authorize additional fields. */
  readonly fieldStorage?: readonly R1FieldStorage[]
  /** Full, same-record R1 source snapshot is mandatory for an existing row.
   * A projected FormDataRead.values map is NOT a full update payload. */
  readonly authoritativeOriginal?: Readonly<Record<string, unknown>>
  readonly workOrderId: WorkOrderId
  readonly workflowNodeId: WorkflowNodeRuntimeId
  readonly workflowRunId?: WorkflowRunId
  readonly existingFormDataId?: FormDataId
  readonly state: 1 | -1
}): ApiCommandRequest {
  if (!['forms','repeat'].includes(input.sourceNodeType)) throw new Error('Unsupported R1 node type')
  if (!input.definitionId||!input.workOrderId||!input.workflowNodeId)throw new Error('R1 FormData identity missing')
  if(input.sourceNodeType==='repeat'&&!input.workflowRunId)throw new Error('R1 repeat requires actual workflow run identity')
  const forbidden=new Set(['_id','id','dataId','formDataId','state','nodeId','runtimeNodeId','workflowId','workflowRunId','runId','workflow','sid','workOrderId','smodule','dataStr','tenantId','userId','roleId','formDefId','formDefinitionId','definitionId','extId','exts','__proto__','prototype','constructor'])
  if(!input.formData || typeof input.formData!=='object' || Array.isArray(input.formData)
    || Object.keys(input.formData).length>50)throw new Error('Unbounded or invalid R1 form field patch')
  for(const [key,value] of Object.entries(input.formData)){
    if(!key.trim()||key.length>120||forbidden.has(key))
      throw new Error('R1 form field collides with server-owned identity')
    if(!((typeof value==='string'&&value.length<=4000)
      || (typeof value==='number'&&Number.isFinite(value))
      || typeof value==='boolean'
      // Legacy extForm sends checkbox IDs and cascade paths as JSON arrays.
      || (Array.isArray(value)&&value.length>0&&value.length<=30
        && value.every(part=>typeof part==='string'&&part.length>0&&part.length<=256))
      || (Array.isArray(value)&&value.length>0&&isR1FileWireArray(value))))
      throw new Error('R1 form field value requires a supported bounded scalar or path array')
  }
  const cleared = input.clearedFieldKeys ?? []
  if (cleared.length > 50 || new Set(cleared).size !== cleared.length
    || (cleared.length > 0 && !input.existingFormDataId)
    || cleared.some(key => !key.trim() || key.length > 120
      || forbidden.has(key) || ['__proto__', 'prototype', 'constructor'].includes(key)
      || Object.hasOwn(input.formData, key))) {
    throw new Error('Invalid R1 optional-field clearing intent')
  }
  let original: Record<string, unknown> = {}
  if (input.existingFormDataId) {
    const source=input.authoritativeOriginal
    if (!source || typeof source!=='object' || Array.isArray(source))
      throw new Error('Existing R1 FormData update requires authoritative full original record')
    // Never reconstruct an existing FormData from its redacted/UI projection.
    let serialized:string|undefined
    try {serialized=JSON.stringify(source)} catch {throw new Error('Invalid R1 source FormData JSON')}
    if (!serialized || serialized.length>200000)
      throw new Error('Unbounded or invalid R1 source FormData')
    original=JSON.parse(serialized) as Record<string,unknown>
    if (!original || typeof original!=='object' || Array.isArray(original)
      || Object.keys(original).length!==Object.keys(source).length
      || original._id!==input.existingFormDataId || original.state===-1)
      throw new Error('Authoritative saved FormData identity or state mismatch')
    const identities:readonly [string,string][]=[
      ['id',input.existingFormDataId],['dataId',input.existingFormDataId],
      ['formDataId',input.existingFormDataId],['sid',input.workOrderId],
      ['smodule','serviceAppointment'],['nodeId',input.workflowNodeId],
      ['formDefId',input.definitionId],['definitionId',input.definitionId],
      ['extId',input.definitionId],['formDefinitionId',input.definitionId],
    ]
    for(const [key,expected] of identities){
      if(Object.hasOwn(source,key) && source[key]!==expected)
        throw new Error(`Authoritative saved FormData ${key} mismatch`)
    }
    // Both forms and repeat may carry persisted run aliases. Verify every
    // present alias before the contextual wire can overwrite workflowId.
    // A missing caller run is not permission to infer one from saved data.
    const verifyRunAliases=(record:Readonly<Record<string,unknown>>)=>{
      for(const key of ['workflowId','workflowRunId','runId']){
        if(Object.hasOwn(record,key) && (!input.workflowRunId || record[key]!==input.workflowRunId))
          throw new Error(`Authoritative saved FormData ${key} mismatch`)
      }
    }
    verifyRunAliases(source)
    const nestedWorkflow=source.workflow
    if(nestedWorkflow!=null){
      if(typeof nestedWorkflow!=='object'||Array.isArray(nestedWorkflow))
        throw new Error('Authoritative saved FormData nested Workflow is malformed')
      // Workflow._id belongs to a separate entity, not the FormData record.
      verifyRunAliases(nestedWorkflow as Readonly<Record<string,unknown>>)
    }
  } else if (input.authoritativeOriginal !== undefined) {
    throw new Error('New R1 FormData must not reuse an existing source record')
  }
  if (cleared.length > 0) {
    const exts=original.exts
    if (!exts || typeof exts !== 'object' || Array.isArray(exts)) {
      throw new Error('Clearing requires the authoritative original field object')
    }
    const nextExts = { ...exts as Record<string, unknown> }
    for (const key of cleared) {
      if (!Object.hasOwn(original, key) || !Object.hasOwn(nextExts, key)) {
        throw new Error('Clearing requires an existing exact source field')
      }
      delete original[key]
      delete nextExts[key]
    }
    original.exts = nextExts
  }
  // Existing dynamic records may store the same business value at the top
  // level and inside exts. The read mapper prefers exts; update only duplicate
  // keys already present there, without synthesizing an entire Mock-style merge.
  if(input.existingFormDataId && original.exts && typeof original.exts==='object' && !Array.isArray(original.exts)){
    const nextExts={...original.exts as Record<string,unknown>}
    for(const [key,value] of Object.entries(input.formData)){
      if(Object.hasOwn(nextExts,key))nextExts[key]=value
    }
    original.exts=nextExts
  }
  const data={...projectR1PresetStorage(original,input.formData,input.fieldStorage),sid:input.workOrderId,smodule:'serviceAppointment',
    nodeId:input.workflowNodeId,...(input.workflowRunId?{workflowId:input.workflowRunId}:{}),
    ...(input.existingFormDataId?{_id:input.existingFormDataId}:{}),state:input.state}
  return { method:'POST', path:`biz/extForm/upsert/${encodeURIComponent(input.definitionId)}`,
    r1Special:true, body:{dataStr:JSON.stringify(data)} }
}

export function r1FormsUpdateExtsCommand(input: {
  readonly sourceNodeType: 'forms'
  readonly planned: { readonly path: string; readonly contentType:'application/json'; readonly body: Readonly<Record<string,unknown>> }
}): ApiCommandRequest {
  if (input.sourceNodeType !== 'forms' || !/^workflowNode\/updateExts\/[^/]+$/.test(input.planned.path))
    throw new Error('Invalid R1 full-fidelity Exts plan')
  return {method:'POST',path:input.planned.path,r1Special:true,jsonBody:input.planned.body}
}

/** Legacy repeat deletion is separate from forms' soft-delete Exts contract. */
export function r1RepeatRemoveCommand(input: {
  readonly sourceNodeType:'repeat'
  readonly definitionId: FormDefinitionId
  readonly formDataId: FormDataId
}): ApiCommandRequest {
  if (input.sourceNodeType !== 'repeat' || !input.definitionId || !input.formDataId)
    throw new Error('R1 repeat removal requires saved identities')
  return {method:'POST',path:`biz/extForm/remove/${encodeURIComponent(input.definitionId)}`,
    r1Special:true,body:{formDataId:input.formDataId}}
}
