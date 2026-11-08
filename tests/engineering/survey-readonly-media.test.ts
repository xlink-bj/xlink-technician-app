import { describe, expect, it } from 'vitest'
import { createSurveyReadOnlyMediaCodec } from '@adapters/api/survey-readonly-media-codec'
import { formData, formDefinition } from '@adapters/api/read-models/form'
import { surveyMediaValueCodec } from '@adapters/api/survey-form-codec'
import { projectR1RecordReadFields } from '@features/work-orders/r1-record-read-fields'
import { normalizeR1RepeatValues, projectR1RepeatFields } from '@features/work-orders/r1-repeat-form'
import { normalizeR1FormsEditValues, projectR1FormsEditValues } from '@features/work-orders/r1-forms-edit-values'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { asOpaqueId } from '@shared/types'
import type { FormDefinitionRead, FormFieldRead } from '@shared/ports'

const id = asOpaqueId<'FormDefinitionId'>('survey-definition')
const rawRows = (def: FormDefinitionRead) => (def.fields ?? []).map(field => ({ _id: field.fieldId, name: field.valueKey,
  type: field.type, state: 1, extId: def.id, colName: 'Survey', preset: ['surveyDrawing','infraredImageList'].includes(field.valueKey) ? 1 : 0 }))
const codecFor = (def: FormDefinitionRead, collection: unknown = 'Survey') => createSurveyReadOnlyMediaCodec(def, collection, rawRows(def))
const wire = { url: 'https://media.example.test/photo.jpg?token=TRANSIENT_SECRET', name: 'private-object-key', extname: 'jpg' }
function definition(overrides: Record<string, unknown> = {}): FormDefinitionRead {
  return formDefinition({ data: [{ _id: 'media-field', extId: id, colName: 'Survey', state: 1,
    name: 'images1', nameDisp: '现场附件', type: 'file', multiple: false, showList: ['4'], ...overrides }] }, id)
}
function read(value: unknown, def = definition()) {
  const codec = codecFor(def, 'Survey'), raw = { _id: 'record', extId: id, exts: { images1: value } }
  codec?.validateSlots(raw)
  return formData(raw, codec, id)
}
const project = (value: unknown, def = definition()) => projectR1RecordReadFields(def, read(value, def))

