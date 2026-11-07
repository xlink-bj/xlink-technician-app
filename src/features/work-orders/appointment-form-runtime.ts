import { appointmentReplacementValues } from './appointment-replacement-values'
import { hasNonStringAppointmentNeed, appointmentNeedReselectionMessage } from '@shared/form/appointment-need'
import {
  evaluateFieldState,
  evaluateVisibility,
  isFieldApplicable,
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
  AppointmentVisitIntent,
} from '@shared/ports'
import { actionFormConditionValues } from './action-form-condition-context'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'
import { createOperationError, type OperationSnapshot } from '@shared/types'

export interface AppointmentRuntimeField extends AppointmentFormFieldRead {
  readonly runtime: EffectiveFieldState
}

export interface AppointmentFieldRoles {
  readonly need?: AppointmentRuntimeField
  readonly datetime?: AppointmentRuntimeField
  readonly note?: AppointmentRuntimeField
  readonly extras: readonly AppointmentRuntimeField[]
}

export type AppointmentFieldApplicability = 'applicable' | 'not_applicable'

export type { AppointmentVisitIntent } from '@shared/ports'

/**
 * R1 verifies the appointment form's semantic option values: `1` is the
 * branch that can create an on-site appointment. `2` is the verified no-visit
 * branch; legacy `0` is supported only when present in the option set. Labels remain
 * presentation metadata and are intentionally not consulted here.
 */
const appointmentVisitOptionValues = {
  required: '1',
  deferred: '2',
  legacyDeferred: '0',
} as const

function schemaFor(field: AppointmentFormFieldRead): FormFieldSchema {
  return actionFormSchemaFor(field)
}

function runtimeFieldState(
  field: AppointmentFormFieldRead,
  form: AppointmentFormRead,
  conditionValues = actionFormConditionValues(form),
): EffectiveFieldState {
  return evaluateFieldState(schemaFor(field), { values: conditionValues, surface: ACTION_FORM_SURFACE })
}

export function appointmentVisitIntentFor(form: AppointmentFormRead): AppointmentVisitIntent {
  const needField = form.fields.find((field) => field.valueKey === 'need')
  if (!needField) return 'unknown'

  const rawValue = form.values[needField.valueKey]
  if (rawValue === undefined || rawValue === null || rawValue === '') return 'unknown'
  if (typeof rawValue !== 'string') return 'unknown'
  const value = rawValue
  if (!needField.options?.some((option) => option.value === value)) return 'unknown'
  if (value === appointmentVisitOptionValues.required) return 'visit_required'
  if (value === appointmentVisitOptionValues.deferred || value === appointmentVisitOptionValues.legacyDeferred) return 'visit_deferred'
  return 'unknown'
}

function appointmentFieldApplicabilityFromRuntime(
  field: AppointmentFormFieldRead,
  form: AppointmentFormRead,
  runtime: EffectiveFieldState,
): AppointmentFieldApplicability {
  if (runtime.capability === 'UNSUPPORTED' || !runtime.visible) return 'not_applicable'
  if (field.valueKey === 'datetime' && appointmentVisitIntentFor(form) === 'visit_deferred') return 'not_applicable'
  return 'applicable'
}

/**
 * One semantic applicability result is shared by rendering, validation,
 * confirmation, and effective submission projection. Stored draft values are
 * deliberately not consulted as proof that a field is currently applicable.
 */
export function appointmentFieldApplicabilityFor(
  form: AppointmentFormRead,
  field: AppointmentFormFieldRead,
): AppointmentFieldApplicability {
  return appointmentFieldApplicabilityFromRuntime(field, form, runtimeFieldState(field, form))
}

export function appointmentDatetimeApplicableFor(form: AppointmentFormRead): boolean {
  const field = form.fields.find((candidate) => candidate.valueKey === 'datetime')
  return field ? appointmentFieldApplicabilityFor(form, field) === 'applicable' : false
}

function effectiveRuntimeFieldFor(
  field: AppointmentFormFieldRead,
  form: AppointmentFormRead,
): AppointmentRuntimeField {
  const runtime = runtimeFieldState(field, form)
  const applicability = appointmentFieldApplicabilityFromRuntime(field, form, runtime)

  return {
    ...field,
    runtime: {
      ...runtime,
      visible: applicability === 'applicable',
      required: applicability === 'applicable' && runtime.required,
    },
  }
}

export function appointmentRuntimeFieldsFor(
  form: AppointmentFormRead,
): readonly AppointmentRuntimeField[] {
  return form.fields
    .map((field) => effectiveRuntimeFieldFor(field, form))
    .filter((field) => field.runtime.visible && field.runtime.capability !== 'UNSUPPORTED')
}

