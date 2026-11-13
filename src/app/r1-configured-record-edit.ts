import type { AuthSessionPort } from '@shared/ports'
import type { R1NodeFormsReader, R1NodeFormsSnapshot, R1RecordEditRead } from '@features/work-orders/r1-node-forms-read'
import type { R1RepeatPageActions } from '@features/work-orders/r1-repeat-actions-port'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from '@features/work-orders/action-form-schema'
import { hasDistinctR1ChoiceMembers } from '@features/work-orders/r1-local-form-fields'
import { isR1MobilePhone } from '@shared/form/r1-mobile-phone'
import { evaluateFieldState, normalizeFieldValue, normalizeSubmission } from '@runtimes/dynamic-form'
import { evaluateNodeVisibility, isHandlerMatch } from '@runtimes/workflow/policy'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { asOpaqueId } from '@shared/types'
import type { ApiCommandTransport, ApiCommandRequest } from '@adapters/api/technician-api-commands'
import { r1SpecialFormUpsert } from '@adapters/api/r1-special-workflow-wires'
import { surveyExistingOriginalProblem, sameTypedSurveyResult } from '@adapters/api/r1-typed-survey-preservation'
import { createLocalFixtureMutationLock } from './local-fixture-mutation-lock'
import { r1RepeatActionsEnabled, type R1RepeatScope } from './r1-repeat-actions'

// Structural consumption of the parsed deployment grant keeps the authority
// dispatcher out of this lower-level capability's dependency graph.
type EditGrant = { readonly version: number; readonly synthetic?: true; readonly scope: R1RepeatScope;
  readonly fieldIds: readonly string[]; readonly recordIds?: readonly string[] }

function refuse(reason = '记录、字段或权限已变化，禁止提交或自动重试。'): never { throw Error(reason) }
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object'
  && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => object(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x)
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const schema = (s: R1NodeFormsSnapshot) => stable([s.workOrderId,s.node,s.definition,s.fillableFieldIds])
const reserved = new Set('_id id dataId formDataId formDefId definitionId formDefinitionId extId tenantId userId roleId sid smodule state nodeId runtimeNodeId workOrderId workflowId workflowRunId runId workflow workflowNodeId orderId contractId contractdocNum sourceType serviceType serviceAppointmentNum externalSid optId optName dataStr exts __proto__ prototype constructor toJSON sessionRef createTime createDateTime createUser createUserName updateTime updateDateTime updateUser updateUserName orgId orgName belongTo etags _version _class'.split(' '))

function conditionDependencies(s:R1NodeFormsSnapshot){
  return (s.definition.fields??[]).filter(f=>f.visibility).map(f=>{
    const rule=f.visibility!
    if(!('path'in rule)||typeof rule.path!=='string')refuse('条件来源尚未核实。')
    const dependency=s.definition.fields!.find(field=>field.valueKey===rule.path)
    if(!dependency)refuse('条件字段来源缺失。')
    return dependency
  })
}
function verifyConditionValues(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>){
  for(const dependency of conditionDependencies(s)){
    const key=dependency.valueKey,value=values[key]
    if(!Object.hasOwn(values,key))refuse('条件依据缺失，不能默认隐藏字段。')
    if(value===''||Array.isArray(value)&&value.length===0)continue // Known empty, not an unknown dependency.
    const checked=normalizeFieldValue(dependency.type,value,dependency.options,dependency.multiple)
    if(!checked.ok||stable(checked.value)!==stable(value))refuse('条件依据的值或选项尚未核实。')
  }
}

function originalProblem(e: R1RecordEditRead): string | null {
  const raw = e.original
  if (e.storage.kind === 'survey-dto') return surveyExistingOriginalProblem(raw)
  // Type0 follows the existing R1 query wire. Its separately witnessed audit
  // Date projections are known backend limitations, not BSON-lossless data.
  try {
    let count=0
    const visit=(v:unknown,depth:number):void=>{
      if(++count>5000||depth>20)refuse()
      if(v===null||typeof v==='string'||typeof v==='boolean')return
      if(typeof v==='number'&&Number.isFinite(v)&&(!Number.isInteger(v)||Number.isSafeInteger(v)))return
      if(Array.isArray(v)){for(const x of v)visit(x,depth+1);return}
      if(object(v)){for(const[k,x]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))refuse();visit(x,depth+1)}return}
      refuse()
    }
    visit(raw,0);visit(e.wireOriginal,0);if(stable(raw).length>200000||stable(e.wireOriginal).length>200000)refuse()
  } catch { return '记录原文包含无法保全的值。' }
  return null
}
function sameMapResult(expected: Record<string,unknown>, actual: Record<string,unknown>): boolean {
  const strip=(v:Record<string,unknown>)=>Object.fromEntries(Object.entries(v)
    .filter(([key])=>!['updateTime','updateDateTime','updateUser','updateUserName'].includes(key)))
  return stable(strip(expected))===stable(strip(actual))
}

