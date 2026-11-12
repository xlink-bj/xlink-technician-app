import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import type { R1LocalFieldValue } from './r1-local-form-fields'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import { evaluateFieldState, evaluateVisibility, normalizeSubmission } from '@runtimes/dynamic-form'
import type { VisibilityExpression } from '@runtimes/dynamic-form'
import { completePath, verifiedTree } from './r1-forms-cascade-create'
import { isR1NormalImageWireArray } from '@shared/form/r1-normal-image-contract'
import { sameR1NormalFileValues } from './r1-normal-file-values'
import type { R1FileWireValue } from '@shared/types'

type Kind = 'scalar' | 'switch' | 'rate' | 'choice' | 'path' | 'file'
type Value = string | number | boolean | readonly string[] | readonly R1FileWireValue[]
const deny = (reason='配置、来源、值或条件尚未完整核实'): never => { throw Error('普通新建：'+reason+'。') }
const scalar = new Set(['text','textarea','phone','IDNumber','number','digit','date','time','datetime','radio','select'])
const reserved = new Set(['id','_id','dataId','formDataId','formDefId','definitionId','extId','tenantId','userId','roleId','sid','smodule','state','nodeId','runtimeNodeId','workOrderId','workflowId','workflowRunId','runId','workflow','formDefinitionId','dataStr','exts','__proto__','prototype','constructor','createTime','createDateTime','createUser','createUserName','updateTime','updateDateTime','updateUser','updateUserName','orgId','belongTo','_version','_class','fieldId','sessionRef'])
const text = (v: unknown, max = 256): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v)
const object = (v: unknown): v is Readonly<Record<string, unknown>> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Complete metadata plan, not route/authority inference. Each entry chooses
 * its value adapter; coexisting supported kinds do not select a writer. */
