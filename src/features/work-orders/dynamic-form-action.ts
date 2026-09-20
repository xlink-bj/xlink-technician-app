import {
  evaluateFieldState,
  evaluateVisibility,
  isFieldApplicable,
  normalizeFieldValue,
  normalizeSubmission,
} from '@runtimes/dynamic-form'
import type { EffectiveFieldState, FormFieldSchema, FormRuntimeSurface, NormalizedFieldValue } from '@runtimes/dynamic-form'
import type { DynamicFormRead, AppointmentFormFieldRead } from '@shared/ports'
import type { FormFieldValue } from '@shared/ports/api'
import { createOperationError } from '@shared/types'
import type { OperationSnapshot } from '@shared/types'
import { surveyMediaDescriptorFor } from './survey-media'

export interface DynamicActionField extends AppointmentFormFieldRead {
  readonly runtime: EffectiveFieldState
}

const ACTION_FORM_SURFACE: FormRuntimeSurface = 'mobile_detail'

function actionUnsupportedReasonFor(
  field: AppointmentFormFieldRead,
  values: Readonly<Record<string, FormFieldValue>>,
  formPurpose?: DynamicFormRead['purpose'],
): string | undefined {
  if (field.unsupportedReason) return field.unsupportedReason
  const mediaDescriptor = surveyMediaDescriptorFor(formPurpose, field)
  if (mediaDescriptor?.selectionMode === 'special_tool') return mediaDescriptor.blocker
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
  formPurpose?: DynamicFormRead['purpose'],
): FormFieldSchema {
  const unsupportedReason = actionUnsupportedReasonFor(field, values, formPurpose)
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
    ...(field.multiple ? { multiple: field.multiple } : {}),
    ...(field.options?.length ? { inlineOptions: field.options } : {}),
    ...(field.visibility ? { visibility: field.visibility } : {}),
    ...(field.valueOption ? { valueOption: field.valueOption } : {}),
    ...(unsupportedReason ? { unsupportedReason } : {}),
  }
}

function toFormValue(value: NormalizedFieldValue): FormFieldValue {
  if (Array.isArray(value)) return value as FormFieldValue
  return value
}

function fieldState(
  field: AppointmentFormFieldRead,
  values: Readonly<Record<string, FormFieldValue>>,
  workflowReadOnly = false,
  formPurpose?: DynamicFormRead['purpose'],
): EffectiveFieldState {
  return evaluateFieldState(schemaFor(field, values, formPurpose), {
    values,
    workflowReadOnly,
    surface: ACTION_FORM_SURFACE,
  })
}

export function dynamicActionFieldsFor(form: DynamicFormRead): readonly DynamicActionField[] {
  return form.fields.map((field) => ({
    ...field,
    runtime: evaluateFieldState(schemaFor(field, form.values, form.purpose), {
      values: form.values,
      workflowReadOnly: form.workflowReadOnlyFieldIds?.some((id) => String(id) === String(field.fieldId)),
      surface: ACTION_FORM_SURFACE,
    }),
  }))
}

export function dynamicActionUnsupportedFieldsFor(form: DynamicFormRead): readonly DynamicActionField[] {
  return dynamicActionFieldsFor(form).filter((field) => {
    if (!isFieldApplicable(field, ACTION_FORM_SURFACE)) return false
    if (field.runtime.capability !== 'UNSUPPORTED') return false
    return evaluateVisibility(field.visibility, form.values).state !== 'hidden'
  })
}

export function normalizeDynamicForm(
  form: DynamicFormRead,
): OperationSnapshot<Readonly<Record<string, FormFieldValue>>> {
  const fields = form.fields.map((field) => {
    const schema = schemaFor(field, form.values, form.purpose)
    return form.workflowReadOnlyFieldIds?.some((id) => String(id) === String(field.fieldId))
      ? { ...schema, readOnly: true }
      : schema
  })
  const result = normalizeSubmission({
    fields,
    values: form.values,
    surface: ACTION_FORM_SURFACE,
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
    form.purpose,
  )
  if (state.capability === 'PRESENTATION_ONLY') {
    return {
      state: 'failed_terminal',
      error: createOperationError('validation', 'Presentation-only fields cannot be changed'),
    }
  }
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