/** One exact existing-record capability. Data routing is reader-issued; fields
 * and controls are configured. It cannot create, Process, delete or upload. */
export function createConfiguredRecordEditActions(input: {
  snapshot: R1NodeFormsSnapshot; reader: R1NodeFormsReader; auth: Pick<AuthSessionPort,'getCurrentSession'>;
  env: Record<string,unknown>; origin: string; getGrant(): EditGrant | null; transport: ApiCommandTransport;
}): R1RepeatPageActions | null {
  const g=input.getGrant(), initial=input.snapshot
  if(g?.version!==6||g.synthetic!==true||!g.recordIds?.length)return null
  const grant=g, scope=Object.freeze({...g.scope}), grantBytes=stable(g), initialSchema=schema(initial)
  const initialIds=stable(initial.records.map(r=>r.id)), identity=input.reader.retainReadIdentity?.(initial)
  const fingerprint=()=>{const a=input.auth.getCurrentSession();return a?sessionAuthorizationFingerprint({sessionRef:a.sessionRef,userId:a.user.id,roleId:a.currentRole?.id,roleVersion:a.roleVersion}):null}
  const actorAtRead=fingerprint(), actor={userId:asOpaqueId<'UserId'>(scope.userId),roleIds:[asOpaqueId<'RoleId'>(scope.roleId)],organizationRoles:[]}
  let lease=initial, revoked=false, ownRead=false, used=false
  const evidence=(s:R1NodeFormsSnapshot,id:string)=>{
    const e=input.reader.currentRecordEdit?.(s,id)
    return e&&input.reader.isCurrentRecordEdit?.(s,id,e)===true?e:null
  }
  const sources=new Map(grant.recordIds!.map(id=>[id,evidence(initial,id)]))
  const sourceIdentity=(e:R1RecordEditRead)=>stable([e.sourceSeal,e.storage])
  function valid(s:R1NodeFormsSnapshot):boolean {
    const f=s.definition.fields,fill=s.fillableFieldIds,ro=s.node.formFieldIdsReadOnly
    return schema(s)===initialSchema&&s.workOrderId===scope.workOrderId&&s.node.id===scope.runtimeNodeId
      &&s.node.runId===scope.workflowRunId&&s.definition.id===scope.formDefinitionId&&s.node.formDefinitionId===scope.formDefinitionId
      &&s.node.sourceNodeType==='repeat'&&s.node.nodeTypeEvidence==='runtime_node_def'&&s.node.lifecycle==='active'
      &&isHandlerMatch(actor,s.node.handlers??[])&&evaluateNodeVisibility(s.node,actor).visible
      &&Boolean(f?.length&&fill?.length&&Array.isArray(ro))&&fill!.length===grant.fieldIds.length
      &&fill!.every(id=>grant.fieldIds.includes(id)&&!ro!.includes(id)&&f!.some(x=>x.fieldId===id&&!x.readOnly))
      &&s.records.length>=1&&s.records.length<=50&&stable(s.records.map(r=>r.id))===initialIds
      &&grant.recordIds!.every(id=>{const e=evidence(s,id),before=sources.get(id);return Boolean(e&&before&&sourceIdentity(e)===sourceIdentity(before))})
  }
  function current():boolean {
    const a=input.auth.getCurrentSession()
    if(!actorAtRead||fingerprint()!==actorAtRead||!identity?.isSameActor()||a?.user.id!==scope.userId||a.currentRole?.id!==scope.roleId
      ||input.env.VITE_XLINK_AUTH_TENANT!==scope.tenantId||!r1RepeatActionsEnabled(input.env,input.origin)
      ||stable(input.getGrant())!==grantBytes)revoked=true
    // Observe private source withdrawal even when the broad reader is already
    // unavailable; short-circuiting there could resurrect the same old source.
    if(!ownRead){const present=grant.recordIds!.every(id=>Boolean(evidence(lease,id)))
      if(!present||!input.reader.isCurrent(lease)||!valid(lease))revoked=true}
    return !revoked&&!used
  }
  if(!current()||!valid(initial))return null
  const originals=new Map(initial.records.map(r=>[String(r.id),stable(input.reader.currentFormOriginal?.(initial,String(r.id)))]))
  const wires=new Map(grant.recordIds!.map(id=>[id,stable(sources.get(id)!.wireOriginal)]))
  const locks=new Map(grant.recordIds!.map(id=>[id,createLocalFixtureMutationLock('xlink:r1-configured-record-edit:'+stable([scope,id]))]))
  function source(s:R1NodeFormsSnapshot,id:string):R1RecordEditRead {
    const e=evidence(s,id);if(!e)refuse('完整记录来源已失效。')
    const expected={_id:id,tenantId:scope.tenantId,sid:scope.workOrderId,nodeId:scope.runtimeNodeId,workflowId:scope.workflowRunId,state:1}
    if(Object.entries(expected).some(([k,v])=>e.original[k]!==v))refuse()
    const problem=originalProblem(e);if(problem)refuse(problem)
    const ex=e.original.exts
    if(ex!==undefined&&!object(ex))refuse('EXTS 原文无法保全。')
    for(const f of e.storage.fields){
      if(reserved.has(f.valueKey)||/[.$\p{Cc}\p{Cf}]/u.test(f.valueKey))refuse()
      const root=Object.hasOwn(e.original,f.valueKey),ext=object(ex)&&Object.hasOwn(ex,f.valueKey)
      if(root&&!f.slots.includes('root')||ext&&!f.slots.includes('exts')
        ||root&&ext&&stable(e.original[f.valueKey])!==stable(ex![f.valueKey]))refuse('字段 root/EXTS 存储位置或副本冲突。')
    }
    const conditions:Record<string,unknown>={},dependencies=conditionDependencies(s),bindings=e.storage.conditions??[]
    if(bindings.length!==(s.definition.fields??[]).filter(f=>f.visibility).length)refuse('条件来源绑定不完整。')
    for(const binding of bindings){
      const dependency=dependencies.find(f=>f.fieldId===binding.dependencyFieldId&&f.valueKey===binding.valueKey)
      if(!dependency||!s.definition.fields?.some(f=>f.fieldId===binding.fieldId&&f.visibility))refuse('条件来源绑定已变化。')
      const container=binding.slot==='root'?e.original:binding.slot==='exts'?ex:undefined
      if(!object(container)||!Object.hasOwn(container,dependency.valueKey))refuse('条件依据的原始存储槽位缺失。')
      conditions[dependency.valueKey]=container[dependency.valueKey]
    }
    verifyConditionValues(s,conditions)
    return e
  }
  const canEdit=(id:string)=>{try{return current()&&!ownRead&&Boolean(locks.has(id)&&!locks.get(id)!.locked&&source(lease,id))}catch{return false}}
  const initialValues=(id:string)=>{
    const e=source(lease,id),ex=object(e.original.exts)?e.original.exts:{}
    const values:Record<string,unknown>={}
    for(const f of lease.definition.fields!){if(Object.hasOwn(ex,f.valueKey))values[f.valueKey]=copy(ex[f.valueKey]);else if(Object.hasOwn(e.original,f.valueKey))values[f.valueKey]=copy(e.original[f.valueKey])}
    return values
  }
  function normalize(values:Readonly<Record<string,unknown>>,id:string) {
    if(!canEdit(id)||!object(values))refuse()
    const initial=initialValues(id),fields=lease.definition.fields!,merged={...initial,...values}
    if(Object.keys(values).some(key=>!fields.some(f=>f.valueKey===key)))refuse()
    verifyConditionValues(lease,merged)
    const writable=fields.filter(f=>grant.fieldIds.includes(f.fieldId)),schemas=writable.map(f=>actionFormSchemaFor(f))
    for(const f of fields){
      if(!grant.fieldIds.includes(f.fieldId)&&Object.hasOwn(values,f.valueKey)&&stable(values[f.valueKey])!==stable(initial[f.valueKey]))refuse()
    }
    for(const f of writable){const v=merged[f.valueKey]
      const state=evaluateFieldState(actionFormSchemaFor(f),{values:merged as never,surface:ACTION_FORM_SURFACE})
      if(state.capability!=='SUPPORTED_GENERIC')refuse()
      if(!state.visible){
        if(Object.hasOwn(values,f.valueKey)&&stable(v)!==stable(initial[f.valueKey]))refuse('隐藏字段不能在本次编辑中修改。')
        continue
      }
      if(f.type==='checkbox'||f.type==='cascade'){
        if(v!==undefined&&(!Array.isArray(v)||v.length>30||v.some(x=>typeof x!=='string'||!x||x.length>256)
          ||f.type==='checkbox'&&!hasDistinctR1ChoiceMembers(v)))refuse()
        if(f.type==='cascade'&&Array.isArray(v)&&v.length===0&&stable(v)!==stable(initial[f.valueKey]))refuse('级联清空规则尚未核实。')
      }else if(v!==undefined&&!(typeof v==='string'||typeof v==='number'&&Number.isFinite(v)))refuse()
      if(['radio','select','phone','IDNumber','date','time'].includes(f.type)&&v!==undefined&&typeof v!=='string')refuse()
      if(f.type==='phone'&&v!==undefined&&v!==''&&!isR1MobilePhone(v))refuse('手机号格式不符合要求。')
      if(['number','digit'].includes(f.type)&&v==='')refuse()}
    const result=normalizeSubmission({fields:schemas,values:merged,surface:ACTION_FORM_SURFACE});if(!result.ok)refuse()
    const patch:Record<string,string|number|boolean|readonly string[]>={}
    for(const f of writable){const key=f.valueKey;if(!Object.hasOwn(values,key))continue
      // Hidden values remain in the complete authoritative original. Even an
      // optional []/empty-string sentinel must not accidentally clear them.
      if(!evaluateFieldState(actionFormSchemaFor(f),{values:merged as never,surface:ACTION_FORM_SURFACE}).visible)continue
      const supplied=values[key]
      // Empty optional checkbox is an explicit clear, not absence. R1's
      // checkbox-group serializes []; omitting it would retain the old value.
      const value=result.value.values[key]??(!f.required&&f.type==='checkbox'&&Array.isArray(supplied)&&supplied.length===0?[]
        :!f.required&&values[key]===''&&!['number','digit'].includes(f.type)?'':undefined)
      if(value===undefined)continue
      if(Array.isArray(value)&&['checkbox','cascade'].includes(f.type))patch[key]=Object.freeze([...value]) as readonly string[]
      else if(['string','number','boolean'].includes(typeof value))patch[key]=value as string|number|boolean
      else refuse()
    }
    return patch
  }
  async function fresh(){
    if(!current())refuse();ownRead=true
    try{const next=await input.reader.load(scope.workOrderId,scope.runtimeNodeId);if(!current()||!input.reader.isCurrent(next)||!valid(next))refuse();lease=next;return next}
    finally{ownRead=false;if(!input.reader.isCurrent(lease))revoked=true}
  }
  return {locked:()=>!current()||ownRead||[...locks.values()].every(l=>l.locked),canCreate:()=>false,canComplete:()=>false,canSaveAndComplete:()=>false,canEdit,
    editProblem(id){
      if(!current()||ownRead||!locks.has(id))return null
      const lock=locks.get(id)!
      if(lock.locked)return lock.completed?'本次编辑已保存并核实。':'上次保存结果尚未核实，请勿重复提交。'
      try{source(lease,id);return null}catch{return '记录的完整信息尚未核实，暂不能编辑。'}
    },
    initialValues(id){try{return canEdit(id)?initialValues(id):null}catch{return null}},
    // Existing editing has a reader-issued storage policy. Reuse the shared
    // runtime projection directly rather than a create-specific codec list.
    projectFields(values,id){if(!id||!canEdit(id))return[]
      const context={...initialValues(id),...values}
      return lease.definition.fields!.map(field=>{
      const state=evaluateFieldState(actionFormSchemaFor({...field,
        readOnly:field.readOnly||lease.node.formFieldIdsReadOnly?.includes(field.fieldId)===true}),
        {values:context as never,surface:ACTION_FORM_SURFACE})
      return {fieldId:field.fieldId,valueKey:field.valueKey,label:field.label,type:field.type,
        required:state.required,readOnly:state.readOnly,options:field.options??[],multiple:Boolean(field.multiple),visible:state.visible,
        supported:grant.fieldIds.includes(field.fieldId)&&state.capability==='SUPPORTED_GENERIC'&&state.visible&&!state.readOnly,
        ...(field.type==='checkbox'?{preserveSelectionOrder:true}:{}),
        ...(field.presentation?.placeholder?{placeholder:field.presentation.placeholder}:{}),...(state.reason?{reason:state.reason}:{})}
    })},
    validateDraft(values,id){try{if(!id)return false;normalize(values,id);return true}catch{return false}},
    complete:async()=>refuse(),
    async saveOnly(values,selectedId){
      if(!selectedId||!canEdit(selectedId))refuse();const id=selectedId,draft=Object.freeze({...values});normalize(draft,id)
      return locks.get(id)!.run(async mark=>{
        if(!current())refuse();await fresh();if(!canEdit(id))refuse()
        for(const[k,v]of originals)if(stable(input.reader.currentFormOriginal?.(lease,k))!==v)refuse('完整原文已变化。')
        for(const[k,v]of wires)if(stable(evidence(lease,k)?.wireOriginal)!==v)refuse('原始提交格式已变化。')
        const e=source(lease,id),patch=normalize(draft,id)
        let expected:Record<string,unknown>,request:ApiCommandRequest
        if(e.storage.kind==='survey-dto'){
          expected=copy(e.original)
          for(const f of e.storage.fields)if(Object.hasOwn(patch,f.valueKey))for(const slot of f.slots){
            if(slot==='root')expected[f.valueKey]=patch[f.valueKey]
            else (expected.exts as Record<string,unknown>)[f.valueKey]=patch[f.valueKey]
          }
          const problem=surveyExistingOriginalProblem(expected);if(problem)refuse(problem)
          request={method:'POST' as const,path:`biz/extForm/upsert/${encodeURIComponent(scope.formDefinitionId)}`,r1Special:true,body:{dataStr:JSON.stringify(expected)}}
        }else{
          request=r1SpecialFormUpsert({sourceNodeType:'repeat',definitionId:lease.definition.id,formData:patch,fieldStorage:lease.definition.fields,
            authoritativeOriginal:e.wireOriginal,existingFormDataId:asOpaqueId<'FormDataId'>(id),workOrderId:asOpaqueId<'WorkOrderId'>(scope.workOrderId),workflowNodeId:lease.node.id,workflowRunId:lease.node.runId,state:1})
          expected=JSON.parse(String(request.body?.dataStr)) as Record<string,unknown>
        }
        if(!current()||!input.reader.isCurrentRecordEdit?.(lease,id,e))refuse()
        mark('uncertain') // Durable before dispatch; never cleared by a read.
        const ack=await input.transport.execute(request);if(!current()||!object(ack)||!(ack.success===true||ack.status===1)
          ||Object.hasOwn(ack,'success')&&ack.success!==true||Object.hasOwn(ack,'status')&&ack.status!==1||!object(ack.data))refuse()
        const data=ack.data,aliases=['_id','id','dataId','formDataId'].filter(k=>Object.hasOwn(data,k))
        if(!aliases.length||aliases.some(k=>data[k]!==id))refuse('保存回执身份不一致。')
        const ackOriginal=copy(data);for(const k of ['id','dataId','formDataId'])delete ackOriginal[k]
        const same=(actual:Record<string,unknown>,precise=false)=>e.storage.kind==='survey-dto'?sameTypedSurveyResult(expected,actual,precise):sameMapResult(expected,actual)
        if(!same(ackOriginal))refuse('保存回执与完整原文不一致。')
        await fresh()
        for(const[k,v]of originals)if(k!==id&&stable(input.reader.currentFormOriginal?.(lease,k))!==v)refuse('其他记录发生变化。')
        if(!same(source(lease,id).original as Record<string,unknown>,true))refuse('权威回读与保存内容不一致。')
        mark('completed');used=true;return lease
      })
    },
  }
}
