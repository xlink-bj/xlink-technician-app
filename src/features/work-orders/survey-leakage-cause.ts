import {
  evaluateVisibility,
  isFieldApplicable,
} from '@runtimes/dynamic-form'
import type { EffectiveFieldState } from '@runtimes/dynamic-form'
import type {
  AppointmentFormFieldRead,
  DynamicFormRead,
  FormFieldValue,
  SurveyLeakageCauseRow,
} from '@shared/ports'
import { createOperationError } from '@shared/types'
import type { OperationSnapshot } from '@shared/types'
import { isWorkflowFieldReadOnly } from './action-form-schema'

export const surveyLeakageCauseTriggerKey = 'leakageCauseSelect' as const
export const surveyLeakageCauseValueKey = 'leakageCause' as const

export interface SurveyLeakageCauseExperience {
  readonly triggerField: AppointmentFormFieldRead
  readonly valueField: AppointmentFormFieldRead
}

export interface SurveyLeakageCauseTreeOption {
  readonly value: string
  readonly label: string
  readonly children: readonly {
    readonly value: string
    readonly label: string
  }[]
}

export type SurveyLeakageCausePartChangePolicy = 'preserve' | 'clear_when_hidden'

function fieldByValueKey(
  fields: readonly AppointmentFormFieldRead[],
  valueKey: string,
): AppointmentFormFieldRead | undefined {
  const matches = fields.filter((field) => field.valueKey === valueKey)
  return matches.length === 1 ? matches[0] : undefined
}

/**
 * Returns a controlled Survey experience only for the verified two-row shape.
 * A generic form with similarly named fields does not receive this override.
 */
export function surveyLeakageCauseExperienceFor(
  form: Pick<DynamicFormRead, 'purpose' | 'fields'>,
): SurveyLeakageCauseExperience | undefined {
  if (form.purpose !== 'survey') return undefined
  const triggerField = fieldByValueKey(form.fields, surveyLeakageCauseTriggerKey)
  const valueField = fieldByValueKey(form.fields, surveyLeakageCauseValueKey)
  if (
    !triggerField
    || triggerField.type !== 'select'
    || !valueField
    || valueField.type !== 'data'
    || valueField.multiple !== true
  ) return undefined
  return { triggerField, valueField }
}

export function surveyLeakageCauseFieldIdsFor(form: Pick<DynamicFormRead, 'purpose' | 'fields'>): readonly string[] {
  const experience = surveyLeakageCauseExperienceFor(form)
  return experience ? [experience.triggerField.fieldId, experience.valueField.fieldId] : []
}

export function surveyLeakageCauseFieldStateFor(
  form: DynamicFormRead,
  field: AppointmentFormFieldRead,
): EffectiveFieldState | undefined {
  const experience = surveyLeakageCauseExperienceFor(form)
  if (!experience) return undefined
  const isControlledField = field.fieldId === experience.triggerField.fieldId
    || field.fieldId === experience.valueField.fieldId
  if (!isControlledField) return undefined

  if (!isFieldApplicable(field, 'mobile_detail')) {
    return {
      capability: 'CONDITIONAL_CAPABILITY',
      visible: false,
      readOnly: true,
      required: false,
      optionProvider: { state: 'not_required' },
      reason: 'Field is not applicable to the current form surface',
    }
  }

  const visibility = evaluateVisibility(field.visibility, form.values)
  if (visibility.state === 'unsupported') {
    return {
      capability: 'UNSUPPORTED',
      visible: false,
      readOnly: true,
      required: false,
      optionProvider: { state: 'unsupported', reason: visibility.reason },
      reason: visibility.reason,
    }
  }

  const workflowReadOnly = isWorkflowFieldReadOnly(form, field)
  const readOnly = Boolean(workflowReadOnly || field.readOnly)
  return {
    capability: 'CONDITIONAL_CAPABILITY',
    visible: visibility.visible,
    readOnly,
    required: visibility.visible && !readOnly && field.fieldId === experience.valueField.fieldId && field.required,
    optionProvider: { state: 'not_required' },
  }
}

/** Backend Survey persistence is a list of selected leakageCause identifiers. */
export function surveyLeakageCausePersistedIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null
  const ids = value.map((candidate) => typeof candidate === 'string' ? candidate.trim() : '')
  if (ids.some((id) => id.length === 0) || new Set(ids).size !== ids.length) return null
  return ids
}

