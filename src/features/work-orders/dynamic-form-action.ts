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
  if (
    field.valueOption
    && ['select', 'bizSelect', 'radio', 'checkbox', 'cascade'].includes(field.type)
    && !field.options?.length
  ) {
    return `${field.type} requires a verified option set before it can be rendered`
  }
  return undefined
}

function schemaFor(
  field: AppointmentFormFieldRead,
  values: Readonly<Record<string, FormFieldValue>> = {},
): FormFieldSchema {
  const unsupportedReason = actionUnsupportedReasonFor(field, values)
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
    ...(field.multiple ? { multiple: field.multiple } : {}),
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
  workflowReadOnly = false,
): EffectiveFieldState {
  return evaluateFieldState(schemaFor(field, values), {
    values,
    workflowReadOnly,
  })
}

export function dynamicActionFieldsFor(form: DynamicFormRead): readonly DynamicActionField[] {
  return form.fields.map((field) => ({
    ...field,
    runtime: evaluateFieldState(schemaFor(field, form.values), {
      values: form.values,
      workflowReadOnly: form.workflowReadOnlyFieldIds?.some((id) => String(id) === String(field.fieldId)),
    }),
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
  const fields = form.fields.map((field) => {
    const schema = schemaFor(field, form.values)
    return form.workflowReadOnlyFieldIds?.some((id) => String(id) === String(field.fieldId))
      ? { ...schema, readOnly: true }
      : schema
  })
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
        { reason: result.fieldId ?? result.valueKey },
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
  const values = { ...form.values, [field.valueKey]: value }
  const state = fieldState(
    field,
    values,
    form.workflowReadOnlyFieldIds?.some((id) => String(id) === String(field.fieldId)),
  )
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

  const normalized = normalizeFieldValue(field.type, value, field.options, field.multiple)
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
