import type { FormFieldOptionRead } from '@shared/ports'
import type { R1NodeFormsSnapshot } from './r1-node-forms-read'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import { evaluateFieldState } from '@runtimes/dynamic-form'

const canonicalSurvey = '7971040108398070730'
const fieldTypes: Readonly<Record<string, string>> = {
  part: 'cascade', length: 'digit', width: 'digit', planeArea: 'digit', memo: 'textarea',
}

/** The initial rollout covers this unconditional measurement subset only.
 * Conditional part clearing needs separately verified field conditions. */
export function hasCanonicalSurveyPart(snapshot: R1NodeFormsSnapshot): boolean {
  return snapshot.node.sourceNodeType === 'repeat'
    && snapshot.definition.id === canonicalSurvey && snapshot.definition.purpose === 'survey'
    && snapshot.definition.fields?.some(field => field.valueKey === 'part') === true
}

/** Structural boundary only: malformed permissions in this new slice must fail
 * closed, while older/larger Survey drafts retain their existing area rules. */
export function isSurveyPartCreateDraft(snapshot: R1NodeFormsSnapshot): boolean {
  const fields = snapshot.definition.fields
  return hasCanonicalSurveyPart(snapshot) && snapshot.records.length === 0
    && fields?.length === 5 && new Set(fields.map(field => field.valueKey)).size === 5
    && fields.every(field => Object.hasOwn(fieldTypes, field.valueKey))
}

export function supportsSurveyPartCreate(snapshot: R1NodeFormsSnapshot): boolean {
  const fields = snapshot.definition.fields
  if (!hasCanonicalSurveyPart(snapshot)
    || snapshot.node.formDefinitionId !== canonicalSurvey || !fields || fields.length !== 5
    || new Set(fields.map(field => field.valueKey)).size !== 5
    || new Set(fields.map(field => field.fieldId)).size !== 5
    || snapshot.node.formFieldIdsReadOnly?.length !== 0
    || snapshot.fillableFieldIds?.length !== 5 || new Set(snapshot.fillableFieldIds).size !== 5
    || snapshot.fillableFieldIds.some(id => !fields.some(field => field.fieldId === id))) return false
  for (const field of fields) {
    if (field.type !== fieldTypes[field.valueKey] || field.multiple || field.readOnly
      || field.preset !== true || field.visibility || field.presentationOnly || field.unsupportedReason
      || (field.valueKey !== 'memo' && !field.required)) return false
    const state = evaluateFieldState(actionFormSchemaFor(field), { values: {}, surface: ACTION_FORM_SURFACE })
    if (!state.visible || state.readOnly || state.capability !== 'SUPPORTED_GENERIC') return false
  }
  const part = fields.find(field => field.valueKey === 'part')!
  return typeof part.valueOption === 'string' && part.valueOption.length > 0
    && part.options?.some(option => Boolean(option.children?.length)) === true
}

/** A Vant finish event is a complete root-to-leaf string path. */
export function isCompleteSurveyPart(
  options: readonly FormFieldOptionRead[],
  value: unknown,
): value is readonly string[] {
  if (!Array.isArray(value) || !value.length || value.length > 20
    || value.some(segment => typeof segment !== 'string' || !segment || segment.trim() !== segment)) return false
  let level = options
  for (const segment of value) {
    const matches = level.filter(option => option.value === segment)
    if (matches.length !== 1 || !Array.isArray(matches[0]!.children)) return false
    level = matches[0]!.children!
  }
  return level.length === 0
}

export function surveyPartSchemaIdentity(snapshot: R1NodeFormsSnapshot): string {
  return JSON.stringify([snapshot.workOrderId, snapshot.node, snapshot.definition, snapshot.fillableFieldIds])
}

/** Typed Survey stores part at the root. An optional duplicate EXTS slot must agree. */
export function sameSurveyPartSlots(
  original: Readonly<Record<string, unknown>> | null | undefined,
  expected: readonly string[],
): boolean {
  const same = (value: unknown) => Array.isArray(value) && value.length === expected.length
    && expected.every((segment, index) => typeof value[index] === 'string' && value[index] === segment)
  if (!original || !same(original.part)) return false
  if (original.exts === undefined) return true
  if (!original.exts || typeof original.exts !== 'object' || Array.isArray(original.exts)) return false
  return !Object.hasOwn(original.exts, 'part') || same((original.exts as Record<string, unknown>).part)
}
