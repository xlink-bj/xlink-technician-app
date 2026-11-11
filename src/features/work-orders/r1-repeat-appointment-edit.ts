import type { R1LocalField } from './r1-local-form-fields'
import type { R1NodeFormsSnapshot, R1RepeatAppointmentRead } from './r1-node-forms-read'
import type { AppointmentFormRead } from '@shared/ports'
import { appointmentBusinessKeys, appointmentReplacementProblem } from '@shared/form/appointment-replacement-context'
import { appointmentRuntimeFieldsFor, normalizeAppointmentForm } from './appointment-form-runtime'
import { evaluateFieldState, isFieldApplicable } from '@runtimes/dynamic-form'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
const deny=():never=>{throw Error('预约记录、六字段或改约规则尚未完整核实。')}
const keys=new Set<string>(appointmentBusinessKeys)
export function appointmentEditDraft(s:R1NodeFormsSnapshot,e:R1RepeatAppointmentRead):Record<string,string>{
 const f=s.definition.fields
 if(s.node.sourceNodeType!=='repeat'||s.definition.purpose!=='appointment'||!f||f.length!==6
  ||s.node.formFieldIdsReadOnly?.length!==0||new Set(f.map(x=>x.fieldId)).size!==6||new Set(f.map(x=>x.valueKey)).size!==6
  ||f.some(x=>!x.fieldId||!keys.has(x.valueKey)||typeof x.required!=='boolean'||x.readOnly!==false||x.unsupportedReason||x.multiple||x.presentationOnly
    ||!isFieldApplicable(actionFormSchemaFor(x),ACTION_FORM_SURFACE)
    ||evaluateFieldState(actionFormSchemaFor(x),{values:{},surface:ACTION_FORM_SURFACE}).capability!=='SUPPORTED_GENERIC'
    ||(x.valueKey==='need'?x.type!=='radio':x.valueKey==='reasons1'?x.type!=='select':x.valueKey==='datetime'?x.type!=='datetime':!['text','textarea'].includes(x.type)))
  ||s.fillableFieldIds?.length!==6||s.fillableFieldIds.some(id=>!f.some(x=>x.fieldId===id))||new Set(s.fillableFieldIds).size!==6)return deny()
 for(const k of ['need','reasons1']){const field=f.find(x=>x.valueKey===k)!;if(!field.options?.length||new Set(field.options.map(o=>o.value)).size!==field.options.length||field.options.some(o=>o.children?.length))return deny()}
 const original=e.original,recordId=original._id
 if(typeof recordId!=='string'||appointmentReplacementProblem({definitionId:s.definition.id,dataId:recordId,workflowRunId:s.node.runId,
   workOrderId:s.workOrderId,workflowNodeId:s.node.id,appointmentReplacement:e.appointmentReplacement},true))return deny()
 const ext=original.exts
 if(ext!==undefined&&(!ext||typeof ext!=='object'||Array.isArray(ext)))return deny()
 const values:Record<string,string>={}
 for(const k of appointmentBusinessKeys){const raw=ext&&Object.hasOwn(ext,k)?(ext as Record<string,unknown>)[k]:original[k]
  if(raw!==undefined){if(typeof raw!=='string')return deny();values[k]=raw}}
 if(!['1','2'].includes(values.need??''))return deny()
 return values
}
function form(s:R1NodeFormsSnapshot,e:R1RepeatAppointmentRead,values:Record<string,string>):AppointmentFormRead{
 return {definitionId:s.definition.id,dataId:e.original._id as never,workflowRunId:s.node.runId,fields:s.definition.fields!,values,
  appointmentReplacement:e.appointmentReplacement} as AppointmentFormRead
}
export function projectRepeatAppointmentEdit(s:R1NodeFormsSnapshot,e:R1RepeatAppointmentRead,draft:Readonly<Record<string,unknown>>):readonly (R1LocalField&{visible:boolean})[]{
 const initial=appointmentEditDraft(s,e),values={...initial,...draft} as Record<string,string>
 return appointmentRuntimeFieldsFor(form(s,e,values)).map(f=>({fieldId:f.fieldId,valueKey:f.valueKey,label:f.label,type:f.type,required:f.runtime.required,
  readOnly:f.runtime.readOnly,options:f.options??[],multiple:false,visible:f.runtime.visible,supported:f.runtime.capability==='SUPPORTED_GENERIC'&&!f.runtime.readOnly}))
}
export function normalizeRepeatAppointmentEdit(s:R1NodeFormsSnapshot,e:R1RepeatAppointmentRead,draft:Readonly<Record<string,unknown>>):Record<string,string>{
 const initial=appointmentEditDraft(s,e)
 if(!draft||typeof draft!=='object'||Array.isArray(draft)||Object.keys(draft).some(k=>!keys.has(k)||typeof draft[k]!=='string'))return deny()
 const values={...initial,...draft} as Record<string,string>
 if(!['1','2'].includes(values.need))return deny()
 const visibleFields=appointmentRuntimeFieldsFor(form(s,e,values))
 for(const field of visibleFields)if(field.runtime.required&&(!Object.hasOwn(values,field.valueKey)||!values[field.valueKey]?.trim()))return deny()
 const visible=new Set(visibleFields.map(f=>f.valueKey))
 for(const k of Object.keys(draft))if(!visible.has(k)&&draft[k]!==initial[k])return deny()
 const result=normalizeAppointmentForm(form(s,e,values))
 if(result.state!=='succeeded'||!result.data)return deny()
 const out:Record<string,string>={};for(const[k,v]of Object.entries(result.data)){if(!keys.has(k)||typeof v!=='string')return deny();out[k]=v}
 return out
}
