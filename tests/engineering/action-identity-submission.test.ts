import { describe, expect, it } from 'vitest'
import { normalizeDynamicForm, normalizeDynamicFieldValue } from '@features/work-orders/dynamic-form-action'
import { normalizeAppointmentForm } from '@features/work-orders/appointment-form-runtime'
import type { DynamicFormRead, AppointmentFormRead, AppointmentFormFieldRead } from '@shared/ports'

function form(type: 'phone' | 'IDNumber', value: string, extra: Partial<AppointmentFormFieldRead> = {}): DynamicFormRead & AppointmentFormRead {
  return { fields: [{ fieldId: 'identity-row', valueKey: 'contact', label: '联系信息', type,
    required: false, readOnly: false, showList: ['4'], ...extra }], values: { contact: value } }
}
const complete = (f: DynamicFormRead) => normalizeDynamicForm(f, { intent: 'complete' })
const validId = '99000019900101001X' // Synthetic syntax only; no identity/checksum claim.

describe('explicit submission formats; save-only and historical values stay separate', () => {
  for (const [type, valid, invalid] of [['phone', '13800000000', '123'], ['IDNumber', validId, 'bad-id']] as const) {
    it(`${type}: rejects invalid editable values on completion, retains save-only`, () => {
      const f = form(type, invalid), before = structuredClone(f)
      expect(normalizeDynamicForm(f).state).toBe('succeeded')
      expect(complete(f)).toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
      expect(f).toEqual(before)
    })
    it(`${type}: dedicated appointment still rejects unknown contact keys`, () => {
      expect(normalizeAppointmentForm(form(type, invalid))).toMatchObject({ state: 'failed_terminal', error: { category: 'unsupported_capability' } })
      expect(normalizeAppointmentForm(form(type, valid))).toMatchObject({ state: 'failed_terminal', error: { category: 'unsupported_capability' } })
    })
    it(`${type}: preserves unfinished raw input for submission validation`, () => {
      const f = form(type, invalid)
      expect(normalizeDynamicFieldValue(f, f.fields[0]!, ' ' + valid)).toMatchObject({ state: 'succeeded', data: ' ' + valid })
    })
    it(`${type}: keeps exact valid submitted strings without rewriting case or zeros`, () => {
      expect(complete(form(type, valid))).toMatchObject({ state: 'succeeded', data: { contact: valid } })
      expect(complete(form(type, ' ' + valid))).toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    })
    it(`${type}: exempts field/workflow readonly and excludes hidden/nonmobile rows`, () => {
      for (const f of [form(type, invalid, { readOnly: true }), { ...form(type, invalid), workflowReadOnlyFieldIds: ['identity-row'] }]) {
        expect(complete(f).state).toBe('succeeded')
      }
      for (const f of [form(type, invalid, { visibility: { kind: 'equals', path: 'show', value: 'yes' } }), form(type, invalid, { showList: ['2'] })]) {
        expect(complete(f)).toMatchObject({ state: 'succeeded', data: {} })
      }
    })
    it(`${type}: keeps optional empty distinct from required missing`, () => {
      expect(complete(form(type, '')).state).toBe('succeeded')
      expect(complete(form(type, '', { required: true }))).toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    })
  }
  it('matches R1 scalar comparison and truthy guards without mutating source values', () => {
    for (const [type, value] of [['phone', 13800000000], ['IDNumber', 990000900101001], ['phone', 0], ['IDNumber', false]] as const) {
      const f = { ...form(type, ''), values: { contact: value } }, before = structuredClone(f)
      expect(complete(f).state).toBe('succeeded')
      expect(f).toEqual(before)
    }
  })
  it('uses R1 ID syntax, including 15 digits/lowercase x and its calendar/checksum limits', () => {
    for (const value of ['990000900101001', validId.toLowerCase(), '990000199001|1001X', '99000019900231001X', '99000019900000001X']) {
      expect(complete(form('IDNumber', value))).toMatchObject({ state: 'succeeded', data: { contact: value } })
    }
    for (const value of ['99000019901301001X', '99000019900132001X', '09000019900101001X']) {
      expect(complete(form('IDNumber', value)).state).toBe('failed_terminal')
    }
  })
})
