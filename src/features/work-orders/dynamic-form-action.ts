import {
  evaluateFieldState,
  normalizeFieldValue,
  normalizeSubmission,
} from '@runtimes/dynamic-form'
import type { EffectiveFieldState, FormFieldSchema, NormalizedFieldValue } from '@runtimes/dynamic-form'
import type { DynamicFormRead, AppointmentFormFieldRead } from '@shared/ports'
import type { FormFieldValue } from '@shared/ports/api'
import type { OperationSnapshot } from '@shared/types'
import { createOperationError } from '@shared/types'

export interface DynamicActionField extends AppointmentFormFieldRead {
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

function toFormValue(value: NormalizedFieldValue): FormFieldValue {
  if (Array.isArray(value)) return value.map((item) => String(item))
  return value
}

function fieldState(
  field: AppointmentFormFieldRead,
  values: Readonly<Record<string, FormFieldValue>>,
): EffectiveFieldState {
  return evaluateFieldState(schemaFor(field), { values })
}

export function dynamicActionFieldsFor(form: DynamicFormRead): readonly DynamicActionField[] {
  return form.fields.map((field) => ({
    ...field,
    runtime: fieldState(field, form.values),
  }))
}

export function dynamicActionUnsupportedFieldsFor(form: DynamicFormRead): readonly DynamicActionField[] {
  return dynamicActionFieldsFor(form).filter((field) => field.runtime.capability === 'UNSUPPORTED')
}

export function normalizeDynamicForm(
  form: DynamicFormRead,
): OperationSnapshot<Readonly<Record<string, FormFieldValue>>> {
  const result = normalizeSubmission({
    fields: form.fields.map(schemaFor),
    values: form.values,
  })
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

  const values: Record<string, FormFieldValue> = {}
  for (const [key, value] of Object.entries(result.value.values)) values[key] = toFormValue(value)
  return { state: 'succeeded', data: values }
}

export function normalizeDynamicFieldValue(
  form: DynamicFormRead,
  field: AppointmentFormFieldRead,
  value: FormFieldValue,
): OperationSnapshot<FormFieldValue> {
  const state = fieldState(field, { ...form.values, [field.key]: value })
  if (state.capability === 'UNSUPPORTED') {
    return {
      state: 'failed_terminal',
      error: createOperationError('unsupported_capability', state.reason ?? 'Dynamic field is unsupported'),
    }
  }
  if (state.readOnly) {
    return {
      state: 'failed_terminal',
      error: createOperationError('validation', 'Read-only fields cannot be changed'),
    }
  }
  if (!state.visible) {
    return {
      state: 'failed_terminal',
      error: createOperationError('validation', 'Hidden fields cannot be changed'),
    }
  }

  const normalized = normalizeFieldValue(field.type, value, field.options)
  if (!normalized.ok) {
    return {
      state: 'failed_terminal',
      error: createOperationError(
        normalized.reason === 'unsupported_field_type' ? 'unsupported_capability' : 'validation',
        normalized.message,
      ),
    }
  }
  return { state: 'succeeded', data: toFormValue(normalized.value) }
}
