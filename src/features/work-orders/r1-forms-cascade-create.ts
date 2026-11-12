import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import type { R1LocalFieldValue } from './r1-local-form-fields'
import type { FormFieldOptionRead } from '@shared/ports'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import { evaluateFieldState, isFieldApplicable, normalizeSubmission } from '@runtimes/dynamic-form'

const deny = (): never => { throw Error('普通级联首次新建的来源、完整路径或配置尚未核实。') }
const scalars = new Set(['text','textarea','phone','IDNumber','number','digit','date','time','datetime','radio','select'])
const reserved = new Set(['id','_id','dataId','formDataId','formDefId','definitionId','extId','tenantId','userId','roleId','sid','smodule','state','nodeId','runtimeNodeId','workOrderId','workflowId','workflowRunId','runId','workflow','formDefinitionId','dataStr','exts','__proto__','prototype','constructor','createTime','createDateTime','createUser','createUserName','updateTime','updateDateTime','updateUser','updateUserName','orgId','belongTo','_version','_class','fieldId','sessionRef'])
const text = (v:unknown,max=256):v is string => typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v)
/** Selection only; never substitutes for the provider's private type0 route. */
export const hasR1FormsCascade = (s:R1NodeFormsSnapshot) => s.node.sourceNodeType==='forms'&&Boolean(s.definition.fields?.some(f=>f.type==='cascade'))
export function verifiedTree(options:readonly FormFieldOptionRead[]) {
 let count=0
 const visit=(level:readonly FormFieldOptionRead[],depth:number):void=>{
  if(!Array.isArray(level)||level.length&&depth>20||new Set(level.map(o=>o.value)).size!==level.length)return deny()
  for(const o of level){if(++count>5000||!text(o.value)||!text(o.label,512)||!Array.isArray(o.children))return deny();visit(o.children,depth+1)}
 }
 visit(options,1)
}
function schemaFor(s:R1NodeFormsSnapshot) {
 const fields=s.definition.fields,fill=s.fillableFieldIds,ro=s.node.formFieldIdsReadOnly
 if(!hasR1FormsCascade(s)||s.definition.purpose!==undefined||s.records.length!==0||!fields?.length||fields.length>50
  ||!Array.isArray(fill)||!Array.isArray(ro)||ro.length||fill.length!==fields.length||new Set(fill).size!==fill.length
  ||new Set(fields.map(f=>f.fieldId)).size!==fields.length||new Set(fields.map(f=>f.valueKey)).size!==fields.length)return deny()
 const schema=fields.map(f=>{
  if(!text(f.fieldId)||!text(f.valueKey,120)||/[,.]/.test(f.valueKey)||reserved.has(f.valueKey)||!fill.includes(f.fieldId)
   ||typeof f.required!=='boolean'||typeof f.preset!=='boolean'||f.readOnly!==false||f.visibility!==undefined||f.unsupportedReason||f.presentationOnly
   ||f.type!=='cascade'&&(!scalars.has(f.type)||f.multiple)||f.type==='cascade'&&f.multiple!==undefined&&f.multiple!==false
   ||f.presentation&&Object.entries(f.presentation).some(([k,v])=>k!=='customizeFlag'||typeof v!=='boolean'))return deny()
  if(f.type==='cascade'){
   if(!f.valueOption||!f.options?.length)return deny();verifiedTree(f.options)
  }else if(f.type==='radio'||f.type==='select'){
   if(!f.valueOption||!f.options?.length||f.options.length>5000||new Set(f.options.map(o=>o.value)).size!==f.options.length
    ||f.options.some(o=>!text(o.value)||!text(o.label,512)||o.children?.length))return deny()
  }else if(f.valueOption||f.options?.length)return deny()
  const field=actionFormSchemaFor(f),state=evaluateFieldState(field,{values:{},surface:ACTION_FORM_SURFACE})
  if(!isFieldApplicable(field,ACTION_FORM_SURFACE)||!state.visible||state.readOnly||state.capability!=='SUPPORTED_GENERIC')return deny()
  return field
 })
 return{fields,schema}
}
export function supportsR1FormsCascadeCreate(s:R1NodeFormsSnapshot):boolean {try{schemaFor(s);return true}catch{return false}}
const seal=(s:R1NodeFormsSnapshot)=>JSON.stringify([s.workOrderId,s.node,s.definition,s.fillableFieldIds,s.records])
const proofs=new WeakMap<R1NodeFormsSnapshot,{seal:string;current:()=>boolean;renewing:()=>boolean;onRevoke:()=>void;revoked:boolean}>()
/** Only the normal provider binds after exact grant and current reader route.
 * That route requires a raw boolean multiple. The mapper omits false, so
 * absent mapped multiple is false only under this positive raw provenance. */
