import {hasR1OrdinaryCreatePlan,normalizeR1OrdinaryCreate,projectR1OrdinaryCreate,updateR1OrdinaryCreateDraft} from './r1-ordinary-create-plan'
import {usesR1FormsChoiceCreate,normalizeR1FormsChoiceCreate,projectR1FormsChoiceFields,transitionR1FormsChoiceDraft} from './r1-forms-choice-create'
import { isSurveyConditionalDraft, supportsSurveyConditionalCreate, supportsSurveyPartSubmission, surveyConditionalPartAfterChange, surveyHeightVisible } from './r1-survey-conditional-create'
import { hasCanonicalSurveyPart, isSurveyPartCreateDraft, isCompleteSurveyPart } from './r1-survey-part-create'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import type { R1LocalField } from './r1-local-form-fields'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import { evaluateFieldState, normalizeSubmission } from '@runtimes/dynamic-form'
import { normalizeDynamicForm } from './dynamic-form-action'
import { r1SurveyPlaneAreaAfterChange } from './survey-plane-area'
import type { R1LocalFieldValue } from './r1-local-form-fields'
import type { FormFieldValue } from '@shared/ports'
import { usesR1FormsScalarSubset, r1FormsScalarSubsetSchema, normalizeR1FormsScalarCreate } from './r1-forms-scalar-subset'
import { usesR1NormalFileCreate, normalizeR1NormalFileCreate, projectR1NormalFileFields, type R1NormalFileCreateValues } from './r1-normal-file-values'
const deny = (): never => { throw Error('字段、选项或规则尚未核实，不能保存。') }
const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.trim() === v && !v.includes(',')
const reserved = new Set(['id', '_id', 'dataId', 'formDataId', 'formDefId', 'definitionId', 'extId', 'tenantId', 'userId', 'roleId', 'sid', 'smodule', 'state', 'nodeId', 'runtimeNodeId', 'workOrderId', 'workflowId', 'workflowRunId', 'runId', 'workflow', 'formDefinitionId', 'dataStr', 'exts', '__proto__', 'prototype', 'constructor', 'createTime', 'createDateTime', 'createUser', 'createUserName', 'updateTime', 'updateDateTime', 'updateUser', 'updateUserName', 'orgId', 'belongTo', '_version', '_class'])
const scalarTypes = new Set(['text', 'textarea', 'phone', 'IDNumber', 'number', 'digit', 'date', 'time', 'datetime', 'radio', 'select'])

/** Local draft transition only. The provider, original-record provenance and
 * submission guards still independently decide whether anything can save. */
