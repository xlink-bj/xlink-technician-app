import type { FormFieldRead } from '@shared/ports'
import { isMultilineField, usesCascadeSheet, type FormPresentationMode } from './form-presentation'

export type DynamicFieldControl =
  | 'cascade-sheet'
  | 'cascade-inline'
  | 'multi-choice'
  | 'single-choice'
  | 'textarea'
  | 'binary'
  | 'rating'
  | 'datetime'
  | 'date'
  | 'time'
  | 'media'
  | 'input'

/**
 * Field control routing is a PURE projection of verified, normalized FormDef
 * metadata. No Survey/Appointment/Acceptance checks or hard-coded valueKeys.
 *
 * Architecture contract:
 * - fieldId identifies an ExtField ROW; valueKey identifies FormData values
 *   and can repeat. Never infer control identity from valueKey.
 * - Runtime owns applicability, visibility, required/readOnly and validation.
 * - Option Providers + Adapters own option provenance and wire codecs.
 * - This registry chooses only the visual input control; never dispatch
 *   upload/Save/Workflow commands or treat unsupported fields as editable.
 * - Keep precedence stable: a confirmed hierarchical cascade uses the shared
 *   sheet only in task mode; ordinary cascade/choice, multiline, media, then
 *   scalar input mirror the legacy renderer's exact fallback semantics.
 */
export function fieldControlFor(
  field: Pick<FormFieldRead, 'type' | 'valueKey' | 'multiple' | 'options'>,
  mode: FormPresentationMode,
): DynamicFieldControl {
  if (usesCascadeSheet(field, mode)) return 'cascade-sheet'
  if (field.type === 'cascade' && field.options?.length) return 'cascade-inline'
  if (field.options?.length && (field.multiple || field.type === 'checkbox')) return 'multi-choice'
  if (field.options?.length) return 'single-choice'
  // Explicit source types outrank field-name heuristics. A date field whose
  // business key happens to contain "notes" must remain a date selector.
  // R1 van-switch is a literal 1/0 FormData code, NOT a boolean. A choice
  // control makes both states explicit without writing a default until user
  // interaction. Numeric/date widgets must retain source wire values too.
  if (field.type === 'switch') return 'binary'
  if (field.type === 'rate') return 'rating'
  if (field.type === 'datetime') return 'datetime'
  if (field.type === 'date') return 'date'
  if (field.type === 'time') return 'time'
  if (isMultilineField(field)) return 'textarea'
  if (field.type === 'image' || field.type === 'file') return 'media'
  return 'input'
}