function planFor(s: R1NodeFormsSnapshot) {
  const fields = s.definition.fields, fill = s.fillableFieldIds, ro = s.node.formFieldIdsReadOnly
  if (s.node.sourceNodeType !== 'forms' || s.definition.purpose !== undefined || s.records.length !== 0
    || !fields?.length || fields.length > 50 || !Array.isArray(ro) || ro.length || !Array.isArray(fill)
    || fill.length !== fields.length || new Set(fill).size !== fill.length
    || new Set(fields.map(f => f.fieldId)).size !== fields.length || new Set(fields.map(f => f.valueKey)).size !== fields.length) return deny()
  const entries = fields.map(f => {
    const kind: Kind = f.type === 'file' ? 'file' : f.type === 'cascade' ? 'path' : f.type === 'checkbox' || f.type === 'select' && f.multiple === true ? 'choice' : f.type === 'switch' ? 'switch' : f.type === 'rate' ? 'rate' : 'scalar'
    if(kind==='scalar'&&!scalar.has(f.type))return deny('字段 '+f.fieldId+' 的类型未支持：'+f.type)
    if (!text(f.fieldId) || !text(f.valueKey,120) || /[,.]/.test(f.valueKey) || reserved.has(f.valueKey) || !fill.includes(f.fieldId)
      || typeof f.required !== 'boolean' || typeof f.preset !== 'boolean' || f.readOnly !== false || f.unsupportedReason || f.presentationOnly
      || kind === 'scalar' && !scalar.has(f.type) || f.multiple !== undefined && typeof f.multiple !== 'boolean'
      || kind !== 'choice' && f.multiple === true) return deny('字段 '+f.fieldId+' 的身份、权限或多值配置不匹配')
    if (f.presentation && Object.entries(f.presentation).some(([k,v]) => k === 'customizeFlag' ? typeof v !== 'boolean'
      : k === 'max' && kind === 'file' ? typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > 10 : true)) return deny('字段 '+f.fieldId+' 的工具或数量配置未核实')
    if (kind === 'path') { if (!f.valueOption || !f.options?.length) return deny(); verifiedTree(f.options) }
    else if (kind === 'choice' || f.type === 'radio' || f.type === 'select') {
      if (!text(f.valueOption) || !f.options?.length || f.options.length > 5000 || new Set(f.options.map(o => o.value)).size !== f.options.length
        || f.options.some(o => !text(o.value) || !text(o.label,512) || o.children?.length)) return deny('字段 '+f.fieldId+' 的平面 Code 选项未核实')
    } else if (f.valueOption || f.options?.length) return deny()
    const schema = actionFormSchemaFor(f)
    if (evaluateFieldState(schema,{values:{},surface:ACTION_FORM_SURFACE}).capability !== 'SUPPORTED_GENERIC') return deny()
    return {field:f,schema,kind,max:kind === 'file' ? f.presentation?.max ?? 10 : undefined}
  })
  const keys = new Set(fields.map(f => f.valueKey)), graph = new Map<string,Set<string>>()
  const dependencies = (rule: VisibilityExpression | undefined, refs: Set<string>, depth = 0): void => {
    if (rule === undefined) return
    if (depth > fields.length || evaluateVisibility(rule,{}).state === 'unsupported') return deny()
    if (rule.kind === 'all') { rule.conditions.forEach(c => dependencies(c,refs,depth+1)); return }
    const path = Array.isArray(rule.path) && rule.path.length === 1 ? rule.path[0] : rule.path
    if (!text(path) || path.includes('.') || !keys.has(path) || entries.find(e => e.field.valueKey === path)?.kind === 'file') return deny('条件控制字段或附件条件协议未核实')
    refs.add(path)
  }
  entries.forEach(e => { const refs = new Set<string>(); dependencies(e.schema.visibility,refs); graph.set(e.field.valueKey,refs) })
  const active = new Set<string>(), done = new Set<string>()
  const visit = (k: string): void => { if (active.has(k)) return deny('条件依赖存在循环'); if (done.has(k)) return; active.add(k); graph.get(k)!.forEach(visit); active.delete(k); done.add(k) }
  keys.forEach(visit)
  return {entries,keys,controllers:new Set([...graph.values()].flatMap(s => [...s]))}
}
export function inspectR1OrdinaryCreatePlan(s:R1NodeFormsSnapshot) { try {const plan=planFor(s);return {supported:true as const,fields:plan.entries.map(e=>({fieldId:e.field.fieldId,kind:e.kind}))}} catch(error) {return {supported:false as const,reason:error instanceof Error?error.message:'配置未核实'}} }
export const supportsR1OrdinaryCreatePlan=(s:R1NodeFormsSnapshot)=>inspectR1OrdinaryCreatePlan(s).supported
const seal = (s:R1NodeFormsSnapshot) => JSON.stringify([s.workOrderId,s.node,s.definition,s.fillableFieldIds,s.records])
const issuedDefinitions = new WeakSet<object>()
const proofs = new WeakMap<R1NodeFormsSnapshot,{seal:string;current:()=>boolean;renewing:()=>boolean;onRevoke:()=>void;revoked:boolean}>()
export const hasR1OrdinaryCreatePlan = (s:R1NodeFormsSnapshot) => proofs.has(s)||issuedDefinitions.has(s.definition)
export const isR1OrdinaryCreateRevoked = (s:R1NodeFormsSnapshot) => proofs.get(s)?.revoked === true
export function bindR1OrdinaryCreatePlan(s:R1NodeFormsSnapshot,current:()=>boolean,renewing:()=>boolean,onRevoke:()=>void):void {
  planFor(s); issuedDefinitions.add(s.definition); const p=proofs.get(s); if(p?.revoked)return deny(); if(!p)proofs.set(s,{seal:seal(s),current,renewing,onRevoke,revoked:false})
}
function current(s:R1NodeFormsSnapshot) {
  const p=proofs.get(s);if(!p||p.revoked)return deny();const revoke=()=>{p.revoked=true;p.onRevoke()}
  let valid=false
  // Serialization failures are observed seal failures too. Only a successfully
  // sealed, independently authorized own-reader gap may await renewal.
  try{if(p.seal!==seal(s)){revoke();return deny()};valid=p.current()}catch(error){revoke();throw error}
  if(!valid){let renewing=false;try{renewing=p.renewing()}catch(error){revoke();throw error};if(renewing)return deny();revoke();return deny()}
  try{return planFor(s)}catch(error){revoke();throw error}
}
function states(plan:ReturnType<typeof planFor>,v:Readonly<Record<string,unknown>>) { return plan.entries.map(e=>{const x=evaluateFieldState(e.schema,{values:v,surface:ACTION_FORM_SURFACE});return[x.capability,x.visible,x.readOnly,x.required]}) }
function literals(plan:ReturnType<typeof planFor>,values:Readonly<Record<string,unknown>>) {
  if(!object(values)||Object.keys(values).length>50||Object.keys(values).some(k=>!plan.keys.has(k)))return deny()
  const runtime:Record<string,unknown>={...values}
  for(const e of plan.entries)if(Object.hasOwn(values,e.field.valueKey)){
    const v=values[e.field.valueKey];if(v===null||v===undefined)return deny()
    if(e.kind==='file'){
      if(!isR1NormalImageWireArray(v)||v.length>e.max!)return deny()
      runtime[e.field.valueKey]=v.map(f=>({url:f.url,fileName:f.name,extension:f.extname}))
    }else if(e.kind==='path'){if(!completePath(e.field.options!,v))return deny()}
    else if(e.kind==='choice'){
      if(!Array.isArray(v)||v.length>30||new Set(v).size!==v.length||v.some(x=>!text(x)||!e.field.options!.some(o=>o.value===x)))return deny()
    }else{
      if(Array.isArray(v)||typeof v==='object'||typeof v==='number'&&!Number.isFinite(v))return deny()
      if(v==='')continue
      if(e.kind==='switch'&&v!=='1'&&v!=='0')return deny()
      if(e.kind==='rate'&&(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>5))return deny()
    }
  }
  return runtime
}
export function normalizeR1OrdinaryCreate(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>):Record<string,Value> {
  const plan=current(s),runtime=literals(plan,values)
  for(const e of plan.entries){const x=evaluateFieldState(e.schema,{values,surface:ACTION_FORM_SURFACE});if((!x.visible||x.readOnly)&&Object.hasOwn(values,e.field.valueKey))return deny()}
  const result=normalizeSubmission({fields:plan.entries.map(e=>e.schema),values:runtime,conditionValues:values,surface:ACTION_FORM_SURFACE})
  if(!result.ok||!Object.keys(result.value.values).length)return deny()
  const out:Record<string,Value>={}
  for(const [k,v]of Object.entries(result.value.values)){
    const e=plan.entries.find(e=>e.field.valueKey===k)!
    if(e.kind==='file'){
      const raw=values[k];if(!isR1NormalImageWireArray(raw))return deny();out[k]=Object.freeze(raw.map(f=>Object.freeze({...f})))
    }else if(Array.isArray(v))out[k]=Object.freeze([...v] as string[])
    else if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')out[k]=v
    else return deny()
  }
  if(JSON.stringify(states(plan,values))!==JSON.stringify(states(plan,out)))return deny()
  return Object.freeze(out)
}
export function projectR1OrdinaryCreate(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>) {
  try{return current(s).entries.map(e=>{const x=evaluateFieldState(e.schema,{values,surface:ACTION_FORM_SURFACE});return{fieldId:e.field.fieldId,valueKey:e.field.valueKey,label:e.field.label,type:e.field.type,required:x.required,readOnly:x.readOnly,options:e.schema.inlineOptions??[],multiple:Boolean(e.field.multiple),visible:x.visible,supported:x.capability==='SUPPORTED_GENERIC'&&x.visible&&!x.readOnly&&(e.kind!=='file'||e.max!>0)}})}catch{return[]}
}
export const isR1OrdinaryFileEligible=(s:R1NodeFormsSnapshot,id:string,values:Readonly<Record<string,unknown>>)=>projectR1OrdinaryCreate(s,values).some(f=>f.fieldId===id&&f.type==='file'&&f.supported)
/** Queue adapter validates non-file arrays with the same current plan; it never
 * skips a file task, creates a receipt, or changes queue provenance. */
