import { describe, expect, it } from 'vitest'
import { assertSurveyReadExtsValues } from '@app/r1-node-forms-read'
import { formData, formDefinition } from '@adapters/api/read-models/form'
import { projectR1RecordReadFields } from '@features/work-orders/r1-record-read-fields'
import { asOpaqueId } from '@shared/types'
import reference from '../fixtures/survey-59-read-reference.json'

const definition = formDefinition({ data: reference.fields.map(f => f.row) }, asOpaqueId<'FormDefinitionId'>('synthetic-survey'))
const valid = [null, '', false, 0, 'saved', [], [0, false, 'saved']]
describe('captured 59-row metadata, effective Survey read slot only', () => {
  it('demonstrates the lossy root display that must be rejected before presentation', () => {
    expect(definition.fields).toHaveLength(59); expect(definition.purpose).toBe('survey')
    const original = { _id: 'synthetic-record', memo: { unexpected: 'json' } }
    const mapped = formData(original, undefined, definition.id)
    expect(mapped.values?.memo).toBeUndefined()
    expect(projectR1RecordReadFields(definition, mapped).find(f => f.valueKey === 'memo')?.text).toBe('未保存')
    expect(() => assertSurveyReadExtsValues(definition, original)).toThrow()
  })
  for (const key of ['memo', 'part']) {
    for (const exts of [undefined, {}]) {
      it.each([{}, [{ broken: true }], ['saved', {}], [null], Number.NaN, Number.POSITIVE_INFINITY].map(value => ({ value })))(
        `rejects invalid root ${key}, EXTS=${exts === undefined ? 'missing' : 'empty'} %#`, ({ value }) => {
          expect(() => assertSurveyReadExtsValues(definition, { [key]: value, ...(exts ? { exts } : {}) })).toThrow()
        })
    }
    it.each(valid.map(value => ({ value })))(`allows root ${key} representable %#`, ({ value }) => {
      const raw = { _id: 'synthetic-record', [key]: value }
      expect(() => assertSurveyReadExtsValues(definition, raw)).not.toThrow()
      expect(formData(raw, undefined, definition.id).values?.[key]).toEqual(value)
    })
    it.each(valid.map(value => ({ value })))(`EXTS overrides invalid root ${key} %#`, ({ value }) => {
      const raw = { _id: 'synthetic-record', [key]: { invalid: true }, exts: { [key]: value } }
      expect(() => assertSurveyReadExtsValues(definition, raw)).not.toThrow()
      expect(formData(raw, undefined, definition.id).values?.[key]).toEqual(value)
    })
    it('does not fall back from invalid own EXTS ' + key, () => {
      expect(() => assertSurveyReadExtsValues(definition, { [key]: 'old', exts: { [key]: { broken: true } } })).toThrow()
    })
  }
  it('allows genuinely missing values and unrelated audit/media JSON', () => {
    expect(() => assertSurveyReadExtsValues(definition, { audit: { unknown: true }, exts: { images1: [{ url: 'https://synthetic.invalid/file.png' }] } })).not.toThrow()
  })
  it.each([[], 'malformed', false])('retains malformed parent EXTS rejection %#', exts => {
    expect(() => assertSurveyReadExtsValues(definition, { memo: 'old', exts })).toThrow()
  })
  it.each(['static', 'presentation', 'unknown', 'media'] as const)('does not expand validation of %s fields', kind => {
    const memo = definition.fields!.find(f => f.valueKey === 'memo')!
    const field = { ...memo, ...(kind === 'static' ? { mobileDetailHidden: true } : {}),
      ...(kind === 'presentation' ? { presentationOnly: true } : {}),
      ...(kind === 'unknown' ? { unsupportedReason: 'not verified' } : {}),
      ...(kind === 'media' ? { type: 'file' } : {}) }
    expect(() => assertSurveyReadExtsValues({ ...definition, fields: [field] }, { memo: { unknown: true } })).not.toThrow()
  })
})
