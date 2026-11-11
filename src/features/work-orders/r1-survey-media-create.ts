import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import type { R1LocalField } from './r1-local-form-fields'
import { isR1NormalImageWireArray } from '@shared/form/r1-normal-image-contract'
import type { R1FileWireValue } from '@shared/types'
const deny=():never=>{throw Error('当前勘查图片字段、数量或来源尚未核实。')}
const keys=['infraredImageList','images1'] as const
const valid=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.trim()===v&&!v.includes(',')
export function supportsSurveyMediaCreate(s:R1NodeFormsSnapshot):boolean{
 const f=s.definition.fields,fill=s.fillableFieldIds,ro=s.node.formFieldIdsReadOnly
 return s.node.sourceNodeType==='repeat'&&s.node.lifecycle==='active'&&s.node.nodeTypeEvidence==='runtime_node_def'
  &&s.definition.purpose==='survey'&&valid(s.definition.id)&&s.node.formDefinitionId===s.definition.id
  &&Array.isArray(f)&&f.length===2&&new Set(f.map(x=>x.fieldId)).size===2&&new Set(f.map(x=>x.valueKey)).size===2
  &&Array.isArray(fill)&&fill.length===2&&new Set(fill).size===2&&Array.isArray(ro)&&ro.length===0
  &&f.every(x=>valid(x.fieldId)&&fill.includes(x.fieldId)&&keys.includes(x.valueKey as never)&&x.type==='file'
   &&x.preset===(x.valueKey==='infraredImageList')&&x.required===(x.valueKey==='images1')&&x.readOnly===false&&(x.multiple===undefined||x.multiple===false)
   &&!x.unsupportedReason&&!x.presentationOnly&&!x.visibility&&!x.valueOption&&!x.options?.length
   &&Array.isArray(x.showList)&&JSON.stringify(x.showList)===JSON.stringify(['1','2','4'])
   &&x.presentation?.max===(x.valueKey==='infraredImageList'?4:10)&&!x.presentation.surveyTool)
}
export function surveyMediaSchemaIdentity(s:R1NodeFormsSnapshot):string{
 if(!supportsSurveyMediaCreate(s))return deny()
 return JSON.stringify([s.workOrderId,s.node,s.definition,s.fillableFieldIds])
}
export function isSurveyMediaFieldEligible(s:R1NodeFormsSnapshot,fieldId:string):boolean{
 return supportsSurveyMediaCreate(s)&&s.records.length===0&&s.definition.fields!.some(f=>f.fieldId===fieldId)
}
export function projectSurveyMediaFields(s:R1NodeFormsSnapshot):readonly(R1LocalField&{readonly visible:boolean})[]{
 if(!supportsSurveyMediaCreate(s))return []
 return s.definition.fields!.map(f=>({fieldId:f.fieldId,valueKey:f.valueKey,label:f.label,type:f.type,required:f.required,
  readOnly:false,visible:true,supported:s.records.length===0,multiple:false,options:[]}))
}
export function normalizeSurveyMediaCreate(s:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>):Record<string,readonly R1FileWireValue[]>{
 if(!supportsSurveyMediaCreate(s)||s.records.length!==0||!values||typeof values!=='object'||Array.isArray(values)
  ||Object.keys(values).some(k=>!keys.includes(k as never)))return deny()
 const out:Record<string,readonly R1FileWireValue[]>={},seen=new Set<string>()
 for(const f of s.definition.fields!){
  const value=values[f.valueKey]
  // This first capability proves a nonempty root + EXTS pair only. Optional
  // absent/null/empty preservation has not been measured against typed Mongo.
  if(f.valueKey==='infraredImageList'&&(!Array.isArray(value)||value.length===0))return deny()
  if(!isR1NormalImageWireArray(value)||value.length>(f.valueKey==='infraredImageList'?4:10)||(f.required&&value.length===0))return deny()
  // Empty optional file values are omitted, never passed as ambiguous string[].
  if(!value.length)continue
  for(const image of value){if(seen.has(image.name)||seen.has(image.url))return deny();seen.add(image.name);seen.add(image.url)}
  out[f.valueKey]=Object.freeze(value.map(v=>Object.freeze({...v})))
 }
 return Object.freeze(out)
}
/** Strict original-slot check; never compare only the reader's display values. */
export function assertSurveyMediaOriginal(raw:Readonly<Record<string,unknown>>,expected?:Readonly<Record<string,readonly R1FileWireValue[]>>):void{
 const exts=raw.exts
 if(exts===null||typeof exts!=='object'||Array.isArray(exts))return deny()
 const ext=exts as Record<string,unknown>
 if(Object.hasOwn(raw,'images1')||Object.hasOwn(ext,'infraredImageList'))return deny()
 for(const key of keys){
  const slot=key==='infraredImageList'?raw:ext,value=slot[key]
  if(value!==undefined&&value!==null&&!isR1NormalImageWireArray(value))return deny()
  if(key==='images1'&&(value===undefined||value===null))return deny()
  if(expected){const want=expected[key]
   if(want){if(!isR1NormalImageWireArray(value)||value.length!==want.length||value.some((v,i)=>v.url!==want[i]!.url||v.name!==want[i]!.name||v.extname!==want[i]!.extname))return deny()}
   else if(value!==undefined&&value!==null&&(!Array.isArray(value)||value.length!==0))return deny()
  }
 }
 // Unknown media roots or EXTS slots cannot be smuggled into this two-field ACK.
 for(const key of ['surveyDrawing','beforeMoldRemoval','afterMoldRemoval',...Array.from({length:19},(_,i)=>`images${i+2}`)]){
  for(const slot of [raw,ext])if(Object.hasOwn(slot,key)&&slot[key]!==null&&slot[key]!==undefined)return deny()
 }
}
