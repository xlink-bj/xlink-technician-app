import { evaluateFieldState, evaluateVisibility, normalizeSubmission } from '@runtimes/dynamic-form'
import type { FormFieldSchema } from '@runtimes/dynamic-form'
import type { FormFieldRead } from '@shared/ports'
import type { R1FileWireValue } from '@shared/types'
import { isR1NormalImageWireArray } from '@shared/form/r1-normal-image-contract'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import type { R1LocalField } from './r1-local-form-fields'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'

export type R1NormalFileCreateValues = Record<string, string | number | boolean | readonly R1FileWireValue[]>
const deny = (): never => { throw Error('普通表单文件字段、原文或条件尚未完整核实，不能保存。') }
const scalarTypes = new Set(['text', 'textarea', 'phone', 'IDNumber', 'number', 'digit', 'date', 'time', 'datetime', 'radio', 'select'])
const reserved = new Set(['id', '_id', 'dataId', 'formDataId', 'formDefId', 'definitionId', 'extId', 'tenantId', 'userId', 'roleId', 'sid', 'smodule', 'state', 'nodeId', 'runtimeNodeId', 'workOrderId', 'workflowId', 'workflowRunId', 'runId', 'workflow', 'formDefinitionId', 'dataStr', 'exts', '__proto__', 'prototype', 'constructor', 'createTime', 'createDateTime', 'createUser', 'createUserName', 'updateTime', 'updateDateTime', 'updateUser', 'updateUserName', 'orgId', 'belongTo', '_version', '_class', 'fieldId', 'sessionRef'])
const object = (value: unknown): value is Readonly<Record<string, unknown>> => value !== null && typeof value === 'object' && !Array.isArray(value)
const validId = (value: unknown): value is string => typeof value === 'string' && Boolean(value) && value.trim() === value && !value.includes(',')

/** A branch selector only, never a permission or proof of queue provenance. */
export const usesR1NormalFileCreate = (s: R1NodeFormsSnapshot): boolean => s.node.sourceNodeType === 'forms'
  && s.records.length === 0 && (s.definition.fields?.length ?? 0) <= 50
  && Array.isArray(s.node.formFieldIdsReadOnly)
  && Boolean(s.definition.fields?.some(field => field.type === 'file' && field.readOnly === false
    && !s.node.formFieldIdsReadOnly!.includes(field.fieldId)))

/** R1 extForm generic file wire is an ordered list of exact objects. A URL
 * alone, local media ID or neutral upload receipt is not this value contract. */
export function sameR1NormalFileValues(left: unknown, right: unknown): boolean {
  return isR1NormalImageWireArray(left) && isR1NormalImageWireArray(right) && left.length === right.length
    && left.every((file, index) => file.url === right[index]!.url && file.name === right[index]!.name && file.extname === right[index]!.extname)
}

function fileLimit(field: FormFieldRead): number {
  const max = field.presentation?.max
  if (max === undefined) return 10 // Existing isR1FileWireArray protocol bound.
  if (!Number.isSafeInteger(max) || max < 0) return deny()
  return Math.min(10, max)
}

