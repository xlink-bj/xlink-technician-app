import { describe, expect, it } from 'vitest'
import type { FormFieldRead } from '@shared/ports'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { normalizeR1RepeatValues, projectR1RepeatFields } from '@features/work-orders/r1-repeat-form'
import { normalizeR1FormsEditValues } from '@features/work-orders/r1-forms-edit-values'
import { isR1NormalFileFieldEligible, normalizeR1NormalFileCreate, projectR1NormalFileFields, sameR1NormalFileValues, usesR1NormalFileCreate } from '@features/work-orders/r1-normal-file-values'

const attachment = { url: 'https://synthetic.invalid/inspection.png', name: 'synthetic/inspection.png', extname: 'png' }
const field = (valueKey: string, extra: Partial<FormFieldRead> = {}): FormFieldRead => ({ fieldId: valueKey, valueKey, type: 'text', label: valueKey, required: false, readOnly: false, ...extra })
function snapshot(fields = [field('attachment', { type: 'file', required: true }), field('note')]): R1NodeFormsSnapshot {
  return { workOrderId: 's', node: { id: 'n', sourceNodeType: 'forms', formFieldIdsReadOnly: [] },
    definition: { id: 'e', fields }, fillableFieldIds: fields.filter(f => !f.readOnly).map(f => f.fieldId), records: [] } as unknown as R1NodeFormsSnapshot
}

describe('normal forms file creation integration', () => {
  it('normalizes strict generic R1 file wire through the ordinary forms create validator', () => {
    const s = snapshot(), values = { attachment: [attachment], note: ' checked ' }, before = structuredClone(values)
    expect(normalizeR1RepeatValues(s, values)).toEqual({ attachment: [attachment], note: 'checked' })
    expect(values).toEqual(before)
  })
  it('projects only the ordinary forms file field as currently supported', () => {
    expect(projectR1RepeatFields(snapshot(), {}).find(f => f.fieldId === 'attachment')).toMatchObject({ type: 'file', supported: true, visible: true, required: true })
    const repeat = snapshot(); Object.assign(repeat.node, { sourceNodeType: 'repeat' })
    expect(projectR1RepeatFields(repeat, {}).find(f => f.fieldId === 'attachment')?.supported).toBe(false)
  })
  it('keeps scalar zero and false alongside a validated file list', () => {
    const s = snapshot([field('attachment', { type: 'file' }), field('amount', { type: 'digit' }), field('flag', { type: 'radio', options: [{ value: 'false', label: 'No' }] })])
    expect(normalizeR1RepeatValues(s, { attachment: [attachment], amount: 0, flag: false })).toEqual({ attachment: [attachment], amount: 0, flag: false })
  })
  it('does not enable Repeat file create or normal forms existing file edits', () => {
    const s = snapshot(), repeat = snapshot(); Object.assign(repeat.node, { sourceNodeType: 'repeat' })
    expect(() => normalizeR1RepeatValues(repeat, { attachment: [attachment] })).toThrow()
    expect(() => normalizeR1FormsEditValues(s, { attachment: [attachment], exts: { attachment: [attachment] } }, { attachment: [attachment] })).toThrow()
  })
  it('does not enable appending files to a forms node with an existing active record', () => {
    const s = snapshot(); Object.assign(s, { records: [{ id: 'old', definitionId: 'e', values: {} }] })
    expect(usesR1NormalFileCreate(s)).toBe(false)
    expect(() => normalizeR1RepeatValues(s, { attachment: [attachment] })).toThrow()
    expect(projectR1RepeatFields(s, {}).find(f => f.fieldId === 'attachment')?.supported).toBe(false)
  })
  it('does not hijack the existing large scalar-only subset when readonly file metadata exists', () => {
    const s = snapshot([field('note'), ...Array.from({ length: 58 }, (_, i) => field(`retained${i}`, { type: i === 0 ? 'file' : 'unknown', readOnly: true }))])
    expect(usesR1NormalFileCreate(s)).toBe(false)
    expect(normalizeR1RepeatValues(s, { note: ' checked ' })).toEqual({ note: 'checked' })
  })
  it('does not select the new branch solely because a readonly file appears in the metadata', () => {
    const s = snapshot([field('attachment', { type: 'file', readOnly: true }), field('note')])
    expect(usesR1NormalFileCreate(s)).toBe(false)
    expect(() => normalizeR1RepeatValues(s, { note: 'unchanged old small-form boundary' })).toThrow()
  })
  it('keeps generic image unsupported rather than treating it as a generic file', () => {
    const s = snapshot([field('photo', { type: 'image' })])
    expect(() => normalizeR1RepeatValues(s, { photo: [attachment] })).toThrow()
    expect(projectR1RepeatFields(s, {}).find(f => f.fieldId === 'photo')?.supported).toBe(false)
  })
})

