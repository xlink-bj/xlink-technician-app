import { describe, expect, it } from 'vitest'
import reference from '../fixtures/survey-59-read-reference.json'
import { survey59Fields, survey59Paths, survey59Record, completeConditions, expectedSurvey59VisibleIds } from '../fixtures/survey-59-synthetic'
import { formData, formDefinition } from '@adapters/api/read-models/form'
import { createSurveyReadOnlyMediaCodec } from '@adapters/api/survey-readonly-media-codec'
import { projectR1RecordReadFields } from '@features/work-orders/r1-record-read-fields'
import { evaluateVisibility } from '@runtimes/dynamic-form'
import { asOpaqueId } from '@shared/types'
const id = asOpaqueId<'FormDefinitionId'>('e')
const definition = () => formDefinition({ data: survey59Fields }, id)

describe('59 row condition x typed read-only media matrix', () => {
  it('retains 13 captured paths, 28 complete conditions, 59 row identities and 40 mobile rows', () => {
    expect(survey59Paths).toHaveLength(13); expect(completeConditions).toHaveLength(28)
    const fields = definition().fields!
    expect(fields).toHaveLength(59); expect(new Set(fields.map(f => f.valueKey)).size).toBe(56)
    expect(fields.filter(f => f.showList?.map(String).includes('4'))).toHaveLength(40)
    expect(fields.filter(f => f.type === 'file' && f.showList?.map(String).includes('4'))).toHaveLength(22)
  })
  for (const part of [...survey59Paths, ['unverified'], ['1'], ['1', '130', 'unverified-child'], ['310', '3']]) {
    it(`checks all 28 source conditions and actual media projection for ${JSON.stringify(part)}`, () => {
      const d = definition()
      for (const source of completeConditions) {
        const raw = source.row as Record<string, unknown>, options = (raw.exts as Record<string, unknown>).showValue as unknown[]
        const visible = options.some(value => JSON.stringify(value) === JSON.stringify(part))
        const field = d.fields!.find(f => f.fieldId === source.row._id)!
        expect(evaluateVisibility(field.visibility, { part }).state, source.row._id).toBe(visible ? 'visible' : 'hidden')
      }
      const raw = survey59Record(part), codec = createSurveyReadOnlyMediaCodec(d, 'survey', survey59Fields)!
      codec.validateSlots(raw)
      const values = formData(raw, codec, id)
      const projected = projectR1RecordReadFields(d, values)
      expect(projected.map(f => f.fieldId)).toEqual(expectedSurvey59VisibleIds(part))
      expect(projected.some(f => f.valueKey === 'perimeter')).toBe(false)
      expect(projected.some(f => ['beforeMoldRemoval', 'afterMoldRemoval'].includes(f.valueKey))).toBe(false)
      for (const field of projected.filter(f => /^images\d+$/.test(f.valueKey) || ['surveyDrawing', 'infraredImageList'].includes(f.valueKey))) {
        expect(field.unavailable).toBe(false); expect(field.text).toContain('PNG'); expect(field.text).not.toContain('https:')
      }
      expect(projected.find(f => f.valueKey === 'height')).toMatchObject({ unavailable: true })
      expect(projected.find(f => f.valueKey === 'height')?.text).not.toContain('12.5')
    })
  }
  it('does not convert partial source conditions into editable or visible values', () => {
    expect(reference.fields.filter(f => f.evidence.conditionStatus === 'PARTIAL_REDACTED_CONDITION').map(f => f.row.name)).toEqual(['gap0', 'height', 'gap1'])
  })
})
