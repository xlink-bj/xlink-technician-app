import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import type { R1LocalFieldValue } from './r1-local-form-fields'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import { evaluateFieldState, isFieldApplicable, normalizeSubmission } from '@runtimes/dynamic-form'

const deny = (): never => { throw Error('普通开关或评分首次新建的来源、配置或值尚未核实。') }
const types = new Set(['text','textarea','phone','IDNumber','number','digit','date','time','datetime','radio','select','switch','rate'])
const reserved = new Set(['id','_id','dataId','formDataId','formDefId','definitionId','extId','tenantId','userId','roleId','sid','smodule','state','nodeId','runtimeNodeId','workOrderId','workflowId','workflowRunId','runId','workflow','formDefinitionId','dataStr','exts','__proto__','prototype','constructor','createTime','createDateTime','createUser','createUserName','updateTime','updateDateTime','updateUser','updateUserName','orgId','belongTo','_version','_class','fieldId','sessionRef'])
const valid = (v:unknown):v is string => typeof v==='string'&&v.length>0&&v.length<=120&&v.trim()===v&&!/[,.\u0000-\u001f\u007f]/.test(v)
export const hasR1SwitchRate = (s:R1NodeFormsSnapshot) => Boolean(s.definition.fields?.some(f=>f.type==='switch'||f.type==='rate'))

function schemaFor(s:R1NodeFormsSnapshot) {
 const fields=s.definition.fields,fill=s.fillableFieldIds,ro=s.node.formFieldIdsReadOnly
 if(!hasR1SwitchRate(s)||s.node.sourceNodeType!=='forms'||s.definition.purpose!==undefined||s.records.length!==0
   ||!fields?.length||fields.length>50||!Array.isArray(fill)||!Array.isArray(ro)||ro.length
   ||fill.length!==fields.length||new Set(fill).size!==fill.length
   ||new Set(fields.map(f=>f.fieldId)).size!==fields.length||new Set(fields.map(f=>f.valueKey)).size!==fields.length)return deny()
 const schema=fields.map(f=>{
  if(!valid(f.fieldId)||!valid(f.valueKey)||reserved.has(f.valueKey)||!fill.includes(f.fieldId)
   ||!types.has(f.type)||typeof f.preset!=='boolean'||typeof f.required!=='boolean'||f.readOnly!==false
   ||f.multiple||f.visibility!==undefined||f.unsupportedReason||f.presentationOnly
   ||f.presentation&&Object.entries(f.presentation).some(([k,v])=>k!=='customizeFlag'||typeof v!=='boolean'))return deny()
  if(f.type==='select'||f.type==='radio'){
   if(!f.valueOption||!f.options?.length||new Set(f.options.map(o=>o.value)).size!==f.options.length
    ||f.options.some(o=>!valid(o.value)||!o.label||o.children?.length))return deny()
  }else if(f.valueOption||f.options?.length)return deny()
  const field=actionFormSchemaFor(f),state=evaluateFieldState(field,{values:{},surface:ACTION_FORM_SURFACE})
  if(!isFieldApplicable(field,ACTION_FORM_SURFACE)||!state.visible||state.readOnly||state.capability!=='SUPPORTED_GENERIC')return deny()
  return field
 })
 return {fields,schema}
}
/** Structural applicability only, not a grant or storage proof. */
export function supportsR1SwitchRateCreate(s:R1NodeFormsSnapshot):boolean {try{schemaFor(s);return true}catch{return false}}
const seal=(s:R1NodeFormsSnapshot)=>JSON.stringify([s.workOrderId,s.node,s.definition,s.fillableFieldIds])
const evidence=new WeakMap<R1NodeFormsSnapshot,{seal:string;current:()=>boolean;revoked:boolean}>()
/** Installed only by the normal provider after its private reader type0 proof
 * and exact version1 create grant. Drafts cannot select this storage strategy. */
export function bindR1SwitchRateCreate(s:R1NodeFormsSnapshot,current:()=>boolean):void {
 schemaFor(s)
 const prior=evidence.get(s)
 if(prior?.revoked)return deny()
 if(!prior)evidence.set(s,{seal:seal(s),current,revoked:false})
}
function current(s:R1NodeFormsSnapshot){
 const e=evidence.get(s)
 if(!e||e.revoked)return deny()
 try{if(e.seal!==seal(s)||!e.current()){e.revoked=true;return deny()}}catch(error){e.revoked=true;throw error}
 return schemaFor(s)
}
function literalValues(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>){
 const {fields,schema}=current(s)
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>50
  ||Object.keys(values).some(k=>!fields.some(f=>f.valueKey===k)))return deny()
 for(const f of fields){
  if(!Object.hasOwn(values,f.valueKey))continue
  const v=values[f.valueKey]
  // Own undefined/null is malformed, independently of optional omission.
  if(v===undefined||v===null||Array.isArray(v)||typeof v==='object')return deny()
  if(v==='')continue
  if(f.type==='switch'&&v!=='1'&&v!=='0')return deny()
  if(f.type==='rate'&&(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>5))return deny()
 }
 return schema
}
export function normalizeR1SwitchRateCreate(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>):Record<string,string|number|boolean>{
 const schema=literalValues(s,values)
 const result=normalizeSubmission({fields:schema,values,surface:ACTION_FORM_SURFACE})
 if(!result.ok||!Object.keys(result.value.values).length)return deny()
 const out:Record<string,string|number|boolean>={}
 for(const [k,v]of Object.entries(result.value.values)){
  if(!['string','number','boolean'].includes(typeof v))return deny()
  out[k]=v as string|number|boolean
 }
 return Object.freeze(out)
}
export function projectR1SwitchRateFields(s:R1NodeFormsSnapshot){
 try{return current(s).schema.map((f,i)=>{const state=evaluateFieldState(f,{values:{},surface:ACTION_FORM_SURFACE});return {
  fieldId:f.fieldId,valueKey:f.valueKey,label:s.definition.fields![i]!.label,type:f.type,required:state.required,
  readOnly:state.readOnly,options:f.inlineOptions??[],multiple:false,visible:true,supported:true}})}catch{return []}
}
/** No condition controller is admitted in this first slice. The old scalar
 * hidden transition is never applied to these new Runtime types. */
export function updateR1SwitchRateDraft(s:R1NodeFormsSnapshot,values:Readonly<Record<string,R1LocalFieldValue>>,key:string,value:R1LocalFieldValue){
 if(!s.definition.fields?.some(f=>f.valueKey===key))return deny()
 const next={...values,[key]:value};literalValues(s,next);return next
}
