import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import { ACTION_FORM_SURFACE, actionFormSchemaFor } from './action-form-schema'
import { evaluateFieldState, evaluateVisibility, normalizeSubmission } from '@runtimes/dynamic-form'

const deny=():never=>{throw Error('普通多选首次新建的字段、选项或存储尚未核实。')}
const scalarTypes=new Set(['text','textarea','phone','IDNumber','number','digit','date','time','datetime','radio','select'])
const reserved=new Set(['id','_id','dataId','formDataId','formDefId','definitionId','extId','tenantId','userId','roleId','sid','smodule','state','nodeId','runtimeNodeId','workOrderId','workflowId','workflowRunId','runId','workflow','formDefinitionId','dataStr','exts','__proto__','prototype','constructor','createTime','createDateTime','createUser','createUserName','updateTime','updateDateTime','updateUser','updateUserName','orgId','belongTo','_version','_class','fieldId','sessionRef'])
const valid=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v)
const choice=(f:{type:string;multiple?:boolean})=>f.type==='checkbox'||f.type==='select'&&f.multiple===true
/** Branch selection only. The provider additionally requires private type0 source evidence. */
export const usesR1FormsChoiceCreate=(s:R1NodeFormsSnapshot)=>s.node.sourceNodeType==='forms'&&s.records.length===0&&Boolean(s.definition.fields?.some(choice))
function schemaFor(s:R1NodeFormsSnapshot){
 const fields=s.definition.fields,ro=s.node.formFieldIdsReadOnly,fill=s.fillableFieldIds
 if(!usesR1FormsChoiceCreate(s)||!fields?.length||fields.length>50||s.definition.purpose!==undefined||!Array.isArray(ro)||!Array.isArray(fill)
  ||new Set(fields.map(f=>f.fieldId)).size!==fields.length||new Set(fields.map(f=>f.valueKey)).size!==fields.length
  ||new Set(ro).size!==ro.length||new Set(fill).size!==fill.length||ro.some(id=>!fields.some(f=>f.fieldId===id)))return deny()
 const writable=fields.filter(f=>!f.readOnly&&!ro.includes(f.fieldId))
 if(!writable.length||fill.length!==writable.length||fill.some(id=>!writable.some(f=>f.fieldId===id)))return deny()
 const keys=new Set(fields.map(f=>f.valueKey))
 const condition=(v:unknown):void=>{
  if(v===undefined)return
  if(!v||typeof v!=='object'||Array.isArray(v))return deny()
  const c=v as {kind:string;conditions?:unknown[];path?:unknown}
  if(c.kind==='all'){if(!c.conditions?.length)return deny();c.conditions.forEach(condition);return}
  const path=Array.isArray(c.path)&&c.path.length===1?c.path[0]:c.path
  if(!valid(path)||!keys.has(path)||path.includes('.')||evaluateVisibility(v as never,{}).state==='unsupported')return deny()
 }
 const schema=fields.map(f=>{
  if(!valid(f.fieldId)||!valid(f.valueKey)||f.valueKey.length>120||reserved.has(f.valueKey)||typeof f.preset!=='boolean'
   ||typeof f.required!=='boolean'||typeof f.readOnly!=='boolean'||f.unsupportedReason||f.presentationOnly
   ||(!choice(f)&&(!scalarTypes.has(f.type)||f.multiple))||f.multiple!==undefined&&typeof f.multiple!=='boolean')return deny()
  if(f.presentation&&Object.entries(f.presentation).some(([k,v])=>k!=='customizeFlag'||typeof v!=='boolean'))return deny()
  condition(f.visibility)
  if(choice(f)||f.type==='radio'||f.type==='select'){
   if(!valid(f.valueOption)||!f.options?.length||f.options.length>5000||new Set(f.options.map(o=>o.value)).size!==f.options.length
    ||f.options.some(o=>!valid(o.value)||!valid(o.label)||o.children?.length))return deny()
  }else if(f.valueOption)return deny()
  const schema=actionFormSchemaFor({...f,readOnly:f.readOnly||ro.includes(f.fieldId)})
  if(evaluateFieldState(schema,{values:{},surface:ACTION_FORM_SURFACE}).capability!=='SUPPORTED_GENERIC')return deny()
  return schema
 })
 return{fields,schema}
}
export function projectR1FormsChoiceFields(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>){
 try{return schemaFor(s).schema.map((f,i)=>{const state=evaluateFieldState(f,{values,surface:ACTION_FORM_SURFACE});return{fieldId:f.fieldId,valueKey:f.valueKey,label:s.definition.fields![i]!.label,type:f.type,required:state.required,readOnly:state.readOnly,options:f.inlineOptions??[],multiple:Boolean(f.multiple),visible:state.visible,supported:state.visible&&!state.readOnly&&state.capability==='SUPPORTED_GENERIC'}})}catch{return[]}
}
export function normalizeR1FormsChoiceCreate(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>):Record<string,string|number|boolean|readonly string[]>{
 const {fields,schema}=schemaFor(s)
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>50||Object.keys(values).some(k=>!fields.some(f=>f.valueKey===k)))return deny()
 for(const f of schema){
  const state=evaluateFieldState(f,{values,surface:ACTION_FORM_SURFACE}),own=Object.hasOwn(values,f.valueKey)
  if((!state.visible&&own)||(state.readOnly&&(own||state.required)))return deny()
  if(choice(f)&&own){const v=values[f.valueKey];if(!Array.isArray(v)||v.length>30||new Set(v).size!==v.length||v.some(x=>!valid(x)))return deny()}
 }
 const result=normalizeSubmission({fields:schema,values,conditionValues:values,surface:ACTION_FORM_SURFACE});if(!result.ok)return deny()
 const out:Record<string,string|number|boolean|readonly string[]>={}
 for(const [k,v]of Object.entries(result.value.values)){
  if(Array.isArray(v)){if(!choice(fields.find(f=>f.valueKey===k)!))return deny();out[k]=Object.freeze([...v] as string[])}
  else if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')out[k]=v
  else return deny()
 }
 const states=(v:Readonly<Record<string,unknown>>)=>schema.map(f=>{const x=evaluateFieldState(f,{values:v,surface:ACTION_FORM_SURFACE});return[x.visible,x.readOnly,x.required,x.capability]})
 if(!Object.keys(out).length||JSON.stringify(states(values))!==JSON.stringify(states(out)))return deny()
 return Object.freeze(out)
}
/** Only new-record drafts in this schema. Existing originals are never cleaned. */
export function transitionR1FormsChoiceDraft(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>){
 const {schema}=schemaFor(s),controllers=new Set<string>()
 const collect=(v:unknown):void=>{
  if(!v)return
  const c=v as {kind:string;conditions?:unknown[];path:string|readonly string[]}
  if(c.kind==='all'){c.conditions!.forEach(collect);return}
  controllers.add(Array.isArray(c.path)?c.path[0]!:c.path as string)
 }
 schema.forEach(f=>collect(f.visibility))
 // Use the same Runtime codecs/omission as submission, without making an
 // incomplete required draft invalid. Only condition controllers participate.
 const projected=normalizeSubmission({fields:schema.filter(f=>controllers.has(f.valueKey)).map(f=>({...f,required:false})),
  values,conditionValues:values,surface:ACTION_FORM_SURFACE})
 if(!projected.ok)return deny()
 const wireContext={...values}
 controllers.forEach(k=>delete wireContext[k]);Object.assign(wireContext,projected.value.values)
 const states=(v:Readonly<Record<string,unknown>>)=>schema.map(f=>{const x=evaluateFieldState(f,{values:v,surface:ACTION_FORM_SURFACE});return[x.visible,x.readOnly,x.required,x.capability]})
 if(JSON.stringify(states(values))!==JSON.stringify(states(wireContext)))return deny()
 const out={...values}
 for(const f of schema)if(!evaluateFieldState(f,{values,surface:ACTION_FORM_SURFACE}).visible)delete out[f.valueKey]
 // Hidden controllers were omitted from wireContext as well. No cascade may
 // become newly required merely because cleanup removed its raw controller.
 if(JSON.stringify(states(out))!==JSON.stringify(states(wireContext)))return deny()
 return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,Array.isArray(v)?Object.freeze([...v]):v]))
}
export function sameR1ChoiceValue(a:unknown,b:unknown):boolean{
 return Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>typeof v==='string'&&v===b[i]):a===b
}
/** Exact declared root/EXTS slots, including omitted optional fields. No flattened ACK proof. */
export function assertR1FormsChoiceStored(s:R1NodeFormsSnapshot,raw:Readonly<Record<string,unknown>>,sent:Readonly<Record<string,unknown>>):void{
 const object=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v))
 if(!object(raw)||raw.exts!==undefined&&!object(raw.exts))return deny()
 for(const k of ['sid','smodule','nodeId','workflowId','state'])if(raw[k]!==sent[k])return deny()
 for(const f of s.definition.fields??[])for(const slot of ['root','exts']){
  const expected=slot==='root'?sent:(sent.exts??{}) as Record<string,unknown>,actual=slot==='root'?raw:(raw.exts??{}) as Record<string,unknown>
  if(Object.hasOwn(expected,f.valueKey)!==Object.hasOwn(actual,f.valueKey)||Object.hasOwn(expected,f.valueKey)&&!sameR1ChoiceValue(expected[f.valueKey],actual[f.valueKey]))return deny()
 }
 const expectedExts=(sent.exts??{}) as Record<string,unknown>,actualExts=(raw.exts??{}) as Record<string,unknown>
 if(Object.keys(expectedExts).sort().join()!==Object.keys(actualExts).sort().join())return deny()
}
