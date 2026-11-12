import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import type { R1LocalFieldValue } from './r1-local-form-fields'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import { evaluateFieldState, isFieldApplicable, normalizeSubmission } from '@runtimes/dynamic-form'

const deny=():never=>{throw Error('普通混排首次新建的字段、选项、状态值或来源尚未核实。')}
const scalarTypes=new Set(['text','textarea','phone','IDNumber','number','digit','date','time','datetime','radio','select'])
const reserved=new Set(['id','_id','dataId','formDataId','formDefId','definitionId','extId','tenantId','userId','roleId','sid','smodule','state','nodeId','runtimeNodeId','workOrderId','workflowId','workflowRunId','runId','workflow','formDefinitionId','dataStr','exts','__proto__','prototype','constructor','createTime','createDateTime','createUser','createUserName','updateTime','updateDateTime','updateUser','updateUserName','orgId','belongTo','_version','_class','fieldId','sessionRef'])
const text=(v:unknown,max=256):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v)
const flat=(f:{type:string;multiple?:boolean})=>f.type==='checkbox'||f.type==='select'&&f.multiple===true
/** Metadata selection only. Positive private type0 route and exact grant are separate. */
export const hasR1FormsMixed=(s:R1NodeFormsSnapshot)=>s.node.sourceNodeType==='forms'
 &&Boolean(s.definition.fields?.some(f=>f.type==='switch'||f.type==='rate'))&&Boolean(s.definition.fields?.some(flat))
type Kind='scalar'|'switch'|'rate'|'flat'
function planFor(s:R1NodeFormsSnapshot){
 const fields=s.definition.fields,fill=s.fillableFieldIds,ro=s.node.formFieldIdsReadOnly
 if(!hasR1FormsMixed(s)||s.definition.purpose!==undefined||s.records.length!==0||!fields?.length||fields.length>50
  ||!Array.isArray(fill)||!Array.isArray(ro)||ro.length||fill.length!==fields.length||new Set(fill).size!==fill.length
  ||new Set(fields.map(f=>f.fieldId)).size!==fields.length||new Set(fields.map(f=>f.valueKey)).size!==fields.length)return deny()
 return fields.map(f=>{
  const kind:Kind=flat(f)?'flat':f.type==='switch'?'switch':f.type==='rate'?'rate':'scalar'
  if(!text(f.fieldId)||!text(f.valueKey,120)||/[,.]/.test(f.valueKey)||reserved.has(f.valueKey)||!fill.includes(f.fieldId)
   ||typeof f.required!=='boolean'||typeof f.preset!=='boolean'||f.readOnly!==false||f.visibility!==undefined||f.unsupportedReason||f.presentationOnly
   ||kind==='scalar'&&!scalarTypes.has(f.type)||kind!=='flat'&&f.multiple||f.multiple!==undefined&&typeof f.multiple!=='boolean'
   ||f.presentation&&Object.entries(f.presentation).some(([k,v])=>k!=='customizeFlag'||typeof v!=='boolean'))return deny()
  if(kind==='flat'||f.type==='radio'||f.type==='select'){
   if(!f.valueOption||!f.options?.length||f.options.length>5000||new Set(f.options.map(o=>o.value)).size!==f.options.length
    ||f.options.some(o=>!text(o.value)||!text(o.label,512)||o.children?.length))return deny()
  }else if(f.valueOption||f.options?.length)return deny()
  const schema=actionFormSchemaFor(f),state=evaluateFieldState(schema,{values:{},surface:ACTION_FORM_SURFACE})
  if(!isFieldApplicable(schema,ACTION_FORM_SURFACE)||!state.visible||state.readOnly||state.capability!=='SUPPORTED_GENERIC')return deny()
  return{field:f,schema,kind}
 })
}
export function supportsR1FormsMixedCreate(s:R1NodeFormsSnapshot):boolean{try{planFor(s);return true}catch{return false}}
const seal=(s:R1NodeFormsSnapshot)=>JSON.stringify([s.workOrderId,s.node,s.definition,s.fillableFieldIds,s.records])
const proofs=new WeakMap<R1NodeFormsSnapshot,{seal:string;current:()=>boolean;renewing:()=>boolean;onRevoke:()=>void;revoked:boolean}>()
export function bindR1FormsMixedCreate(s:R1NodeFormsSnapshot,current:()=>boolean,renewing:()=>boolean,onRevoke:()=>void):void{
 planFor(s);const prior=proofs.get(s);if(prior?.revoked)return deny()
 if(!prior)proofs.set(s,{seal:seal(s),current,renewing,onRevoke,revoked:false})
}
export const isR1FormsMixedRevoked=(s:R1NodeFormsSnapshot)=>proofs.get(s)?.revoked===true
function current(s:R1NodeFormsSnapshot){
 const p=proofs.get(s);if(!p||p.revoked)return deny();const revoke=()=>{p.revoked=true;p.onRevoke()};let valid=false
 try{if(p.seal!==seal(s)){revoke();return deny()};valid=p.current()}catch(e){revoke();throw e}
 if(!valid){let renewing=false;try{renewing=p.renewing()}catch(e){revoke();throw e};if(renewing)return deny();revoke();return deny()}
 try{return planFor(s)}catch(e){revoke();throw e}
}
function literalValues(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>){
 const plan=current(s)
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>50||Object.keys(values).some(k=>!plan.some(p=>p.field.valueKey===k)))return deny()
 for(const {field:f,kind}of plan)if(Object.hasOwn(values,f.valueKey)){
  const v=values[f.valueKey];if(v===undefined||v===null)return deny()
  if(kind==='flat'){
   if(!Array.isArray(v)||v.length>30||new Set(v).size!==v.length||v.some(x=>!text(x)||!f.options!.some(o=>o.value===x)))return deny()
  }else{
   if(Array.isArray(v)||typeof v==='object')return deny()
   if(v==='')continue
   if(kind==='switch'&&v!=='1'&&v!=='0')return deny()
   if(kind==='rate'&&(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>5))return deny()
  }
 }
 return plan
}
export function normalizeR1FormsMixedCreate(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>):Record<string,string|number|boolean|readonly string[]>{
 const plan=literalValues(s,values),result=normalizeSubmission({fields:plan.map(p=>p.schema),values,surface:ACTION_FORM_SURFACE})
 if(!result.ok||!Object.keys(result.value.values).length)return deny()
 const out:Record<string,string|number|boolean|readonly string[]>={}
 for(const [k,v]of Object.entries(result.value.values)){
  if(Array.isArray(v))out[k]=Object.freeze([...v] as string[])
  else if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')out[k]=v
  else return deny()
 }
 return Object.freeze(out)
}
export function projectR1FormsMixedFields(s:R1NodeFormsSnapshot){
 try{return current(s).map(({field:f,schema})=>({fieldId:f.fieldId,valueKey:f.valueKey,label:f.label,type:f.type,
  required:f.required!,readOnly:false,options:schema.inlineOptions??[],multiple:Boolean(f.multiple),visible:true,supported:true}))}catch{return[]}
}
export function updateR1FormsMixedDraft(s:R1NodeFormsSnapshot,values:Readonly<Record<string,R1LocalFieldValue>>,key:string,value:R1LocalFieldValue){
 if(!s.definition.fields?.some(f=>f.valueKey===key))return deny()
 const next={...values,[key]:value};literalValues(s,next)
 return Object.fromEntries(Object.entries(next).map(([k,v])=>[k,Array.isArray(v)?Object.freeze([...v]):v])) as Record<string,R1LocalFieldValue>
}
