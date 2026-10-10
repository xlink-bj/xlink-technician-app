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
  AppointmentVisitIntent,
} from '@shared/ports'
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
 * branch that can create an on-site appointment. `0` is the complementary
 * deferred branch exposed by the same normalized option set. Labels remain
 * presentation metadata and are intentionally not consulted here.
 */
const appointmentVisitOptionValues = {
  required: '1',
  deferred: '0',
} as const

function schemaFor(field: AppointmentFormFieldRead): FormFieldSchema {
  return {
    fieldId: field.fieldId,
    valueKey: field.valueKey,
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

export function appointmentVisitIntentFor(form: AppointmentFormRead): AppointmentVisitIntent {
  const needField = form.fields.find((field) => field.valueKey === 'need')
  if (!needField) return 'unknown'

  const rawValue = form.values[needField.valueKey]
  if (rawValue === undefined || rawValue === null || rawValue === '') return 'unknown'
  const value = String(rawValue).trim()
  if (!needField.options?.some((option) => option.value === value)) return 'unknown'
  if (value === appointmentVisitOptionValues.required) return 'visit_required'
  if (value === appointmentVisitOptionValues.deferred) return 'visit_deferred'
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
  return appointmentFieldApplicabilityFromRuntime(field, form, runtimeFieldState(field, form.values))
}

export function appointmentDatetimeApplicableFor(form: AppointmentFormRead): boolean {
  const field = form.fields.find((candidate) => candidate.valueKey === 'datetime')
  return field ? appointmentFieldApplicabilityFor(form, field) === 'applicable' : false
}

function effectiveRuntimeFieldFor(
  field: AppointmentFormFieldRead,
  form: AppointmentFormRead,
): AppointmentRuntimeField {
  const runtime = runtimeFieldState(field, form.values)
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
  const values: Record<string, AppointmentFieldValue> = {}
  const fieldContexts: Record<string, { readonly fixedRequired: boolean }> = {}
  for (const field of form.fields) {
    const applicability = appointmentFieldApplicabilityFor(form, field)
    if (applicability === 'not_applicable') {
      // The stored draft value remains in `form.values`, but it is not an
      // effective value and must not reach validation or submission.
      fieldContexts[field.fieldId] = { fixedRequired: false }
      continue
    }
    const value = form.values[field.valueKey]
    if (value !== undefined) values[field.valueKey] = value
  }

  return resultFromSubmission(
    normalizeSubmission({
      fields: form.fields.map(schemaFor),
      values,
      ...(Object.keys(fieldContexts).length > 0 ? { fieldContexts } : {}),
    }),
  )
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
  return normalizeAppointmentFieldValue(field, value, form.values)
}

export function normalizeAppointmentFieldValue(
  field: AppointmentFormFieldRead,
  value: AppointmentFieldValue,
  values: Readonly<Record<string, AppointmentFieldValue>>,
): OperationSnapshot<AppointmentFieldValue> {
  const schema = schemaFor(field)
  const state = evaluateFieldState(schema, { values: { ...values, [field.valueKey]: value } })
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