/** Appointment presentation roles are keyed by the verified field identities. */
export function appointmentFieldRolesFor(
  form: AppointmentFormRead,
): AppointmentFieldRoles {
  // Keep a conditionally hidden datetime field in the role projection so its
  // draft value remains recoverable. Consumers must use runtime.visible to
  // decide whether it is currently in the active content path.
  const fields = form.fields
    .map((field) => effectiveRuntimeFieldFor(field, form))
    .filter((field) => field.runtime.capability !== 'UNSUPPORTED')
  const need = fields.find((field) => field.valueKey === 'need')
  const datetime = fields.find((field) => field.valueKey === 'datetime')
  const note = fields.find((field) => field.valueKey === 'note')
  const knownValueKeys = new Set(['need', 'datetime', 'note'])

  return {
    ...(need ? { need } : {}),
    ...(datetime ? { datetime } : {}),
    ...(note ? { note } : {}),
    extras: fields.filter((field) => !knownValueKeys.has(field.valueKey) && field.runtime.visible),
  }
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
        { reason: result.fieldId ?? result.valueKey },
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
  if (form.fields.some(field => field.valueKey === 'need') && hasNonStringAppointmentNeed(form.values.need)) {
    return { state: 'failed_terminal', error: createOperationError('validation', appointmentNeedReselectionMessage, { reason: 'need' }) }
  }
  // Visibility depends on the full trusted form state, not on which values
  // survive payload projection (a hidden controller can reveal another field).
  const conditionValues = actionFormConditionValues(form)
  const values: Record<string, AppointmentFieldValue> = {}
  const fieldContexts: Record<string, { readonly fixedRequired: boolean }> = {}
  for (const field of form.fields) {
    const schema = schemaFor(field)
    // A non-mobile row is not part of this Action surface, even when its
    // persisted value remains in the local draft.
    if (!isFieldApplicable(schema, 'mobile_detail')) {
      fieldContexts[field.fieldId] = { fixedRequired: false }
      continue
    }
    const visibility = evaluateVisibility(field.visibility, conditionValues)
    if (visibility.state === 'unsupported') {
      return {
        state: 'failed_terminal',
        error: createOperationError('unsupported_capability', visibility.reason ?? 'Appointment visibility rule is unsupported', {
          reason: field.fieldId,
        }),
      }
    }
    const runtime = runtimeFieldState(field, form, conditionValues)
    // A visible unsupported backend field must fail closed. Merely hiding it
    // in the specialized Appointment UI must never make submission possible.
    if (runtime.capability === 'UNSUPPORTED' && visibility.state !== 'hidden') {
      return {
        state: 'failed_terminal',
        error: createOperationError('unsupported_capability', runtime.reason ?? 'Appointment field is unsupported', {
          reason: field.fieldId,
        }),
      }
    }
    const applicability = appointmentFieldApplicabilityFromRuntime(field, form, runtime)
    if (applicability === 'not_applicable') {
      // Hidden values do not participate in visible required validation.
      // The separate replacement projection validates retention afterward.
      fieldContexts[field.fieldId] = { fixedRequired: false }
      continue
    }
    const value = form.values[field.valueKey]
    if (value !== undefined && field.valueKey !== '_id') values[field.valueKey] = value
  }

  const normalized = resultFromSubmission(
    normalizeSubmission({
      fields: form.fields.map(schemaFor),
      values,
      conditionValues,
      surface: ACTION_FORM_SURFACE,
      ...(Object.keys(fieldContexts).length > 0 ? { fieldContexts } : {}),
    }),
  )

  return normalized.state === 'succeeded'
    ? appointmentReplacementValues(form, normalized.data!) as OperationSnapshot<Readonly<Record<string, AppointmentFieldValue>>>
    : normalized
}

export function normalizeAppointmentFieldValueForForm(
  form: AppointmentFormRead,
  field: AppointmentFormFieldRead,
  value: AppointmentFieldValue,
): OperationSnapshot<AppointmentFieldValue> {
  if (appointmentFieldApplicabilityFor(form, field) === 'not_applicable') {
    return {
      state: 'failed_terminal',
      error: createOperationError('validation', 'Appointment field is not applicable to the current visit branch'),
    }
  }
  return normalizeAppointmentFieldValue(field, value, form.values, form)
}

export function normalizeAppointmentFieldValue(
  field: AppointmentFormFieldRead,
  value: AppointmentFieldValue,
  values: Readonly<Record<string, AppointmentFieldValue>>,
  identity: Pick<AppointmentFormRead, 'definitionId' | 'dataId'> = {},
): OperationSnapshot<AppointmentFieldValue> {
  if (field.valueKey === '_id') {
    return { state: 'failed_terminal', error: createOperationError('validation', 'Record identity cannot be edited') }
  }
  const schema = schemaFor(field)
  const state = evaluateFieldState(schema, { values: actionFormConditionValues({ ...identity, values: { ...values, [field.valueKey]: value } }), surface: ACTION_FORM_SURFACE })
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

  if (field.valueKey === 'need' && hasNonStringAppointmentNeed(value)) {
    return { state: 'failed_terminal', error: createOperationError('validation', appointmentNeedReselectionMessage, { reason: 'need' }) }
  }
  const normalized = normalizeFieldValue(schema.type, value, schema.inlineOptions, schema.multiple)
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