function schemaFor(s: R1NodeFormsSnapshot, configured = false): { fields: readonly FormFieldRead[]; schema: readonly FormFieldSchema[] } {
  const fields = s.definition.fields, readonly = s.node.formFieldIdsReadOnly, fillable = s.fillableFieldIds
  if ((!configured && !usesR1NormalFileCreate(s)) || (configured && !['forms','repeat'].includes(s.node.sourceNodeType ?? ''))
    || s.definition.purpose === 'appointment' || !fields?.length || fields.length > 50
    || !Array.isArray(readonly) || !Array.isArray(fillable)) return deny()
  if (fields.some(f => !validId(f.fieldId) || !validId(f.valueKey) || f.valueKey.length > 120 || reserved.has(f.valueKey))
    || new Set(fields.map(f => f.fieldId)).size !== fields.length || new Set(fields.map(f => f.valueKey)).size !== fields.length
    || new Set(readonly).size !== readonly.length || readonly.some(id => !validId(id) || !fields.some(f => f.fieldId === id))) return deny()
  const writable = fields.filter(f => !f.readOnly && !readonly.includes(f.fieldId))
  if (!writable.length || writable.length > 50 || fillable.length !== writable.length || new Set(fillable).size !== fillable.length
    || fillable.some(id => !validId(id) || !writable.some(f => f.fieldId === id))) return deny()
  const keys = new Set(fields.map(f => f.valueKey))
  const condition = (value: unknown): void => {
    if (value === undefined) return
    if (!object(value)) return deny()
    if (value.kind === 'all') {
      if (!Array.isArray(value.conditions) || !value.conditions.length) return deny()
      value.conditions.forEach(condition); return
    }
    const path = Array.isArray(value.path) && value.path.length === 1 ? value.path[0] : value.path
    if (!validId(path) || path.includes('.') || !keys.has(path)
      || evaluateVisibility(value as never, {}).state === 'unsupported') return deny()
  }
  const schema = fields.map(field => {
    if ((configured && typeof field.preset !== 'boolean') || typeof field.required !== 'boolean' || typeof field.readOnly !== 'boolean' || field.unsupportedReason || field.presentationOnly
      || (field.multiple !== undefined && typeof field.multiple !== 'boolean')
      || (field.type !== 'file' && (!scalarTypes.has(field.type) || field.multiple))) return deny()
    if(configured&&(field.presentation?.surveyTool||field.presentation?.componentType||field.presentation?.customizeFlag
      ||field.presentation?.urlShape||field.presentation?.paramsShape||field.presentation?.min!==undefined
      ||field.presentation?.minlength!==undefined||field.presentation?.maxlength!==undefined
      ||field.type!=='file'&&field.presentation?.max!==undefined))return deny()
    if (field.type === 'file') {
      if(configured&&field.presentation?.max!==undefined&&field.presentation.max>10)return deny()
      if (field.valueOption || field.options?.length) return deny()
      fileLimit(field)
    }
    condition(field.visibility)
    const projected = actionFormSchemaFor({ ...field, readOnly: field.readOnly || readonly.includes(field.fieldId) })
    if (['radio', 'select'].includes(field.type) && (!projected.inlineOptions?.length
      || new Set(projected.inlineOptions.map(o => o.value)).size !== projected.inlineOptions.length
      || projected.inlineOptions.some(o => o.children?.length))) return deny()
    if (evaluateFieldState(projected, { values: {}, surface: ACTION_FORM_SURFACE }).capability !== 'SUPPORTED_GENERIC') return deny()
    return projected
  })
  return { fields, schema }
}

export function projectR1NormalFileFields(s: R1NodeFormsSnapshot, values: Readonly<Record<string, unknown>>, configured = false): readonly (R1LocalField & { readonly visible: boolean })[] {
  try {
    const { fields, schema } = schemaFor(s, configured)
    return schema.map((field, index) => {
      const state = evaluateFieldState(field, { values, surface: ACTION_FORM_SURFACE })
      return { fieldId: field.fieldId, valueKey: field.valueKey, label: fields[index]!.label, type: field.type,
        required: state.required, readOnly: state.readOnly, options: field.inlineOptions ?? [], multiple: Boolean(field.multiple),
        visible: state.visible, supported: state.capability === 'SUPPORTED_GENERIC' && state.visible && !state.readOnly
          && (field.type !== 'file' || fileLimit(fields[index]!) > 0),
        ...(state.reason ? { reason: state.reason } : {}) }
    })
  } catch { return [] }
}

export function isR1NormalFileFieldEligible(s: R1NodeFormsSnapshot, fieldId: string, values: Readonly<Record<string, unknown>>): boolean {
  return projectR1NormalFileFields(s, values).some(field => field.fieldId === fieldId && field.type === 'file' && field.supported)
}

