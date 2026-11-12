import {supportsR1OrdinaryCreatePlan,bindR1OrdinaryCreatePlan,isR1OrdinaryCreateRevoked,projectR1OrdinaryCreate,updateR1OrdinaryCreateDraft,isR1OrdinaryFileEligible,assertR1OrdinaryNonFileValues,assertR1OrdinaryStored} from '@features/work-orders/r1-ordinary-create-plan'
import {updateR1CreateDraftValues,supportsR1CreateDraftSchema} from '@features/work-orders/r1-ordinary-create-draft'
import type {R1LocalFieldValue} from '@features/work-orders/r1-local-form-fields'
import {sessionAuthorizationFingerprint} from '@shared/session-authorization'
import type { AuthSessionPort, MediaFilePickerPort, MediaUploadQueuePort } from '@shared/ports'
import type { R1NodeFormsReader, R1NodeFormsSnapshot, R1GenericMapRouteRead } from '@features/work-orders/r1-node-forms-read'
import type { R1RepeatActionProvider } from '@features/work-orders/r1-repeat-actions-port'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { createNormalRepeatActionProvider } from './r1-repeat-authorization'
import { r1RepeatActionsEnabled as localFormWritesEnabled, type R1RepeatScope } from './r1-repeat-actions'
import { normalizeR1FormsEditValues,projectR1FormsEditValues } from '@features/work-orders/r1-forms-edit-values'
import { normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
import {projectR1NormalFileFields} from '@features/work-orders/r1-normal-file-values'
import { usesR1FormsScalarSubset } from '@features/work-orders/r1-forms-scalar-subset'
import { projectR1GenericScalarEditValues,normalizeR1GenericScalarEditValues } from '@features/work-orders/r1-generic-scalar-edit-values'
import { createR1FormsActions } from './r1-forms-actions'
import { createR1NormalFormFileSession, createR1ConfiguredFormFileSession } from './r1-normal-form-media'
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
  readonly reader:R1NodeFormsReader;readonly env:Record<string,unknown>;readonly origin:string;
  readonly media?:{readonly picker:MediaFilePickerPort;readonly queue:MediaUploadQueuePort}}):R1RepeatActionProvider {
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
    const fileMode=Boolean(snapshot.definition.fields?.some(f=>f.type==='file'&&!f.readOnly&&!snapshot.node.formFieldIdsReadOnly?.includes(f.fieldId)))
    if(fileMode&&(snapshot.records.length!==0||!input.media))return null
    const g=grant(),a=input.auth.getCurrentSession()
    if(!g||!schemaMatches(snapshot)||!input.reader.isCurrent(snapshot)||(g.version===1&&snapshot.records.length!==0)
      || !input.reader.currentFormsExts?.(snapshot)||a?.user.id!==g.scope.userId||a.currentRole?.id!==g.scope.roleId)return null
    const actor={userId:asOpaqueId<'UserId'>(g.scope.userId),roleIds:[asOpaqueId<'RoleId'>(g.scope.roleId)],organizationRoles:[]}
    if(snapshot.node.lifecycle!=='active'||snapshot.node.nodeTypeEvidence!=='runtime_node_def'
      || !isHandlerMatch(actor,snapshot.node.handlers??[])||!evaluateNodeVisibility(snapshot.node,actor).visible)return null
    const unifiedMode=g.version===1&&typeof input.reader.currentFormsCreateRoute==='function'&&supportsR1OrdinaryCreatePlan(snapshot)
    // Actual normal readers must use the complete ordinary v1 field plan.
    // Historical minimal reader adapters retain only their prior scalar API;
    // they cannot introduce any new field capability or type0 source claim.
    if(g.version===1&&typeof input.reader.currentFormsCreateRoute==='function'&&!unifiedMode)return null
    const legacyFile=g.version===2&&fileMode&&projectR1NormalFileFields(snapshot,{}).length===snapshot.definition.fields?.length
    if(!unifiedMode&&!legacyFile&&!usesR1FormsScalarSubset(snapshot)&&snapshot.definition.fields?.some(f=>!['text','textarea','phone','IDNumber','number','digit','date','time','datetime','radio','select'].includes(f.type)||f.multiple))return null
    let lease=snapshot,createRevoked=false,createReadPending=false
    const createActor=()=>{const a=input.auth.getCurrentSession();return a?sessionAuthorizationFingerprint({sessionRef:a.sessionRef,userId:a.user.id,roleId:a.currentRole?.id,roleVersion:a.roleVersion}):null}
    const initialCreateActor=createActor()
    const ordinaryCreateRouteIdentity=(s:R1NodeFormsSnapshot)=>{
      const e=input.reader.currentFormsCreateRoute?.(s)
      return e&&input.reader.isCurrentFormsCreateRoute?.(s,e)===true&&e.type==='0'
        &&e.tenantId===g.scope.tenantId&&e.workOrderId===g.scope.workOrderId&&e.runtimeNodeId===g.scope.runtimeNodeId
        &&e.workflowRunId===g.scope.workflowRunId&&e.formDefinitionId===g.scope.formDefinitionId
        &&!['survey','inspectionAppointment','serviceAppointment'].includes(e.colName)&&e.collectionName===`frm_${e.tenantId}_${e.colName}`
        ?JSON.stringify(e):null
    }
    const scalarDraftTypes=new Set(['text','textarea','phone','IDNumber','number','digit','date','time','datetime','radio','select'])
    const scalarDraftCandidate=!unifiedMode&&!fileMode&&g.version===1&&snapshot.records.length===0&&snapshot.definition.purpose===undefined
      &&Boolean(snapshot.definition.fields?.length)&&snapshot.definition.fields!.length<=50
      &&snapshot.definition.fields!.every(f=>scalarDraftTypes.has(f.type)&&f.readOnly===false&&typeof f.required==='boolean'
        &&!f.multiple&&!f.presentationOnly&&!f.unsupportedReason&&!f.valueOption)
    const initialScalarRoute=scalarDraftCandidate?ordinaryCreateRouteIdentity(snapshot):null
    const scalarDraftMode=Boolean(scalarDraftCandidate&&initialScalarRoute&&supportsR1CreateDraftSchema(snapshot))
    const controlledCreate=unifiedMode||scalarDraftMode
    const initialControlledRoute=unifiedMode?ordinaryCreateRouteIdentity(snapshot):initialScalarRoute
    if(unifiedMode&&!initialControlledRoute)return null
    const fileRouteIdentity=(s:R1NodeFormsSnapshot)=>{
      const e=input.reader.currentNormalFileRoute?.(s)
      if(!e||input.reader.isCurrentNormalFileRoute?.(s,e)!==true||e.type!=='0'
        ||e.tenantId!==g.scope.tenantId||e.workOrderId!==g.scope.workOrderId||e.runtimeNodeId!==g.scope.runtimeNodeId
        ||e.workflowRunId!==g.scope.workflowRunId||e.formDefinitionId!==g.scope.formDefinitionId
        ||!e.colName||['survey','inspectionAppointment','serviceAppointment'].includes(e.colName)
        ||e.collectionName!==`frm_${e.tenantId}_${e.colName}`)return null
      return JSON.stringify([e.tenantId,e.workOrderId,e.runtimeNodeId,e.workflowRunId,e.formDefinitionId,e.type,e.colName,e.collectionName])
    }
    const initialFileRoute=fileMode?fileRouteIdentity(snapshot):undefined
    if(fileMode&&!initialFileRoute)return null
    // Freeze the observed metadata as bytes, not a later view of shared objects.
    // Only the newly supported large forms subset gets this stricter lease.
    const subsetSchema=usesR1FormsScalarSubset(snapshot)||fileMode||controlledCreate
      ?JSON.stringify([snapshot.definition.fields,snapshot.definition.purpose,snapshot.node.formFieldIdsReadOnly,snapshot.fillableFieldIds]):undefined
    const permits=(op:R1FormsOperation,recordId?:string)=>{
      if((fileMode||controlledCreate)&&(op!=='create'||recordId!==undefined))return false
      const fresh=grant()
      return Boolean(fresh&&permitted(g.scope)&&(fresh.operations as readonly string[]).includes(op)
        &&(op!=='edit'||(fresh.version===2&&Boolean(recordId)&&fresh.recordIds.includes(recordId!))))
    }
    const routeAt=(s:R1NodeFormsSnapshot,id:string)=>{
      const e=input.reader.currentGenericMapRoute?.(s,id)
      if(!e || input.reader.isCurrentGenericMapRoute?.(s,id,e)!==true || e.type!=='0'
        ||e.tenantId!==g.scope.tenantId||e.workOrderId!==g.scope.workOrderId||e.runtimeNodeId!==g.scope.runtimeNodeId
        ||e.workflowRunId!==g.scope.workflowRunId||e.formDefinitionId!==g.scope.formDefinitionId||e.recordId!==id
        ||!e.colName||e.colName.trim()!==e.colName||e.colName==='serviceAppointment'
        ||e.collectionName!==`frm_${e.tenantId}_${e.colName}`)return null
      return e
    }
    const routeIdentity=(e:R1GenericMapRouteRead)=>JSON.stringify([e.tenantId,e.workOrderId,e.runtimeNodeId,
      e.workflowRunId,e.formDefinitionId,e.recordId,e.type,e.colName,e.collectionName])
    const initialRoutes=new Map<string,string>()
    if(usesR1FormsScalarSubset(snapshot))for(const record of snapshot.records){
      const e=routeAt(snapshot,String(record.id));if(e)initialRoutes.set(String(record.id),routeIdentity(e))
    }
    const genericRoute=(s:R1NodeFormsSnapshot,id:string)=>{
      const e=routeAt(s,id)
      return e&&initialRoutes.get(id)===routeIdentity(e)?e:null
    }
    const original=(s:R1NodeFormsSnapshot,id:string)=>usesR1FormsScalarSubset(s)
      ?genericRoute(s,id)?.original??null:input.reader.currentFormOriginal?.(s,id)??null
    const normalizeExisting=(s:R1NodeFormsSnapshot,raw:Readonly<Record<string,unknown>>,values:Readonly<Record<string,unknown>>,id:string)=>{
      if(!usesR1FormsScalarSubset(s))return normalizeR1FormsEditValues(s,raw,values)
      if(!genericRoute(s,id))throw Error('当前原记录的同租户type0路由证据不可核实')
      // raw is the transaction's exact pre-upsert original, not the changed
      // record returned by the intermediate read. Fresh route proof is separate.
      return normalizeR1GenericScalarEditValues(s,raw,values)
    }
    const owns=(s:R1RepeatScope)=>{
      const sameActor=createActor()===initialCreateActor
      // External authority is observable even while our own reader has no
      // current snapshot. Never exempt an observed grant/switch revocation.
      let independent=false
      try{independent=permitted(s)&&(!unifiedMode||!isR1OrdinaryCreateRevoked(lease))&&(!controlledCreate||sameActor&&input.env.VITE_XLINK_AUTH_TENANT===g.scope.tenantId
        &&JSON.stringify(grant())===JSON.stringify(g)&&schemaMatches(lease)
        &&lease.node.lifecycle==='active'&&lease.node.nodeTypeEvidence==='runtime_node_def'
        &&isHandlerMatch(actor,lease.node.handlers??[])&&evaluateNodeVisibility(lease.node,actor).visible
        &&(subsetSchema===undefined||JSON.stringify([lease.definition.fields,lease.definition.purpose,lease.node.formFieldIdsReadOnly,lease.fillableFieldIds])===subsetSchema))}catch{independent=false}
      if(controlledCreate&&!independent)createRevoked=true
      const valid=independent&&input.reader.isCurrent(lease)
        &&(!fileMode||fileRouteIdentity(lease)===initialFileRoute)
        &&(!controlledCreate||ordinaryCreateRouteIdentity(lease)===initialControlledRoute)
      // Only the controlled reader-current gap may await renewal. Independently
      // observed authority loss above is permanent, including during that gap.
      if(controlledCreate&&!valid&&!createReadPending)createRevoked=true
      return valid&&(!controlledCreate||!createRevoked)
    }
    const bindPlan=(s:R1NodeFormsSnapshot)=>bindR1OrdinaryCreatePlan(s,()=>owns(g.scope)&&lease===s,()=>createReadPending&&!createRevoked&&lease===s,()=>{if(lease===s)createRevoked=true})
    if(unifiedMode)bindPlan(snapshot)
    const mediaInput=fileMode?{scope:g.scope,queue:input.media!.queue,picker:input.media!.picker,
      getSnapshot:()=>lease,isAuthorized:()=>owns(g.scope)&&schemaMatches(lease)&&permits('create')}:undefined
    // Compatibility adapter for the already-issued v2 file-only/scalar protocol,
    // never an entry for new field kinds or reinterpreted v1 permission.
    const fileMedia=mediaInput?(legacyFile?createR1NormalFormFileSession(mediaInput):createR1ConfiguredFormFileSession(mediaInput,
      {sourceNodeType:'forms',allowedSources:['camera','library','file'],eligible:isR1OrdinaryFileEligible,assertNonFileValues:assertR1OrdinaryNonFileValues})):undefined
    const initialValues=(id:string)=>{try{return permits('edit',id)&&owns(g.scope)&&original(lease,id)
      ?usesR1FormsScalarSubset(lease)?projectR1GenericScalarEditValues(lease,original(lease,id)!):projectR1FormsEditValues(lease,original(lease,id)!):null}catch{return null}}
    const actions=createR1FormsActions({env:input.env,origin:input.origin,getSession:()=>input.auth.getCurrentSession(),hasExactGrant:owns,
      transport:createUniApiCommandTransport({apiBaseUrl:String(input.env.VITE_XLINK_API_BASE_URL),getSessionRef:()=>input.auth.getCurrentSession()?.sessionRef??null}),
      permits,original,normalizeExisting,
      ...(unifiedMode?{assertChoiceStored:(s:R1NodeFormsSnapshot,raw:Readonly<Record<string,unknown>>,sent:Readonly<Record<string,unknown>>)=>{if(raw.tenantId!==g.scope.tenantId)throw Error('新记录租户回执不匹配');assertR1OrdinaryStored(s,raw,sent)}}:{}),
      ...(fileMedia?{assertFileValues:(s:R1NodeFormsSnapshot,v:Readonly<Record<string,unknown>>)=>fileMedia.assertValues(s,v)}:{}),
      confirmCompletion:async s=>{
        if(!owns(g.scope)||!input.reader.confirmFormsCompletion)throw Error('完成结果无法核实')
        return input.reader.confirmFormsCompletion(s)
      },
      fullExts:s=>input.reader.currentFormsExts?.(s)??null,
      async readLatest(s){
        if(!owns(s))throw Error('本轮普通表单授权已失效')
        let latest:R1NodeFormsSnapshot
        createReadPending=controlledCreate
        try{latest=await input.reader.load(s.workOrderId,s.runtimeNodeId)}catch(error){if(controlledCreate)createRevoked=true;throw error}finally{createReadPending=false}
        if(controlledCreate&&(createRevoked||createActor()!==initialCreateActor)){createRevoked=true;throw Error('本轮创建身份已撤销')}

        if(!permitted(s)||!input.reader.isCurrent(latest)||!schemaMatches(latest)
          ||(controlledCreate&&(ordinaryCreateRouteIdentity(latest)!==initialControlledRoute||JSON.stringify(grant())!==JSON.stringify(g)))
          ||(subsetSchema!==undefined&&JSON.stringify([latest.definition.fields,latest.definition.purpose,latest.node.formFieldIdsReadOnly,latest.fillableFieldIds])!==subsetSchema))throw Error('普通表单配置已变化')
        lease=latest;
        if(unifiedMode&&latest.records.length===0)bindPlan(latest)
        return latest
      }})
    const updateCreateDraft=(values:Readonly<Record<string,R1LocalFieldValue>>,key:string,value:R1LocalFieldValue,recordId?:string)=>{
      if((!scalarDraftMode&&!unifiedMode)||recordId!==undefined||lease.records.length!==0||!owns(g.scope)
        ||!permits('create')||!schemaMatches(lease)||ordinaryCreateRouteIdentity(lease)!==initialControlledRoute
        ||JSON.stringify(grant())!==JSON.stringify(g)||createActor()!==initialCreateActor)throw Error('当前普通新建草稿的来源或授权已失效')
      const next=unifiedMode?updateR1OrdinaryCreateDraft(lease,values,key,value):updateR1CreateDraftValues(lease,values,key,value)
      // Hiding an owned/pending file is not cancellation. Keep the complete
      // draft atomic until its independent queue can prove the omission safe.
      if(fileMedia&&lease.definition.fields?.some(f=>f.type==='file'&&Object.hasOwn(values,f.valueKey)&&!Object.hasOwn(next,f.valueKey))
        &&!fileMedia.ready(next))throw Error('隐藏附件前须先核对或取消当前上传任务')
      return next
    }
    return {...(scalarDraftMode||unifiedMode?{updateCreateDraft}:{}),locked:()=>!owns(g.scope)||actions.locked(g.scope),
      ...(fileMedia?{fileMedia}:{}),
      ...(unifiedMode?{projectFields:(values:Readonly<Record<string,unknown>>)=>projectR1OrdinaryCreate(lease,values)}:{}),
      canCreate:()=>owns(g.scope)&&(!controlledCreate||lease.records.length===0)&&permits(lease.records.length?'append':'create'),
      canEdit:id=>owns(g.scope)&&permits('edit',id)&&lease.records.some(r=>r.id===id)&&Boolean(initialValues(id)),
      canComplete:()=>owns(g.scope)&&permits('complete')&&lease.records.length>0,
      canSaveAndComplete:()=>owns(g.scope)&&permits('save_finish'),
      initialValues,
      validateDraft:(values,id)=>{try{
        if(!owns(g.scope))return false
        return Boolean(id?permits('edit',id)&&normalizeExisting(lease,original(lease,id)??{},values,id)
          :permits(lease.records.length?'append':'create')&&normalizeR1RepeatValues(lease,values))
      }catch{return false}},
      saveOnly:async(values,id)=>{
        const saved=await actions.saveOnly(g.scope,values,id)
        // Cleanup is local and follows authoritative readback. A cleanup error
        // must not turn an already verified business save into a replay prompt.
        if(fileMedia)try{await fileMedia.finalize()}catch{/* queue retains local cleanup evidence */}
        return saved
      },
      saveAndComplete:(values,id)=>actions.saveAndComplete(g.scope,values,id),
      complete:()=>actions.complete(g.scope)}
  }}
}
/** Normal App entry dispatches on the server's source type; never relabels nodes. */
export function createNormalNodeFormActionProvider(input:Parameters<typeof createNormalFormsActionProvider>[0]):R1RepeatActionProvider {
  const forms=createNormalFormsActionProvider(input),repeat=createNormalRepeatActionProvider(input)
  return {forSnapshot:s=>s.node.sourceNodeType==='forms'?forms.forSnapshot(s):repeat.forSnapshot(s)}
}
