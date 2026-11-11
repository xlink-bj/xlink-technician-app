import type { FormDefinitionRead, FormValueCodec, FormFieldValue } from '@shared/ports'
import type { R1FileCreateStorage } from '@shared/form/r1-file-create-storage'
import { isR1NormalImageWireArray } from '@shared/form/r1-normal-image-contract'

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const deny = (): never => { throw Error('当前字段的后台存储位置或原文无法核实。') }
// backend@5fc008d Survey.java:20–30,41. These are DTO storage types, not
// form definitions, required/max rules or field-pair selection.
const doubles = new Set(['length','width','height','perimeter','planeArea','squareMeter','gapLength'])
const strings = new Set(['memo','surveyTime'])
const files = new Set(['infraredImageList','surveyDrawing'])
const declared = new Set([...doubles,...strings,...files,'surveyDrawing','part','leakageCause','area','serviceGoods',
  'surveyNum','name','phone','address','supervisorName','supervisorPhone','orderId','contractId','contractdocNum',
  'sid','serviceAppointmentNum','sourceType','serviceType','nodeId','province','city','district','surveyPDFUrl','progress'])
const scalarTypes = new Set(['text','textarea','phone','IDNumber','date','time','datetime','radio','select'])

/** SOURCE ExtFormServiceImpl checks special colName before type0. Unknown
 * typed roots cannot use the Map route; arbitrary extension keys use Map exts. */
export function configuredFileStorage(definition: FormDefinitionRead, ext: Readonly<Record<string,unknown>>): R1FileCreateStorage | undefined {
  if(ext._id!==definition.id || typeof ext.colName!=='string' || !ext.colName || ext.colName.trim()!==ext.colName)return
  const kind = ext.type==='0'&&!['survey','inspectionAppointment','serviceAppointment'].includes(ext.colName)
    ? 'generic-map' : ext.type==='1'&&ext.colName==='survey' ? 'survey-dto' : undefined
  if(!kind || !definition.fields?.length)return
  const mapped=[]
  for(const f of definition.fields){
    if(typeof f.preset!=='boolean'||/[.$\p{Cc}\p{Cf}]/u.test(f.valueKey))return
    if(kind==='survey-dto'&&(f.preset||declared.has(f.valueKey))){
      if(f.type==='file'?!files.has(f.valueKey):['number','digit'].includes(f.type)?!doubles.has(f.valueKey):!scalarTypes.has(f.type)||!strings.has(f.valueKey))return
    }
    const slots: ('root'|'exts')[]=f.preset?['root']:kind==='generic-map'||declared.has(f.valueKey)?['root','exts']:['exts']
    mapped.push(Object.freeze({fieldId:f.fieldId,valueKey:f.valueKey,type:f.type,max:Math.min(10,f.presentation?.max??10),slots:Object.freeze(slots)}))
  }
  return Object.freeze({kind,definitionId:String(definition.id),colName:ext.colName,fields:Object.freeze(mapped)})
}
const equal = (left: unknown, right: unknown): boolean => Array.isArray(right)
  ? isR1NormalImageWireArray(left)&&isR1NormalImageWireArray(right)&&left.length===right.length
    &&left.every((v,i)=>v.url===right[i]!.url&&v.name===right[i]!.name&&v.extname===right[i]!.extname)
  : ['string','number','boolean'].includes(typeof right)&&left===right

/** Always inspect raw slots. The general mapper's EXTS-first projection is
 * not evidence that a contradictory root copy was absent or equal. */
export function assertConfiguredFileOriginal(storage:R1FileCreateStorage,raw:Readonly<Record<string,unknown>>,expected?:Readonly<Record<string,unknown>>):void{
  if(!object(raw)||Object.hasOwn(raw,'exts')&&!object(raw.exts))return deny()
  const ext=(raw.exts??{}) as Record<string,unknown>
  if(expected&&Object.keys(expected).some(key=>!storage.fields.some(f=>f.valueKey===key)))return deny()
  if(expected&&Object.keys(ext).some(key=>!Object.hasOwn(expected,key)||!storage.fields.some(f=>f.valueKey===key&&f.slots.includes('exts'))))return deny()
  for(const f of storage.fields){
    if(f.slots.length===2&&(Object.hasOwn(raw,f.valueKey)!==Object.hasOwn(ext,f.valueKey)
      ||Object.hasOwn(raw,f.valueKey)&&!equal(raw[f.valueKey],ext[f.valueKey])))return deny()
    const submitted=Boolean(expected&&Object.hasOwn(expected,f.valueKey))
    for(const slot of ['root','exts'] as const){
      const target=slot==='root'?raw:ext,own=Object.hasOwn(target,f.valueKey),value=target[f.valueKey],canonical=f.slots.includes(slot)
      // Omission is strict absence, not DTO null or fabricated [] equivalence.
      if(expected&&!submitted){if(own)return deny();continue}
      if(!canonical){if(own)return deny();continue}
      if(expected&&(!own||!equal(value,expected[f.valueKey])))return deny()
      if(own&&f.type==='file'&&(!isR1NormalImageWireArray(value)||value.length>f.max))return deny()
      if(own&&f.type!=='file'&&!['string','number','boolean'].includes(typeof value))return deny()
    }
  }
}
export function createConfiguredFileCodec(storage:R1FileCreateStorage,options:{readonly allowLegacyNull?:boolean}={}):FormValueCodec{
  const fields=storage.fields.filter(f=>f.type==='file')
  return {decode(value,context){
    const f=fields.find(f=>f.valueKey===context.valueKey);if(!f)return undefined
    if(value===null&&options.allowLegacyNull)return null
    if(!isR1NormalImageWireArray(value)||value.length>f.max)return deny()
    return value.map(v=>({...v})) as FormFieldValue
  },encode(){return deny()}}
}