export function updateR1FormDraftValue(snapshot: R1NodeFormsSnapshot, values: Readonly<Record<string, R1LocalFieldValue>>,
  key: string, value: R1LocalFieldValue): Record<string, R1LocalFieldValue> {
  if(hasR1OrdinaryCreatePlan(snapshot))return updateR1OrdinaryCreateDraft(snapshot,values,key,value)
  if ((isSurveyPartCreateDraft(snapshot) || isSurveyConditionalDraft(snapshot)) && ['part', 'length', 'width'].includes(key)
    && !supportsSurveyPartSubmission(snapshot)) return deny()
  if (key === 'part' && hasCanonicalSurveyPart(snapshot)) {
    const part = snapshot.definition.fields!.find(field => field.valueKey === 'part')!
    if (!supportsSurveyPartSubmission(snapshot) || !isCompleteSurveyPart(part.options ?? [], value)) return deny()
    return supportsSurveyConditionalCreate(snapshot) ? surveyConditionalPartAfterChange(snapshot, values, value)
      : { ...values, part: Object.freeze([...value]) }
  }
  if (isSurveyConditionalDraft(snapshot) && key === 'height'
    && (!supportsSurveyConditionalCreate(snapshot) || !surveyHeightVisible(snapshot, values))) return deny()
  if(usesR1FormsChoiceCreate(snapshot))return transitionR1FormsChoiceDraft(snapshot,{...values,[key]:Array.isArray(value)?Object.freeze([...value]):value}) as Record<string,R1LocalFieldValue>
  const next = { ...values, [key]: value }
  const area = r1SurveyPlaneAreaAfterChange({ definitionId: snapshot.definition.id, purpose: snapshot.definition.purpose, values }, key, next)
  if (!area) return next
  const source = projectR1RepeatFields(snapshot, values).filter(f => f.valueKey === key && f.supported)
  const target = projectR1RepeatFields(snapshot, next).filter(f => f.valueKey === 'planeArea')
  if (source.length !== 1 || target.length !== 1 || !target[0]!.supported || target[0]!.type !== 'digit'
    || (typeof area.value === 'number' && !Number.isFinite(area.value))) return deny()
  return { ...next, planeArea: area.value }
}
export function normalizeR1RepeatValues(snapshot: R1NodeFormsSnapshot, values: Readonly<Record<string, unknown>>): Record<string, R1NormalFileCreateValues[string] | readonly string[]> {
  if(hasR1OrdinaryCreatePlan(snapshot))return normalizeR1OrdinaryCreate(snapshot,values)
  if(usesR1FormsChoiceCreate(snapshot))return normalizeR1FormsChoiceCreate(snapshot,values)
  if (usesR1NormalFileCreate(snapshot)) return normalizeR1NormalFileCreate(snapshot, values)
  if (usesR1FormsScalarSubset(snapshot)) return normalizeR1FormsScalarCreate(snapshot,values)
  const fields = snapshot.definition.fields
  if (!fields?.length || fields.length > 50 || !values || typeof values !== 'object' || Array.isArray(values)) return deny()
  const schema = fields.map(f => actionFormSchemaFor({ ...f, readOnly: f.readOnly || snapshot.node.formFieldIdsReadOnly?.includes(f.fieldId) === true }))
  const appointment = snapshot.definition.purpose === 'appointment'
  const clearHeight = supportsSurveyConditionalCreate(snapshot) && !surveyHeightVisible(snapshot, values)
  if (clearHeight && Object.hasOwn(values, 'height') && values.height !== '') return deny()
  if (supportsSurveyPartSubmission(snapshot)) {
    const part = fields.find(field => field.valueKey === 'part')!
    if (!isCompleteSurveyPart(part.options ?? [], values.part)) return deny()
  }
  if (new Set(fields.map(f => f.valueKey)).size !== fields.length) return deny()
  for (const field of schema) {
    if (!validId(field.valueKey) || reserved.has(field.valueKey)) return deny()
    const state = evaluateFieldState(field, { values, surface: ACTION_FORM_SURFACE })
    const submitted = Object.hasOwn(values, field.valueKey)
    // New appointment drafts retain only their verified six business fields.
    // Other forms still have no hidden-value contract; metadata and the edit-only
    // reason may never be introduced through a new-record draft.
    if (state.capability === 'UNSUPPORTED' || (!scalarTypes.has(field.type) && !(field.valueKey === 'part' && supportsSurveyPartSubmission(snapshot))) || field.multiple) return deny()
    if (appointment && submitted && field.valueKey === 'modifyReason') return deny()
    if (!state.visible && submitted && !appointment && !(clearHeight && field.valueKey === 'height')) return deny()
    if ((state.readOnly || state.capability === 'PRESENTATION_ONLY') && (submitted || (state.visible && field.required))) return deny()
    if (['radio', 'select'].includes(field.type) && (!field.inlineOptions?.length
      || new Set(field.inlineOptions.map(o => o.value)).size !== field.inlineOptions.length
      || field.inlineOptions.some(o => o.children?.length))) return deny()
  }
  if (Object.keys(values).some(key => reserved.has(key) || !fields.some(f => f.valueKey === key))) return deny()
  let normalized: Readonly<Record<string, unknown>>
  if (appointment) {
    const result = normalizeDynamicForm({ definitionId: snapshot.definition.id, purpose: 'appointment', fields,
      values: values as Readonly<Record<string, FormFieldValue>>,
      workflowReadOnlyFieldIds: snapshot.node.formFieldIdsReadOnly })
    if (result.state !== 'succeeded' || !result.data) return deny()
    normalized = result.data
  } else {
    const result = normalizeSubmission({ fields: schema, values, surface: ACTION_FORM_SURFACE })
    if (!result.ok) return deny()
    normalized = result.value.values
  }
  const out: Record<string, string | number | boolean | readonly string[]> = {}
  for (const [key, value] of Object.entries(normalized)) {
    if (key === 'part' && supportsSurveyPartSubmission(snapshot)) {
      const part = fields.find(field => field.valueKey === 'part')!
      if (!isCompleteSurveyPart(part.options ?? [], value)) return deny()
      out[key] = Object.freeze([...value])
      continue
    }
    if (!['string', 'number', 'boolean'].includes(typeof value)) return deny()
    out[key] = value as string | number | boolean
  }
  // Only the verified cleared scalar gets R1's explicit empty root.
  if (clearHeight) out.height = ''
  return out
}

/** Same schema and conditions as the submission validator, without granting a command. */
export function projectR1RepeatFields(snapshot: R1NodeFormsSnapshot, values: Readonly<Record<string, unknown>>): readonly (R1LocalField & { readonly visible: boolean })[] {
  if(hasR1OrdinaryCreatePlan(snapshot))return projectR1OrdinaryCreate(snapshot,values)
  if(usesR1FormsChoiceCreate(snapshot))return projectR1FormsChoiceFields(snapshot,values)
  if (usesR1NormalFileCreate(snapshot)) return projectR1NormalFileFields(snapshot, values)
  if (usesR1FormsScalarSubset(snapshot)) {
    try {
      return r1FormsScalarSubsetSchema(snapshot).schema.map(field => {
        const state=evaluateFieldState(field,{values:values as never,surface:ACTION_FORM_SURFACE})
        return {fieldId:field.fieldId,valueKey:field.valueKey,label:snapshot.definition.fields!.find(f=>f.fieldId===field.fieldId)!.label,
          type:field.type,required:state.required,readOnly:state.readOnly,options:field.inlineOptions??[],multiple:false,
          visible:state.visible,supported:state.visible&&!state.readOnly&&state.capability==='SUPPORTED_GENERIC'}
      })
    } catch { return [] }
  }
  return (snapshot.definition.fields ?? []).map(field => {
    const schema = actionFormSchemaFor({ ...field, readOnly: field.readOnly || snapshot.node.formFieldIdsReadOnly?.includes(field.fieldId) === true })
    const state = evaluateFieldState(schema, { values: values as never, surface: ACTION_FORM_SURFACE })
    return { fieldId: field.fieldId, valueKey: field.valueKey, label: field.label, type: field.type,
      required: state.required, readOnly: state.readOnly, options: field.options ?? [], multiple: Boolean(field.multiple),
      visible: state.visible,
      ...(field.presentation?.placeholder ? { placeholder: field.presentation.placeholder } : {}),
      supported: state.capability === 'SUPPORTED_GENERIC' && state.visible && !state.readOnly && (scalarTypes.has(field.type) || (field.valueKey === 'part' && supportsSurveyPartSubmission(snapshot))) && !field.multiple,
      ...(state.reason ? { reason: state.reason } : {}) }
  })
}
