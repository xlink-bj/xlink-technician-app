/** Normal local forms create/save adapter. R1 full EXTS replacement is retained;
 * this client lock does not provide cross-client CAS. Explicit scoped append/edit/Process; never implicit Process. */
import type { AuthSessionPort } from '@shared/ports'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
import { planR1FormsUpdateExts } from '@features/work-orders/r1-forms-exts-plan'
import { normalizeR1FormsEditValues } from '@features/work-orders/r1-forms-edit-values'
import { r1SpecialFormUpsert, r1FormsUpdateExtsCommand, r1FormsAfterSaveProcess, r1FormsFinalizeProcess } from '@adapters/api/r1-special-workflow-wires'
import { normalizeCommandResponse, type ApiCommandTransport } from '@adapters/api/technician-api-commands'
import { isHandlerMatch, evaluateNodeVisibility } from '@runtimes/workflow/policy'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { asOpaqueId } from '@shared/types'
import { createLocalFixtureMutationLock } from './local-fixture-mutation-lock'
import { r1RepeatActionsEnabled as localFormWritesEnabled, type R1RepeatScope } from './r1-repeat-actions'

const deny = (): never => { throw Error('普通表单的身份、归属、字段或回执无法核实，禁止提交或自动重试。') }
const keys = ['tenantId','userId','roleId','workOrderId','workflowRunId','runtimeNodeId','formDefinitionId'] as const
function success(raw: unknown): Record<string, unknown> {
  normalizeCommandResponse(raw)
  const r = raw as Record<string, unknown>
  if (!(r.success === true || r.status === 1) || (Object.hasOwn(r,'success') && r.success !== true)
    || (Object.hasOwn(r,'status') && r.status !== 1)) deny()
  return r
}
function savedIdentity(raw: Record<string, unknown>, scope: R1RepeatScope): string {
  const source = raw.data ?? raw.entity ?? raw
  if (!source || typeof source !== 'object' || Array.isArray(source)) return deny()
  const row = source as Record<string, unknown>
  const ids = ['_id','id','dataId'].filter(k => Object.hasOwn(row,k)).map(k => row[k])
  if (!ids.length || new Set(ids).size !== 1 || ids.some(v => typeof v !== 'string'
    || !v || v.trim() !== v || v.includes(',') || v.startsWith('local-'))) return deny()
  // The selected FormData container owns these wire fields. Missing optional
  // fields are not invented; unrelated envelope/entity metadata is not merged.
  const ownership = { tenantId:scope.tenantId, sid:scope.workOrderId, nodeId:scope.runtimeNodeId,
    workflowId:scope.workflowRunId, workflowRunId:scope.workflowRunId, runId:scope.workflowRunId,
    definitionId:scope.formDefinitionId, extId:scope.formDefinitionId,
    formDefId:scope.formDefinitionId, formDefinitionId:scope.formDefinitionId,
    smodule:'serviceAppointment', state:1 }
  for (const [key, expected] of Object.entries(ownership)) {
    if (Object.hasOwn(row,key) && row[key] !== expected) return deny()
  }
  // The existing FormData mapper also recognizes these nested run aliases;
  // nested Workflow._id remains a different entity's identity.
  if (row.workflow != null) {
    if (typeof row.workflow !== 'object' || Array.isArray(row.workflow)) return deny()
    const workflow = row.workflow as Record<string,unknown>
    for (const key of ['workflowId','workflowRunId','runId']) {
      if (Object.hasOwn(workflow,key) && workflow[key] !== scope.workflowRunId) return deny()
    }
  }
  return ids[0] as string
}
export function createR1FormsActions(input: {
  readonly env: Record<string, unknown>; readonly origin: string
  readonly getSession: AuthSessionPort['getCurrentSession']
  readonly hasExactGrant: (scope: R1RepeatScope) => boolean
  readonly readLatest: (scope: R1RepeatScope) => Promise<R1NodeFormsSnapshot>
  readonly fullExts: (snapshot: R1NodeFormsSnapshot) => Readonly<Record<string, unknown>> | null
  readonly original?: (snapshot: R1NodeFormsSnapshot, recordId: string) => Readonly<Record<string, unknown>> | null
  readonly permits?: (operation: 'create' | 'append' | 'edit' | 'save_finish' | 'complete', recordId?: string) => boolean
  readonly confirmCompletion?: (snapshot: R1NodeFormsSnapshot) => Promise<{transitionVerified:true}>
  readonly transport: ApiCommandTransport
  readonly createLock?: typeof createLocalFixtureMutationLock
}) {
  const locks = new Map<string, ReturnType<typeof createLocalFixtureMutationLock>>()
  const key = (s: R1RepeatScope) => {
    if (keys.some(k => typeof s[k] !== 'string' || !s[k] || s[k].trim() !== s[k] || s[k].includes(','))) return deny()
    return JSON.stringify(keys.map(k => s[k]))
  }
  const lockFor = (s: R1RepeatScope) => {
    const k = key(s)
    if (!locks.has(k)) locks.set(k, (input.createLock ?? createLocalFixtureMutationLock)(`xlink:r1-forms:${k}`))
    return locks.get(k)!
  }
  const fingerprint = () => {
    const s = input.getSession()
    return s && sessionAuthorizationFingerprint({ sessionRef:s.sessionRef, userId:s.user.id,
      roleId:s.currentRole?.id, roleVersion:s.roleVersion })
  }
  const allowed = (operation:'create'|'append'|'edit'|'save_finish'|'complete', recordId?:string) =>
    input.permits ? input.permits(operation,recordId) : operation==='create'
  async function execute(source:R1RepeatScope, values:Readonly<Record<string,unknown>>, recordId?:string, finish=false, onlyComplete=false) {
    const s=Object.freeze({...source}),draft=Object.freeze({...values}),identity=fingerprint()
    const check=()=>{
      const a=input.getSession()
      if(!identity || fingerprint()!==identity || a?.user.id!==s.userId || a.currentRole?.id!==s.roleId
        || input.env.VITE_XLINK_AUTH_TENANT!==s.tenantId || !localFormWritesEnabled(input.env,input.origin)
        || !input.hasExactGrant(s)) deny()
    }
    check()
    return lockFor(s).run(async mark=>{
      const read=async()=>{
        check();const snapshot=await input.readLatest(s);check()
        const n=snapshot.node,actor={userId:asOpaqueId<'UserId'>(s.userId),roleIds:[asOpaqueId<'RoleId'>(s.roleId)],organizationRoles:[]}
        if(snapshot.workOrderId!==s.workOrderId || n.id!==s.runtimeNodeId || n.runId!==s.workflowRunId
          || n.sourceNodeType!=='forms' || n.nodeTypeEvidence!=='runtime_node_def' || n.lifecycle!=='active'
          || n.formDefinitionId!==s.formDefinitionId || snapshot.definition.id!==s.formDefinitionId
          || !isHandlerMatch(actor,n.handlers??[]) || !evaluateNodeVisibility(n,actor).visible) deny()
        const exts=input.fullExts(snapshot)
        if(!exts || !Array.isArray(exts.formList)) return deny()
        // Validate complete old EXTS, including duplicate/deleted and unknown rows.
        const ids=snapshot.records.map(r=>String(r.id))
        if(new Set(ids).size!==ids.length) deny()
        return {snapshot,exts}
      }
      const receipt=(stage:string,savedId?:string)=>{
        const k=`xlink:r1-forms-receipt:${key(s)}`
        const raw=JSON.stringify({version:1,stage,...(savedId?{savedId}:{})})
        localStorage.setItem(k,raw);if(localStorage.getItem(k)!==raw) deny()
      }
      const process=async(snapshot:R1NodeFormsSnapshot,afterSave:boolean,savedId?:string)=>{
        check()
        if(!input.confirmCompletion || !allowed(afterSave?'save_finish':'complete',recordId)) return deny()
        const base={workOrderId:asOpaqueId<'WorkOrderId'>(s.workOrderId),workflowNodeId:asOpaqueId<'WorkflowNodeRuntimeId'>(s.runtimeNodeId)}
        const command=afterSave?r1FormsAfterSaveProcess({...base,sourceNodeType:'forms',updatedFormListAcknowledged:true})
          :r1FormsFinalizeProcess({...base,sourceNodeType:'forms',definitionId:asOpaqueId<'FormDefinitionId'>(s.formDefinitionId),availableFormDataIds:snapshot.records.map(r=>asOpaqueId<'FormDataId'>(String(r.id)))})
        receipt('process_may_have_dispatched',savedId)
        success(await input.transport.execute(command));check()
        // ACK is not transition evidence. Verify the same authoritative runtime
        // node closed through a fresh role/session-bound detail read.
        const result=await input.confirmCompletion(snapshot)
        if(!result.transitionVerified) return deny()
        // Completion consumes the reader lease, so check identity/grant separately.
        if(fingerprint()!==identity || !allowed(afterSave?'save_finish':'complete',recordId)) return deny()
        receipt('completed',savedId);mark('completed')
        return {acknowledged:true as const,transitionVerified:true as const}
      }
      const before=await read();check()
      if(onlyComplete){
        if(!allowed('complete') || !before.snapshot.records.length) return deny()
        // Compile before dispatch so malformed slots cannot consume a write.
        r1FormsFinalizeProcess({sourceNodeType:'forms',definitionId:asOpaqueId<'FormDefinitionId'>(s.formDefinitionId),
          availableFormDataIds:before.snapshot.records.map(r=>asOpaqueId<'FormDataId'>(String(r.id))),workOrderId:asOpaqueId<'WorkOrderId'>(s.workOrderId),workflowNodeId:asOpaqueId<'WorkflowNodeRuntimeId'>(s.runtimeNodeId)})
        check();mark('uncertain');return process(before.snapshot,false)
      }
      const operation=recordId?'edit':before.snapshot.records.length?'append':'create'
      if(!allowed(operation,recordId) || (finish&&!allowed('save_finish',recordId))) return deny()
      const original=recordId?input.original?.(before.snapshot,recordId):undefined
      if(recordId && (!original || !before.snapshot.records.some(r=>r.id===recordId))) return deny()
      const normalize=(snapshot:R1NodeFormsSnapshot,raw?:Readonly<Record<string,unknown>>)=>recordId
        ?normalizeR1FormsEditValues(snapshot,raw??deny(),draft)
        :{fields:normalizeR1RepeatValues(snapshot,draft),clearedFieldKeys:[] as readonly string[]}
      const normalized=normalize(before.snapshot,original??undefined)
      // Existing R1 formList entries retain their own title/metadata. The
      // original FormData title is separately preserved by the full raw wire;
      // do not reconcile a pre-existing difference using a node default.
      const newTitle=recordId?{}:{formTitle:before.snapshot.node.displayName||'现场记录'}
      const plan=(id:string)=>planR1FormsUpdateExts({sourceNodeType:'forms',workflowNodeId:s.runtimeNodeId,authoritativeExts:before.exts,
        change:{kind:'saved',record:{_id:id,formDefId:s.formDefinitionId,...newTitle,state:1}}})
      const previousList=before.exts.formList as Record<string,unknown>[]
      // Match the authoritative reader's total-reference bound, including
      // deleted entries. Refuse before upsert can create an unreadable row.
      if(!recordId&&previousList.length>=50) return deny()
      const occupied=new Set(previousList.map(r=>r&&typeof r==='object'?r._id:undefined))
      let placeholder=recordId??'__forms_preflight_only__'
      if(!recordId)while(occupied.has(placeholder))placeholder+='x'
      if(recordId&&!occupied.has(recordId)) return deny()
      plan(placeholder)
      const request=r1SpecialFormUpsert({sourceNodeType:'forms',definitionId:asOpaqueId<'FormDefinitionId'>(s.formDefinitionId),
        formData:normalized.fields,workOrderId:asOpaqueId<'WorkOrderId'>(s.workOrderId),workflowNodeId:asOpaqueId<'WorkflowNodeRuntimeId'>(s.runtimeNodeId),
        workflowRunId:asOpaqueId<'WorkflowRunId'>(s.workflowRunId),state:1,
        ...(recordId?{existingFormDataId:asOpaqueId<'FormDataId'>(recordId),authoritativeOriginal:original!,clearedFieldKeys:normalized.clearedFieldKeys}:{})})
      check();mark('uncertain');receipt('upsert_may_have_dispatched',recordId)
      const savedId=savedIdentity(success(await input.transport.execute(request)),s);check()
      if(recordId?savedId!==recordId:occupied.has(savedId)) return deny()
      const intermediate=await read();check()
      if(JSON.stringify(intermediate.exts)!==JSON.stringify(before.exts)
        || JSON.stringify(intermediate.snapshot.records.map(r=>r.id))!==JSON.stringify(before.snapshot.records.map(r=>r.id))) return deny()
      // Re-evaluate actor, grant, definition, conditions, readonly fields, and all
      // submitted values before the second write. The original stays the exact
      // pre-upsert read; never synthesize edit authority from the ACK.
      if(!allowed(operation,recordId) || (finish&&!allowed('save_finish',recordId))
        || JSON.stringify(normalize(intermediate.snapshot,original??undefined))!==JSON.stringify(normalized)) return deny()
      const planned=plan(savedId)
      receipt('exts_may_have_dispatched',savedId);check()
      success(await input.transport.execute(r1FormsUpdateExtsCommand({sourceNodeType:'forms',planned})));check()
      receipt('readback_pending',savedId)
      const after=await read();check()
      const expectedIds=recordId?before.snapshot.records.map(r=>r.id):[...before.snapshot.records.map(r=>r.id),savedId]
      const saved=after.snapshot.records.find(r=>r.id===savedId)
      if(JSON.stringify(after.exts)!==JSON.stringify(planned.body)
        || JSON.stringify(after.snapshot.records.map(r=>r.id))!==JSON.stringify(expectedIds)
        || !saved || Object.entries(normalized.fields).some(([k,v])=>saved.values?.[k]!==v)
        || normalized.clearedFieldKeys.some(k=>Object.hasOwn(saved.values??{},k))) return deny()
      if(recordId){
        const reread=input.original?.(after.snapshot,savedId)
        const expected=JSON.parse(String(request.body?.dataStr)) as Record<string,unknown>
        const serverMetadata=new Set(['updateTime','updateDateTime','updateUser','updateUserName'])
        if(!reread || Object.entries(expected).some(([k,v])=>!serverMetadata.has(k)
          && JSON.stringify(reread[k])!==JSON.stringify(v))
          || normalized.clearedFieldKeys.some(k=>Object.hasOwn(reread,k)
            || Object.hasOwn((reread.exts??{}) as object,k))) return deny()
      }
      if(finish)return process(after.snapshot,true,savedId)
      receipt('verified',savedId);mark('ready');return after.snapshot
    })
  }
  return {
    locked:(s:R1RepeatScope)=>lockFor(s).locked,
    saveOnly:(s:R1RepeatScope,values:Readonly<Record<string,unknown>>,recordId?:string)=>execute(s,values,recordId) as Promise<R1NodeFormsSnapshot>,
    saveAndComplete:(s:R1RepeatScope,values:Readonly<Record<string,unknown>>,recordId?:string)=>execute(s,values,recordId,true) as Promise<{acknowledged:true;transitionVerified:true}>,
    complete:(s:R1RepeatScope)=>execute(s,{},undefined,false,true) as Promise<{acknowledged:true;transitionVerified:true}>,
  }
}
