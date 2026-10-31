/**
 * One R1 FormFieldRead -> Dynamic Form Runtime schema projection.
 *
 * Shared by the specialized Appointment UX and generic Action Content.
 * Business semantics (visit branch, Survey special tools, controlled leakage
 * cause) remain with their respective feature. This module projects verified
 * field metadata and the shared Workflow instance field readonly decision.
 * Never infer an unsupported field as editable.
 */
import type { FormFieldSchema, FormRuntimeSurface } from '@runtimes/dynamic-form'
import type { AppointmentFormFieldRead, DynamicFormRead } from '@shared/ports'

export const ACTION_FORM_SURFACE: FormRuntimeSurface = 'mobile_detail'

/** Workflow instance readonly wins over a field's editable metadata.
 * Keep identity comparison compatible with R1's string-coercing field IDs.
 * Generic Dynamic Action and controlled Survey rows must use the same rule.
 */
export function isWorkflowFieldReadOnly(
  form: Pick<DynamicFormRead, 'workflowReadOnlyFieldIds'>,
  field: Pick<AppointmentFormFieldRead, 'fieldId'>,
): boolean {
  return form.workflowReadOnlyFieldIds?.some((id) => String(id) === String(field.fieldId)) ?? false
}

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
    ...(field.mobileDetailHidden ? { mobileDetailHidden: true } : {}),
    ...(field.presentationOnly ? { presentationOnly: true } : {}),
    ...(field.multiple !== undefined ? { multiple: field.multiple } : {}),
    ...(field.options?.length ? { inlineOptions: field.options } : {}),
    ...(field.visibility ? { visibility: field.visibility } : {}),
    ...(field.valueOption ? { valueOption: field.valueOption } : {}),
    ...(unsupportedReason ? { unsupportedReason } : {}),
  }
}
