import { evaluateFieldState, normalizeSubmission } from '@runtimes/dynamic-form'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'

const reserved = new Set(['id', '_id', 'dataId', 'formDataId', 'formDefId', 'definitionId', 'extId', 'tenantId', 'userId', 'roleId', 'sid', 'smodule', 'state', 'nodeId', 'workflowId', 'workflowRunId', 'runtimeNodeId', 'workOrderId', 'dataStr', 'exts', '__proto__', 'prototype', 'constructor', 'createTime', 'createDateTime', 'createUser', 'createUserName', 'updateTime', 'updateDateTime', 'updateUser', 'updateUserName', 'orgId', 'belongTo', '_version', '_class'])
for (const key of ['formDefinitionId', 'runId', 'workflow', 'fieldId', 'sessionRef']) reserved.add(key)
const scalarTypes = new Set(['text', 'textarea', 'phone', 'IDNumber', 'number', 'digit', 'date', 'time', 'datetime', 'radio', 'select'])
const own = (record: Readonly<Record<string, unknown>>, key: string): boolean => Object.hasOwn(record, key)
const record = (value: unknown): value is Readonly<Record<string, unknown>> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const deny = (): never => { throw Error('编辑字段、原文或规则尚未核实，不能保存。') }

function schemaFor(snapshot: R1NodeFormsSnapshot) {
  const fields = snapshot.definition.fields
  if (!fields?.length || fields.length > 50 || new Set(fields.map(field => field.valueKey)).size !== fields.length) return deny()
  return fields.map(field => {
    if (!field.valueKey || field.valueKey.trim() !== field.valueKey || field.valueKey.includes(',') || reserved.has(field.valueKey)) return deny()
    const schema = actionFormSchemaFor({ ...field, readOnly: field.readOnly
      || snapshot.node.formFieldIdsReadOnly?.some(id => String(id) === String(field.fieldId)) === true })
    if (!scalarTypes.has(schema.type) || schema.multiple) return deny()
    if (['radio', 'select'].includes(schema.type) && (!schema.inlineOptions?.length
      || new Set(schema.inlineOptions.map(option => option.value)).size !== schema.inlineOptions.length
      || schema.inlineOptions.some(option => option.children?.length))) return deny()
    return schema
  })
}

/** Business-field projection only. The original remains the wire's authority for
 * identity, unknown data and hidden/readonly fields; this grants no edit lease. */
export function projectR1FormsEditValues(snapshot: R1NodeFormsSnapshot, original: Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (!record(original) || (own(original, 'exts') && !record(original.exts))) return deny()
  const exts = record(original.exts) ? original.exts : {}
  const values: Record<string, unknown> = {}
  for (const field of schemaFor(snapshot)) {
    if (own(exts, field.valueKey)) values[field.valueKey] = exts[field.valueKey]
    else if (own(original, field.valueKey)) values[field.valueKey] = original[field.valueKey]
  }
  return values
}

/** Validate an edit patch, never a replacement record. Missing draft fields keep
 * their original values. Optional clearing is explicit and requires the known
 * two-slot wire representation; metadata preservation belongs to the wire. */
export function normalizeR1FormsEditValues(
  snapshot: R1NodeFormsSnapshot,
  original: Readonly<Record<string, unknown>>,
  draft: Readonly<Record<string, unknown>>,
): { fields: Record<string, string | number | boolean>; clearedFieldKeys: readonly string[] } {
  if (!record(draft)) return deny()
  const schema = schemaFor(snapshot)
  const initial = projectR1FormsEditValues(snapshot, original)
  if (Object.keys(draft).some(key => !schema.some(field => field.valueKey === key))) return deny()
  const values = { ...initial, ...draft }
  // Empty draft inputs share one condition context regardless of definition
  // ordering; normalizing them while walking fields makes later rules differ.
  for (const [key, value] of Object.entries(draft)) {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) values[key] = ''
  }
  const editable = [] as typeof schema
  const clearedFieldKeys: string[] = []
  for (const field of schema) {
    const key = field.valueKey
    const state = evaluateFieldState(field, { values, surface: ACTION_FORM_SURFACE })
    if (state.capability === 'UNSUPPORTED') return deny()
    if (!state.visible || state.readOnly || state.capability === 'PRESENTATION_ONLY') {
      if (own(draft, key) && !Object.is(draft[key], initial[key])) return deny()
      continue
    }
    editable.push(field)
    const value = draft[key]
    if (own(draft, key) && (value === null || value === undefined || (typeof value === 'string' && value.trim() === ''))) {
      if (state.required) return deny()
      if (!record(original.exts) || !own(original, key) || !own(original.exts, key)) return deny()
      clearedFieldKeys.push(key)
    }
  }
  const result = normalizeSubmission({ fields: editable, values, conditionValues: values, surface: ACTION_FORM_SURFACE })
  if (!result.ok) return deny()
  const fields: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(result.value.values)) {
    if (!own(draft, key)) continue
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return deny()
    fields[key] = value
  }
  return { fields, clearedFieldKeys }
}