/** R1 uses the first segment of the selected part path to scope the tree. */
export function surveyLeakageCauseCurrentPart(value: unknown): string | undefined {
  if (!Array.isArray(value) || typeof value[0] !== 'string' || value[0].trim().length === 0) return undefined
  return value[0].trim()
}

/**
 * Resolves repair-part labels from the same dynamic-form option contract that
 * supplies the part field. The provider only returns part codes, so labels
 * must not be guessed from those codes.
 */
export function surveyLeakageCausePartLabelsFor(
  form: Pick<DynamicFormRead, 'fields'>,
): ReadonlyMap<string, string> {
  const partField = fieldByValueKey(form.fields, 'part')
  const labels = new Map<string, string>()
  const visit = (options: readonly NonNullable<AppointmentFormFieldRead['options']>[number][]): void => {
    for (const option of options) {
      if (!labels.has(option.value) && option.label.trim().length > 0) {
        labels.set(option.value, option.label)
      }
      if (option.children?.length) visit(option.children)
    }
  }
  if (partField?.options?.length) visit(partField.options)
  return labels
}

export function surveyLeakageCauseGroups(
  rows: readonly SurveyLeakageCauseRow[],
  currentPart: string | undefined,
  partLabels: ReadonlyMap<string, string> = new Map(),
): readonly SurveyLeakageCauseTreeOption[] {
  const grouped = new Map<string, { value: string; label: string }[]>()
  for (const row of rows) {
    const children = grouped.get(row.part) ?? []
    children.push({ value: row.id, label: row.label })
    grouped.set(row.part, children)
  }
  const groups = [...grouped.entries()].map(([part, children]) => ({
    value: part,
    label: partLabels.get(part) ?? part,
    children,
  }))
  if (!currentPart) return groups
  return groups.sort((left, right) => {
    const leftPriority = left.value === currentPart ? 0 : 1
    const rightPriority = right.value === currentPart ? 0 : 1
    return leftPriority - rightPriority
  })
}

export function surveyLeakageCauseLabels(
  ids: readonly string[],
  rows: readonly SurveyLeakageCauseRow[],
): readonly string[] {
  const labels = new Map(rows.map((row) => [row.id, row.label]))
  return ids.map((id) => labels.get(id) ?? `未解析（${id}）`)
}

export function surveyLeakageCausePartChangePolicy(
  form: DynamicFormRead,
  nextValues: Readonly<Record<string, FormFieldValue>>,
): SurveyLeakageCausePartChangePolicy {
  const experience = surveyLeakageCauseExperienceFor(form)
  if (!experience) return 'preserve'
  const previousState = surveyLeakageCauseFieldStateFor(form, experience.valueField)
  const nextForm = { ...form, values: nextValues }
  const nextState = surveyLeakageCauseFieldStateFor(nextForm, experience.valueField)
  return previousState?.visible && !nextState?.visible ? 'clear_when_hidden' : 'preserve'
}

export function normalizeSurveyLeakageCauseSelection(
  form: DynamicFormRead,
  selectedIds: readonly string[],
  providerRows: readonly SurveyLeakageCauseRow[],
): OperationSnapshot<readonly string[]> {
  const experience = surveyLeakageCauseExperienceFor(form)
  if (!experience) return { state: 'failed_terminal', error: createOperationError('unsupported_capability', 'Survey leakage-cause experience is unavailable') }
  const state = surveyLeakageCauseFieldStateFor(form, experience.valueField)
  if (!state || !state.visible) return { state: 'failed_terminal', error: createOperationError('validation', 'Leakage-cause field is hidden') }
  if (state.readOnly) return { state: 'failed_terminal', error: createOperationError('validation', 'Leakage-cause field is read-only') }
  const persisted = surveyLeakageCausePersistedIds(selectedIds)
  if (!persisted) return { state: 'failed_terminal', error: createOperationError('validation', 'Leakage-cause selection is invalid') }
  const allowed = new Set(providerRows.map((row) => row.id))
  if (persisted.some((id) => !allowed.has(id))) {
    return { state: 'failed_terminal', error: createOperationError('validation', 'Leakage-cause selection is not available') }
  }
  return { state: 'succeeded', data: persisted }
}
