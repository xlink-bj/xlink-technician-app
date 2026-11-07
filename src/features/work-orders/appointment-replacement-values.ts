import { appointmentBusinessKeys, appointmentNullBusinessKey, appointmentReplacementProblem } from '@shared/form/appointment-replacement-context'
import type { AppointmentFormRead, DynamicFormRead, FormFieldValue } from '@shared/ports'
import { evaluateFieldState, isFieldApplicable, normalizeFieldValue } from '@runtimes/dynamic-form'
import { createOperationError, type OperationSnapshot } from '@shared/types'
import { actionFormConditionValues } from './action-form-condition-context'
import { actionFormSchemaFor, ACTION_FORM_SURFACE, isWorkflowFieldReadOnly } from './action-form-schema'

/** Source-backed six-field replacement projection, separate from visible required
 * validation. Never echo raw records, unsupported values, or readonly hidden edits.
 */
export function appointmentReplacementValues(
  form: AppointmentFormRead | DynamicFormRead,
  effective: Readonly<Record<string, FormFieldValue>>,
): OperationSnapshot<Readonly<Record<string, FormFieldValue>>> {
  const fail = (message: string) => ({ state: 'failed_terminal' as const, error: createOperationError('unsupported_capability', message) })
  const problem = appointmentReplacementProblem(form)
  if (problem) return fail(problem)
  if (appointmentNullBusinessKey(form.values)) return fail('Null appointment business values are not a supported clear operation')
  const allowed = new Set<string>(appointmentBusinessKeys)
  for (const key of Object.keys(form.values)) {
    if (key !== '_id' && !allowed.has(key)) return fail(`Appointment replacement cannot preserve unknown field: ${key}`)
  }
  const values = { ...effective }
  for (const key of appointmentBusinessKeys) {
    // New records have no permitted edit event for the identity-gated reason.
    if (key === 'modifyReason' && !form.dataId) continue
    const raw = form.values[key]
    if (raw === undefined) continue
    const fields = form.fields.filter(field => field.valueKey === key)
    if (!fields.length) return fail(`Appointment replacement has no schema for ${key}`)
    for (const field of fields) {
      const schema = actionFormSchemaFor(field)
      const state = evaluateFieldState(schema, {
        values: actionFormConditionValues(form), surface: ACTION_FORM_SURFACE,
        workflowReadOnly: isWorkflowFieldReadOnly(form as DynamicFormRead, field),
      })
      if (!isFieldApplicable(schema, ACTION_FORM_SURFACE) || state.capability !== 'SUPPORTED_GENERIC'
        || state.readOnly) return fail(`Appointment replacement cannot preserve ${key} on this surface`)
      if (typeof raw !== 'string') return fail(`Appointment replacement requires a string value for ${key}`)
      // Only the evidenced empty text input has an explicit clearing contract.
      if (raw === '' && !['text', 'textarea', 'phone'].includes(field.type)) return fail(`Appointment empty ${key} has no verified clear contract`)
      if (['need', 'reasons1'].includes(key) && (!field.options?.length || !field.options.some(option => option.value === raw))) return fail(`Appointment option provider is not verified: ${key}`)
      const normalized = normalizeFieldValue(field.type, raw, field.options, field.multiple)
      if (!normalized.ok || typeof normalized.value !== 'string') return fail(`Appointment replacement value is invalid: ${key}`)
      if (Object.prototype.hasOwnProperty.call(values, key) && values[key] !== normalized.value) return fail(`Appointment duplicate field projection disagrees: ${key}`)
      values[key] = state.visible ? normalized.value : raw
    }
  }
  return { state: 'succeeded', data: values }
}