export function bindR1FormsCascadeCreate(s:R1NodeFormsSnapshot,current:()=>boolean,renewing:()=>boolean,onRevoke:()=>void):void {
 schemaFor(s);const prior=proofs.get(s);if(prior?.revoked)return deny()
 if(!prior)proofs.set(s,{seal:seal(s),current,renewing,onRevoke,revoked:false})
}
/** Provider observes a prior failed binding check without recursively calling current. */
export const isR1FormsCascadeRevoked=(s:R1NodeFormsSnapshot)=>proofs.get(s)?.revoked===true
function current(s:R1NodeFormsSnapshot) {
 const p=proofs.get(s);if(!p||p.revoked)return deny()
 const revoke=()=>{p.revoked=true;p.onRevoke()}
 let valid=false
 try{if(p.seal!==seal(s)){revoke();return deny()};valid=p.current()}catch(e){revoke();throw e}
 if(!valid){
  // Only the provider's own current-null renewal window is transient. It
  // independently checked grant/actor/schema before reporting that window.
  let renewing=false
  try{renewing=p.renewing()}catch(e){revoke();throw e}
  if(renewing)return deny()
  revoke();return deny()
 }
 try{return schemaFor(s)}catch(e){revoke();throw e}
}

export function completePath(options:readonly FormFieldOptionRead[],value:unknown):boolean {
 if(!Array.isArray(value)||value.length>20||value.some(v=>!text(v)))return false
 if(!value.length)return true
 let level=options
 for(const segment of value){const node=level.find(o=>o.value===segment);if(!node||!Array.isArray(node.children))return false;level=node.children}
 return level.length===0
}
function literalValues(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>) {
 const {fields,schema}=current(s)
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>50||Object.keys(values).some(k=>!fields.some(f=>f.valueKey===k)))return deny()
 for(const f of fields)if(Object.hasOwn(values,f.valueKey)){
  const v=values[f.valueKey]
  if(v===undefined||v===null)return deny()
  if(f.type==='cascade'){if(!completePath(f.options!,v))return deny()}
  else if(Array.isArray(v)||typeof v==='object')return deny()
 }
 return schema
}
export function normalizeR1FormsCascadeCreate(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>):Record<string,string|number|boolean|readonly string[]> {
 const schema=literalValues(s,values),result=normalizeSubmission({fields:schema,values,surface:ACTION_FORM_SURFACE})
 if(!result.ok||!Object.keys(result.value.values).length)return deny()
 const out:Record<string,string|number|boolean|readonly string[]>={}
 for(const [k,v]of Object.entries(result.value.values)){
  if(Array.isArray(v))out[k]=Object.freeze([...v] as string[])
  else if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')out[k]=v
  else return deny()
 }
 return Object.freeze(out)
}
export function projectR1FormsCascadeFields(s:R1NodeFormsSnapshot) {
 try{return current(s).schema.map((f,i)=>({fieldId:f.fieldId,valueKey:f.valueKey,label:s.definition.fields![i]!.label,type:f.type,
  required:f.required!,readOnly:false,options:f.inlineOptions??[],multiple:false,visible:true,supported:true}))}catch{return []}
}
export function updateR1FormsCascadeDraft(s:R1NodeFormsSnapshot,values:Readonly<Record<string,R1LocalFieldValue>>,key:string,value:R1LocalFieldValue) {
 if(!s.definition.fields?.some(f=>f.valueKey===key))return deny()
 const next={...values,[key]:value};literalValues(s,next)
 return Object.fromEntries(Object.entries(next).map(([k,v])=>[k,Array.isArray(v)?Object.freeze([...v]):v])) as Record<string,R1LocalFieldValue>
}