/** Create values only. This validates wire semantics, not who uploaded the
 * object; normal actions must separately require session-scoped queue proof.
 * Existing-record edits retain their independent scalar-only validator. */
export function normalizeR1NormalFileCreate(s: R1NodeFormsSnapshot, values: Readonly<Record<string, unknown>>, configured = false): R1NormalFileCreateValues {
  const { fields, schema } = schemaFor(s, configured)
  if (!object(values) || Object.keys(values).length > 50 || Object.keys(values).some(key => !fields.some(f => f.valueKey === key))) return deny()
  const runtimeValues: Record<string, unknown> = { ...values }
  for (const [index, field] of schema.entries()) {
    const state = evaluateFieldState(field, { values, surface: ACTION_FORM_SURFACE }), submitted = Object.hasOwn(values, field.valueKey)
    if (state.capability !== 'SUPPORTED_GENERIC' || (!state.visible && submitted)
      || (state.readOnly && (submitted || (state.visible && field.required)))) return deny()
    if (field.type === 'file' && submitted) {
      const raw = values[field.valueKey]
      if (!isR1NormalImageWireArray(raw) || raw.length > fileLimit(fields[index]!)) return deny()
      // The Runtime validates required/conditional presence with its neutral
      // media codec; only the independently checked R1 wire leaves this module.
      runtimeValues[field.valueKey] = raw.map(item => ({ url: item.url, fileName: item.name, extension: item.extname }))
    }
  }
  const result = normalizeSubmission({ fields: schema, values: runtimeValues, conditionValues: values, surface: ACTION_FORM_SURFACE })
  if (!result.ok) return deny()
  const out: R1NormalFileCreateValues = {}
  for (const [key, value] of Object.entries(result.value.values)) {
    if (schema.find(field => field.valueKey === key)!.type === 'file') {
      const raw = values[key]
      if (!isR1NormalImageWireArray(raw)) return deny()
      out[key] = raw.map(item => ({ url: item.url, name: item.name, extname: item.extname }))
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value
    else return deny()
  }
  const states = (v: Readonly<Record<string, unknown>>) => schema.map(field => {
    const state = evaluateFieldState(field, { values: v, surface: ACTION_FORM_SURFACE })
    return [state.visible, state.readOnly, state.required, state.capability]
  })
  if (JSON.stringify(states(values)) !== JSON.stringify(states(out))) return deny()
  return out
}

/** Configuration schema only; neither source-route proof nor a write grant. */
export function supportsR1ConfiguredFileSchema(snapshot: R1NodeFormsSnapshot): boolean {
  try { const { fields } = schemaFor({...snapshot,records:[]},true); return fields.some(f=>f.type==='file') }
  catch { return false }
}
export function normalizeR1ConfiguredFileCreate(snapshot:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>):R1NormalFileCreateValues {
  if(snapshot.records.length!==0) return deny()
  const normalized=normalizeR1NormalFileCreate(snapshot,values,true),seen=new Set<string>()
  for(const value of Object.values(normalized))if(Array.isArray(value))for(const file of value){
    if(seen.has(file.name)||seen.has(file.url))return deny();seen.add(file.name);seen.add(file.url)
  }
  return Object.freeze(Object.fromEntries(Object.entries(normalized).map(([key,value])=>[key,Array.isArray(value)?Object.freeze(value.map(file=>Object.freeze({...file}))):value])))
}
export function projectR1ConfiguredFileFields(snapshot:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>){
  return projectR1NormalFileFields(snapshot,values,true)
}
export const isR1ConfiguredFileFieldEligible=(snapshot:R1NodeFormsSnapshot,id:string,values:Readonly<Record<string,unknown>>)=>
  snapshot.records.length===0&&projectR1ConfiguredFileFields(snapshot,values).some(f=>f.fieldId===id&&f.type==='file'&&f.supported)
