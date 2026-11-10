import { evaluateFieldState, normalizeSubmission } from '@runtimes/dynamic-form'
import type { FormFieldSchema } from '@runtimes/dynamic-form'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import { ACTION_FORM_SURFACE } from './action-form-schema'
import { r1FormsScalarSubsetSchema } from './r1-forms-scalar-subset'

type Scalar = string | number | boolean
const deny = (): never => { throw Error('标量编辑原文、字段或条件尚未核实，不能保存。') }
const record = (value: unknown): value is Readonly<Record<string, unknown>> => value !== null && typeof value === 'object' && !Array.isArray(value)
const scalar = (value: unknown): value is Scalar | null => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
const own = (value: Readonly<Record<string, unknown>>, key: string): boolean => Object.hasOwn(value, key)
const empty = (value: unknown): boolean => value === null || value === undefined || (typeof value === 'string' && !value.trim())
const stateFor = (field: FormFieldSchema, values: Readonly<Record<string, unknown>>) => evaluateFieldState(field, { values: values as never, surface: ACTION_FORM_SURFACE })
const states = (schema: readonly FormFieldSchema[], values: Readonly<Record<string, unknown>>) => JSON.stringify(schema.map(field => {
  const state = stateFor(field, values)
  return [state.visible, state.readOnly, state.required, state.capability]
}))

/** Pure validation only. The caller must independently prove generic Ext.type=0
 * using its private authoritative reader evidence and grant an edit lease.
 * Neither missing purpose nor a raw class marker establishes that authority.
 * This projection never replaces the complete original used by the wire. */
export function projectR1GenericScalarEditValues(snapshot: R1NodeFormsSnapshot, original: Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (!record(original) || (own(original, 'exts') && !record(original.exts))) return deny()
  const { schema } = r1FormsScalarSubsetSchema(snapshot)
  const exts = record(original.exts) ? original.exts : {}
  const values: Record<string, unknown> = {}
  for (const field of schema) {
    const source = own(exts, field.valueKey) ? exts : original
    if (!own(source, field.valueKey)) continue
    const value = source[field.valueKey]
    if (!scalar(value)) return deny()
    values[field.valueKey] = value
  }
  return values
}

/** Return only changed scalars and explicit two-slot optional clears. This is
 * not an authorization API; only the reader-bound provider may use it for edits. */
export function normalizeR1GenericScalarEditValues(snapshot: R1NodeFormsSnapshot, original: Readonly<Record<string, unknown>>, draft: Readonly<Record<string, unknown>>): { fields: Record<string, Scalar>; clearedFieldKeys: readonly string[] } {
  const { fields, schema, keys } = r1FormsScalarSubsetSchema(snapshot)
  const initial = projectR1GenericScalarEditValues(snapshot, original)
  if (!record(draft) || Object.keys(draft).length > 50) return deny()
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(draft)) {
    if (keys.has(key)) {
      if (value !== undefined && !scalar(value)) return deny()
      safe[key] = value
      continue
    }
    const source = record(original.exts) && own(original.exts, key) ? original.exts : original
    if (!fields.some(field => field.valueKey === key) || !own(source, key) || !scalar(value) || !Object.is(value, source[key])) return deny()
  }
  const values = { ...initial, ...safe }
  const clearCandidates = new Set(Object.entries(safe).filter(([, value]) => empty(value)).map(([key]) => key))
  for (const key of clearCandidates) delete values[key]
  // Restore retained hidden empty slots together, so definition order cannot
  // change the context. Each pass only removes candidates and is bounded.
  for (let pass = 0; pass < schema.length; pass++) {
    const retained = schema.filter(field => clearCandidates.has(field.valueKey)
      && !stateFor(field, values).visible && own(initial, field.valueKey)
      && Object.is(safe[field.valueKey], initial[field.valueKey]))
    if (!retained.length) break
    for (const field of retained) {
      clearCandidates.delete(field.valueKey)
      values[field.valueKey] = initial[field.valueKey]
    }
  }
  const editable: FormFieldSchema[] = []
  const clearedFieldKeys: string[] = []
  for (const field of schema) {
    const key = field.valueKey, state = stateFor(field, values)
    if (!state.visible) {
      if (own(safe, key) && !Object.is(safe[key], initial[key])) return deny()
      continue
    }
    if (state.readOnly || state.capability !== 'SUPPORTED_GENERIC') return deny()
    editable.push(field)
    if (clearCandidates.has(key)) {
      if (state.required || !record(original.exts) || !own(original, key) || !own(original.exts, key)) return deny()
      clearedFieldKeys.push(key)
    }
  }
  const normalized = normalizeSubmission({ fields: editable, values, conditionValues: values, surface: ACTION_FORM_SURFACE })
  if (!normalized.ok) return deny()
  const normalizedValues = normalized.value.values
  if (Object.values(normalizedValues).some(value => !scalar(value) || value === null)) return deny()
  for (const field of editable) if (stateFor(field, values).required && empty(normalizedValues[field.valueKey])) return deny()
  const finalContext = { ...values, ...normalizedValues }
  for (const key of clearedFieldKeys) delete finalContext[key]
  if (states(schema, values) !== states(schema, finalContext)) return deny()
  const patch: Record<string, Scalar> = {}
  for (const [key, value] of Object.entries(normalizedValues)) {
    if (own(safe, key) && !Object.is(safe[key], initial[key]) && !Object.is(value, initial[key])) patch[key] = value as Scalar
  }
  // Verify the context the existing full-original wire will actually persist,
  // rather than one containing normalized values omitted from this patch.
  const persistedContext = { ...initial, ...patch }
  for (const key of clearedFieldKeys) delete persistedContext[key]
  if (states(schema, values) !== states(schema, persistedContext)) return deny()
  if (!Object.keys(patch).length && !clearedFieldKeys.length) return deny()
  return { fields: patch, clearedFieldKeys }
}
