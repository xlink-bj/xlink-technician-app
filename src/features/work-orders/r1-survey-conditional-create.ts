import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import type { R1LocalFieldValue } from './r1-local-form-fields'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import { evaluateFieldState } from '@runtimes/dynamic-form'
import { hasCanonicalSurveyPart, supportsSurveyPartCreate, isCompleteSurveyPart } from './r1-survey-part-create'

const keys = ['part', 'length', 'width', 'planeArea', 'memo', 'height']
const deny = (): never => { throw Error('部位条件或测量字段尚未核实，不能保存。') }

/** A new, explicit six-field slice, never a projection of the unknown 59 rows. */
export function isSurveyConditionalDraft(snapshot: R1NodeFormsSnapshot): boolean {
  const fields = snapshot.definition.fields
  return hasCanonicalSurveyPart(snapshot) && snapshot.records.length === 0 && fields?.length === keys.length
    && new Set(fields.map(field => field.valueKey)).size === keys.length
    && fields.every(field => keys.includes(field.valueKey))
}

/** Pure schema check also used after ACK, when the first record exists. */
export function supportsSurveyConditionalCreate(snapshot: R1NodeFormsSnapshot): boolean {
  const fields = snapshot.definition.fields
  if (!fields || fields.length !== keys.length || new Set(fields.map(f => f.valueKey)).size !== keys.length
    || new Set(fields.map(f => f.fieldId)).size !== keys.length || fields.some(f => !keys.includes(f.valueKey))
    || snapshot.fillableFieldIds?.length !== keys.length || new Set(snapshot.fillableFieldIds).size !== keys.length
    || snapshot.fillableFieldIds.some(id => !fields.some(f => f.fieldId === id))) return false
  if (fields.find(f => f.valueKey === 'part')?.valueOption !== 'parts') return false
  const height = fields.find(f => f.valueKey === 'height')!
  if (height.type !== 'digit' || height.preset !== true || !height.required || height.readOnly || height.multiple
    || height.unsupportedReason || height.presentationOnly || height.valueOption || height.options?.length) return false
  const condition = height.visibility
  if (condition?.kind !== 'oneOf' || condition.path !== 'part' || !condition.values.length || condition.values.length > 20) return false
  const base = { ...snapshot, definition: { ...snapshot.definition, fields: fields.filter(f => f !== height) },
    fillableFieldIds: snapshot.fillableFieldIds.filter(id => id !== height.fieldId) }
  if (!supportsSurveyPartCreate(base)) return false
  const options = fields.find(f => f.valueKey === 'part')!.options ?? []
  if (condition.values.some(path => !isCompleteSurveyPart(options, path))
    || new Set(condition.values.map(path => JSON.stringify(path))).size !== condition.values.length) return false
  return condition.values.every(part => {
    const state = evaluateFieldState(actionFormSchemaFor(height), { values: { part }, surface: ACTION_FORM_SURFACE })
    return state.visible && state.required && !state.readOnly && state.capability === 'SUPPORTED_GENERIC'
  })
}

export const supportsSurveyPartSubmission = (snapshot: R1NodeFormsSnapshot): boolean =>
  supportsSurveyPartCreate(snapshot) || supportsSurveyConditionalCreate(snapshot)

export function surveyHeightVisible(snapshot: R1NodeFormsSnapshot, values: Readonly<Record<string, unknown>>): boolean {
  if (!supportsSurveyConditionalCreate(snapshot)) return deny()
  const height = snapshot.definition.fields!.find(f => f.valueKey === 'height')!
  return evaluateFieldState(actionFormSchemaFor(height), { values: values as never, surface: ACTION_FORM_SURFACE }).visible
}

/** R1 onCascaderFinish clears scalar dependents to '' on full-path mismatch. */
export function surveyConditionalPartAfterChange(snapshot: R1NodeFormsSnapshot,
  values: Readonly<Record<string, R1LocalFieldValue>>, part: readonly string[]): Record<string, R1LocalFieldValue> {
  if (!supportsSurveyConditionalCreate(snapshot)) return deny()
  const next = { ...values, part: Object.freeze([...part]) }
  return surveyHeightVisible(snapshot, next) ? next : { ...next, height: '' }
}

/** Fixed Java turns the empty Double input into null and Mongo omits it.
 * A stale EXTS duplicate must never shadow that authoritative root result. */
export function sameClearedSurveyHeight(original: Readonly<Record<string, unknown>> | null | undefined): boolean {
  if (!original || (Object.hasOwn(original, 'height') && original.height !== null)) return false
  if (original.exts === undefined) return true
  return Boolean(original.exts && typeof original.exts === 'object' && !Array.isArray(original.exts)
    && !Object.hasOwn(original.exts, 'height'))
}

/** Preset height is a numeric root; a display value from EXTS alone is not
 * authoritative evidence of typed persistence. */
export function sameVisibleSurveyHeight(original: Readonly<Record<string, unknown>> | null | undefined, expected: number): boolean {
  if (!original || !Object.hasOwn(original, 'height') || typeof original.height !== 'number'
    || !Number.isFinite(original.height) || original.height !== expected) return false
  if (original.exts === undefined) return true
  if (!original.exts || typeof original.exts !== 'object' || Array.isArray(original.exts)) return false
  return !Object.hasOwn(original.exts, 'height')
    || (typeof (original.exts as Record<string, unknown>).height === 'number'
      && (original.exts as Record<string, unknown>).height === expected)
}

export function sameSurveyConditionalScalar(original: Readonly<Record<string, unknown>> | null | undefined,
  key: string, expected: string | number): boolean {
  if (!['length', 'width', 'planeArea', 'memo', 'height'].includes(key) || !original || !Object.hasOwn(original, key)
    || typeof original[key] !== typeof expected || original[key] !== expected
    || (typeof expected === 'number' && !Number.isFinite(expected))) return false
  if (original.exts === undefined) return true
  if (!original.exts || typeof original.exts !== 'object' || Array.isArray(original.exts)) return false
  return !Object.hasOwn(original.exts, key)
    || (typeof (original.exts as Record<string, unknown>)[key] === typeof expected
      && (original.exts as Record<string, unknown>)[key] === expected)
}
