import {
  evaluateFieldState,
  evaluateVisibility,
  isFieldApplicable,
  normalizeFieldValue,
  normalizeSubmission,
} from '@runtimes/dynamic-form'
import type { EffectiveFieldState, FormFieldSchema, NormalizedFieldValue } from '@runtimes/dynamic-form'
import type { DynamicFormRead, AppointmentFormFieldRead } from '@shared/ports'
import type { FormFieldValue } from '@shared/ports/api'
import { actionFormSchemaFor, ACTION_FORM_SURFACE, isWorkflowFieldReadOnly } from './action-form-schema'
import { createOperationError } from '@shared/types'
import type { OperationSnapshot } from '@shared/types'
import { surveyMediaDescriptorFor } from './survey-media'
import {
  surveyLeakageCauseExperienceFor,
  surveyLeakageCauseFieldStateFor,
  surveyLeakageCausePersistedIds,
} from './survey-leakage-cause'

export interface DynamicActionField extends AppointmentFormFieldRead {
  readonly runtime: EffectiveFieldState
}

/** Product-owned Survey fields retained in evidence, excluded from this action. */
export function isDeferredSurveyField(
  formPurpose: DynamicFormRead['purpose'] | undefined,
  field: Pick<AppointmentFormFieldRead, 'valueKey'>,
): boolean {
  return formPurpose === 'survey'
    && (field.valueKey === 'serviceGoods' || field.valueKey === 'surveyDrawing')
}

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
  return actionFormSchemaFor(field, {
    unsupportedReason: actionUnsupportedReasonFor(field, values, formPurpose),
  })
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
    runtime: surveyLeakageCauseFieldStateFor(form, field) ?? evaluateFieldState(schemaFor(field, form.values, form.purpose), {
      values: form.values,
      workflowReadOnly: isWorkflowFieldReadOnly(form, field),
      surface: ACTION_FORM_SURFACE,
    }),
  }))
}

export function dynamicActionUnsupportedFieldsFor(form: DynamicFormRead): readonly DynamicActionField[] {
  return dynamicActionFieldsFor(form).filter((field) => {
    if (isDeferredSurveyField(form.purpose, field)) return false
    if (!isFieldApplicable(field, ACTION_FORM_SURFACE)) return false
    if (field.runtime.capability !== 'UNSUPPORTED') return false
    // Unsupported capability is intentionally non-renderable in the Runtime,
    // so its `visible` bit is false by construction. Re-evaluate the verified
    // visibility contract: only an explicitly hidden field is non-blocking;
    // an unresolvable expression remains fail-closed and blocks.
    const visibility = evaluateVisibility(field.visibility, form.values)
    return visibility.state !== 'hidden'
  })
}

export function normalizeDynamicForm(
  form: DynamicFormRead,
): OperationSnapshot<Readonly<Record<string, FormFieldValue>>> {
  const leakageExperience = surveyLeakageCauseExperienceFor(form)
  const controlledFieldIds = new Set(
    leakageExperience
      ? [leakageExperience.triggerField.fieldId, leakageExperience.valueField.fieldId]
      : [],
  )
  const fields = form.fields
    .filter((field) => !controlledFieldIds.has(field.fieldId))
    .filter((field) => !isDeferredSurveyField(form.purpose, field))
    .map((field) => {
    const schema = schemaFor(field, form.values, form.purpose)
    return isWorkflowFieldReadOnly(form, field)
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
        result.message === 'required field is missing' ? '请填写必填项' : result.message,
        { reason: result.fieldId ?? result.valueKey },
      ),
    }
  }

  const values: Record<string, FormFieldValue> = {}
  for (const [key, value] of Object.entries(result.value.values)) values[key] = toFormValue(value)

  if (leakageExperience) {
    const state = surveyLeakageCauseFieldStateFor(form, leakageExperience.valueField)
    if (state?.capability === 'UNSUPPORTED' && state.visible) {
      return {
        state: 'failed_terminal',
        error: createOperationError('unsupported_capability', state.reason ?? 'Survey leakage-cause field is unsupported'),
      }
    }
    if (state?.visible) {
      const raw = form.values[leakageExperience.valueField.valueKey]
      const missing = raw === undefined
        || raw === null
        || raw === ''
        || (Array.isArray(raw) && raw.length === 0)
      if (missing) {
        if (state.required) {
          return {
            state: 'failed_terminal',
            error: createOperationError('validation', '请选择渗漏原因', {
              reason: leakageExperience.valueField.valueKey,
            }),
          }
        }
        return { state: 'succeeded', data: values }
      }
      const ids = surveyLeakageCausePersistedIds(raw)
      if (!ids) {
        return {
          state: 'failed_terminal',
          error: createOperationError('validation', 'Leakage-cause selection is invalid', {
            reason: leakageExperience.valueField.valueKey,
          }),
        }
      }
      if (ids.length > 0) values[leakageExperience.valueField.valueKey] = ids
    }
  }
  return { state: 'succeeded', data: values }
}

export function normalizeDynamicFieldValue(
  form: DynamicFormRead,
  field: AppointmentFormFieldRead,
  value: FormFieldValue,
): OperationSnapshot<FormFieldValue> {
  const values = { ...form.values, [field.valueKey]: value }
  const leakageExperience = surveyLeakageCauseExperienceFor(form)
  const leakageState = leakageExperience
    ? surveyLeakageCauseFieldStateFor({ ...form, values }, field)
    : undefined
  if (leakageExperience && field.fieldId === leakageExperience.triggerField.fieldId) {
    return {
      state: 'failed_terminal',
      error: createOperationError('unsupported_capability', 'Use the Survey leakage-cause selector to change this field'),
    }
  }
  if (leakageExperience && field.fieldId === leakageExperience.valueField.fieldId) {
    if (!leakageState || leakageState.capability === 'UNSUPPORTED') {
      return {
        state: 'failed_terminal',
        error: createOperationError('unsupported_capability', leakageState?.reason ?? 'Survey leakage-cause field is unsupported'),
      }
    }
    if (!leakageState.visible) return { state: 'failed_terminal', error: createOperationError('validation', 'Hidden fields cannot be changed') }
    if (leakageState.readOnly) return { state: 'failed_terminal', error: createOperationError('validation', 'Read-only fields cannot be changed') }
    const ids = surveyLeakageCausePersistedIds(value)
    if (!ids) return { state: 'failed_terminal', error: createOperationError('validation', 'Leakage-cause selection is invalid') }
    return { state: 'succeeded', data: ids }
  }

  const state = fieldState(
    field,
    values,
    isWorkflowFieldReadOnly(form, field),
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
