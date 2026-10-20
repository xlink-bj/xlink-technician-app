/**
 * One R1 FormFieldRead -> Dynamic Form Runtime schema projection.
 *
 * Shared by the specialized Appointment UX and generic Action Content.
 * Business semantics (visit branch, Survey special tools, controlled leakage
 * cause) remain with their respective feature; this module only transfers
 * verified field metadata. Never infer an unsupported field as editable.
 */
import type { FormFieldSchema, FormRuntimeSurface } from '@runtimes/dynamic-form'
import type { AppointmentFormFieldRead } from '@shared/ports'

export const ACTION_FORM_SURFACE: FormRuntimeSurface = 'mobile_detail'

export function actionFormSchemaFor(
  field: AppointmentFormFieldRead,
  options: { readonly unsupportedReason?: string } = {},
): FormFieldSchema {
  const unsupportedReason = options.unsupportedReason ?? field.unsupportedReason
  return {
    fieldId: field.fieldId,
    valueKey: field.valueKey,
    type: field.type,
    required: field.required,
    readOnly: field.readOnly,
    ...(field.order !== undefined ? { order: field.order } : {}),
    ...(field.state !== undefined ? { state: field.state } : {}),
    ...(field.fixed !== undefined ? { fixed: field.fixed } : {}),
    ...(field.operationType !== undefined ? { operationType: field.operationType } : {}),
    ...(field.presentation ? { presentation: field.presentation as Readonly<Record<string, string | number | boolean>> } : {}),
    ...(field.showList ? { showList: field.showList } : {}),
    ...(field.multiple !== undefined ? { multiple: field.multiple } : {}),
    ...(field.options?.length ? { inlineOptions: field.options } : {}),
    ...(field.visibility ? { visibility: field.visibility } : {}),
    ...(field.valueOption ? { valueOption: field.valueOption } : {}),
    ...(unsupportedReason ? { unsupportedReason } : {}),
  }
}
