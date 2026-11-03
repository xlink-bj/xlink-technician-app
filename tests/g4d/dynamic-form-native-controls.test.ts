import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeDynamicFieldValue, normalizeDynamicForm } from '@features/work-orders/dynamic-form-action'
import { normalizeFieldValue } from '@runtimes/dynamic-form'
import { dateTimeParts, dateTimeWire } from '@shared/ui/date-time-wire'
import type { DynamicFormRead, FormFieldRead } from '@shared/ports'

function field(fieldId: string, valueKey: string, type: string): FormFieldRead {
  return { fieldId, valueKey, type, label: valueKey, required: false, readOnly: false, showList: ['4'] }
}

describe('Dynamic Form source-backed scalar control closure', () => {
  it('retains R1 literal 1/0 switch values across edits, submission and readback', () => {
    const enabled = field('switch-a', 'inspectionConfirmed', 'switch')
    const accepted = field('switch-b', 'acceptanceConfirmed', 'switch')
    const form: DynamicFormRead = {
      fields: [enabled, accepted], values: { inspectionConfirmed: '0', acceptanceConfirmed: '1' },
    }
    expect(normalizeDynamicFieldValue(form, enabled, '1'))
      .toMatchObject({ state: 'succeeded', data: '1' })
    expect(normalizeDynamicFieldValue(form, accepted, '0'))
      .toMatchObject({ state: 'succeeded', data: '0' })
    const changed: DynamicFormRead = {
      ...form, values: { inspectionConfirmed: '1', acceptanceConfirmed: '0' },
    }
    expect(normalizeDynamicForm(changed)).toEqual({
      state: 'succeeded', data: { inspectionConfirmed: '1', acceptanceConfirmed: '0' },
    })
    expect(normalizeFieldValue('switch', 'wrong')).toMatchObject({ ok: false, reason: 'invalid_value' })
  })

  it('retains leading zeros on text IDs and validates numeric precision/type at the Runtime', () => {
    const phone = field('phone', 'contactPhone', 'phone')
    const id = field('idnumber', 'identity', 'IDNumber')
    const quantity = field('quantity', 'quantity', 'number')
    const area = field('measured', 'measured', 'digit')
    const form: DynamicFormRead = { fields: [phone, id, quantity, area], values: {} }
    expect(normalizeDynamicFieldValue(form, phone, '0013800100200')).toMatchObject({
      state: 'succeeded', data: '0013800100200',
    })
    expect(normalizeDynamicFieldValue(form, id, '000100200300400500')).toMatchObject({
      state: 'succeeded', data: '000100200300400500',
    })
    expect(normalizeDynamicFieldValue(form, quantity, '12')).toMatchObject({ state: 'succeeded', data: 12 })
    expect(normalizeDynamicFieldValue(form, area, '12.50')).toMatchObject({ state: 'succeeded', data: 12.5 })
    expect(normalizeDynamicFieldValue(form, quantity, '12.5'))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
  })

  it('preserves source date/time strings while refusing edits to Workflow readonly fields', () => {
    const date = field('date-row', 'visitDate', 'date')
    const time = field('time-row', 'visitTime', 'time')
    const form: DynamicFormRead = {
      fields: [date, time], values: { visitDate: '2026-11-03', visitTime: '14:30' },
      workflowReadOnlyFieldIds: ['time-row'],
    }
    expect(normalizeDynamicFieldValue(form, date, '2026-11-04'))
      .toMatchObject({ state: 'succeeded', data: '2026-11-04' })
    expect(normalizeDynamicFieldValue(form, time, '15:30'))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    expect(normalizeDynamicForm(form)).toEqual({
      state: 'succeeded', data: { visitDate: '2026-11-03', visitTime: '14:30' },
    })
  })

  it('normalizes R1 5-point ratings and does not allow made-up scores', () => {
    expect(normalizeFieldValue('rate', 1)).toEqual({ ok: true, value: 1 })
    expect(normalizeFieldValue('rate', '5')).toEqual({ ok: true, value: 5 })
    for (const value of ['0', '6', '2.5', 'n/a', true, []]) {
      expect(normalizeFieldValue('rate', value)).toMatchObject({ ok: false, reason: 'invalid_value' })
    }
    expect(normalizeFieldValue('rate', [1, 2], undefined, true))
      .toMatchObject({ ok: false, reason: 'invalid_value' })
  })

  it('roundtrips local datetime without timezone conversion or losing existing seconds', () => {
    expect(dateTimeParts('2026-11-03 14:30:24')).toEqual({ date: '2026-11-03', time: '14:30' })
    expect(dateTimeWire('2026-11-04', '14:30', '2026-11-03 14:30:24')).toBe('2026-11-04 14:30:24')
    expect(dateTimeWire('2026-11-03', '16:00', '2026-11-03 14:30:24')).toBe('2026-11-03 16:00:00')
    expect(dateTimeWire('', '14:30')).toBeUndefined()
    expect(dateTimeWire('2026-11-03', '')).toBeUndefined()
  })

  it('submits a complete non-Survey form with verified scalar controls and readonly protection', () => {
    const datetime = field('when-row', 'workTime', 'datetime')
    const rating = field('score-row', 'qualityRating', 'rate')
    const switchField = field('bool-row', 'confirmed', 'switch')
    const area = field('area-row', 'surfaceArea', 'digit')
    const frozen = field('frozen-row', 'locked', 'text')
    const form: DynamicFormRead = {
      fields: [datetime, rating, switchField, area, frozen],
      values: {
        workTime: '2026-11-03 14:30:00',
        qualityRating: 4,
        confirmed: '0',
        surfaceArea: 8.5,
        locked: '原始保存值',
      },
      workflowReadOnlyFieldIds: ['frozen-row'],
    }
    expect(normalizeDynamicForm(form)).toEqual({
      state: 'succeeded',
      data: {
        workTime: '2026-11-03 14:30:00',
        qualityRating: 4,
        confirmed: '0',
        surfaceArea: 8.5,
        locked: '原始保存值',
      },
    })
    expect(normalizeDynamicFieldValue(form, rating, '6'))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    expect(normalizeDynamicFieldValue(form, frozen, '伪造写入'))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
  })

  it('generic renderer uses native date/time, rating and binary controls rather than business key conditions', () => {
    const ui = readFileSync(new URL('../../src/features/work-orders/components/GenericDynamicFormActionContent.vue', import.meta.url), 'utf8')
    const native = readFileSync(new URL('../../src/shared/ui/AppDateTimeField.vue', import.meta.url), 'utf8')
    const input = readFileSync(new URL('../../src/shared/ui/AppInput.vue', import.meta.url), 'utf8')
    const registry = readFileSync(new URL('../../src/features/work-orders/field-control-registry.ts', import.meta.url), 'utf8')
    expect(ui).toContain("controlFor(field) === 'binary'")
    expect(ui).toContain("controlFor(field) === 'date'")
    expect(ui).toContain("controlFor(field) === 'time'")
    expect(ui).toContain("controlFor(field) === 'datetime'")
    expect(ui).toContain("controlFor(field) === 'rating'")
    expect(ui).toContain('AppRatingField')
    expect(ui).toContain("field.type === 'digit' ? 'digit'")
    expect(ui).toContain(':maxlength="field.presentation?.maxlength"')
    expect(ui).not.toContain("field.valueKey === 'inspectionConfirmed'")
    expect(native).toContain(`:mode="mode === 'date' ? 'date' : 'time'"`)
    expect(native).toContain('mode="date"')
    expect(native).toContain('mode="time"')
    expect(native).toContain(':disabled="disabled"')
    expect(native).not.toContain('useActionWorkspaceStore')
    expect(input).toContain(':type="inputType"')
    expect(registry).not.toContain("valueKey === 'part'")
  })
})
