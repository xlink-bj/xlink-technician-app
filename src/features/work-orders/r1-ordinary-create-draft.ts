import { evaluateFieldState, evaluateVisibility, isFieldApplicable, normalizeSubmission } from '@runtimes/dynamic-form'
import type { VisibilityExpression } from '@runtimes/dynamic-form'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import type { R1LocalFieldValue } from './r1-local-form-fields'

const deny = (): never => { throw Error('当前新增草稿的字段、权限或条件尚未完整核实。') }
const scalar = new Set(['text', 'textarea', 'phone', 'IDNumber', 'number', 'digit', 'date', 'time', 'datetime', 'radio', 'select'])
const reserved = new Set(['id', '_id', 'dataId', 'formDataId', 'formDefId', 'definitionId', 'extId', 'tenantId', 'userId', 'roleId', 'sid', 'smodule', 'state', 'nodeId', 'runtimeNodeId', 'workOrderId', 'workflowId', 'workflowRunId', 'runId', 'workflow', 'formDefinitionId', 'dataStr', 'exts', '__proto__', 'prototype', 'constructor', 'createTime', 'createDateTime', 'createUser', 'createUserName', 'updateTime', 'updateDateTime', 'updateUser', 'updateUserName', 'orgId', 'belongTo', '_version', '_class', 'fieldId', 'sessionRef'])
const valid = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.trim() === v && !v.includes(',')

/** Exact static applicability shared by selection and execution. No authority. */
function draftSchema(snapshot:R1NodeFormsSnapshot) {
  const fields = snapshot.definition.fields, fillable = snapshot.fillableFieldIds
  if (snapshot.node.sourceNodeType !== 'forms' || snapshot.definition.purpose !== undefined
    || snapshot.records.length !== 0 || !fields?.length || fields.length > 50
    || !Array.isArray(snapshot.node.formFieldIdsReadOnly) || snapshot.node.formFieldIdsReadOnly.length !== 0
    || !Array.isArray(fillable) || fillable.length !== fields.length || new Set(fillable).size !== fillable.length
    || fields.some(f => !valid(f.fieldId) || !valid(f.valueKey) || reserved.has(f.valueKey)
      || !fillable.includes(f.fieldId) || f.readOnly !== false || typeof f.required !== 'boolean'
      || !scalar.has(f.type) || f.multiple || f.presentationOnly || f.unsupportedReason || f.valueOption)
    || new Set(fields.map(f => f.fieldId)).size !== fields.length
    || new Set(fields.map(f => f.valueKey)).size !== fields.length) return deny()
  const schema = fields.map(f => actionFormSchemaFor(f))
  const keys = new Set(fields.map(f => f.valueKey))
  // Inspect dependencies, not visibility semantics: those remain Runtime-owned.
  // No unresolved controller, nested metadata context or cyclic dependency may
  // turn a failed interpretation into permission to discard user input.
  const graph = new Map<string, Set<string>>()
  const dependencies = (rule: VisibilityExpression | undefined, target: Set<string>, depth = 0): void => {
    if (rule === undefined) return
    if (rule.kind === 'role') return deny() // Role display support is not a create/draft write grant.
    if (depth > fields.length || evaluateVisibility(rule, {}).state === 'unsupported') return deny()
    if (rule.kind === 'all') { rule.conditions.forEach(c => dependencies(c, target, depth + 1)); return }
    const path = Array.isArray(rule.path) && rule.path.length === 1 ? rule.path[0] : rule.path
    if (!valid(path) || path.includes('.') || !keys.has(path)) return deny()
    target.add(path)
  }
  for (const f of schema) {
    if (!isFieldApplicable(f, ACTION_FORM_SURFACE)
      || evaluateFieldState(f, { values: {}, surface: ACTION_FORM_SURFACE }).capability !== 'SUPPORTED_GENERIC'
      || (['radio', 'select'].includes(f.type) && (!f.inlineOptions?.length
        || new Set(f.inlineOptions.map(o => o.value)).size !== f.inlineOptions.length
        || f.inlineOptions.some(o => o.children?.length)))) return deny()
    const deps = new Set<string>(); dependencies(f.visibility, deps); graph.set(f.valueKey, deps)
  }
  const visited = new Set<string>(), active = new Set<string>()
  const visit = (k: string): void => {
    if (active.has(k)) return deny()
    if (visited.has(k)) return
    active.add(k); graph.get(k)!.forEach(visit); active.delete(k); visited.add(k)
  }
  keys.forEach(visit)
  const controllers = new Set([...graph.values()].flatMap(deps => [...deps]))
  return { fields, schema, keys, controllers }
}
export function supportsR1CreateDraftSchema(snapshot:R1NodeFormsSnapshot):boolean {
  try { draftSchema(snapshot); return true } catch { return false }
}

