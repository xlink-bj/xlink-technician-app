import { describe, expect, it } from 'vitest'
import { evaluateFieldState, normalizeFieldValue, normalizeSubmission } from '@runtimes/dynamic-form'
import { actionFormSchemaFor } from '@features/work-orders/action-form-schema'
import { normalizeDynamicFieldValue, normalizeDynamicForm } from '@features/work-orders/dynamic-form-action'
import { normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
import type { AppointmentFormFieldRead, DynamicFormRead, FormFieldValue } from '@shared/ports'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'

// Synthetic options prove shape validation only, never provider provenance,
// grants, UI or transport. Deliberately invalid values cross the typed boundary.
const options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: '0', label: 'Zero' }, { value: 'false', label: 'No' }]
const field = (extra: Partial<AppointmentFormFieldRead> = {}): AppointmentFormFieldRead => ({
  fieldId: 'choice', valueKey: 'choice', label: '选择', type: 'radio',
  required: true, readOnly: false, multiple: false, options, ...extra,
})
const form = (f: AppointmentFormFieldRead, value: unknown): DynamicFormRead => ({ fields: [f], values: { choice: value as FormFieldValue } })
const submit = (f: AppointmentFormFieldRead, value: unknown) => normalizeSubmission({ fields: [actionFormSchemaFor(f)], values: { choice: value }, surface: 'mobile_detail' })
const action = (f: AppointmentFormFieldRead, value: unknown) => normalizeDynamicForm(form(f, value))
const bounded = (f: AppointmentFormFieldRead, value: unknown, sourceNodeType: 'forms' | 'repeat') => {
  // Pure value normalizer input; this object is not issued as a reader proof.
  const snapshot = { workOrderId: 's', node: { id: 'n', runId: 'w', sourceNodeType, category: 'form', lifecycle: 'active', formFieldIdsReadOnly: [] }, definition: { id: 'e', fields: [f] }, fillableFieldIds: ['choice'], records: [] } as unknown as R1NodeFormsSnapshot
  return normalizeR1RepeatValues(snapshot, { choice: value })
}
const invalidRadios = [
  ...[false, true].flatMap(multiple => [[], ['a'], ['a', 'b']].map(value => ({ label: `multiple=${multiple}, array=${JSON.stringify(value)}`, multiple, value }))),
  ...['a', undefined, null, ''].map(value => ({ label: `multiple=true, scalar/missing=${String(value)}`, multiple: true, value })),
]
const hidden = { kind: 'equals', path: 'showChoice', value: true } as const

