import { normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
import { normalizeR1FormsEditValues } from '@features/work-orders/r1-forms-edit-values'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { assertSurveyReadExtsValues } from '@app/r1-node-forms-read'
import { describe, expect, it } from 'vitest'
import reference from '../fixtures/survey-59-read-reference.json'
import { formData, formDefinition } from '@adapters/api/read-models/form'
import { asOpaqueId } from '@shared/types'
import { surveyLeakageCauseExperienceFor, surveyLeakageCauseFieldStateFor, surveyLeakageCauseReadIds, surveyLeakageCausePersistedIds } from '@features/work-orders/survey-leakage-cause'
import { projectR1RecordReadFields } from '@features/work-orders/r1-record-read-fields'
import type { DynamicFormRead } from '@shared/ports'

const definition = () => formDefinition({data:reference.fields.map(f=>f.row)},asOpaqueId<'FormDefinitionId'>('synthetic-leakage'))
const form = (): DynamicFormRead => ({purpose:'survey',fields:definition().fields!,values:{part:['1','130']}})
describe('leakage double-row identity binding, without global key uniqueness',()=>{
  it('binds captured rows57/58 despite unrelated repeated length/width keys',()=>{
    const f=form(),bound=surveyLeakageCauseExperienceFor(f)!
    expect(f.fields).toHaveLength(59)
    expect(bound.triggerField.fieldId).toBe(reference.fields[56]!.row._id)
    expect(bound.valueField.fieldId).toBe(reference.fields[57]!.row._id)
  })
  it.each(['missing-id','blank-id','same-id','third-id-collision','unsupported-trigger','unsupported-value','multi-trigger','wrong-type','wrong-multiple','duplicate-trigger-key','duplicate-value-key','missing-row','not-survey'] as const)(
    'does not grant business override for %s',change=>{
      const f=form(),bound=surveyLeakageCauseExperienceFor(f)!,trigger=bound.triggerField,value=bound.valueField
      const fields=f.fields.map(field=>({...field}));const t=fields.find(r=>r.valueKey===trigger.valueKey)!,v=fields.find(r=>r.valueKey===value.valueKey)!
      if(change==='missing-id')Reflect.deleteProperty(t,'fieldId')
      if(change==='blank-id')t.fieldId=' '
      if(change==='same-id')v.fieldId=t.fieldId
      if(change==='third-id-collision')fields[0]!.fieldId=t.fieldId
      if(change==='unsupported-trigger')t.unsupportedReason='unverified'
      if(change==='unsupported-value')v.unsupportedReason='unverified'
      if(change==='multi-trigger')t.multiple=true
      if(change==='wrong-type')v.type='text'
      if(change==='wrong-multiple')v.multiple=false
      if(change==='duplicate-trigger-key')fields.push({...t,fieldId:'extra-trigger'})
      if(change==='duplicate-value-key')fields.push({...v,fieldId:'extra-value'})
      const changed={...f,fields:change==='missing-row'?fields.filter(r=>r!==v):fields,...(change==='not-survey'?{purpose:'appointment' as const}:{})}
      expect(surveyLeakageCauseExperienceFor(changed)).toBeUndefined()
      expect(surveyLeakageCauseFieldStateFor(changed,t)).toBeUndefined()
    })
  it('evaluates each actual row independently: part4 trigger is visible but data is hidden',()=>{
    const f={...form(),values:{part:['4']}},bound=surveyLeakageCauseExperienceFor(f)!
    expect(surveyLeakageCauseFieldStateFor(f,bound.triggerField)?.visible).toBe(true)
    expect(surveyLeakageCauseFieldStateFor(f,bound.valueField)?.visible).toBe(false)
    const locked={...f,workflowReadOnlyFieldIds:[bound.triggerField.fieldId]}
    expect(surveyLeakageCauseFieldStateFor(locked,bound.triggerField)?.readOnly).toBe(true)
    expect(surveyLeakageCauseFieldStateFor(locked,bound.valueField)?.visible).toBe(false)
  })
})

describe('saved display evidence gap (no reader or mapper changes)',()=>{
  it('demonstrates why record.values cannot distinguish absent data from a dropped object array',()=>{
    const d=definition(),missing=formData({_id:'saved',part:['1','130']},undefined,d.id)
    const invalid=formData({_id:'saved',part:['1','130'],leakageCause:[{unknown:true}]},undefined,d.id)
    expect(missing.values?.leakageCause).toBeUndefined();expect(invalid.values?.leakageCause).toBeUndefined()
    expect(projectR1RecordReadFields(d,missing).find(r=>r.valueKey==='leakageCause')?.text)
      .toBe(projectR1RecordReadFields(d,invalid).find(r=>r.valueKey==='leakageCause')?.text)
  })
})

describe('saved IDs preserve raw identity independently of picker normalization',()=>{
  it.each([['id-a'],['id-a','id-b'],[]].map(value=>({value})))('retains legal list %#',({value})=>{
    expect(surveyLeakageCauseReadIds(value)).toEqual(value)
  })
  it.each([undefined,null,false,0,'id',{},[{}],['id',{}],['id','id'],[''],[' '],[' id ']].map(value=>({value})))(
    'rejects dirty/raw saved IDs %#',({value})=>expect(surveyLeakageCauseReadIds(value)).toBeNull())
  it('keeps the established picker trim contract unchanged',()=>{
    expect(surveyLeakageCausePersistedIds([' id '])).toEqual(['id'])
    expect(surveyLeakageCauseReadIds([' id '])).toBeNull()
  })
})

describe('saved Survey projection after verified lossless read guard',()=>{
  function show(value:unknown,part=['1','130']) {
    const d=definition(),record=formData({_id:'saved',part,leakageCause:value},undefined,d.id)
    return projectR1RecordReadFields(d,record)
  }
  it('hides only the bound interaction trigger and displays unresolved saved IDs',()=>{
    const rows=show(['cause-a','cause-b'])
    expect(rows.some(r=>r.valueKey==='leakageCauseSelect')).toBe(false)
    expect(rows.find(r=>r.valueKey==='leakageCause')).toMatchObject({unavailable:false,text:'未解析（cause-a） / 未解析（cause-b）'})
  })
  it('honors the data row own condition rather than part4 trigger visibility',()=>{
    expect(show(['cause-a'],['4']).some(r=>r.valueKey==='leakageCause')).toBe(false)
  })
  it('distinguishes an empty saved list from malformed representable data',()=>{
    expect(show([]).find(r=>r.valueKey==='leakageCause')).toMatchObject({unavailable:false,text:'空值'})
    expect(show(null).find(r=>r.valueKey==='leakageCause')).toMatchObject({unavailable:false,text:'空值'})
    expect(show(undefined).find(r=>r.valueKey==='leakageCause')).toMatchObject({unavailable:false,text:'未保存'})
    for(const value of [false,0,'id',[' id '],['id','id'],['']]) {
      expect(show(value).find(r=>r.valueKey==='leakageCause')).toMatchObject({unavailable:true,text:'已保存的渗漏原因格式无效'})
    }
  })
  it('preserves generic fallback for an unverified double-row binding',()=>{
    const d=definition(),fields=d.fields!.map(f=>f.valueKey==='leakageCause'?{...f,unsupportedReason:'unknown'}:f)
    const rows=projectR1RecordReadFields({...d,fields},formData({_id:'saved',part:['1','130'],leakageCause:['id']},undefined,d.id))
    expect(rows.some(r=>r.valueKey==='leakageCauseSelect')).toBe(true)
    expect(rows.find(r=>r.valueKey==='leakageCause')?.unavailable).toBe(true)
  })
})

describe('lossless shared guard for bound leakage data before publishing display',()=>{
  it.each([{},[{}],['id',{}],['id','id'],[' id '],[' ']].map(value=>({value})))(
    'rejects invalid raw data slot %#',({value})=>{
      const d=definition();expect(()=>assertSurveyReadExtsValues(d,{_id:'saved',part:['1','130'],leakageCause:value})).toThrow()
    })
  it.each([null,[],['id-a']].map(value=>({value})))('retains null/empty/IDs and EXTS priority %#',({value})=>{
    const d=definition();expect(()=>assertSurveyReadExtsValues(d,{_id:'saved',part:['1','130'],leakageCause:{bad:true},exts:{leakageCause:value}})).not.toThrow()
  })
  it('does not infer a data grant from part4 trigger visibility',()=>{
    expect(()=>assertSurveyReadExtsValues(definition(),{_id:'saved',part:['4'],leakageCause:[{}]})).not.toThrow()
  })
})

describe('both controlled identities and independent surfaces',()=>{
  for(const key of ['leakageCauseSelect','leakageCause'])for(const fault of ['empty','whitespace','numeric','third-collision']){
    it(`${key} rejects ${fault} fieldId`,()=>{
      const f=form(),fields=f.fields.map(row=>({...row})),target=fields.find(row=>row.valueKey===key)!
      if(fault==='empty')target.fieldId=''
      if(fault==='whitespace')target.fieldId='  bad  '
      if(fault==='numeric')Object.assign(target,{fieldId:7})
      if(fault==='third-collision')fields[0]!.fieldId=target.fieldId
      expect(surveyLeakageCauseExperienceFor({...f,fields})).toBeUndefined()
    })
  }
  it('does not read data merely because its trigger surface is applicable',()=>{
    const f=form(),fields=f.fields.map(row=>row.valueKey==='leakageCause'?{...row,showList:['1']}:row)
    const d={...definition(),fields},raw={_id:'saved',part:['1','130'],leakageCause:[{}]}
    expect(()=>assertSurveyReadExtsValues(d,raw)).not.toThrow()
    expect(projectR1RecordReadFields(d,formData(raw,undefined,d.id)).some(row=>row.valueKey==='leakageCause')).toBe(false)
  })
  it('keeps value workflow readonly separate from the trigger',()=>{
    const f=form(),bound=surveyLeakageCauseExperienceFor(f)!,locked={...f,workflowReadOnlyFieldIds:[bound.valueField.fieldId]}
    expect(surveyLeakageCauseFieldStateFor(locked,bound.triggerField)?.readOnly).toBe(false)
    expect(surveyLeakageCauseFieldStateFor(locked,bound.valueField)).toMatchObject({readOnly:true,visible:true,required:false})
  })
})

it('keeps normal create/edit scalar submission guards closed for the controlled array pair',()=>{
  const d=definition(),fields=d.fields!.filter(row=>['leakageCauseSelect','leakageCause'].includes(row.valueKey)).map(row=>({...row,visibility:undefined,required:false,
    ...(row.type==='select'?{options:[{value:'choose',label:'Synthetic trigger'}]}:{})}))
  const snapshot:R1NodeFormsSnapshot={workOrderId:'s',node:{id:asOpaqueId<'WorkflowNodeRuntimeId'>('n'),category:'forms',sourceNodeType:'forms',lifecycle:'active'},definition:{...d,fields},records:[]}
  expect(()=>normalizeR1RepeatValues(snapshot,{leakageCause:['id']})).toThrow()
  expect(()=>normalizeR1FormsEditValues(snapshot,{_id:'saved',exts:{},leakageCause:['old']},{leakageCause:['new']})).toThrow()
})
