import type { AuthSessionPort } from '@shared/ports'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import type { R1RepeatActionProvider } from '@features/work-orders/r1-repeat-actions-port'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { createNormalRepeatActionProvider } from './r1-repeat-authorization'
import { r1RepeatActionsEnabled as localFormWritesEnabled, type R1RepeatScope } from './r1-repeat-actions'
import { createR1FormsActions } from './r1-forms-actions'
import { isHandlerMatch, evaluateNodeVisibility } from '@runtimes/workflow/policy'
import { asOpaqueId } from '@shared/types'
const keys = ['tenantId','userId','roleId','workOrderId','workflowRunId','runtimeNodeId','formDefinitionId'] as const
export interface R1FormsGrant {
  readonly version:1; readonly scope:R1RepeatScope; readonly expiresAt:string
  readonly fieldIds:readonly string[]; readonly operations:readonly ['create']
}
export function parseR1FormsGrant(raw:unknown, now=Date.now()):R1FormsGrant|null {
  try {
    if (typeof raw !== 'string' || raw.length>10000) return null
    const g=JSON.parse(raw),s=g?.scope
    if (!g || Object.keys(g).sort().join()!==['version','scope','expiresAt','fieldIds','operations'].sort().join()
      || g.version!==1 || !s || Object.keys(s).sort().join()!==[...keys].sort().join()
      || keys.some(k=>typeof s[k]!=='string'||!s[k]||s[k].trim()!==s[k]||s[k].includes(','))
      || typeof g.expiresAt!=='string'||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=now
      || !Array.isArray(g.fieldIds)||g.fieldIds.length<1||g.fieldIds.length>50
      || g.fieldIds.some((v:unknown)=>typeof v!=='string'||!v||v.trim()!==v)
      || new Set(g.fieldIds).size!==g.fieldIds.length||JSON.stringify(g.operations)!=='["create"]') return null
    return Object.freeze({...g,scope:Object.freeze({...s}),fieldIds:Object.freeze([...g.fieldIds]),operations:Object.freeze([...g.operations])})
  } catch { return null }
}
export function createNormalFormsActionProvider(input:{readonly auth:Pick<AuthSessionPort,'getCurrentSession'>;
  readonly reader:R1NodeFormsReader;readonly env:Record<string,unknown>;readonly origin:string}):R1RepeatActionProvider {
  const grant=()=>input.env.VITE_XLINK_R1_FORMS_ACTIONS==='true'&&localFormWritesEnabled(input.env,input.origin)
    ?parseR1FormsGrant(input.env.VITE_XLINK_R1_FORMS_GRANT):null
  const permitted=(s:R1RepeatScope)=>{const g=grant();return Boolean(g&&keys.every(k=>g.scope[k]===s[k]))}
  const schemaMatches=(snapshot:R1NodeFormsSnapshot)=>{
    const g=grant(),fields=snapshot.definition.fields
    return Boolean(g&&fields?.length===g.fieldIds.length&&fields.every(f=>g.fieldIds.includes(f.fieldId))
      && snapshot.fillableFieldIds?.length===g.fieldIds.length&&snapshot.fillableFieldIds.every(id=>g.fieldIds.includes(id))
      && snapshot.node.formFieldIdsReadOnly?.length===0&&snapshot.workOrderId===g.scope.workOrderId
      && snapshot.node.id===g.scope.runtimeNodeId&&snapshot.node.runId===g.scope.workflowRunId
      && snapshot.node.formDefinitionId===g.scope.formDefinitionId&&snapshot.definition.id===g.scope.formDefinitionId
      && snapshot.node.sourceNodeType==='forms')
  }
  return {forSnapshot(snapshot){
    const g=grant(),a=input.auth.getCurrentSession()
    if(!g||!schemaMatches(snapshot)||!input.reader.isCurrent(snapshot)||snapshot.records.length!==0
      || !input.reader.currentFormsExts?.(snapshot)||a?.user.id!==g.scope.userId||a.currentRole?.id!==g.scope.roleId)return null
    const actor={userId:asOpaqueId<'UserId'>(g.scope.userId),roleIds:[asOpaqueId<'RoleId'>(g.scope.roleId)],organizationRoles:[]}
    if(snapshot.node.lifecycle!=='active'||snapshot.node.nodeTypeEvidence!=='runtime_node_def'
      || !isHandlerMatch(actor,snapshot.node.handlers??[])||!evaluateNodeVisibility(snapshot.node,actor).visible)return null
    let lease=snapshot
    const owns=(s:R1RepeatScope)=>permitted(s)&&input.reader.isCurrent(lease)
    const actions=createR1FormsActions({env:input.env,origin:input.origin,getSession:()=>input.auth.getCurrentSession(),hasExactGrant:owns,
      transport:createUniApiCommandTransport({apiBaseUrl:String(input.env.VITE_XLINK_API_BASE_URL),getSessionRef:()=>input.auth.getCurrentSession()?.sessionRef??null}),
      fullExts:s=>input.reader.currentFormsExts?.(s)??null,
      async readLatest(s){
        if(!owns(s))throw Error('本轮普通表单授权已失效')
        const latest=await input.reader.load(s.workOrderId,s.runtimeNodeId)
        if(!permitted(s)||!input.reader.isCurrent(latest)||!schemaMatches(latest))throw Error('普通表单配置已变化')
        lease=latest;return latest
      }})
    return {locked:()=>!owns(g.scope)||actions.locked(g.scope),saveOnly:values=>actions.saveOnly(g.scope,values),
      complete:async()=>{throw Error('普通表单完成操作未授权')}}
  }}
}
/** Normal App entry dispatches on the server's source type; never relabels nodes. */
export function createNormalNodeFormActionProvider(input:Parameters<typeof createNormalFormsActionProvider>[0]):R1RepeatActionProvider {
  const forms=createNormalFormsActionProvider(input),repeat=createNormalRepeatActionProvider(input)
  return {forSnapshot:s=>s.node.sourceNodeType==='forms'?forms.forSnapshot(s):repeat.forSnapshot(s)}
}
