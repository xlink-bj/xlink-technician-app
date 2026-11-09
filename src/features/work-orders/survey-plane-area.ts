import type { DynamicFormRead, FormFieldValue } from '@shared/ports'
import { normalizeFieldValue } from '@runtimes/dynamic-form'

/** Pinned R1 serviceAppointment.vue:7929-7947. This is a named FormDef
 * special case, NOT an interpreter for calculateConfig or a write grant. */
export function isR1SurveyMeasurementField(
  form: Pick<DynamicFormRead, 'definitionId' | 'purpose'>,
  changedKey: string,
): boolean {
  return form.purpose === 'survey' && form.definitionId === '7971040108398070730'
    && (changedKey === 'length' || changedKey === 'width')
}

/** part gates calculation, not the types retained by earlier input events. */
export function isR1SurveyPlaneAreaMeasurement(
  form: Pick<DynamicFormRead, 'definitionId' | 'purpose' | 'values'>,
  changedKey: string,
): boolean {
  const part = form.values.part
  return isR1SurveyMeasurementField(form, changedKey)
    && (typeof part === 'string' || Array.isArray(part)) && String(part[0]) === '3'
}

/** Keep R1's truthiness, strict numeric-zero branch and toFixed/parseFloat
 * order. Callers must authorize both the input row and derived target, and
 * reject non-finite output before committing a draft. No mutation or I/O. */
export function r1SurveyPlaneAreaAfterChange(
  form: Pick<DynamicFormRead, 'definitionId' | 'purpose' | 'values'>,
  changedKey: string,
  nextValues: Readonly<Record<string, FormFieldValue>>,
): { readonly value: number | '' } | undefined {
  if (!isR1SurveyPlaneAreaMeasurement({ ...form, values: nextValues }, changedKey)) return undefined
  const { length, width } = nextValues
  // Retain the existing frontend digit contract for a persisted peer value
  // too. Number(["3"]) must not make a malformed digit look supported.
  if ([length, width].some(value => value !== undefined && value !== null && value !== ''
    && !normalizeFieldValue('digit', value).ok)) return { value: NaN }
  return { value: length && width
    ? parseFloat((Number(length) * Number(width)).toFixed(2))
    : length === 0 || width === 0 ? 0 : '' }
}
