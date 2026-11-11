import { describe, expect, it } from 'vitest'
import { formDefinition } from '@adapters/api/read-models/form'
import { asOpaqueId } from '@shared/types'
import { normalizeR1RepeatValues, projectR1RepeatFields, updateR1FormDraftValue } from '@features/work-orders/r1-repeat-form'
import { updateR1CreateDraftValues as update } from '@features/work-orders/r1-ordinary-create-draft'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import type { FormFieldRead } from '@shared/ports'

const raw = [['mode', 'text', '0'], ['followupAt', 'datetime', '1'], ['memo', 'text', '0']]
  .map(([name, type, required], i) => ({ _id: `id-${i}`, tenantId: 'test-tenant', extId: 'test-def',
    colName: 'onsiteScheduleRecord', name, nameDisp: name, type, preset: 0, required, state: 1,
    multiple: false, showList: ['1', '2', '4'], showType: name === 'followupAt' ? '3' : '1',
    showField: name === 'followupAt' ? 'mode' : '', showValue: name === 'followupAt' ? 'on' : '',
    showFieldPreset: 0, operationType: '1', frontEndConfig: '{}', exts: {} }))
const definition = formDefinition({ data: raw }, asOpaqueId<'FormDefinitionId'>('test-def'))
const fixture = (fields: readonly FormFieldRead[] = definition.fields!): R1NodeFormsSnapshot => ({
  workOrderId: 'test-work', node: { id: 'test-node', runId: 'test-run', sourceNodeType: 'forms',
    formDefinitionId: 'test-def', formFieldIdsReadOnly: [] }, definition: { ...definition, fields },
  fillableFieldIds: fields.map(f => f.fieldId), records: [],
} as unknown as R1NodeFormsSnapshot)
const filled = { mode: 'on', followupAt: '2027-01-02 00:05:00', memo: '保留现场说明' }
const replace = (changes: Partial<FormFieldRead>, key = 'followupAt') => fixture(definition.fields!
  .map(f => f.valueKey === key ? { ...f, ...changes } : f))

