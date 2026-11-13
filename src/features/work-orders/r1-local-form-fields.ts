import { evaluateFieldState, evaluateVisibility, normalizeFieldValue } from '@runtimes/dynamic-form'
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
  readonly placeholder?: string
  readonly preserveSelectionOrder?: boolean
}
const scalar = new Set(['text','textarea','phone','IDNumber','number','digit','date','time','datetime','switch','rate'])
const choices = new Set(['select','radio','checkbox','cascade','bizSelect'])
// ExtField rows retain distinct fieldId identities even when business keys repeat.
// Keep the transport's payload bound separate from the source-backed row bound.
export const R1_LOCAL_FORM_MAX_ROWS = 200
const MAX_VALUES = 50
/** Shared frontend safety rule. R1's direct onChange assignment does not
 * independently prove that the server rejects duplicate checkbox members. */
export function hasDistinctR1ChoiceMembers(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length
}
function locallySupported(field: FormFieldRead): boolean {
  return (field.type === 'file' || scalar.has(field.type)
    || (choices.has(field.type) && !!field.options?.length
      && (!field.valueOption || (field.type === 'bizSelect' && field.valueOption === 'projPackage'))))
    && !(field.type === 'select' && field.multiple)
    && !(field.type === 'radio' && field.multiple)
    && !(field.type === 'checkbox' && !field.multiple)
    && !(field.type === 'cascade' && field.multiple)
    && !(field.type === 'rate' && field.multiple)
}

export function projectR1LocalFields(
  definition: FormDefinitionRead,
  values: Readonly<Record<string, R1LocalFieldValue | readonly R1FileWireValue[]>> = {},
): readonly R1LocalField[] {
  const fields = definition.fields
  if (!fields || fields.length > R1_LOCAL_FORM_MAX_ROWS
    || fields.some(field => !field.fieldId || !field.valueKey)
    || new Set(fields.map(field => field.fieldId)).size !== fields.length) return []
  const states = fields.map(field => evaluateFieldState({
      fieldId: field.fieldId, valueKey: field.valueKey, type: field.type,
      required: field.required, readOnly: field.readOnly, multiple: field.multiple,
      showList: field.showList, state: field.state, fixed: field.fixed,
      operationType: field.operationType, visibility: field.visibility, roleVisibilityContext: field.roleVisibilityContext,
      mobileDetailHidden: field.mobileDetailHidden, presentationOnly: field.presentationOnly,
      valueOption: field.valueOption, unsupportedReason: field.unsupportedReason,
      ...(field.options ? { inlineOptions: field.options } : {}),
    }, {surface:'mobile_detail',values}))
  return fields.map((field, index) => {
    const state = states[index]!
    const siblings = fields.flatMap((row, i) => row.valueKey === field.valueKey ? [{ row, state: states[i]! }] : [])
    // Mutually exclusive, fully understood rows may share one storage key.
    // Ambiguous/unknown siblings must not let source order pick edit authority.
    const unique = siblings.length === 1 || (siblings.every(({ row, state: sibling }) =>
      !row.unsupportedReason && locallySupported(row)
      && sibling.capability === 'SUPPORTED_GENERIC' && sibling.optionProvider.state !== 'unsupported'
      // Static surface exclusion short-circuits state evaluation. Inspect each
      // original rule too, so hidden unknown configuration never grants a key.
      && evaluateVisibility(row.visibility, values, row.roleVisibilityContext).state !== 'unsupported')
      && siblings.filter(({ state: sibling }) => sibling.visible).length === 1)
    const supported = unique && locallySupported(field) && state.capability==='SUPPORTED_GENERIC'
      && state.visible && !state.readOnly && field.valueKey.trim().length>0
    return {
      fieldId:field.fieldId,valueKey:field.valueKey,label:field.label,type:field.type,
      required:state.required,readOnly:state.readOnly,
      options:field.options??[],
      multiple:!!field.multiple,supported,
      ...(!supported?{reason:!unique?'重复字段名，不可修改'
        :!state.visible && state.capability !== 'UNSUPPORTED'?'当前字段不可见'
        :state.readOnly?'原字段只读'
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
  const selected=projected.filter(x=>x.valueKey===key && x.supported)
  if (selected.length!==1) return null
  const field=selected[0]!
  if(Object.keys(existing).length>MAX_VALUES) return null
  if(raw===undefined || raw===null || raw==='' || (Array.isArray(raw)&&raw.length===0)) {
    const result={...existing}
    delete result[key]
    return result
  }
  if((field.type==='checkbox'||field.type==='cascade')
    && (!Array.isArray(raw)||!raw.every(x=>typeof x==='string'))) return null
  if((field.type==='checkbox'||(field.type==='bizSelect'&&field.multiple))
    && Array.isArray(raw) && !hasDistinctR1ChoiceMembers(raw)) return null
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
  const result = {...existing,[key]:safe}
  return Object.keys(result).length <= MAX_VALUES ? result : null
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
