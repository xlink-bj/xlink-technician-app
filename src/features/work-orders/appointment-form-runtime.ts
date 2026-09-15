import {
  evaluateFieldState,
  normalizeFieldValue,
  normalizeSubmission,
} from '@runtimes/dynamic-form'
import type {
  EffectiveFieldState,
  FormFieldSchema,
  NormalizedFieldValue,
} from '@runtimes/dynamic-form'
import type {
  AppointmentFieldValue,
  AppointmentFormFieldRead,
  AppointmentFormRead,
} from '@shared/ports'
import { createOperationError, type OperationSnapshot } from '@shared/types'

export interface AppointmentRuntimeField extends AppointmentFormFieldRead {
  readonly runtime: EffectiveFieldState
}

function schemaFor(field: AppointmentFormFieldRead): FormFieldSchema {
  return {
    key: field.key,
    type: field.type,
    required: field.required,
    readOnly: field.readOnly,
    ...(field.options?.length ? { inlineOptions: field.options } : {}),
  }
}

function runtimeFieldState(
  field: AppointmentFormFieldRead,
  values: Readonly<Record<string, AppointmentFieldValue>>,
): EffectiveFieldState {
  return evaluateFieldState(schemaFor(field), { values })
}

export function appointmentRuntimeFieldsFor(
  form: AppointmentFormRead,
): readonly AppointmentRuntimeField[] {
  return form.fields
    .map((field) => ({
      ...field,
      runtime: runtimeFieldState(field, form.values),
    }))
    .filter((field) => field.runtime.visible && field.runtime.capability !== 'UNSUPPORTED')
}

function appointmentValue(value: NormalizedFieldValue): AppointmentFieldValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return undefined
}

function resultFromSubmission(
  result: ReturnType<typeof normalizeSubmission>,
): OperationSnapshot<Readonly<Record<string, AppointmentFieldValue>>> {
  if (!result.ok) {
    return {
      state: 'failed_terminal',
      error: createOperationError(
        result.reason === 'unsupported_capability' ? 'unsupported_capability' : 'validation',
        result.message,
        { reason: result.fieldKey },
      ),
    }
  }

  const values: Record<string, AppointmentFieldValue> = {}
  for (const [key, value] of Object.entries(result.value.values)) {
    const normalized = appointmentValue(value)
    if (normalized === undefined) {
      return {
        state: 'failed_terminal',
        error: createOperationError('unsupported_capability', 'Appointment field value shape is unsupported', {
          reason: key,
        }),
      }
    }
    values[key] = normalized
  }
  return { state: 'succeeded', data: values }
}

export function normalizeAppointmentForm(
  form: AppointmentFormRead,
): OperationSnapshot<Readonly<Record<string, AppointmentFieldValue>>> {
  return resultFromSubmission(
    normalizeSubmission({
      fields: form.fields.map(schemaFor),
      values: form.values,
    }),
  )
}

export function normalizeAppointmentFieldValue(
  field: AppointmentFormFieldRead,
  value: AppointmentFieldValue,
  values: Readonly<Record<string, AppointmentFieldValue>>,
): OperationSnapshot<AppointmentFieldValue> {
  const schema = schemaFor(field)
  const state = evaluateFieldState(schema, { values: { ...values, [field.key]: value } })
  if (state.capability === 'UNSUPPORTED') {
    return {
      state: 'failed_terminal',
      error: createOperationError('unsupported_capability', state.reason ?? 'Appointment field is unsupported'),
    }
  }
  if (state.readOnly) {
    return {
      state: 'failed_terminal',
      error: createOperationError('validation', 'Read-only appointment fields cannot be changed'),
    }
  }
  if (!state.visible) {
    return {
      state: 'failed_terminal',
      error: createOperationError('validation', 'Hidden appointment fields cannot be changed'),
    }
  }

  const normalized = normalizeFieldValue(schema.type, value, schema.inlineOptions)
  if (!normalized.ok) {
    return {
      state: 'failed_terminal',
      error: createOperationError(
        normalized.reason === 'unsupported_field_type' ? 'unsupported_capability' : 'validation',
        normalized.message,
      ),
    }
  }
  const result = appointmentValue(normalized.value)
  if (result === undefined) {
    return {
      state: 'failed_terminal',
      error: createOperationError('unsupported_capability', 'Appointment field value shape is unsupported'),
    }
  }
  return { state: 'succeeded', data: result }
}
