/**
 * SOURCE-ONLY R1 workflow/process body encoders for special form nodes.
 *
 * These functions are deliberately NOT connected to a command Adapter.
 * They do not execute writes, reserve receipts or claim server equivalence.
 * R1 ServiceAppointment saveNodeExts/process/doProcess has three DISTINCT
 * branches; the original one-FormData workflowCompleteCommand is ineligible.
 */
import type { ApiCommandRequest } from './technician-api-commands'
import type { FormDataId, FormDefinitionId, WorkOrderId, WorkflowNodeRuntimeId, WorkflowRunId } from '@shared/types'

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
  readonly formData: Readonly<Record<string, string | number | boolean>>
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
  const forbidden=new Set(['_id','state','nodeId','workflowId','sid','smodule','dataStr'])
  if(Object.keys(input.formData).some(key=>forbidden.has(key)))
    throw new Error('R1 form field collides with server-owned identity')
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
      ['extId',input.definitionId],
    ]
    for(const [key,expected] of identities){
      if(original[key]!==undefined && original[key]!==expected)
        throw new Error(`Authoritative saved FormData ${key} mismatch`)
    }
    if(input.sourceNodeType==='repeat' && original.workflowId!==undefined
      && original.workflowId!==input.workflowRunId)
      throw new Error('Authoritative saved FormData workflowId mismatch')
  } else if (input.authoritativeOriginal !== undefined) {
    throw new Error('New R1 FormData must not reuse an existing source record')
  }
  const data={...original,...input.formData,sid:input.workOrderId,smodule:'serviceAppointment',
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