describe('ordinary first-create local draft, independent of command authorization', () => {
  it('uses actual raw showType=3/string showValue and distinct fieldId/valueKey bindings', () => {
    const s = fixture()
    expect(s.definition.fields![1]).toMatchObject({ fieldId: 'id-1', valueKey: 'followupAt',
      required: true, visibility: { kind: 'equals', path: 'mode', value: 'on' } })
    const next = update(s, filled, 'mode', 'off')
    expect(next).toEqual({ mode: 'off', memo: filled.memo })
    expect(Object.hasOwn(next, 'followupAt')).toBe(false)
    expect(normalizeR1RepeatValues(s, next)).toEqual(next)
    expect(Object.hasOwn(next, 'id-1')).toBe(false)
  })
  it('closes the exact six-field temporal draft counterexample without changing the wire guard', () => {
    const names = [['visitDate', 'date', 1, '1'], ['visitTime', 'time', 0, '0'],
      ['visitAt', 'datetime', 0, '0'], ['mode', 'text', 0, '0'],
      ['followupAt', 'datetime', 0, '1'], ['memo', 'text', 0, '0']]
    const rows = names.map(([name, type, preset, required], i) => ({ ...raw[0], _id: `temporal-${i}`,
      name, nameDisp: name, type, preset, required, showType: name === 'followupAt' ? '3' : '1',
      showField: name === 'followupAt' ? 'mode' : '', showValue: name === 'followupAt' ? 'on' : '' }))
    const s = fixture(formDefinition({ data: rows }, asOpaqueId<'FormDefinitionId'>('test-def')).fields!)
    const values = { visitDate: '2028-02-29', visitTime: '00:05', visitAt: '2027-01-01 00:05:00',
      mode: 'on', followupAt: filled.followupAt }
    const stale = updateR1FormDraftValue(s, values, 'mode', 'off')
    expect(Object.hasOwn(stale, 'followupAt')).toBe(true)
    expect(() => normalizeR1RepeatValues(s, stale)).toThrow()
    const next = update(s, values, 'mode', 'off')
    expect(next).toEqual({ visitDate: values.visitDate, visitTime: values.visitTime, visitAt: values.visitAt, mode: 'off' })
    expect(Object.hasOwn(next, 'memo')).toBe(false)
    expect(normalizeR1RepeatValues(s, next)).toEqual(next)
  })
  it('preserves visible input and immutable originals, including false/zero/empty strings', () => {
    const s = fixture(), values = Object.freeze({ ...filled })
    expect(update(s, values, 'memo', '')).toEqual({ ...filled, memo: '' })
    expect(values).toEqual(filled)
    expect(update(s, { mode: 'off', memo: 0 }, 'memo', false)).toEqual({ mode: 'off', memo: false })
    expect(s.records).toEqual([])
  })
  it('does not restore a discarded value when the condition becomes visible again; required gates resume', () => {
    const s = fixture(), hidden = update(s, filled, 'mode', 'off')
    const visible = update(s, hidden, 'mode', 'on')
    expect(visible).toEqual({ mode: 'on', memo: filled.memo })
    expect(projectR1RepeatFields(s, visible).find(f => f.valueKey === 'followupAt'))
      .toMatchObject({ visible: true, required: true })
    expect(() => normalizeR1RepeatValues(s, visible)).toThrow()
    expect(normalizeR1RepeatValues(s, update(s, visible, 'followupAt', filled.followupAt))).toEqual(filled)
  })
  it('keeps the submission guard and original updater refusal unchanged until coordinated integration', () => {
    const s = fixture(), stale = updateR1FormDraftValue(s, filled, 'mode', 'off')
    expect(stale.followupAt).toBe(filled.followupAt)
    expect(() => normalizeR1RepeatValues(s, stale)).toThrow()
    expect(() => update(s, stale, 'memo', 'new')).toThrow()
  })
  it.each([false, true])('clears dependent chains with final context, reversed field order=%s', reverse => {
    const a = definition.fields![0]!, b = { ...definition.fields![1]!, type: 'text' },
      c = { ...definition.fields![2]!, visibility: { kind: 'equals' as const, path: ['followupAt'], value: 'yes' } }
    const s = fixture(reverse ? [c, b, a] : [a, b, c])
    const next = update(s, { mode: 'on', followupAt: 'yes', memo: 'chain' }, 'mode', 'off')
    expect(next).toEqual({ mode: 'off' })
    expect(normalizeR1RepeatValues(s, next)).toEqual(next)
  })
  it('uses final context for newly visible required fields without inventing their values', () => {
    const s = replace({ required: true, visibility: { kind: 'exists', path: ['followupAt'], expected: false } }, 'memo')
    const next = update(s, { mode: filled.mode, followupAt: filled.followupAt }, 'mode', 'off')
    expect(next).toEqual({ mode: 'off' })
    expect(projectR1RepeatFields(s, next).find(f => f.valueKey === 'memo')).toMatchObject({ visible: true, required: true })
    expect(() => normalizeR1RepeatValues(s, next)).toThrow()
    const completed = update(s, next, 'memo', 'newly required')
    expect(normalizeR1RepeatValues(s, completed)).toEqual(completed)
  })
  it('atomically refuses trim that would reveal a required field after dropping its value', () => {
    const s = fixture(), values = Object.freeze({ ...filled })
    expect(() => update(s, values, 'mode', ' on ')).toThrow()
    expect(values).toEqual(filled)
  })
  it.each(['', '   '])('atomically refuses empty-controller omission that changes final required state (%j)', mode => {
    const s = replace({ visibility: { kind: 'exists', path: 'mode', expected: false } })
    const values = Object.freeze({ mode: 'on', memo: 'preserve' })
    expect(() => update(s, values, 'mode', mode)).toThrow()
    expect(values).toEqual({ mode: 'on', memo: 'preserve' })
  })
  it.each([
    ['number', 1, '2', 2],
    ['digit', 1, '2.00', 2],
    ['date', '2027-01-01', ' 2027-01-02 ', '2027-01-02'],
    ['time', '00:05', ' 00:06 ', '00:06'],
    ['datetime', '2027-01-01 00:05:00', ' 2027-01-02 00:05:00 ', '2027-01-02 00:05:00'],
  ] as const)('refuses %s coercion that changes a controller condition without mutating input', (type, before, input, wire) => {
    const fields = definition.fields!.map(f => f.valueKey === 'mode' ? { ...f, type }
      : f.valueKey === 'followupAt' ? { ...f, visibility: { kind: 'oneOf' as const, path: 'mode', values: [before, wire] } } : f)
    const s = fixture(fields), old = Object.freeze({ ...filled, mode: before })
    expect(() => update(s, old, 'mode', input)).toThrow()
    expect(old).toEqual({ ...filled, mode: before })
    expect(update(s, old, 'mode', wire)).toEqual({ ...filled, mode: wire })
  })
  it('preserves untrimmed non-controller draft input while retaining existing submission codecs', () => {
    const s = fixture(), next = update(s, filled, 'memo', '  keep my draft spacing  ')
    expect(next.memo).toBe('  keep my draft spacing  ')
    expect(normalizeR1RepeatValues(s, next).memo).toBe('keep my draft spacing')
  })

  const denied: readonly (readonly [string, () => R1NodeFormsSnapshot])[] = [
    ['readonly field', () => replace({ readOnly: true })],
    ['readonly runtime', () => ({ ...fixture(), node: { ...fixture().node, formFieldIdsReadOnly: ['id-1'] } })],
    ['missing readonly evidence', () => ({ ...fixture(), node: { ...fixture().node, formFieldIdsReadOnly: undefined } })],
    ['nonfillable field', () => ({ ...fixture(), fillableFieldIds: ['id-0', 'id-2'] })],
    ['duplicate fill ID', () => ({ ...fixture(), fillableFieldIds: ['id-0', 'id-0', 'id-2'] })],
    ['duplicate valueKey', () => replace({ valueKey: 'mode' })],
    ['duplicate fieldId', () => replace({ fieldId: 'id-0' })],
    ['unsupported field', () => replace({ type: 'unverified-widget' })],
    ['unsupported metadata', () => replace({ unsupportedReason: 'not verified' })],
    ['presentation-only', () => replace({ presentationOnly: true })],
    ['mobile excluded', () => replace({ showList: ['1', '2'] })],
    ['multi select', () => replace({ type: 'select', multiple: true })],
    ['select without verified options', () => replace({ type: 'select', options: [] })],
    ['duplicate option values', () => replace({ type: 'radio', options: [{ value: 'x', label: 'X' }, { value: 'x', label: 'Again' }] })],
    ['hierarchical scalar choice', () => replace({ type: 'select', options: [{ value: 'x', label: 'X', children: [{ value: 'y', label: 'Y' }] }] })],
    ['checkbox', () => replace({ type: 'checkbox', multiple: true })],
    ['file', () => replace({ type: 'file' })],
    ['business options', () => replace({ type: 'select', valueOption: 'unknown' })],
    ['unknown controller', () => replace({ visibility: { kind: 'equals', path: ['unknown'], value: 'on' } })],
    ['nested controller', () => replace({ visibility: { kind: 'equals', path: ['exts', 'mode'], value: 'on' } })],
    ['malformed rule', () => replace({ visibility: { kind: 'unknown' } as never })],
    ['false rule with unknown sibling', () => replace({ visibility: { kind: 'all', conditions: [
      { kind: 'equals', path: ['mode'], value: 'never' }, { kind: 'unknown' } as never] } })],
    ['self cycle', () => replace({ visibility: { kind: 'exists', path: ['followupAt'], expected: true } })],
    ['mutual cycle', () => replace({ visibility: { kind: 'exists', path: ['followupAt'], expected: true } }, 'mode')],
    ['reserved key', () => replace({ valueKey: 'tenantId' })],
    ['append', () => ({ ...fixture(), records: [{ id: 'already-saved' }] } as unknown as R1NodeFormsSnapshot)],
    ['repeat', () => ({ ...fixture(), node: { ...fixture().node, sourceNodeType: 'repeat' } })],
    ['appointment', () => ({ ...fixture(), definition: { ...fixture().definition, purpose: 'appointment' as const } })],
    ['typed survey', () => ({ ...fixture(), definition: { ...fixture().definition, purpose: 'survey' as const } })],
  ]
  it.each(denied)('fails atomically for %s', (_name, snapshot) => {
    const values = Object.freeze({ ...filled })
    expect(() => update(snapshot(), values, 'mode', 'off')).toThrow()
    expect(values).toEqual(filled)
  })
  it('rejects unknown keys, field IDs as value keys, hidden input, arrays and objects without erasing them', () => {
    const s = fixture()
    expect(() => update(s, { ...filled, unknown: 'keep' }, 'mode', 'off')).toThrow()
    expect(() => update(s, filled, 'id-0', 'off')).toThrow()
    expect(() => update(s, { mode: 'off' }, 'followupAt', filled.followupAt)).toThrow()
    expect(() => update(s, filled, 'memo', [] as string[])).toThrow()
    expect(() => update(s, filled, 'memo', {} as never)).toThrow()
  })
  it('does not add a second schema scale or support incomplete field inventories', () => {
    expect(() => update(fixture([]), {}, 'mode', 'off')).toThrow()
    const fields = Array.from({ length: 51 }, (_, i) => ({ ...definition.fields![0]!, fieldId: `large-${i}`, valueKey: `large${i}` }))
    expect(() => update(fixture(fields), {}, 'large0', 'value')).toThrow()
    const s = { ...fixture(), fillableFieldIds: undefined }
    expect(() => update(s, filled, 'mode', 'off')).toThrow()
  })
})
