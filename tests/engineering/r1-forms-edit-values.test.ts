import { describe, expect, it } from 'vitest'
import { normalizeR1FormsEditValues, projectR1FormsEditValues } from '@features/work-orders/r1-forms-edit-values'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'

const field = (valueKey: string, extra: Record<string, unknown> = {}) => ({ fieldId: valueKey, valueKey, type: 'text', required: false, readOnly: false, label: valueKey, ...extra })
function snapshot(fields = [field('name', { required: true })], readonly: string[] = []): R1NodeFormsSnapshot {
  return { workOrderId: 's', node: { id: 'n', formFieldIdsReadOnly: readonly }, definition: { id: 'e', fields }, records: [] } as unknown as R1NodeFormsSnapshot
}
const original = () => ({ _id: 'existing', tenantId: 't', name: 'top-level', exts: { name: 'authoritative', unknown: { retain: [1, 2] } }, metadata: { retain: true } })

describe('normal forms edit business-field validation', () => {
  it('projects only definition keys, prefers exts and never changes the original', () => {
    const raw = original(), before = structuredClone(raw), s = snapshot()
    expect(projectR1FormsEditValues(s, raw)).toEqual({ name: 'authoritative' })
    expect(normalizeR1FormsEditValues(s, raw, { name: ' next ' })).toEqual({ fields: { name: 'next' }, clearedFieldKeys: [] })
    expect(raw).toEqual(before)
  })
  it('does not patch omitted fields and validates required fields against full original context', () => {
    expect(normalizeR1FormsEditValues(snapshot(), original(), {})).toEqual({ fields: {}, clearedFieldKeys: [] })
    expect(() => normalizeR1FormsEditValues(snapshot(), {}, {})).toThrow()
    expect(() => normalizeR1FormsEditValues(snapshot(), original(), { name: '  ' })).toThrow()
  })
  it.each(['field', 'workflow'])('preserves unchanged %s readonly values while refusing edits', mode => {
    const s = snapshot([field('name', { readOnly: mode === 'field' })], mode === 'workflow' ? ['name'] : [])
    expect(normalizeR1FormsEditValues(s, original(), { name: 'authoritative' }).fields).toEqual({})
    expect(() => normalizeR1FormsEditValues(s, original(), { name: 'changed' })).toThrow()
  })
  it('retains hidden original values, refuses hidden edits and evaluates conditions from original plus draft', () => {
    const s = snapshot([field('toggle'), field('reason', { required: true, visibility: { kind: 'equals', path: 'toggle', value: 'yes' } })])
    const raw = { toggle: 'no', reason: 'keep', exts: { toggle: 'no', reason: 'keep' } }
    expect(normalizeR1FormsEditValues(s, raw, { toggle: 'no', reason: 'keep' })).toEqual({ fields: { toggle: 'no' }, clearedFieldKeys: [] })
    expect(() => normalizeR1FormsEditValues(s, raw, { reason: 'changed' })).toThrow()
    expect(normalizeR1FormsEditValues(s, raw, { toggle: 'yes' }).fields).toEqual({ toggle: 'yes' })
    expect(() => normalizeR1FormsEditValues(s, { toggle: 'no' }, { toggle: 'yes' })).toThrow()
    expect(normalizeR1FormsEditValues(s, { toggle: 'no' }, { toggle: 'yes', reason: 'new' }).fields).toEqual({ toggle: 'yes', reason: 'new' })
    expect(raw.reason).toBe('keep')
  })
  it('validates scalar options and local date values using the shared runtime', () => {
    const s = snapshot([field('choice', { type: 'select', options: [{ value: 'a', label: 'A' }] }), field('day', { type: 'date' })])
    expect(normalizeR1FormsEditValues(s, {}, { choice: 'a', day: '2026-11-08' }).fields).toEqual({ choice: 'a', day: '2026-11-08' })
    expect(() => normalizeR1FormsEditValues(s, {}, { choice: 'b' })).toThrow()
    expect(() => normalizeR1FormsEditValues(s, {}, { day: '2026-02-30' })).toThrow()
  })
  it('uses a complete clearing condition context independently of field order', () => {
    const fields = [field('reason', { required: true, visibility: { kind: 'equals', path: 'toggle', value: '' } }), field('toggle')]
    const raw = { toggle: 'yes', exts: { toggle: 'yes' } }
    for (const ordered of [fields, [...fields].reverse()]) {
      expect(() => normalizeR1FormsEditValues(snapshot(ordered), raw, { toggle: '   ' })).toThrow()
      expect(normalizeR1FormsEditValues(snapshot(ordered), raw, { toggle: '   ', reason: 'because' })).toEqual({ fields: { reason: 'because' }, clearedFieldKeys: ['toggle'] })
    }
  })
  it.each(['', null, undefined, '   '])('returns explicit optional clear %j only with both original wire slots', value => {
    const s = snapshot([field('name')]), raw = original()
    expect(normalizeR1FormsEditValues(s, raw, { name: value })).toEqual({ fields: {}, clearedFieldKeys: ['name'] })
    expect(() => normalizeR1FormsEditValues(s, { name: 'only top' }, { name: value })).toThrow()
    expect(() => normalizeR1FormsEditValues(s, { exts: { name: 'only nested' } }, { name: value })).toThrow()
    expect(raw.exts.name).toBe('authoritative')
  })
  it.each([{ unknown: 1 }, { _id: 'other' }, { tenantId: 'other' }])('rejects extra draft keys %j', draft => {
    expect(() => normalizeR1FormsEditValues(snapshot(), original(), draft)).toThrow()
  })
  it.each([
    [field('x', { type: 'unknown' })], [field('x', { multiple: true })],
    [field('_id')], [field('exts')], [field('nodeId')], [field('formDefinitionId')], [field('runId')], [field('workflow')], [field('x'), field('x')],
    [field('x', { type: 'select' })], [field('x', { unsupportedReason: 'not verified' })],
    [field('x', { visibility: { kind: 'unknown' } })],
    Array.from({ length: 51 }, (_, i) => field(`x${i}`)),
  ].map(fields => ({ fields })))('rejects unsupported or ambiguous definitions %#', ({ fields }) => {
    expect(() => normalizeR1FormsEditValues(snapshot(fields), {}, {})).toThrow()
  })
  it('rejects malformed exts instead of ignoring unpreservable raw data', () => {
    expect(() => projectR1FormsEditValues(snapshot(), { exts: [] })).toThrow()
  })
})
