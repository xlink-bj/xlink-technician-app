import type { AuthSessionPort } from '@shared/ports'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import type { R1RepeatActionProvider } from '@features/work-orders/r1-repeat-actions-port'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { createNormalRepeatActionProvider } from './r1-repeat-authorization'
import { r1RepeatActionsEnabled as localFormWritesEnabled, type R1RepeatScope } from './r1-repeat-actions'
import { normalizeR1FormsEditValues,projectR1FormsEditValues } from '@features/work-orders/r1-forms-edit-values'
import { normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
import { usesR1FormsScalarSubset } from '@features/work-orders/r1-forms-scalar-subset'
import { createR1FormsActions } from './r1-forms-actions'
import { isHandlerMatch, evaluateNodeVisibility } from '@runtimes/workflow/policy'
import { asOpaqueId } from '@shared/types'
const keys = ['tenantId','userId','roleId','workOrderId','workflowRunId','runtimeNodeId','formDefinitionId'] as const
export type R1FormsOperation='create'|'append'|'edit'|'save_finish'|'complete'
export type R1FormsGrant = {
  readonly version:1; readonly scope:R1RepeatScope; readonly expiresAt:string
  readonly fieldIds:readonly string[]; readonly operations:readonly ['create']
} | {
  readonly version:2; readonly scope:R1RepeatScope; readonly expiresAt:string
  readonly fieldIds:readonly string[]; readonly operations:readonly R1FormsOperation[]; readonly recordIds:readonly string[]
}
export function parseR1FormsGrant(raw:unknown,now=Date.now()):R1FormsGrant|null {
  try {
    if(typeof raw!=='string'||raw.length>10000)return null
    const g=JSON.parse(raw),s=g?.scope
    const validIds=(a:unknown,min:number,max:number)=>Array.isArray(a)&&a.length>=min&&a.length<=max
      &&a.every(v=>typeof v==='string'&&v&&v.trim()===v&&!v.includes(','))&&new Set(a).size===a.length
    if(!g || ![1,2].includes(g.version)
      ||Object.keys(g).sort().join()!==['version','scope','expiresAt','fieldIds','operations',...(g.version===2?['recordIds']:[])].sort().join()
      ||!s||Object.keys(s).sort().join()!==[...keys].sort().join()
      ||keys.some(k=>typeof s[k]!=='string'||!s[k]||s[k].trim()!==s[k]||s[k].includes(','))
      ||typeof g.expiresAt!=='string'||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=now
      ||!validIds(g.fieldIds,1,50))return null
    if(g.version===1?JSON.stringify(g.operations)!=='["create"]':
      !validIds(g.operations,1,5)||g.operations.some((op:string)=>!['create','append','edit','save_finish','complete'].includes(op))
      ||!validIds(g.recordIds,0,50)||(g.operations.includes('edit')&&!g.recordIds.length))return null
    return Object.freeze({...g,scope:Object.freeze({...s}),fieldIds:Object.freeze([...g.fieldIds]),operations:Object.freeze([...g.operations]),
      ...(g.version===2?{recordIds:Object.freeze([...g.recordIds])}:{})})
  } catch{return null}
}
export function createNormalFormsActionProvider(input:{readonly auth:Pick<AuthSessionPort,'getCurrentSession'>;
  readonly reader:R1NodeFormsReader;readonly env:Record<string,unknown>;readonly origin:string}):R1RepeatActionProvider {
  const grant=()=>input.env.VITE_XLINK_R1_FORMS_ACTIONS==='true'&&localFormWritesEnabled(input.env,input.origin)
    ?parseR1FormsGrant(input.env.VITE_XLINK_R1_FORMS_GRANT):null
  const permitted=(s:R1RepeatScope)=>{const g=grant();return Boolean(g&&keys.every(k=>g.scope[k]===s[k]))}
  const schemaMatches=(snapshot:R1NodeFormsSnapshot)=>{
    const g=grant(),fields=snapshot.definition.fields
    const writable=fields?.filter(f=>!f.readOnly&&!snapshot.node.formFieldIdsReadOnly?.includes(f.fieldId))
    return Boolean(g&&writable?.length===g.fieldIds.length&&writable.every(f=>g.fieldIds.includes(f.fieldId))
      && snapshot.fillableFieldIds?.length===g.fieldIds.length&&snapshot.fillableFieldIds.every(id=>g.fieldIds.includes(id))
      && Array.isArray(snapshot.node.formFieldIdsReadOnly)
      && (g.version===2 || (fields?.length===g.fieldIds.length&&snapshot.node.formFieldIdsReadOnly.length===0))&&snapshot.workOrderId===g.scope.workOrderId
      && snapshot.node.id===g.scope.runtimeNodeId&&snapshot.node.runId===g.scope.workflowRunId
      && snapshot.node.formDefinitionId===g.scope.formDefinitionId&&snapshot.definition.id===g.scope.formDefinitionId
      && snapshot.node.sourceNodeType==='forms')
  }
  return {forSnapshot(snapshot){
    const g=grant(),a=input.auth.getCurrentSession()
    if(!g||!schemaMatches(snapshot)||!input.reader.isCurrent(snapshot)||(g.version===1&&snapshot.records.length!==0)
      || !input.reader.currentFormsExts?.(snapshot)||a?.user.id!==g.scope.userId||a.currentRole?.id!==g.scope.roleId)return null
    const actor={userId:asOpaqueId<'UserId'>(g.scope.userId),roleIds:[asOpaqueId<'RoleId'>(g.scope.roleId)],organizationRoles:[]}
    if(snapshot.node.lifecycle!=='active'||snapshot.node.nodeTypeEvidence!=='runtime_node_def'
      || !isHandlerMatch(actor,snapshot.node.handlers??[])||!evaluateNodeVisibility(snapshot.node,actor).visible)return null
    let lease=snapshot
    // Freeze the observed metadata as bytes, not a later view of shared objects.
    // Only the newly supported large forms subset gets this stricter lease.
    const subsetSchema=usesR1FormsScalarSubset(snapshot)
      ?JSON.stringify([snapshot.definition.fields,snapshot.definition.purpose,snapshot.node.formFieldIdsReadOnly,snapshot.fillableFieldIds]):undefined
    const permits=(op:R1FormsOperation,recordId?:string)=>{
      const fresh=grant()
      return Boolean(fresh&&permitted(g.scope)&&(fresh.operations as readonly string[]).includes(op)
        &&(op!=='edit'||(fresh.version===2&&Boolean(recordId)&&fresh.recordIds.includes(recordId!))))
    }
    const original=(s:R1NodeFormsSnapshot,id:string)=>input.reader.currentFormOriginal?.(s,id)??null
    const owns=(s:R1RepeatScope)=>permitted(s)&&input.reader.isCurrent(lease)
    const initialValues=(id:string)=>{try{return permits('edit',id)&&owns(g.scope)&&original(lease,id)
      ?projectR1FormsEditValues(lease,original(lease,id)!):null}catch{return null}}
    const actions=createR1FormsActions({env:input.env,origin:input.origin,getSession:()=>input.auth.getCurrentSession(),hasExactGrant:owns,
      transport:createUniApiCommandTransport({apiBaseUrl:String(input.env.VITE_XLINK_API_BASE_URL),getSessionRef:()=>input.auth.getCurrentSession()?.sessionRef??null}),
      permits,original,
      confirmCompletion:async s=>{
        if(!owns(g.scope)||!input.reader.confirmFormsCompletion)throw Error('完成结果无法核实')
        return input.reader.confirmFormsCompletion(s)
      },
      fullExts:s=>input.reader.currentFormsExts?.(s)??null,
      async readLatest(s){
        if(!owns(s))throw Error('本轮普通表单授权已失效')
        const latest=await input.reader.load(s.workOrderId,s.runtimeNodeId)
        if(!permitted(s)||!input.reader.isCurrent(latest)||!schemaMatches(latest)
          ||(subsetSchema!==undefined&&JSON.stringify([latest.definition.fields,latest.definition.purpose,latest.node.formFieldIdsReadOnly,latest.fillableFieldIds])!==subsetSchema))throw Error('普通表单配置已变化')
        lease=latest;return latest
      }})
    return {locked:()=>!owns(g.scope)||actions.locked(g.scope),
      canCreate:()=>owns(g.scope)&&permits(lease.records.length?'append':'create'),
      canEdit:id=>owns(g.scope)&&permits('edit',id)&&lease.records.some(r=>r.id===id)&&Boolean(initialValues(id)),
      canComplete:()=>owns(g.scope)&&permits('complete')&&lease.records.length>0,
      canSaveAndComplete:()=>owns(g.scope)&&permits('save_finish'),
      initialValues,
      validateDraft:(values,id)=>{try{
        if(!owns(g.scope))return false
        return Boolean(id?permits('edit',id)&&normalizeR1FormsEditValues(lease,original(lease,id)??{},values)
          :permits(lease.records.length?'append':'create')&&normalizeR1RepeatValues(lease,values))
      }catch{return false}},
      saveOnly:(values,id)=>actions.saveOnly(g.scope,values,id),
      saveAndComplete:(values,id)=>actions.saveAndComplete(g.scope,values,id),
      complete:()=>actions.complete(g.scope)}
  }}
}
/** Normal App entry dispatches on the server's source type; never relabels nodes. */
export function createNormalNodeFormActionProvider(input:Parameters<typeof createNormalFormsActionProvider>[0]):R1RepeatActionProvider {
  const forms=createNormalFormsActionProvider(input),repeat=createNormalRepeatActionProvider(input)
  return {forSnapshot:s=>s.node.sourceNodeType==='forms'?forms.forSnapshot(s):repeat.forSnapshot(s)}
}
