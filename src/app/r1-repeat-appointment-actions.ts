import type { AuthSessionPort } from '@shared/ports'
import type { R1NodeFormsReader, R1NodeFormsSnapshot, R1RepeatAppointmentRead } from '@features/work-orders/r1-node-forms-read'
import type { R1RepeatPageActions } from '@features/work-orders/r1-repeat-actions-port'
import { appointmentEditDraft, normalizeRepeatAppointmentEdit, projectRepeatAppointmentEdit } from '@features/work-orders/r1-repeat-appointment-edit'
import { r1RepeatActionsEnabled, type R1RepeatScope } from './r1-repeat-actions'
import { createLocalFixtureMutationLock } from './local-fixture-mutation-lock'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { evaluateNodeVisibility, isHandlerMatch } from '@runtimes/workflow/policy'
import { asOpaqueId } from '@shared/types'
import { r1SpecialFormUpsert } from '@adapters/api/r1-special-workflow-wires'
import { normalizeCommandResponse, type ApiCommandTransport } from '@adapters/api/technician-api-commands'
const deny=():never=>{throw Error('改约记录或授权已失效；结果不明时请读取核实，禁止重复保存。')}
const signature=(s:R1NodeFormsSnapshot)=>JSON.stringify([s.workOrderId,s.node,s.definition,s.fillableFieldIds])
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v)
export function createRepeatAppointmentPageActions(input:{snapshot:R1NodeFormsSnapshot;auth:Pick<AuthSessionPort,'getCurrentSession'>;reader:R1NodeFormsReader;
 env:Record<string,unknown>;origin:string;getGrant:()=>{readonly version:1|2;readonly scope:R1RepeatScope;readonly recordIds?:readonly string[]}|null;schemaMatches:(s:R1NodeFormsSnapshot)=>boolean;transport:ApiCommandTransport}):R1RepeatPageActions|null{
 const grant=input.getGrant();if(!grant||grant.version!==2||!grant.recordIds?.length)return null
 const scope=Object.freeze({...grant.scope}),initialSchema=signature(input.snapshot),grantBytes=JSON.stringify(grant)
 let lease=input.snapshot
 const fingerprint=()=>{const s=input.auth.getCurrentSession();return s?sessionAuthorizationFingerprint({sessionRef:s.sessionRef,userId:s.user.id,roleId:s.currentRole?.id,roleVersion:s.roleVersion}):null}
 const identity=fingerprint()
 const authorized=()=>{const s=input.auth.getCurrentSession();return Boolean(identity&&fingerprint()===identity&&s?.user.id===scope.userId&&s.currentRole?.id===scope.roleId
   &&r1RepeatActionsEnabled(input.env,input.origin)&&input.env.VITE_XLINK_AUTH_TENANT===scope.tenantId&&JSON.stringify(input.getGrant())===grantBytes)}
 const valid=(s:R1NodeFormsSnapshot)=>{
  const actor={userId:asOpaqueId<'UserId'>(scope.userId),roleIds:[asOpaqueId<'RoleId'>(scope.roleId)],organizationRoles:[]}
  return input.schemaMatches(s)&&signature(s)===initialSchema&&s.node.lifecycle==='active'&&s.node.nodeTypeEvidence==='runtime_node_def'
   &&s.records.length<=50&&isHandlerMatch(actor,s.node.handlers??[])&&evaluateNodeVisibility(s.node,actor).visible
 }
 const owns=()=>authorized()&&input.reader.isCurrent(lease)&&valid(lease)
 const evidence=(s:R1NodeFormsSnapshot,id:string):R1RepeatAppointmentRead=>{
  if(!authorized()||!input.reader.isCurrent(s)||!valid(s)||!grant.recordIds!.includes(id))return deny()
  const e=input.reader.currentRepeatAppointment?.(s,id)
  if(!e||!input.reader.isCurrentRepeatAppointment?.(s,id,e))return deny()
  appointmentEditDraft(s,e);return e
 }
 const initial=new Map<string,R1RepeatAppointmentRead>()
 for(const id of grant.recordIds){try{initial.set(id,evidence(lease,id))}catch{/* Unsupported or absent records remain read-only. */}}
 if(!initial.size)return null
 const lock=(id:string)=>{if(!grant.recordIds!.includes(id))return deny();return locks.get(id)!}
 const locks=new Map(grant.recordIds.map(id=>[id,createLocalFixtureMutationLock('xlink:r1-repeat-appointment-edit:'+JSON.stringify([scope.tenantId,scope.userId,scope.roleId,scope.workOrderId,scope.workflowRunId,scope.runtimeNodeId,scope.formDefinitionId,id]))]))
 const locked=()=>!owns()||[...locks.values()].some(l=>l.locked)
 const selected=(id:string)=>{if(!owns()||!initial.has(id))return deny();const e=initial.get(id)!
  if(!input.reader.isCurrentRepeatAppointment?.(lease,id,e))return deny();return e}
 async function fresh(){if(!owns())return deny();const s=await input.reader.load(scope.workOrderId,scope.runtimeNodeId)
  if(!authorized()||!input.reader.isCurrent(s)||!valid(s))return deny();lease=s;return s}
 return{
  locked,canCreate:()=>false,canComplete:()=>false,canSaveAndComplete:()=>false,
  canEdit(id){try{return !locked()&&Boolean(selected(id))}catch{return false}},
  initialValues(id){try{return appointmentEditDraft(lease,selected(id))}catch{return null}},
  projectFields(values,id){if(!id)return[];try{return projectRepeatAppointmentEdit(lease,selected(id),values)}catch{return[]}},
  validateDraft(values,id){try{if(!id||locked())return false;normalizeRepeatAppointmentEdit(lease,selected(id),values);return true}catch{return false}},
  complete:async()=>deny(),
  async saveOnly(values,id){
   if(!id||locked())return deny()
   const first=selected(id),raw=JSON.stringify(first.original),draft=Object.freeze({...values})
   // Capture source bytes and metadata before any await; a later shared-object mutation cannot redefine this baseline.
   const others=new Map(lease.records.filter(r=>r.id!==id).map(r=>[String(r.id),JSON.stringify(input.reader.currentFormOriginal?.(lease,String(r.id)))]))
   const initialIds=JSON.stringify(lease.records.map(r=>r.id))
   return lock(id).run(async mark=>{
    if(!owns()||!input.reader.isCurrentRepeatAppointment?.(lease,id,first))return deny()
    const before=await fresh(),e=evidence(before,id)
    if(JSON.stringify(e.original)!==raw||JSON.stringify(before.records.map(r=>r.id))!==initialIds)return deny()
    for(const[k,v]of others)if(JSON.stringify(input.reader.currentFormOriginal?.(before,k))!==v)return deny()
    const normalized=normalizeRepeatAppointmentEdit(before,e,draft)
    const request=r1SpecialFormUpsert({sourceNodeType:'repeat',definitionId:before.definition.id,formData:normalized,fieldStorage:before.definition.fields,
     authoritativeOriginal:e.original,existingFormDataId:asOpaqueId<'FormDataId'>(id),workOrderId:asOpaqueId<'WorkOrderId'>(scope.workOrderId),
     workflowNodeId:before.node.id,workflowRunId:before.node.runId,state:1})
    const expected=JSON.parse(String(request.body?.dataStr)) as Record<string,unknown>
    if(!owns()||!input.reader.isCurrentRepeatAppointment?.(before,id,e))return deny()
    mark('uncertain');const rawAck=await input.transport.execute(request)
    if(!owns())return deny();normalizeCommandResponse(rawAck)
    if(!object(rawAck)||!(rawAck.success===true||rawAck.status===1)||(Object.hasOwn(rawAck,'success')&&rawAck.success!==true)||(Object.hasOwn(rawAck,'status')&&rawAck.status!==1))return deny()
    const ack=object(rawAck.data)?rawAck.data:object(rawAck.entity)?rawAck.entity:rawAck
    const aliases=['_id','id','dataId','formDataId'].filter(k=>Object.hasOwn(ack,k))
    if(!aliases.length||aliases.some(k=>ack[k]!==id))return deny()
    for(const[k,v]of Object.entries({_id:id,state:1,smodule:'serviceAppointment',tenantId:scope.tenantId,sid:scope.workOrderId,nodeId:scope.runtimeNodeId,workflowId:scope.workflowRunId,workflowRunId:scope.workflowRunId,runId:scope.workflowRunId,formDefId:scope.formDefinitionId,definitionId:scope.formDefinitionId,extId:scope.formDefinitionId,formDefinitionId:scope.formDefinitionId}))if(Object.hasOwn(ack,k)&&ack[k]!==v)return deny()
    if(ack.workflow!=null){
     if(!object(ack.workflow))return deny()
     for(const k of ['_id','id','workflowId','workflowRunId','runId'])if(Object.hasOwn(ack.workflow,k)&&ack.workflow[k]!==scope.workflowRunId)return deny()
    }
    const after=await fresh(),saved=evidence(after,id)
    if(JSON.stringify(after.records.map(r=>r.id))!==initialIds)return deny()
    for(const[k,v]of others)if(JSON.stringify(input.reader.currentFormOriginal?.(after,k))!==v)return deny()
    // Known backend update metadata is not a BSON no-change claim. Every submitted/preserved business/raw slot is checked independently.
    const rebuilt=new Set(['createTime','createUser','updateTime','updateDateTime','updateUser','updateUserName'])
    for(const[k,v]of Object.entries(expected))if(!rebuilt.has(k)&&JSON.stringify(saved.original[k])!==JSON.stringify(v))return deny()
    for(const k of Object.keys(e.original))if(!rebuilt.has(k)&&!Object.hasOwn(saved.original,k))return deny()
    if(!owns())return deny();for(const key of initial.keys())initial.set(key,key===id?saved:evidence(after,key));mark('ready');return after
   })
  },
 }
}
