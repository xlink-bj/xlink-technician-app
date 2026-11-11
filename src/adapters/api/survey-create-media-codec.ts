import type {FormValueCodec,FormFieldValue} from '@shared/ports'
import {isR1NormalImageWireArray} from '@shared/form/r1-normal-image-contract'
/** Bound by the reader only after positive typed source validation. No grants. */
export function createSurveyCreateMediaCodec():FormValueCodec{
 return {decode(value,context){
  if(!['infraredImageList','images1'].includes(context.valueKey))return undefined
  if(value===null)return null
  if(!isR1NormalImageWireArray(value))throw Error('勘查附件原件格式无法核实')
  return value.map(v=>({...v})) as FormFieldValue
 },encode(){throw Error('Typed media commands require receipt-backed saveOnly')}}
}
