import { evaluateFieldState, evaluateVisibility, normalizeSubmission } from '@runtimes/dynamic-form'
import type { FormFieldSchema } from '@runtimes/dynamic-form'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'

const deny = (): never => { throw Error('已授权标量子集、原文或条件尚未完整核实，不能保存。') }
const scalarTypes = new Set(['text', 'textarea', 'phone', 'IDNumber', 'number', 'digit', 'date', 'time', 'datetime', 'radio', 'select'])
const reserved = new Set(['id','_id','dataId','formDataId','formDefId','definitionId','extId','tenantId','userId','roleId','sid','smodule','state','nodeId','runtimeNodeId','workOrderId','workflowId','workflowRunId','runId','workflow','formDefinitionId','dataStr','exts','__proto__','prototype','constructor','createTime','createDateTime','createUser','createUserName','updateTime','updateDateTime','updateUser','updateUserName','orgId','belongTo','_version','_class','fieldId','sessionRef'])
const valid = (v: unknown): v is string => typeof v === 'string' && Boolean(v) && v.trim() === v && !v.includes(',')
const object = (v: unknown): v is Readonly<Record<string, unknown>> => v !== null && typeof v === 'object' && !Array.isArray(v)
export const usesR1FormsScalarSubset = (s: R1NodeFormsSnapshot): boolean => s.node.sourceNodeType === 'forms' && (s.definition.fields?.length ?? 0) > 50

/** This is validation, not a grant. Only the existing v2 provider can authorize
 * the exact fresh fillable set. Never infer readonly from runtime failures. */
export function r1FormsScalarSubsetSchema(s: R1NodeFormsSnapshot) {
  const fields = s.definition.fields, readonly = s.node.formFieldIdsReadOnly, fillable = s.fillableFieldIds
  if (!usesR1FormsScalarSubset(s) || s.definition.purpose === 'appointment' || !fields || fields.length > 200 || !Array.isArray(readonly) || !Array.isArray(fillable)) return deny()
  if (fields.some(f => !valid(f.fieldId) || !valid(f.valueKey) || reserved.has(f.valueKey))
    || new Set(fields.map(f => f.fieldId)).size !== fields.length
    // Conservatively reject every duplicate, before filtering any sibling.
    || new Set(fields.map(f => f.valueKey)).size !== fields.length
    || readonly.some(id => !valid(id) || !fields.some(f => f.fieldId === id)) || new Set(readonly).size !== readonly.length) return deny()
  const writable = fields.filter(f => f.readOnly !== true && !readonly.includes(f.fieldId))
  if (!writable.length || writable.length > 50 || fillable.length !== writable.length
    || new Set(fillable).size !== fillable.length || fillable.some(id => !writable.some(f => f.fieldId === id))) return deny()
  const keys = new Set(writable.map(f => f.valueKey))
  const condition = (v: unknown): void => {
    if (v === undefined) return
    if (!object(v)) return deny()
    if (v.kind === 'all') { if (!Array.isArray(v.conditions) || !v.conditions.length) return deny(); v.conditions.forEach(condition); return }
    const path = Array.isArray(v.path) && v.path.length === 1 ? v.path[0] : v.path
    // No lossy readonly controller, nested data or metadata identity context.
    if (!valid(path) || path.includes('.') || !keys.has(path) || !['equals','oneOf','includes','exists'].includes(String(v.kind))) return deny()
    if (evaluateVisibility(v as never, {}).state === 'unsupported') return deny()
  }
  const schema = writable.map(f => {
    if (typeof f.readOnly !== 'boolean' || typeof f.required !== 'boolean' || f.unsupportedReason || f.presentationOnly
      || !scalarTypes.has(f.type) || f.multiple || f.valueOption
      || (s.definition.purpose === 'survey' && f.valueKey === 'leakageCauseSelect')) return deny()
    condition(f.visibility)
    const field = actionFormSchemaFor(f)
    if (['radio','select'].includes(f.type) && (!field.inlineOptions?.length
      || new Set(field.inlineOptions.map(o => o.value)).size !== field.inlineOptions.length || field.inlineOptions.some(o => o.children?.length))) return deny()
    if (evaluateFieldState(field, { values: {}, surface: ACTION_FORM_SURFACE }).capability !== 'SUPPORTED_GENERIC') return deny()
    return field
  })
  return { fields, schema, keys }
}
function states(schema: readonly FormFieldSchema[], values: Readonly<Record<string, unknown>>) {
  return schema.map(f => { const s = evaluateFieldState(f, { values: values as never, surface: ACTION_FORM_SURFACE }); return [s.visible,s.readOnly,s.required,s.capability] })
}
function normalize(schema: readonly FormFieldSchema[], values: Readonly<Record<string, unknown>>) {
  const result = normalizeSubmission({ fields: schema, values, conditionValues: values, surface: ACTION_FORM_SURFACE })
  if (!result.ok || Object.values(result.value.values).some(v => typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean')) return deny()
  return result.value.values as Record<string, string | number | boolean>
}
export function normalizeR1FormsScalarCreate(s: R1NodeFormsSnapshot, draft: Readonly<Record<string, unknown>>) {
  const { schema, keys } = r1FormsScalarSubsetSchema(s)
  if (!object(draft) || Object.keys(draft).length > 50 || Object.keys(draft).some(k => !keys.has(k))) return deny()
  for (const f of schema) if (Object.hasOwn(draft,f.valueKey) && !evaluateFieldState(f,{values:draft as never,surface:ACTION_FORM_SURFACE}).visible) return deny()
  const out = normalize(schema,draft)
  if (!Object.keys(out).length || JSON.stringify(states(schema,draft)) !== JSON.stringify(states(schema,out))) return deny()
  return out
}
