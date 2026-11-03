import { evaluateFieldState, normalizeFieldValue } from '@runtimes/dynamic-form'
import type { FormFieldRead, FormDefinitionRead, FormFieldValue, FormFieldOptionRead } from '@shared/ports'
import type { R1FileWireValue } from '@shared/types'

/**
 * Canonical field identities come from the R1 FormDef. Projection may expose
 * generic 'file' fields, but only the special transaction's R1 media codec
 * authorizes their wire values; this module never issues an upsert.
 */
export type R1LocalFieldValue = string | number | boolean | readonly string[]
export interface R1LocalField {
  readonly fieldId: string
  readonly valueKey: string
  readonly label: string
  readonly type: string
  readonly required: boolean
  readonly readOnly: boolean
  readonly options: readonly FormFieldOptionRead[]
  readonly multiple: boolean
  readonly supported: boolean
  readonly reason?: string
}
const scalar = new Set(['text','textarea','phone','IDNumber','number','digit','date','time','datetime','switch','rate'])
const choices = new Set(['select','radio','checkbox','cascade','bizSelect'])
const MAX = 50

export function projectR1LocalFields(
  definition: FormDefinitionRead,
  values: Readonly<Record<string, R1LocalFieldValue | readonly R1FileWireValue[]>> = {},
): readonly R1LocalField[] {
  const fields = definition.fields
  if (!fields || fields.length > MAX) return []
  const seen = new Set<string>()
  return fields.map(field => {
    const state = evaluateFieldState({
      fieldId: field.fieldId, valueKey: field.valueKey, type: field.type,
      required: field.required, readOnly: field.readOnly, multiple: field.multiple,
      showList: field.showList, state: field.state, fixed: field.fixed,
      operationType: field.operationType, visibility: field.visibility,
      valueOption: field.valueOption, unsupportedReason: field.unsupportedReason,
      ...(field.options ? { inlineOptions: field.options } : {}),
    }, {surface:'mobile_detail',values})
    const available = field.type === 'file' || scalar.has(field.type)
      || (choices.has(field.type) && !!field.options?.length
        && (!field.valueOption || (field.type==='bizSelect' && field.valueOption==='projPackage')))
    const unique = !seen.has(field.valueKey)
    seen.add(field.valueKey)
    const supported = unique && available && state.capability==='SUPPORTED_GENERIC'
      && state.visible && !state.readOnly && field.valueKey.trim().length>0
      && !(field.type==='select' && field.multiple)
      && !(field.type==='radio' && field.multiple)
      && !(field.type==='checkbox' && !field.multiple)
      // R1 cascade persists one ordered path, not an arbitrary multiselect.
      && !(field.type==='cascade' && field.multiple)
    return {
      fieldId:field.fieldId,valueKey:field.valueKey,label:field.label,type:field.type,
      required:state.required,readOnly:state.readOnly,
      options:field.options??[],
      multiple:!!field.multiple,supported,
      ...(!supported?{reason:!unique?'重复字段名，不可修改'
        :state.readOnly?'原字段只读'
        :!state.visible?'当前字段不可见'
        :'该字段或选项来源尚未支持本地编辑'}:{}),
    }
  })
}

export function normalizeR1LocalFieldPatch(
  definition: FormDefinitionRead,
  existing: Readonly<Record<string, R1LocalFieldValue>>,
  key: string,
  raw: FormFieldValue | undefined,
): Readonly<Record<string,R1LocalFieldValue>> | null {
  const projected=projectR1LocalFields(definition, existing)
  if (projected.length===0 || projected.filter(x=>x.valueKey===key).length!==1) return null
  const field=projected.find(x=>x.valueKey===key)!
  if(!field.supported || Object.keys(existing).length>MAX) return null
  if(raw===undefined || raw===null || raw==='' || (Array.isArray(raw)&&raw.length===0)) {
    const result={...existing}
    delete result[key]
    return result
  }
  if((field.type==='checkbox'||field.type==='cascade')
    && (!Array.isArray(raw)||!raw.every(x=>typeof x==='string'))) return null
  if((field.type==='checkbox'||(field.type==='bizSelect'&&field.multiple))
    && Array.isArray(raw) && new Set(raw).size!==raw.length) return null
  if(field.type==='bizSelect' && field.multiple
    && (!Array.isArray(raw)||!raw.every(x=>typeof x==='string'))) return null
  const normalized=normalizeFieldValue(field.type,raw,field.options,field.multiple)
  if(!normalized.ok) return null
  const value=normalized.value
  if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean'
    && !(Array.isArray(value)&&value.every(x=>typeof x==='string'))) return null
  const safe=value as R1LocalFieldValue
  if(typeof safe==='string' && safe.length>4000) return null
  if(Array.isArray(safe)&&(safe.length>30||safe.some(x=>x.length>256))) return null
  return {...existing,[key]:safe}
}

/** Allows read of a synthetic form definition only through the DEV Mock adapter.
 * A real user session or a mock runtime flag alone is not read authorization.
 */
export function allowsR1LocalDefinitionPreview(input: {
  readonly dev: boolean
  readonly mockDataMode: boolean
  readonly workOrderId: string
  readonly definitionId: string
}):boolean {
  return input.dev && input.mockDataMode
    && input.workOrderId.startsWith('mock-work-order-')
    && input.definitionId.startsWith('mock-')
}
