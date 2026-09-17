import {
  evaluateFieldState,
  evaluateVisibility,
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

function actionUnsupportedReasonFor(field: AppointmentFormFieldRead, values: Readonly<Record<string, FormFieldValue>>): string | undefined {
  if (field.unsupportedReason) return field.unsupportedReason
  if (field.type !== 'checkbox' && field.type !== 'cascade') return undefined
  return evaluateVisibility(field.visibility, values).state === 'visible'
    ? `${field.type} requires a multi-value Action Content control`
    : undefined
}

function schemaFor(
  field: AppointmentFormFieldRead,
  values: Readonly<Record<string, FormFieldValue>> = {},
): FormFieldSchema {
  const unsupportedReason = actionUnsupportedReasonFor(field, values)
  return {
    key: field.key,
    type: field.type,
    required: field.required,
    readOnly: field.readOnly,
    ...(field.options?.length ? { inlineOptions: field.options } : {}),
    ...(field.visibility ? { visibility: field.visibility } : {}),
    ...(field.valueOption ? { valueOption: field.valueOption } : {}),
    ...(unsupportedReason ? { unsupportedReason } : {}),
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
  return evaluateFieldState(schemaFor(field, values), { values })
}

export function dynamicActionFieldsFor(form: DynamicFormRead): readonly DynamicActionField[] {
  return form.fields.map((field) => ({
    ...field,
    runtime: fieldState(field, form.values),
  }))
}

export function dynamicActionUnsupportedFieldsFor(form: DynamicFormRead): readonly DynamicActionField[] {
  return dynamicActionFieldsFor(form).filter((field) => {
    if (field.runtime.capability !== 'UNSUPPORTED') return false
    return evaluateVisibility(field.visibility, form.values).state !== 'hidden'
  })
}

export function normalizeDynamicForm(
  form: DynamicFormRead,
): OperationSnapshot<Readonly<Record<string, FormFieldValue>>> {
  const fields = form.fields.map((field) => schemaFor(field, form.values))
  const result = normalizeSubmission({
    fields,
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
  const values = { ...form.values, [field.key]: value }
  const state = fieldState(field, values)
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
