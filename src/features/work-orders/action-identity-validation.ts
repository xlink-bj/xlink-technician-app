import { evaluateFieldState } from '@runtimes/dynamic-form'
import { isR1MobilePhone } from '@shared/form/r1-mobile-phone'
import { isR1IdNumber } from '@shared/form/r1-id-number'
import type { AppointmentFormFieldRead } from '@shared/ports'
import { actionFormSchemaFor, ACTION_FORM_SURFACE } from './action-form-schema'

/** Explicit submission only. Ordinary save-only and persisted readonly values
 * are separate contracts. This check never normalizes values or grants writes;
 * the caller still owns full capability/required/provenance validation. */
export function actionIdentityFormatIssue(input: {
  readonly fields: readonly AppointmentFormFieldRead[]
  readonly values: Readonly<Record<string, unknown>>
  readonly conditionValues?: Readonly<Record<string, unknown>>
  readonly workflowReadOnlyFieldIds?: readonly string[]
}): { readonly fieldId: string; readonly valueKey: string; readonly message: string } | undefined {
  for (const field of input.fields) {
    if (!['phone', 'IDNumber'].includes(field.type) || !Object.hasOwn(input.values, field.valueKey)) continue
    const state = evaluateFieldState(actionFormSchemaFor(field), {
      surface: ACTION_FORM_SURFACE, values: input.conditionValues ?? input.values,
      workflowReadOnly: input.workflowReadOnlyFieldIds?.includes(field.fieldId),
    })
    if (state.capability !== 'SUPPORTED_GENERIC' || !state.visible || state.readOnly) continue
    const value = input.values[field.valueKey]
    if (!value) continue // R1 checks truthy values; requiredness stays runtime-owned.
    // RegExp.test in R1 string-coerces scalar values for comparison only.
    // Never assign this comparison string back to editor or submitted values.
    const syntax = typeof value === 'number' ? String(value) : value
    if (!(field.type === 'phone' ? isR1MobilePhone(syntax) : isR1IdNumber(syntax))) {
      return { fieldId: field.fieldId, valueKey: field.valueKey,
        message: field.type === 'phone' ? '手机号格式不符合要求。' : '证件号格式不符合要求。' }
    }
  }
}