describe('shared R1 radio scalar contract', () => {
  it.each(invalidRadios)('rejects $label at each pure layer before optional missing-value skipping', ({ multiple, value }) => {
    const f = field({ multiple, required: false })
    expect.soft(normalizeFieldValue('radio', value, options, multiple).ok).toBe(false)
    expect.soft(submit(f, value)).toMatchObject({ ok: false, reason: 'validation', fieldId: 'choice' })
    expect.soft(action(f, value)).toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    for (const node of ['forms', 'repeat'] as const) expect.soft(() => bounded(f, value, node)).toThrow()
  })
  it.each(['a', 0, false])('retains legitimate scalar %j without lossy conversion', value => {
    expect(normalizeFieldValue('radio', value, options)).toEqual({ ok: true, value })
    expect(submit(field(), value)).toMatchObject({ ok: true, value: { values: { choice: value } } })
    expect(action(field(), value)).toMatchObject({ state: 'succeeded', data: { choice: value } })
    for (const node of ['forms', 'repeat'] as const) expect(bounded(field(), value, node)).toEqual({ choice: value })
  })
  it('still rejects a value outside the verified option set', () => {
    expect(normalizeFieldValue('radio', 'foreign', options).ok).toBe(false)
    expect(submit(field(), 'foreign').ok).toBe(false)
    expect(action(field(), 'foreign').state).toBe('failed_terminal')
  })
  it('never turns a missing option provider into a valid dynamic action', () => {
    const f = field({ options: undefined, valueOption: 'unverified-provider' })
    expect(action(f, 'a').state).toBe('failed_terminal')
    expect(() => bounded(f, 'a', 'repeat')).toThrow()
  })
  it.each(['select', 'bizSelect'])('retains multiple %s arrays in runtime and generic Action', type => {
    const f = field({ type, multiple: true }), value = ['a', 'b']
    expect(normalizeFieldValue(type, value, options, true)).toEqual({ ok: true, value })
    expect(submit(f, value).ok).toBe(true)
    expect(action(f, value)).toMatchObject({ state: 'succeeded', data: { choice: value } })
  })
  it('retains Checkbox arrays without a multiple flag', () => {
    const f = field({ type: 'checkbox' }), value = ['a', 'b']
    expect(normalizeFieldValue('checkbox', value, options)).toEqual({ ok: true, value })
    expect(submit(f, value).ok).toBe(true)
    expect(action(f, value).state).toBe('succeeded')
  })
  it.each([['select', ['a']], ['checkbox', 'a']] as const)('does not widen %s cardinality', (type, value) => {
    expect(normalizeFieldValue(type, value, options).ok).toBe(false)
  })
  it.each([{ value: undefined }, { value: null }, { value: '' }])('retains required and optional missing-value behavior for $value', ({ value }) => {
    expect(submit(field(), value)).toMatchObject({ ok: false, reason: 'validation' })
    expect(action(field(), value).state).toBe('failed_terminal')
    expect(submit(field({ required: false }), value)).toEqual({ ok: true, value: { values: {} } })
    expect(action(field({ required: false }), value)).toMatchObject({ state: 'succeeded', data: {} })
  })
  it.each(invalidRadios)('omits a hidden $label unless hidden values participate', ({ multiple, value }) => {
    const f = field({ multiple, visibility: hidden })
    const input = { fields: [actionFormSchemaFor(f)], values: { showChoice: false, choice: value }, surface: 'mobile_detail' as const }
    expect(normalizeSubmission(input)).toEqual({ ok: true, value: { values: {} } })
    expect(normalizeSubmission({ ...input, preserveHiddenValues: true })).toMatchObject({ ok: false, reason: 'validation' })
    expect(normalizeDynamicForm({ ...form(f, value), values: { showChoice: false, choice: value as FormFieldValue } })).toMatchObject({ state: 'succeeded', data: {} })
  })
  it('retains a legitimate hidden scalar only when requested', () => {
    const input = { fields: [actionFormSchemaFor(field({ visibility: hidden }))], values: { showChoice: false, choice: 'a' } }
    expect(normalizeSubmission(input)).toEqual({ ok: true, value: { values: {} } })
    expect(normalizeSubmission({ ...input, preserveHiddenValues: true })).toEqual({ ok: true, value: { values: { choice: 'a' } } })
  })
  it.each([{ mobileDetailHidden: true }, { showList: ['1'] }, { presentationOnly: true }])('keeps non-participating fields excluded: %j', metadata => {
    const f = field({ ...metadata, multiple: true })
    expect(submit(f, []).ok).toBe(true)
    expect(action(f, []).state).toBe('succeeded')
    expect(normalizeSubmission({ fields: [actionFormSchemaFor(f)], values: { choice: [] }, surface: 'mobile_detail', preserveHiddenValues: true })).toEqual({ ok: true, value: { values: {} } })
  })
  it('retains readonly precedence and valid persisted scalars without allowing edits', () => {
    const f = field({ readOnly: true })
    expect(evaluateFieldState(actionFormSchemaFor(f), { values: { choice: 'a' }, surface: 'mobile_detail' })).toMatchObject({ readOnly: true, required: false })
    expect(submit(f, 'a')).toMatchObject({ ok: true, value: { values: { choice: 'a' } } })
    expect(submit(f, undefined)).toEqual({ ok: true, value: { values: {} } })
    expect(action(f, 'a')).toMatchObject({ state: 'succeeded', data: { choice: 'a' } })
    expect(normalizeDynamicFieldValue(form(f, 'a'), f, 'b')).toMatchObject({ state: 'failed_terminal', error: { message: 'Read-only fields cannot be changed' } })
  })
  it.each(invalidRadios)('readonly does not legalize participating $label', ({ multiple, value }) => {
    const f = field({ readOnly: true, multiple })
    expect.soft(submit(f, value)).toMatchObject({ ok: false, reason: 'validation' })
    expect.soft(action(f, value)).toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
  })
  it('does not open bounded forms/repeat Select multiple or Checkbox capabilities', () => {
    for (const node of ['forms', 'repeat'] as const) {
      expect(() => bounded(field({ type: 'select', multiple: true }), ['a', 'b'], node)).toThrow()
      expect(() => bounded(field({ type: 'checkbox' }), ['a', 'b'], node)).toThrow()
    }
  })
})