describe('strict Survey-only readonly codec', () => {
  it('binds Survey definition and typed file; multiple=false still yields List<Map>', () => {
    const def = definition(), record = read([wire, { url: 'https://media.example.test/second' }], def)
    expect(record.values?.images1).toEqual([{ url: wire.url, objectKey: wire.name, extension: 'jpg' }, { url: 'https://media.example.test/second' }])
    const field = projectR1RecordReadFields(def, record)[0]!
    expect(field.unavailable).toBe(false)
    expect(field.text).toBe('已保存 2 个附件（暂不支持打开）：附件 1（JPG） / 附件 2')
    expect(JSON.stringify(field)).not.toMatch(/https|TRANSIENT_SECRET|private-object-key/)
  })
  it('distinguishes verified empty list from absent, null or malformed data', () => {
    expect(project([])[0]?.text).toBe('无附件')
    const absent = formData({ _id: 'record' }, codecFor(definition(), 'Survey'), id)
    expect(projectR1RecordReadFields(definition(), absent)[0]).toMatchObject({ unavailable: true, text: '附件内容暂不支持在此查看' })
    expect(() => read(null)).toThrow(/unverified/)
  })
  it.each(['appointment', 'generic', undefined])('does not infer Survey from a known field name in %s', colName => {
    const def = definition({ colName })
    expect(codecFor(def, 'Survey')).toBeUndefined()
    expect(project([wire], def)[0]?.unavailable).toBe(true)
  })
  it.each(['generic', 'appointment', undefined, ' Survey '])('rejects conflicting or missing independent Ext collection %s', collection => {
    expect(() => createSurveyReadOnlyMediaCodec(definition(), collection, rawRows(definition()))).toThrow(/unverified/)
  })
  it.each(['data', 'image', 'unknown', 'text'])('does not unlock %s by Survey key', type => {
    const def = definition({ type })
    expect(read([wire], def).values?.images1).toBeUndefined()
    expect(project([wire], def).some(field => field.text.includes('个附件'))).toBe(false)
  })
  it('does not decode unproven fields or non-Survey object arrays', () => {
    const def = definition({ name: 'otherAttachment' })
    const record = formData({ _id: 'record', otherAttachment: [wire], nestedData: [{ url: wire.url }] }, codecFor(def, 'survey'), id)
    expect(record.values?.otherAttachment).toBeUndefined(); expect(record.values?.nestedData).toBeUndefined()
    expect(projectR1RecordReadFields(def, record)[0]?.unavailable).toBe(true)
  })
  it('rejects duplicate value keys rather than choosing one schema', () => {
    const def = definition()
    expect(codecFor({ ...def, fields: [...def.fields!, { ...def.fields![0]!, fieldId: 'other' }] }, 'Survey')).toBeUndefined()
  })
  it('never encodes and leaves existing command codec behavior untouched', () => {
    expect(() => codecFor(definition(), 'Survey')!.encode([], { valueKey: 'images1' })).toThrow()
    expect(surveyMediaValueCodec.encode([{ url: wire.url, objectKey: wire.name, extension: 'jpg' }], { valueKey: 'images1' })).toEqual([wire])
  })
  it.each([
    null, '', wire, [wire.url], [1], [null], [[wire]], [{ name: 'missing-url' }],
    [{ ...wire, key: 'unverified-alias' }], [{ ...wire, fileName: 'unverified-name' }],
    [{ ...wire, localPath: '/private/file' }], [{ ...wire, token: 'DO_NOT_DISPLAY' }],
    [{ ...wire, name: 3 }], [{ ...wire, name: '' }], [{ ...wire, name: 'a\nb' }],
    [{ ...wire, extname: '<img>' }], [{ ...wire, extname: 'a'.repeat(13) }], [{ ...wire, extname: 'jpg\n' }],
    [{ url: wire.url, objectKey: 'already-normalized' }], [wire, { url: '' }],
  ])('rejects malformed/unproven shape without scalar fallback: %j', value => expect(() => read(value)).toThrow())
  it.each(['javascript:alert(1)', 'data:image/png;base64,AA', 'file:///private/file', 'blob:https://x/a',
    'http://media.example.test/a', '//media.example.test/a', '/a', 'https://user:pass@media.example.test/a',
    'https://', 'https://bad..host/a', 'https://host:99999/a', 'https://host:0/a', 'https://bad host/a', 'https://media.example.test\\evil/a', 'https://media.example.test/a\nb',
    'https://media.example.test/%0a', ' https://media.example.test/a', 'https://media.example.test/a '])(
    'rejects unsafe URL %s', url => expect(() => read([{ ...wire, url }])).toThrow())
  it('bounds resource use without claiming business/photo limits', () => {
    expect(read(Array.from({ length: 20 }, () => wire)).values?.images1).toHaveLength(20)
    expect(() => read(Array.from({ length: 101 }, () => wire))).toThrow()
  })
  it('preserves record identity checks', () => {
    expect(() => formData({ _id: 'record', id: 'different', exts: { images1: [wire] } }, codecFor(definition(), 'Survey'), id)).toThrow()
    expect(() => formData({ _id: 'record', extId: 'foreign', exts: { images1: [wire] } }, codecFor(definition(), 'Survey'), id)).toThrow()
  })
})

