import { normalizeAppointmentForm, normalizeAppointmentFieldValue } from './appointment-form-runtime'
import type { AppointmentFormRead, AppointmentFormFieldRead, AppointmentFieldValue } from '@shared/ports'
import { type OperationSnapshot } from '@shared/types'

export function validateAppointmentValue(
  field: AppointmentFormFieldRead,
  value: AppointmentFieldValue,
  values: Readonly<Record<string, AppointmentFieldValue>> = {},
): OperationSnapshot<void> {
  const result = normalizeAppointmentFieldValue(field, value, values)
  return result.state === 'succeeded'
    ? { state: 'succeeded', data: undefined }
    : { state: result.state, ...(result.error ? { error: result.error } : {}) }
}

export function validateAppointmentForm(form: AppointmentFormRead): OperationSnapshot<void> {
  const result = normalizeAppointmentForm(form)
  return result.state === 'succeeded'
    ? { state: 'succeeded', data: undefined }
    : { state: result.state, ...(result.error ? { error: result.error } : {}) }
}

export { normalizeAppointmentForm }
