import type { FormFieldRead } from '@shared/ports'
import { isMultilineField, usesCascadeSheet, type FormPresentationMode } from './form-presentation'

export type DynamicFieldControl =
  | 'cascade-sheet'
  | 'cascade-inline'
  | 'multi-choice'
  | 'single-choice'
  | 'textarea'
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
  if (isMultilineField(field)) return 'textarea'
  if (field.type === 'image' || field.type === 'file') return 'media'
  return 'input'
}
