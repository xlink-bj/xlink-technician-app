import { describe, expect, it } from 'vitest'
import type { FormDefinitionRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import { formData } from '@adapters/api/read-models/form'
import { createNormalR1FileCodec } from '@adapters/api/normal-r1-file-codec'

const definitionId = asOpaqueId<'FormDefinitionId'>('normal-file-definition')
const wire = { url: 'https://synthetic.invalid/file.png', name: 'synthetic/file.png', extname: 'png' }
const definition = (): FormDefinitionRead => ({ id: definitionId, fields: [
  { fieldId: 'file-field', valueKey: 'attachment', type: 'file', label: 'Attachment', required: false, readOnly: false },
  { fieldId: 'scalar-field', valueKey: 'amount', type: 'digit', label: 'Amount', required: false, readOnly: false },
] })

const codec = () => createNormalR1FileCodec(definition(), ['file-field', 'scalar-field'])!

describe('normal R1 file own-slot mapper codec', () => {
  it('preserves a literal signed URL and source object key in strict and historical reads', () => {
    const signed = { url: 'https://SYNTHETIC.invalid:443/opaque?key=a%2Fb&Signature=AB%2f+CD%3d', name: 'independent-object-key', extname: 'png' }
    const legacy = { ...signed, path: 'original/path' }
    expect(codec().decode([signed], { valueKey: 'attachment' })).toEqual([signed])
    expect(codec().decode([legacy], { valueKey: 'attachment' })).toEqual([legacy])
  })
  it.each([
    { ...wire, extname: 'pdf' },
    { ...wire, extname: 'png', url: 'https://user:secret@synthetic.invalid/a.png' },
    { ...wire, extname: 'png', url: 'https:///synthetic.invalid/a.png' },
    { ...wire, extname: 'png', url: 'https://synthetic.invalid/a b.png' },
    { ...wire, extname: 'png', url: 'https://synthetic.invalid/a\\b.png' },
  ])('does not decode a bound non-image or non-strict image URL %#', value => {
    expect(() => formData({ _id: 'saved', formDefId: definitionId, exts: { attachment: [value] } }, codec())).toThrow()
  })
  it('preserves the exact known-file list instead of silently dropping it', () => {
    const raw = [wire], result = formData({ _id: 'saved', formDefId: definitionId, exts: { attachment: raw } }, codec())
    expect(result.values?.attachment).toEqual([wire])
    expect(result.values?.attachment).not.toBe(raw)
    expect((result.values?.attachment as readonly unknown[])[0]).not.toBe(wire)
  })
  it('does not turn malformed EXTS file into a valid unrelated root fallback', () => {
    expect(() => formData({ _id: 'saved', formDefId: definitionId,
      attachment: 'root fallback', exts: { attachment: [{ url: wire.url, invalid: true }] } }, codec())).toThrow()
  })
  it('preserves null and empty own slots instead of falling back to top-level files', () => {
    for (const attachment of [null, []]) {
      expect(formData({ _id: 'saved', formDefId: definitionId, attachment: [wire], exts: { attachment } }, codec()).values?.attachment).toEqual(attachment)
    }
  })
  it.each([
    undefined, wire, wire.url, [wire.url], [{ url: wire.url }], [wire, 'mixed'],
    [{ ...wire, unknown: true }], [{ ...wire, path: 12 }], [{ ...wire, path: 'a', unknown: true }],
    [{ ...wire, fileName: wire.name }], [{ ...wire, url: 'http://synthetic.invalid/file.png' }],
    [wire, wire], Array.from({ length: 11 }, (_, i) => ({ ...wire, url: `https://synthetic.invalid/${i}.png` })),
  ].map(value => ({ value })))('throws on malformed known EXTS own slot %# even with valid root file', ({ value }) => {
    expect(() => formData({ _id: 'saved', formDefId: definitionId, attachment: [wire], exts: { attachment: value } }, codec())).toThrow()
  })
  it('does not newly admit unknown object values or alter ordinary scalar zero/false', () => {
    const mapped = formData({ _id: 'saved', formDefId: definitionId, count: 4,
      exts: { attachment: [wire], amount: 0, flag: false, audit: { unknown: true }, unknownFiles: [wire] } }, codec())
    expect(mapped.values).toMatchObject({ amount: 0, flag: false, count: 4 })
    expect(mapped.values).not.toHaveProperty('audit')
    expect(mapped.values).not.toHaveProperty('unknownFiles')
    expect(codec().decode({ unknown: true }, { valueKey: 'audit' })).toBeUndefined()
  })
  it('leaves global mapper behavior unchanged when this scoped codec is not supplied', () => {
    expect(formData({ _id: 'saved', formDefId: definitionId, exts: { attachment: [wire] } }).values?.attachment).toBeUndefined()
  })
  it('preserves the exact historical path key in read values and refuses to encode it', () => {
    const legacy = { ...wire, path: 'retained/source/path.png' }, c = codec()
    const mapped = formData({ _id: 'saved', formDefId: definitionId, exts: { attachment: [legacy] } }, c)
    expect(mapped.values?.attachment).toEqual([legacy])
    expect((mapped.values?.attachment as readonly unknown[])[0]).not.toBe(legacy)
    expect(() => c.encode(mapped.values!.attachment!, { valueKey: 'attachment' })).toThrow()
    expect(legacy.path).toBe('retained/source/path.png')
  })
  it('retains valid three-key and legacy four-key items together without stripping', () => {
    const legacy = { ...wire, url: 'https://synthetic.invalid/old.png', path: '' }
    expect(codec().decode([wire, legacy], { valueKey: 'attachment' })).toEqual([wire, legacy])
  })
  it('encodes only exact three-key arrays for the bound file and never arbitrary writes', () => {
    const c = codec(), source = [wire], result = c.encode(source, { valueKey: 'attachment' })
    expect(result).toEqual(source); expect(result).not.toBe(source)
    expect((result as readonly unknown[])[0]).not.toBe(wire)
    expect(() => c.encode(null, { valueKey: 'attachment' })).toThrow()
    expect(() => c.encode('unbound', { valueKey: 'other' })).toThrow()
  })
  it.each(['survey', 'appointment'] as const)('does not bind a typed %s definition', purpose => {
    expect(createNormalR1FileCodec({ ...definition(), purpose }, ['file-field'])).toBeUndefined()
  })
  it.each(['duplicateIds', 'duplicateKeys', 'oversized', 'unknownId', 'readonly', 'hidden', 'surface', 'unsupported', 'unknownVisibility', 'unknownController', 'specialTool', 'options', 'reserved'])('rejects unsupported or ambiguous factory scope: %s', mode => {
    const d = definition(), f = d.fields![0]!
    let ids = ['file-field']
    if (mode === 'duplicateIds') Object.assign(d, { fields: [f, { ...f, valueKey: 'other' }] })
    if (mode === 'duplicateKeys') Object.assign(d, { fields: [f, { ...f, fieldId: 'other' }] })
    if (mode === 'oversized') Object.assign(d, { fields: [f, ...Array.from({ length: 50 }, (_, i) => ({ ...f, fieldId: `f${i}`, valueKey: `key${i}` }))] })
    if (mode === 'unknownId') ids = ['unknown']
    if (mode === 'readonly') Object.assign(f, { readOnly: true })
    if (mode === 'hidden') Object.assign(f, { mobileDetailHidden: true })
    if (mode === 'surface') Object.assign(f, { showList: ['1'] })
    if (mode === 'unsupported') Object.assign(f, { unsupportedReason: 'unverified' })
    if (mode === 'unknownVisibility') Object.assign(f, { visibility: { kind: 'unknown' } })
    if (mode === 'unknownController') Object.assign(f, { visibility: { kind: 'equals', path: 'unknownController', value: 'yes' } })
    if (mode === 'specialTool') Object.assign(f, { presentation: { surveyTool: true } })
    if (mode === 'options') Object.assign(f, { valueOption: 'unknown' })
    if (mode === 'reserved') Object.assign(f, { valueKey: 'workflowId' })
    expect(createNormalR1FileCodec(d, ids)).toBeUndefined()
  })
  it('can read a conditional file without inventing a current visible/editable decision', () => {
    const d = definition()
    Object.assign(d.fields![0]!, { visibility: { kind: 'equals', path: 'amount', value: 0 } })
    const c = createNormalR1FileCodec(d, ['file-field', 'scalar-field'])!
    expect(c.decode([wire], { valueKey: 'attachment' })).toEqual([wire])
  })
  it('does not decode unselected file fields or image metadata', () => {
    const d = definition()
    Object.assign(d, { fields: [...d.fields!, { ...d.fields![0]!, fieldId: 'unselected', valueKey: 'otherFile' }, { ...d.fields![0]!, fieldId: 'image', valueKey: 'photo', type: 'image' }] })
    const c = createNormalR1FileCodec(d, ['file-field', 'image'])!
    expect(c.decode([wire], { valueKey: 'attachment' })).toEqual([wire])
    expect(c.decode([wire], { valueKey: 'otherFile' })).toBeUndefined()
    expect(c.decode([wire], { valueKey: 'photo' })).toBeUndefined()
  })
})
