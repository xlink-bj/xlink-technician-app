import { describe, expect, it } from 'vitest'
import {
  appointmentRuntimeFieldsFor,
  normalizeAppointmentFieldValueForForm,
  normalizeAppointmentForm,
} from '@features/work-orders/appointment-form-runtime'
import type { AppointmentFormRead, FormFieldRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const need: FormFieldRead = {
  fieldId: 'need',
  valueKey: 'need',
  label: '是否上门',
  type: 'radio',
  required: true,
  readOnly: false,
  options: [{ value: '1', label: '是' }, { value: '0', label: '否' }],
}
const conditional: FormFieldRead = {
  fieldId: 'followup',
  valueKey: 'followup',
  label: '上门补充信息',
  type: 'text',
  required: true,
  readOnly: false,
  visibility: { kind: 'equals', path: 'need', value: '1' },
  showList: [4],
}
function form(fields: readonly FormFieldRead[], values: AppointmentFormRead['values']): AppointmentFormRead {
  return {
    definitionId: asOpaqueId<'FormDefinitionId'>('r1-appointment-form'),
    fields,
    values,
  }
}

describe('R1 Appointment conditional field admission and save-only normalization', () => {
  it('blocks unknown hidden business state instead of deleting it in replacement', () => {
    const current = form([need, conditional], { need: '0', followup: 'old private draft' })
    expect(appointmentRuntimeFieldsFor(current).map(field => field.valueKey)).toEqual(['need'])
    expect(normalizeAppointmentForm(current).state).toBe('failed_terminal')
    expect(current.values.followup).toBe('old private draft')
    expect(normalizeAppointmentFieldValueForForm(current, conditional, 'new text').state).toBe('failed_terminal')
  })

  it('validates a conditionally visible required field rather than silently omitting it', () => {
    const current = form([need, conditional], { need: '1' })
    expect(appointmentRuntimeFieldsFor(current).map(field => field.valueKey)).toEqual(['need', 'followup'])
    const missing = normalizeAppointmentForm(current)
    expect(missing.state).toBe('failed_terminal')
    expect(missing.error?.category).toBe('validation')
    expect(normalizeAppointmentForm(form([need, conditional], { need: '1', followup: '到场' })).state).toBe('failed_terminal') // outside verified six-field preservation scope
  })

  it('does not leak stored fields from a non-mobile showList surface', () => {
    const webOnly: FormFieldRead = { ...conditional, fieldId: 'web-only', valueKey: 'webOnly', showList: [1], required: true }
    const current = form([need, webOnly], { need: '1', webOnly: 'should stay local' })
    expect(appointmentRuntimeFieldsFor(current).map(field => field.valueKey)).toEqual(['need'])
    expect(normalizeAppointmentForm(current).state).toBe('failed_terminal')
  })

  it('fails closed for visible unsupported metadata but ignores an explicitly hidden unsupported row', () => {
    const unsupported: FormFieldRead = { ...conditional, fieldId: 'unresolved', valueKey: 'unresolved', unsupportedReason: 'R1 option provider not verified' }
    const visible = normalizeAppointmentForm(form([need, unsupported], { need: '1' }))
    expect(visible.state).toBe('failed_terminal')
    expect(visible.error?.category).toBe('unsupported_capability')
    expect(normalizeAppointmentForm(form([need, unsupported], { need: '0' }))).toEqual({
      state: 'succeeded', data: { need: '0' },
    })
  })

  it('rejects malformed visibility expressions rather than treating them as visible or hidden', () => {
    const unknown: FormFieldRead = {
      ...conditional, fieldId: 'invalid', valueKey: 'invalid',
      visibility: { kind: 'bogus', path: 'need', value: '1' } as unknown as FormFieldRead['visibility'],
    }
    const result = normalizeAppointmentForm(form([need, unknown], { need: '1' }))
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('unsupported_capability')
  })
})
