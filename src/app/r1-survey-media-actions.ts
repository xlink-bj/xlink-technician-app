import type {AuthSessionPort,MediaFilePickerPort,MediaUploadQueuePort} from '@shared/ports'
import type {R1NodeFormsReader,R1NodeFormsSnapshot} from '@features/work-orders/r1-node-forms-read'
import type {R1RepeatPageActions} from '@features/work-orders/r1-repeat-actions-port'
import {r1RepeatActionsEnabled,type R1RepeatScope} from './r1-repeat-actions'
import {createLocalFixtureMutationLock} from './local-fixture-mutation-lock'
import {createR1SurveyFormFileSession} from './r1-normal-form-media'
import {normalizeSurveyMediaCreate,projectSurveyMediaFields,supportsSurveyMediaCreate,surveyMediaSchemaIdentity,assertSurveyMediaOriginal} from '@features/work-orders/r1-survey-media-create'
import {sessionAuthorizationFingerprint} from '@shared/session-authorization'
import {isHandlerMatch,evaluateNodeVisibility} from '@runtimes/workflow/policy'
import {asOpaqueId} from '@shared/types'
import {r1SpecialFormUpsert} from '@adapters/api/r1-special-workflow-wires'
import {normalizeCommandResponse,type ApiCommandTransport} from '@adapters/api/technician-api-commands'
const deny=():never=>{throw Error('当前勘查附件、记录或授权无法核实，禁止保存或自动重试。')}
const parts=['tenantId','userId','roleId','workOrderId','workflowRunId','runtimeNodeId','formDefinitionId'] as const
const valid=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.trim()===v&&!v.includes(',')
export function createSurveyMediaPageActions(input:{snapshot:R1NodeFormsSnapshot;reader:R1NodeFormsReader;auth:Pick<AuthSessionPort,'getCurrentSession'>;
 env:Record<string,unknown>;origin:string;getGrant:()=>{readonly version:number;readonly profile?:string;readonly scope:R1RepeatScope;readonly expiresAt:string;readonly fieldIds:readonly string[];readonly operations:readonly string[]}|null;media:{picker:MediaFilePickerPort;queue:MediaUploadQueuePort};transport:ApiCommandTransport}):R1RepeatPageActions|null{
 const initial=input.getGrant(),s=input.snapshot
 if(!initial||initial.version!==3||initial.profile!=='survey-media-first'||initial.operations.join()!=='create'||!supportsSurveyMediaCreate(s)||s.records.length!==0)return null
 const scope=Object.freeze({...initial.scope}),grantIdentity=JSON.stringify(initial),schema=surveyMediaSchemaIdentity(s)
 let lease=s,leaseProof:unknown=input.reader.currentSurveyMediaSource?.(s),revoked=false
 let pending:ReturnType<NonNullable<R1NodeFormsReader['beginSurveyMediaRead']>>|undefined
 let leaseSeal=JSON.stringify([s.workOrderId,s.node,s.definition,s.fillableFieldIds,s.records])
 const fingerprint=()=>{const a=input.auth.getCurrentSession();return a?sessionAuthorizationFingerprint({sessionRef:a.sessionRef,userId:a.user.id,roleId:a.currentRole?.id,roleVersion:a.roleVersion}):null}
 const identity=fingerprint()
 const source=(snapshot:R1NodeFormsSnapshot,proof:unknown)=>Boolean(proof&&input.reader.isCurrentSurveyMediaSource?.(snapshot,proof)===true)
 function authorized():boolean{
  if(revoked)return false
  try{
   const a=input.auth.getCurrentSession(),g=input.getGrant(),actor={userId:asOpaqueId<'UserId'>(scope.userId),roleIds:[asOpaqueId<'RoleId'>(scope.roleId)],organizationRoles:[]}
   const accepted=Boolean(identity&&fingerprint()===identity&&a?.user.id===scope.userId&&a.currentRole?.id===scope.roleId
    &&r1RepeatActionsEnabled(input.env,input.origin)&&input.env.VITE_XLINK_AUTH_TENANT===scope.tenantId
    &&g&&JSON.stringify(g)===grantIdentity&&Date.parse(g.expiresAt)>Date.now()&&parts.every(k=>valid(scope[k]))
    &&(pending?pending.isCurrent():input.reader.isCurrent(lease)&&source(lease,leaseProof))&&JSON.stringify([lease.workOrderId,lease.node,lease.definition,lease.fillableFieldIds,lease.records])===leaseSeal&&surveyMediaSchemaIdentity(lease)===schema
    &&lease.workOrderId===scope.workOrderId&&lease.node.id===scope.runtimeNodeId&&lease.node.runId===scope.workflowRunId
    &&lease.definition.id===scope.formDefinitionId&&lease.node.lifecycle==='active'
    &&g.fieldIds.length===2&&new Set(g.fieldIds).size===2&&lease.definition.fields!.every(f=>g.fieldIds.includes(f.fieldId))
    &&isHandlerMatch(actor,lease.node.handlers??[])&&evaluateNodeVisibility(lease.node,actor).visible)
   if(!accepted)revoked=true
   return accepted
  }catch{revoked=true;return false}
 }
 if(!authorized())return null
 const check=()=>{if(!authorized())return deny()}
 const lock=createLocalFixtureMutationLock(`xlink:r1-repeat:${JSON.stringify(parts.map(k=>scope[k]))}`)
 const media=createR1SurveyFormFileSession({scope,queue:input.media.queue,picker:input.media.picker,getSnapshot:()=>lease,isAuthorized:authorized})
 async function reread(){
  check();const previous=lease,previousProof=leaseProof,previousSeal=leaseSeal
  let fresh:R1NodeFormsSnapshot
  const renewal=input.reader.beginSurveyMediaRead?.(previous,previousProof)
  if(!renewal){revoked=true;return deny()}
  pending=renewal
  try{fresh=await renewal.result}catch(error){pending=undefined;revoked=true;throw error}
  // Renew only after independently checking the old private proof's integrity;
  // current-read authority alone must never wash an observed old revocation.
  const proof=input.reader.currentSurveyMediaSource?.(fresh)
  if(revoked||pending!==renewal||!renewal.isCurrent()||JSON.stringify([previous.workOrderId,previous.node,previous.definition,previous.fillableFieldIds,previous.records])!==previousSeal
    ||input.reader.isSurveyMediaSourceIntact?.(previous,previousProof)!==true
    ||!input.reader.isCurrent(fresh)||!source(fresh,proof)||surveyMediaSchemaIdentity(fresh)!==schema){pending=undefined;revoked=true;return deny()}
  pending=undefined;lease=fresh;leaseProof=proof;leaseSeal=JSON.stringify([fresh.workOrderId,fresh.node,fresh.definition,fresh.fillableFieldIds,fresh.records]);check();return fresh
 }
 return {fileMedia:media,locked:()=>lock.locked,canCreate:()=>authorized()&&lease.records.length===0&&!lock.locked,
  canEdit:()=>false,canComplete:()=>false,canSaveAndComplete:()=>false,
  projectFields:()=>authorized()?projectSurveyMediaFields(lease):[],
  validateDraft:(values,id)=>{try{return !id&&authorized()&&Boolean(normalizeSurveyMediaCreate(lease,values))}catch{return false}},
  async saveOnly(values,id){if(id)return deny();check();const submitted=normalizeSurveyMediaCreate(lease,values)
   return lock.run(async mark=>{
    check();const before=await reread();if(before.records.length!==0)return deny()
    const normalized=normalizeSurveyMediaCreate(before,submitted)
    await media.assertValues(before,normalized);check()
    if(lease!==before||before.records.length!==0)return deny()
    const request=r1SpecialFormUpsert({sourceNodeType:'repeat',definitionId:before.definition.id,formData:normalized,fieldStorage:before.definition.fields,
     workOrderId:asOpaqueId<'WorkOrderId'>(scope.workOrderId),workflowNodeId:before.node.id,workflowRunId:before.node.runId,state:1})
    check();mark('uncertain');const raw=await input.transport.execute(request);check();normalizeCommandResponse(raw)
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return deny()
    const ack=raw as Record<string,unknown>
    if((ack.success!==true&&ack.status!==1)||(Object.hasOwn(ack,'success')&&ack.success!==true)||(Object.hasOwn(ack,'status')&&ack.status!==1))return deny()
    const entity=ack.data;if(!entity||typeof entity!=='object'||Array.isArray(entity))return deny()
    const original=entity as Record<string,unknown>,ids=['id','_id','dataId'].filter(k=>Object.hasOwn(original,k)).map(k=>original[k])
    if(!ids.length||ids.some(v=>!valid(v))||new Set(ids).size!==1)return deny()
    const savedId=ids[0] as string
    for(const [key,value]of Object.entries({tenantId:scope.tenantId,sid:scope.workOrderId,nodeId:scope.runtimeNodeId,workflowId:scope.workflowRunId}))if(original[key]!==value)return deny()
    assertSurveyMediaOriginal(original,normalized)
    const after=await reread();check()
    if(after.records.length!==1||after.records[0]!.id!==savedId)return deny()
    const fresh=input.reader.currentFormOriginal?.(after,savedId);if(!fresh)return deny()
    for(const [key,value]of Object.entries({tenantId:scope.tenantId,sid:scope.workOrderId,nodeId:scope.runtimeNodeId,workflowId:scope.workflowRunId}))if(fresh[key]!==value)return deny()
    assertSurveyMediaOriginal(fresh,normalized)
    mark('ready');try{await media.finalize()}catch{/* Authoritative save is verified; retain local cleanup evidence, never prompt replay. */}
    return after
   })
  },complete:async()=>deny()}
}