describe('readonly attachment projection remains fail closed', () => {
  it.each([
    { showList: ['2'] }, { frontEndConfig: '{"mpDetailHide":true}' },
    { showType: '3', showField: 'choice', showValue: 'visible' },
  ])('omits hidden/inapplicable media %j', metadata => expect(project([wire], definition(metadata))).toEqual([]))
  it.each([
    { showType: '4', showField: 'role', showValue: 'role' },
    { state: -1 }, { frontEndConfig: '{bad' }, { showList: '4' }, { valueOption: 'unverified-provider' },
  ])('never displays media under unsupported rules/provider %j', metadata => {
    expect(project([wire], definition(metadata)).some(field => !field.unavailable)).toBe(false)
    expect(JSON.stringify(project([wire], definition(metadata)))).not.toContain('TRANSIENT_SECRET')
  })
  it('shows conditionally visible media only when complete scalar context matches', () => {
    const def = definition({ showType: '3', showField: 'choice', showValue: 'visible' })
    const codec = codecFor(def, 'Survey')!, raw = { _id: 'record', exts: { images1: [wire] }, choice: 'visible' }
    codec.validateSlots(raw)
    const record = formData(raw, codec, id)
    expect(projectR1RecordReadFields(def, record)[0]?.unavailable).toBe(false)
  })
  it('revalidates normalized media and treats unknown shape as unsupported, not missing/empty', () => {
    for (const invalid of [[{ url: 'javascript:alert(1)' }], [{ url: wire.url, fileName: 'secret' }], ['legacy-url']]) {
      const record = { id: asOpaqueId<'FormDataId'>('record'), definitionId: id, values: { images1: invalid as never } }
      expect(projectR1RecordReadFields(definition(), record)[0]).toMatchObject({ unavailable: true, text: '附件内容暂不支持在此查看' })
    }
  })
  it('surveyDrawing can display saved metadata without exposing special capture/edit actions', () => {
    const def = definition({ name: 'surveyDrawing', frontEndConfig: '{"surveyTool":true}' })
    const record = formData({ _id: 'record', surveyDrawing: [wire] }, codecFor(def, 'Survey'), id)
    expect(projectR1RecordReadFields(def, record)[0]?.text).toContain('暂不支持打开')
    expect(Object.keys(projectR1RecordReadFields(def, record)[0]!)).toEqual(['fieldId', 'valueKey', 'label', 'unavailable', 'text'])
  })
  it('fails the display closed on mismatched definition and never trusts duplicate media field names', () => {
    const def = definition(), record = read([wire])
    expect(projectR1RecordReadFields({ ...def, id: asOpaqueId<'FormDefinitionId'>('foreign') }, record)).toEqual([])
    const fields = [...def.fields!, { ...def.fields![0]!, fieldId: 'other' }] as FormFieldRead[]
    expect(projectR1RecordReadFields({ ...def, fields }, record).every(field => field.unavailable)).toBe(true)
  })
})


it('does not turn decoded media into repeat/form edit permission through real validators', () => {
  const def = definition(), record = read([wire])
  const snapshot: R1NodeFormsSnapshot = { workOrderId: 'work', definition: def, records: [record],
    node: { id: asOpaqueId<'WorkflowNodeRuntimeId'>('node'), sourceNodeType: 'repeat', category: 'repeat',
      lifecycle: 'active', formDefinitionId: id, formFieldIdsReadOnly: [] } }
  expect(projectR1RepeatFields(snapshot, record.values ?? {}).every(field => !field.supported)).toBe(true)
  expect(() => normalizeR1RepeatValues(snapshot, record.values ?? {})).toThrow()
  expect(() => projectR1FormsEditValues(snapshot, { images1: [wire] })).toThrow()
  expect(() => normalizeR1FormsEditValues(snapshot, { images1: [wire] }, record.values ?? {})).toThrow()
})