export function assertR1OrdinaryNonFileValues(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>):void { literals(current(s),values) }
export function updateR1OrdinaryCreateDraft(s:R1NodeFormsSnapshot,values:Readonly<Record<string,R1LocalFieldValue>>,key:string,value:R1LocalFieldValue):Record<string,R1LocalFieldValue> {
  const plan=current(s),changed=plan.entries.find(e=>e.field.valueKey===key);if(!changed)return deny()
  const before=evaluateFieldState(changed.schema,{values,surface:ACTION_FORM_SURFACE});if(!before.visible||before.readOnly)return deny()
  if(plan.entries.some(e=>Object.hasOwn(values,e.field.valueKey)&&!evaluateFieldState(e.schema,{values,surface:ACTION_FORM_SURFACE}).visible))return deny()
  const next:Record<string,unknown>={...values,[key]:value};literals(plan,next)
  const removed=new Set<string>()
  for(let pass=0;pass<=plan.entries.length;pass++){
    const hidden=plan.entries.filter(e=>Object.hasOwn(next,e.field.valueKey)&&!evaluateFieldState(e.schema,{values:next,surface:ACTION_FORM_SURFACE}).visible)
    if(!hidden.length){
      if(plan.entries.some(e=>removed.has(e.field.valueKey)&&evaluateFieldState(e.schema,{values:next,surface:ACTION_FORM_SURFACE}).visible))return deny()
      const controllerSchema=plan.entries.filter(e=>plan.controllers.has(e.field.valueKey)).map(e=>({...e.schema,required:false}))
      const wire=(v:Readonly<Record<string,unknown>>)=>{const x=normalizeSubmission({fields:controllerSchema,values:v,conditionValues:v,surface:ACTION_FORM_SURFACE});if(!x.ok)return deny();return x.value.values}
      const first=wire(next),second=wire(first)
      if(JSON.stringify(states(plan,next))!==JSON.stringify(states(plan,first))||JSON.stringify(states(plan,first))!==JSON.stringify(states(plan,second)))return deny()
      return Object.fromEntries(Object.entries(next).map(([k,v])=>[k,Array.isArray(v)?Object.freeze(v.map(x=>typeof x==='object'&&x!==null?Object.freeze({...x}):x)):v])) as Record<string,R1LocalFieldValue>
    }
    hidden.forEach(e=>{delete next[e.field.valueKey];removed.add(e.field.valueKey)})
  }
  return deny()
}
export function sameR1OrdinaryValue(s:R1NodeFormsSnapshot,key:string,a:unknown,b:unknown):boolean {
  return s.definition.fields?.find(f=>f.valueKey===key)?.type==='file'?sameR1NormalFileValues(a,b)
    :Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((x,i)=>typeof x==='string'&&x===b[i]):a===b
}
export function assertR1OrdinaryStored(s:R1NodeFormsSnapshot,raw:Readonly<Record<string,unknown>>,sent:Readonly<Record<string,unknown>>):void {
  if(!object(raw)||raw.exts!==undefined&&!object(raw.exts))return deny()
  for(const k of ['sid','smodule','nodeId','workflowId','state'])if(raw[k]!==sent[k])return deny()
  for(const f of s.definition.fields??[])for(const slot of [false,true]){
    const expected=slot?(sent.exts??{}) as Record<string,unknown>:sent,actual=slot?(raw.exts??{}) as Record<string,unknown>:raw
    if(Object.hasOwn(expected,f.valueKey)!==Object.hasOwn(actual,f.valueKey)||Object.hasOwn(expected,f.valueKey)&&!sameR1OrdinaryValue(s,f.valueKey,expected[f.valueKey],actual[f.valueKey]))return deny()
  }
  if(Object.keys((sent.exts??{}) as object).sort().join()!==Object.keys((raw.exts??{}) as object).sort().join())return deny()
}