describe('strict normal forms file value semantics and metadata', () => {
  it('preserves every signed URL byte and the independent server object key', () => {
    const signed = { url: 'https://SYNTHETIC.invalid:443/opaque?key=a%2Fb&Signature=AB%2f+CD%3d', name: 'server-key-not-derived-from-url', extname: 'png' }
    expect(normalizeR1NormalFileCreate(snapshot(), { attachment: [signed] }).attachment).toEqual([signed])
  })
  it.each([
    { ...attachment, extname: 'pdf' },
    { ...attachment, extname: 'png', url: 'https://user:secret@synthetic.invalid/a.png' },
    { ...attachment, extname: 'png', url: 'https://synthetic.invalid:99999/a.png' },
    { ...attachment, extname: 'png', url: 'https:///synthetic.invalid/a.png' },
    { ...attachment, extname: 'png', url: 'https://synthetic.invalid/a b.png' },
    { ...attachment, extname: 'png', url: 'https://synthetic.invalid/a\\b.png' },
  ])('rejects a non-image or non-strict normal image wire %#', value => {
    expect(() => normalizeR1NormalFileCreate(snapshot(), { attachment: [value] })).toThrow()
    expect(sameR1NormalFileValues([value], [value])).toBe(false)
  })
  it('compares exact file semantics rather than object identity or property order', () => {
    expect(sameR1NormalFileValues([attachment], [{ extname: 'png', name: attachment.name, url: attachment.url }])).toBe(true)
    expect(sameR1NormalFileValues([], [])).toBe(true)
    const second = { ...attachment, url: 'https://synthetic.invalid/second.png' }
    expect(sameR1NormalFileValues([attachment, second], [second, attachment])).toBe(false)
    expect(sameR1NormalFileValues([attachment], [{ ...attachment, name: 'other.png' }])).toBe(false)
    expect(sameR1NormalFileValues([attachment], [{ ...attachment, extname: 'txt' }])).toBe(false)
    expect(sameR1NormalFileValues([attachment], [{ ...attachment, arbitrary: true }])).toBe(false)
    expect(sameR1NormalFileValues(undefined, [])).toBe(false)
  })
  it.each([
    'https://synthetic.invalid/file.png', ['https://synthetic.invalid/file.png'],
    [{ url: attachment.url }], [{ ...attachment, arbitrary: true }],
    [{ url: attachment.url, fileName: attachment.name, extension: 'png' }],
    [{ ...attachment, url: 'http://synthetic.invalid/a.png' }],
    [{ ...attachment, name: '' }], [{ ...attachment, extname: '<script>' }],
    [attachment, attachment], Array.from({ length: 11 }, (_, i) => ({ ...attachment, url: `https://synthetic.invalid/${i}.png` })),
  ].map(raw => ({ raw })))('rejects arbitrary, partial, duplicate or oversized file values %#', ({ raw }) => {
    expect(() => normalizeR1NormalFileCreate(snapshot(), { attachment: raw })).toThrow()
  })
  it('enforces required and conditional required files using the shared runtime', () => {
    expect(() => normalizeR1NormalFileCreate(snapshot(), {})).toThrow()
    expect(() => normalizeR1NormalFileCreate(snapshot(), { attachment: [] })).toThrow()
    const s = snapshot([field('need'), field('attachment', { type: 'file', required: true, visibility: { kind: 'equals', path: 'need', value: 'yes' } })])
    expect(normalizeR1NormalFileCreate(s, { need: 'no' })).toEqual({ need: 'no' })
    expect(() => normalizeR1NormalFileCreate(s, { need: 'yes' })).toThrow()
    expect(normalizeR1NormalFileCreate(s, { need: 'yes', attachment: [attachment] }).attachment).toEqual([attachment])
    expect(() => normalizeR1NormalFileCreate(s, { need: 'no', attachment: [attachment] })).toThrow()
    expect(isR1NormalFileFieldEligible(s, 'attachment', { need: 'yes' })).toBe(true)
    expect(isR1NormalFileFieldEligible(s, 'attachment', { need: 'no' })).toBe(false)
  })
  it('rejects a scalar normalization that changes file visibility or required conditions', () => {
    const s = snapshot([field('need'), field('attachment', { type: 'file', required: true, visibility: { kind: 'equals', path: 'need', value: 'yes' } })])
    expect(() => normalizeR1NormalFileCreate(s, { need: ' yes ' })).toThrow()
  })
  it('accepts optional absent/empty arrays but does not encode a fabricated null or URL', () => {
    const s = snapshot([field('attachment', { type: 'file' })])
    expect(normalizeR1NormalFileCreate(s, {})).toEqual({})
    expect(normalizeR1NormalFileCreate(s, { attachment: [] })).toEqual({})
    expect(() => normalizeR1NormalFileCreate(s, { attachment: null })).toThrow()
  })
  it.each([false, true])('retains generic file-list shape independently of multiple=%s', multiple => {
    const s = snapshot([field('attachment', { type: 'file', multiple })])
    const second = { ...attachment, url: 'https://synthetic.invalid/second.png' }
    expect(normalizeR1NormalFileCreate(s, { attachment: [attachment, second] }).attachment).toEqual([attachment, second])
  })
  it('honors verified file capacity including zero without increasing the ten-file wire bound', () => {
    const s = snapshot([field('attachment', { type: 'file', presentation: { max: 1 } })])
    expect(normalizeR1NormalFileCreate(s, { attachment: [attachment] }).attachment).toEqual([attachment])
    const second = { ...attachment, url: 'https://synthetic.invalid/second.png' }
    expect(() => normalizeR1NormalFileCreate(s, { attachment: [attachment, second] })).toThrow()
    const zero = snapshot([field('attachment', { type: 'file', presentation: { max: 0 } })])
    expect(isR1NormalFileFieldEligible(zero, 'attachment', {})).toBe(false)
    expect(normalizeR1NormalFileCreate(zero, {})).toEqual({})
    expect(() => normalizeR1NormalFileCreate(zero, { attachment: [attachment] })).toThrow()
  })
  it('accepts exactly fifty metadata rows and ten strict files without aliasing the caller list', () => {
    const files = Array.from({ length: 10 }, (_, i) => ({ ...attachment, url: `https://synthetic.invalid/${i}.png` }))
    const s = snapshot([field('attachment', { type: 'file', presentation: { max: 20 } }), ...Array.from({ length: 49 }, (_, i) => field(`scalar${i}`))])
    const result = normalizeR1NormalFileCreate(s, { attachment: files })
    expect(result.attachment).toEqual(files)
    expect(result.attachment).not.toBe(files)
  })
  it.each([-1, NaN, 1.5])('does not guess a malformed max=%s', max => {
    const s = snapshot([field('attachment', { type: 'file', presentation: { max } })])
    expect(isR1NormalFileFieldEligible(s, 'attachment', {})).toBe(false)
    expect(() => normalizeR1NormalFileCreate(s, {})).toThrow()
  })
  it.each(['field', 'workflow', 'surface'] as const)('does not accept a submitted file denied by %s readonly/exclusion', mode => {
    const s = snapshot([field('attachment', { type: 'file', readOnly: mode === 'field', ...(mode === 'surface' ? { mobileDetailHidden: true } : {}) }), field('secondAttachment', { type: 'file' }), field('note')])
    if (mode === 'workflow') { Object.assign(s.node, { formFieldIdsReadOnly: ['attachment'] }); Object.assign(s, { fillableFieldIds: ['secondAttachment', 'note'] }) }
    expect(isR1NormalFileFieldEligible(s, 'attachment', {})).toBe(false)
    expect(() => normalizeR1NormalFileCreate(s, { attachment: [attachment] })).toThrow()
    expect(normalizeR1NormalFileCreate(s, { note: 'allowed scalar' })).toEqual({ note: 'allowed scalar' })
  })
  it.each([
    { extra: { type: 'image' } }, { extra: { valueOption: 'unresolved' } }, { extra: { unsupportedReason: 'unknown configuration' } },
    { extra: { presentationOnly: true } }, { extra: { options: [{ value: 'x', label: 'unresolved' }] } },
    { extra: { visibility: { kind: 'unknown' } } }, { extra: { visibility: { kind: 'equals', path: 'tenantId', value: 't' } } },
  ])('rejects unsupported file metadata %#', ({ extra }) => {
    const s = snapshot([field('attachment', { type: 'file', ...extra } as Partial<FormFieldRead>)])
    expect(isR1NormalFileFieldEligible(s, 'attachment', {})).toBe(false)
    expect(() => normalizeR1NormalFileCreate(s, { attachment: [attachment] })).toThrow()
  })
  it.each(['duplicateId', 'duplicateKey', 'reservedKey', 'missingPermissions', 'foreignPermission', 'tooManyFields'])('fails closed on ambiguous identities/permissions: %s', mode => {
    const s = snapshot()
    if (mode === 'duplicateId') Object.assign(s.definition, { fields: [field('attachment', { type: 'file' }), field('other', { fieldId: 'attachment' })] })
    if (mode === 'duplicateKey') Object.assign(s.definition, { fields: [field('attachment', { type: 'file' }), field('attachment', { fieldId: 'other' })] })
    if (mode === 'reservedKey') Object.assign(s.definition, { fields: [field('nodeId', { type: 'file' })] })
    if (mode === 'missingPermissions') Object.assign(s, { fillableFieldIds: undefined })
    if (mode === 'foreignPermission') Object.assign(s, { fillableFieldIds: ['foreign'] })
    if (mode === 'tooManyFields') Object.assign(s.definition, { fields: [field('attachment', { type: 'file' }), ...Array.from({ length: 50 }, (_, i) => field(`extra${i}`))] })
    expect(projectR1NormalFileFields(s, {})).toEqual([])
    expect(() => normalizeR1NormalFileCreate(s, { attachment: [attachment] })).toThrow()
  })
  it('rejects extra business or metadata keys and unresolved scalar choices', () => {
    const s = snapshot()
    for (const extra of [{ unknown: true }, { _id: 'old' }, { tenantId: 'other' }]) {
      expect(() => normalizeR1NormalFileCreate(s, { attachment: [attachment], ...extra })).toThrow()
    }
    const choice = snapshot([field('attachment', { type: 'file' }), field('choice', { type: 'select', options: [{ value: 'a', label: 'A' }] })])
    expect(() => normalizeR1NormalFileCreate(choice, { choice: 'other' })).toThrow()
  })
})
