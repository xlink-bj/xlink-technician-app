import type { AppointmentFormRead, AppointmentFormFieldRead, AppointmentFieldValue } from '@shared/ports'
import { createOperationError, type OperationSnapshot } from '@shared/types'

function validationFailure(message: string): OperationSnapshot<void> {
  return {
    state: 'failed_terminal',
    error: createOperationError('validation', message),
  }
}

function validationSucceeded(): OperationSnapshot<void> {
  return { state: 'succeeded', data: undefined }
}

function hasUsableValue(value: AppointmentFieldValue | undefined): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  return true
}

function supportedOption(field: AppointmentFormFieldRead, value: AppointmentFieldValue | undefined): boolean {
  if (!field.options?.length || value === null || value === undefined) return true
  return typeof value === 'string' && field.options.some((option) => option.value === value)
}

export function validateAppointmentValue(
  field: AppointmentFormFieldRead,
  value: AppointmentFieldValue,
): OperationSnapshot<void> {
  if (field.readOnly) return validationFailure('Read-only appointment fields cannot be changed')
  if (!supportedOption(field, value)) return validationFailure('Appointment option is not supported')
  return validationSucceeded()
}

export function validateAppointmentForm(form: AppointmentFormRead): OperationSnapshot<void> {
  for (const field of form.fields) {
    const value = form.values[field.key]
    if (field.required && !hasUsableValue(value)) {
      return validationFailure('Required appointment information is missing')
    }
    if (!supportedOption(field, value)) {
      return validationFailure('Appointment option is not supported')
    }
  }
  return validationSucceeded()
}