it('does not reject pre-existing duplicate scalar keys or change their projection', () => {
  const def = definition(), scalar = { ...def.fields![0]!, valueKey: 'note', type: 'text' }
  const fields = [...def.fields!, { ...scalar, fieldId: 'note-1' }, { ...scalar, fieldId: 'note-2' }]
  const combined = { ...def, fields }, codec = codecFor(combined, 'Survey')
  const raw = { _id: 'record', exts: { images1: [wire] }, note: 'existing scalar' }
  codec!.validateSlots(raw)
  const record = formData(raw, codec, id)
  const projected = projectR1RecordReadFields(combined, record)
  expect(projected.map(field => field.text)).toEqual(['已保存 1 个附件（暂不支持打开）：附件 1（JPG）', 'existing scalar', 'existing scalar'])
  expect(codecFor({ ...def, fields: fields.slice(1) }, 'other')).toBeUndefined()
})


describe('Survey media storage and transient readonly provenance', () => {
  it.each(['images1', 'images20', 'beforeMoldRemoval', 'afterMoldRemoval', 'surveyDrawing', 'infraredImageList'])(
    'binds %s to its verified preset storage slot', key => {
      const def = definition({ name: key }), codec = codecFor(def)!, root = ['surveyDrawing', 'infraredImageList'].includes(key)
      for (const value of [[], [wire]]) {
        const good = root ? { [key]: value } : { exts: { [key]: value } }
        const wrong = root ? { exts: { [key]: value } } : { [key]: value }
        expect(() => codec.validateSlots(good)).not.toThrow()
        expect(() => codec.validateSlots(wrong)).toThrow()
        expect(() => codec.validateSlots({ [key]: value, exts: { [key]: value } })).toThrow()
        expect(() => codec.validateSlots({ [key]: value, exts: { [key]: null } })).toThrow()
      }
    })
  it.each([undefined, null, 1, true, 'unknown'])('rejects missing/contradictory preset %s including an empty saved list', preset => {
    const def = definition(), rows = rawRows(def).map(row => ({ ...row, preset }))
    expect(() => createSurveyReadOnlyMediaCodec(def, 'Survey', rows)).toThrow()
  })
  it('rejects raw field identity/collection/storage mismatches before decode', () => {
    const def = definition()
    for (const change of [{ extId: 'other' }, { state: -1 }, { colName: 'other' }, { name: 'other' }, { type: 'data' }]) {
      expect(() => createSurveyReadOnlyMediaCodec(def, 'Survey', rawRows(def).map(row => ({ ...row, ...change })))).toThrow()
    }
  })
  it('does not treat unmarked generic [], hand-built media or command codec arrays as verified saved attachments', () => {
    const def = definition()
    for (const value of [[], [{ url: wire.url }], surveyMediaValueCodec.decode([wire], { valueKey: 'images1' })]) {
      const record = { id: asOpaqueId<'FormDataId'>('record'), definitionId: id, values: { images1: value as never } }
      expect(projectR1RecordReadFields(def, record)[0]).toMatchObject({ unavailable: true, text: '附件内容暂不支持在此查看' })
    }
    const generic = formData({ _id: 'record', exts: { images1: [] } }, undefined, id)
    expect(projectR1RecordReadFields(def, generic)[0]?.unavailable).toBe(true)
  })
  it('preserves provenance only for the exact decoded media through the scoped readonly clone', () => {
    const def = definition(), codec = codecFor(def)!, values = formData({ _id: 'record', exts: { images1: [] } }, codec, id).values!
    const copied = codec.cloneValues(values)
    expect(copied).not.toBe(values); expect(copied.images1).not.toBe(values.images1)
    const record = { id: asOpaqueId<'FormDataId'>('record'), definitionId: id, values: copied }
    expect(projectR1RecordReadFields(def, record)[0]?.text).toBe('无附件')
    expect(projectR1RecordReadFields(def, { ...record, values: structuredClone(copied) })[0]?.unavailable).toBe(true)
    expect(projectR1RecordReadFields(def, { ...record, values: codec.cloneValues({ images1: [] }) })[0]?.unavailable).toBe(true)
    expect(projectR1RecordReadFields(def, { ...record, values: codecFor(def)!.cloneValues(values) })[0]?.unavailable).toBe(true)
  })
})
