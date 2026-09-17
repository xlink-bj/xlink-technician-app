import { evaluateFieldState } from './state'
import { evaluateVisibility } from './visibility'
import type {
  FieldStateContext,
  FormFieldSchema,
  FormOption,
  FormSubmission,
  NormalizationResult,
  NormalizedFieldValue,
  SubmissionResult,
} from './types'
import type { LocalMediaRef } from '@shared/types'

const trimmedStringTypes = new Set(['text', 'textarea', 'phone', 'IDNumber', 'date', 'time', 'datetime'])
const optionScalarTypes = new Set(['select', 'bizSelect', 'radio', 'rate'])
const optionArrayTypes = new Set(['checkbox', 'cascade'])

function trimmed(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return undefined
}

function decimal(value: unknown): number | undefined {
  const text = trimmed(value)
  if (!text || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

function integer(value: unknown): number | undefined {
  const text = trimmed(value)
  if (!text || !/^-?\d+$/.test(text)) return undefined
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function scalar(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return undefined
}

function invalid(message: string): NormalizationResult {
  return { ok: false, reason: 'invalid_value', message }
}

function optionValues(options: readonly FormOption[]): readonly string[] {
  const values: string[] = []
  const visit = (option: FormOption): void => {
    values.push(option.value)
    option.children?.forEach(visit)
  }
  options.forEach(visit)
  return values
}

function supportedOption(options: readonly FormOption[] | undefined, value: unknown): boolean {
  if (!options || options.length === 0) return true
  const values = Array.isArray(value) ? value : [value]
  const supported = new Set(optionValues(options))
  return values.every(
    (candidate) =>
      candidate !== null &&
      candidate !== undefined &&
      supported.has(String(candidate)),
  )
}

export function normalizeFieldValue(
  type: string,
  value: unknown,
  options?: readonly FormOption[],
  multiple = false,
): NormalizationResult {
  if (!supportedOption(options, value)) {
    return invalid(`${type} contains an unsupported option`)
  }
  if (trimmedStringTypes.has(type)) {
    const result = trimmed(value)
    return result === undefined ? invalid(`${type} requires a scalar value`) : { ok: true, value: result }
  }
  if (type === 'number') {
    const result = integer(value)
    return result === undefined ? invalid('number requires an integer') : { ok: true, value: result }
  }
  if (type === 'digit') {
    const result = decimal(value)
    return result === undefined ? invalid(`${type} requires a decimal value`) : { ok: true, value: result }
  }
  if (type === 'area') {
    return {
      ok: false,
      reason: 'unsupported_field_type',
      message: 'generic area value representation is unresolved; no decimal assumption is applied',
    }
  }
  if (type === 'switch') {
    if (typeof value === 'boolean') return { ok: true, value }
    if (value === 'true') return { ok: true, value: true }
    if (value === 'false') return { ok: true, value: false }
    return invalid('switch requires a boolean value')
  }
  if (optionScalarTypes.has(type) && multiple) {
    if (!Array.isArray(value)) return invalid(`${type} requires an array of choices`)
    const values = value.map(scalar)
    if (values.some((item) => item === undefined || item === null)) {
      return invalid(`${type} contains an unsupported value`)
    }
    return { ok: true, value: values as NormalizedFieldValue }
  }
  if (optionScalarTypes.has(type)) {
    const result = scalar(value)
    return result === undefined ? invalid(`${type} requires a scalar choice`) : { ok: true, value: result }
  }
  if (type === 'file' || type === 'image') {
    const mediaReference = (candidate: unknown): LocalMediaRef | undefined => {
      if (typeof candidate !== 'string' || candidate.trim().length === 0) return undefined
      return candidate as LocalMediaRef
    }
    if (Array.isArray(value)) {
      const references = value.map(mediaReference)
      if (references.some((reference) => reference === undefined)) {
        return invalid(`${type} requires normalized media references`)
      }
      return { ok: true, value: references as readonly LocalMediaRef[] }
    }
    const reference = mediaReference(value)
    return reference
      ? { ok: true, value: reference }
      : invalid(`${type} requires a normalized media reference`)
  }
  if (optionArrayTypes.has(type)) {
    if (Array.isArray(value)) {
      const values = value.map(scalar)
      if (values.some((item) => item === undefined || item === null)) return invalid(`${type} contains an unsupported value`)
      return { ok: true, value: values as NormalizedFieldValue }
    }
    const result = scalar(value)
    return result === undefined ? invalid(`${type} requires a value or value array`) : { ok: true, value: result }
  }
  return { ok: false, reason: 'unsupported_field_type', message: `unsupported field type: ${type}` }
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

export function normalizeSubmission(input: {
  readonly fields: readonly FormFieldSchema[]
  readonly values: Readonly<Record<string, unknown>>
  readonly fieldContexts?: Readonly<Record<string, Omit<FieldStateContext, 'values'>>>
  readonly preserveHiddenValues?: boolean
}): SubmissionResult {
  const normalized: Record<string, NormalizedFieldValue> = {}
  for (const field of input.fields) {
    const state = evaluateFieldState(field, {
      ...(input.fieldContexts?.[field.fieldId] ?? {}),
      values: input.values,
    })
    // Capability is evaluated independently from effective visibility. A
    // hidden unsupported row is outside the current submission surface and
    // must not produce a misleading warning or block the visible form. An
    // unsupported visibility expression remains fail-closed in state above.
    if (state.capability === 'UNSUPPORTED') {
      const visibility = evaluateVisibility(field.visibility, input.values)
      if (visibility.state === 'hidden') continue
      return {
        ok: false,
        reason: 'unsupported_capability',
        fieldId: field.fieldId,
        valueKey: field.valueKey,
        message: state.reason ?? 'field capability is unsupported',
      }
    }

    const raw = input.values[field.valueKey]
    if (!state.visible && !input.preserveHiddenValues) continue
    if (isMissing(raw)) {
      if (state.required) {
        return {
          ok: false,
          reason: 'validation',
          fieldId: field.fieldId,
          valueKey: field.valueKey,
          message: 'required field is missing',
        }
      }
      continue
    }

    const value = normalizeFieldValue(field.type, raw, field.inlineOptions, field.multiple)
    if (!value.ok) {
      return {
        ok: false,
        reason: value.reason === 'unsupported_field_type' ? 'unsupported_capability' : 'validation',
        fieldId: field.fieldId,
        valueKey: field.valueKey,
        message: value.message,
      }
    }
    normalized[field.valueKey] = value.value
  }
  const submission: FormSubmission = { values: normalized }
  return { ok: true, value: submission }
}