/** Pure local transition, never a write grant or submission normalizer.
 * The caller must independently prove a current ordinary type=0 create-only
 * context. These structural refusals do not establish route identity or any
 * permission; snapshot purpose alone cannot prove an ordinary collection.
 * Existing records, append, typed forms, media and appointments are excluded.
 */
export function updateR1CreateDraftValues(
  snapshot: R1NodeFormsSnapshot,
  values: Readonly<Record<string, R1LocalFieldValue>>,
  key: string,
  value: R1LocalFieldValue,
): Record<string, R1LocalFieldValue> {
  const { fields, schema, keys, controllers } = draftSchema(snapshot)
  if (!values || typeof values !== 'object' || Array.isArray(values) || !keys.has(key)
    || Object.keys(values).some(k => !keys.has(k))) return deny()
  const next = { ...values, [key]: value }
  if (Object.values(next).some(v => !['string', 'number', 'boolean'].includes(typeof v)
    || (typeof v === 'number' && !Number.isFinite(v)))) return deny()

  const controllerSchema = schema.filter(f => controllers.has(f.valueKey)).map(f => ({ ...f, required: false }))
  const wireConditions = (input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> => {
    // Reuse Runtime's codecs AND its missing-value omission, while allowing an
    // incomplete draft. Never normalize or replace the user's editable input.
    const result = normalizeSubmission({ fields: controllerSchema, values: input,
      conditionValues: input, surface: ACTION_FORM_SURFACE })
    if (!result.ok) return deny()
    return result.value.values
  }
  const states = (input: Readonly<Record<string, unknown>>) => schema.map(f => {
    const s = evaluateFieldState(f, { values: input, surface: ACTION_FORM_SURFACE })
    return [s.capability, s.visible, s.readOnly, s.required]
  })
  const changed = schema.find(f => f.valueKey === key)!
  const before = evaluateFieldState(changed, { values, surface: ACTION_FORM_SURFACE })
  if (!before.visible || before.readOnly || schema.some(f => Object.hasOwn(values, f.valueKey)
    && !evaluateFieldState(f, { values, surface: ACTION_FORM_SURFACE }).visible)) return deny()

  const removed = new Set<string>()
  for (let pass = 0; pass <= fields.length; pass++) {
    // Evaluate each pass against one complete context, independently of field order.
    const hidden = schema.filter(f => Object.hasOwn(next, f.valueKey)
      && !evaluateFieldState(f, { values: next, surface: ACTION_FORM_SURFACE }).visible)
    if (!hidden.length) {
      // A negative dependency can reveal a previously removed field. Refuse
      // that ambiguous transition atomically rather than losing a visible value.
      if (schema.some(f => removed.has(f.valueKey)
        && evaluateFieldState(f, { values: next, surface: ACTION_FORM_SURFACE }).visible)) return deny()
      const wire = wireConditions(next), stableWire = wireConditions(wire)
      // Trim/number coercion and omission must not re-expose a discarded field
      // or change effective required state. Whitespace -> '' -> omitted also
      // needs the second existing-codec pass to prove condition stability.
      if (JSON.stringify(states(next)) !== JSON.stringify(states(wire))
        || JSON.stringify(states(wire)) !== JSON.stringify(states(stableWire))) return deny()
      return next
    }
    for (const f of hidden) { delete next[f.valueKey]; removed.add(f.valueKey) }
  }
  return deny()
}
