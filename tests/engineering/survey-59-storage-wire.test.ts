import { describe, expect, it } from 'vitest'
import reference from '../fixtures/survey-59-read-reference.json'
import properties from '../fixtures/survey-typed-root-properties.json'
import { formData, formDefinition } from '@adapters/api/read-models/form'
import { formDataUpsertCommand } from '@adapters/api/action-command-wires'
import { r1SpecialFormUpsert } from '@adapters/api/r1-special-workflow-wires'
import { asOpaqueId } from '@shared/types'
import { createSurveyReadOnlyMediaCodec } from '@adapters/api/survey-readonly-media-codec'
import { projectR1PresetStorage } from '@adapters/api/r1-field-storage'

const definitionId = asOpaqueId<'FormDefinitionId'>('synthetic-survey-59')
const definition = () => formDefinition({ data: reference.fields.map(field => ({ ...field.row, state: 1, extId: definitionId })) }, definitionId)

describe('59-row Survey source-backed preset storage', () => {
  it('retains the 23 explicit non-preset row contracts without deduplicating row IDs', () => {
    const fields = definition().fields!
    expect(fields).toHaveLength(59)
    expect(fields.filter(field => (field as typeof field & { preset?: boolean }).preset === false)).toHaveLength(23)
  })
  it('copies known extension values to exts while retaining the R1 top-level business values', () => {
    const fields = definition().fields!
    const nonPreset = reference.fields.find(field => field.row.preset === 0 && field.row.type === 'radio')!
    const valueKey = nonPreset.row.name
    const input = { definitionId, sourceNodeType: 'repeat' as const, state: 1 as const, workflowRunId: asOpaqueId<'WorkflowRunId'>('synthetic-run'),
      workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-work'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'), formData: { [valueKey]: 0, memo: 'known typed field' } }
    const wire = JSON.parse(String(r1SpecialFormUpsert({ ...input, fieldStorage: fields } as Parameters<typeof r1SpecialFormUpsert>[0]).body?.dataStr))
    expect(wire.exts).toMatchObject({ [valueKey]: 0 })
    expect(wire[valueKey]).toBe(0)
    expect(wire.memo).toBe('known typed field')
    expect(wire.exts.memo).toBeUndefined()
  })
})


describe('full source-known storage projection and typed readback, not write authorization', () => {
  const media = (name: string) => [{ url: `https://synthetic.invalid/${name}.png`, name: `synthetic-${name}`, extname: 'png' }]
  const input = () => ({ definitionId, sourceNodeType: 'repeat' as const, state: 1 as const,
    workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-work'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'),
    workflowRunId: asOpaqueId<'WorkflowRunId'>('synthetic-run') })
  it('routes all 23 observed extension keys and both typed root media keys through the real wire and mapper', () => {
    const d = definition(), patch: Record<string, string | number | boolean | ReturnType<typeof media>> = {}
    for (const source of reference.fields) {
      if (source.row.preset === 0) patch[source.row.name] = source.row.type === 'file' ? media(source.row.name) : false
    }
    patch.surveyDrawing = media('surveyDrawing'); patch.infraredImageList = media('infraredImageList')
    patch.memo = 'known typed root'; patch.squareMeter = 0
    const request = r1SpecialFormUpsert({ ...input(), fieldStorage: d.fields, formData: patch })
    const raw = JSON.parse(String(request.body?.dataStr))
    expect(Object.keys(raw.exts)).toHaveLength(23)
    expect(raw.exts.isMoldRemoved).toBe(false); expect(raw.exts.surveyDrawing).toBeUndefined()
    expect(raw.exts.memo).toBeUndefined(); expect(raw.squareMeter).toBe(0)
    // Narrow source-shaped DTO simulation: Java subclass declared properties
    // plus common response identity/exts. This is NOT Java/Mongo execution.
    const roots = new Set([...properties.rootProperties, 'exts', '_id', 'tenantId', 'state', 'workflowId'])
    const typed = Object.fromEntries(Object.entries({ ...raw, _id: 'saved-survey', tenantId: 'synthetic-tenant' }).filter(([key]) => roots.has(key)))
    expect(typed.images1).toBeUndefined(); expect(typed.surveyDrawing).toEqual(media('surveyDrawing'))
    const rows = reference.fields.map(f => ({ ...f.row, state: 1, extId: definitionId }))
    const codec = createSurveyReadOnlyMediaCodec(d, 'survey', rows)!
    codec.validateSlots(typed)
    const reread = formData(typed, codec, definitionId)
    expect(reread.values?.isMoldRemoved).toBe(false); expect(reread.values?.squareMeter).toBe(0)
    for (let n = 1; n <= 20; n++) expect(reread.values?.[`images${n}`]).toHaveLength(1)
    expect(reread.values?.beforeMoldRemoval).toHaveLength(1); expect(reread.values?.afterMoldRemoval).toHaveLength(1)
    expect(reread.values?.surveyDrawing).toHaveLength(1); expect(reread.values?.infraredImageList).toHaveLength(1)
  })
  it('preserves hidden/original unknown JSON in the wire and never reconstructs it from flattened values', () => {
    const original = { _id: 'old', state: 1, sid: 'synthetic-work', nodeId: 'synthetic-node', workflowId: 'synthetic-run',
      unknownTop: { keep: [1, false] }, formTitle: '原标题', exts: { hidden: ['retained'], audit: { keep: true } } }
    const before = structuredClone(original)
    const request = r1SpecialFormUpsert({ ...input(), existingFormDataId: asOpaqueId<'FormDataId'>('old'),
      authoritativeOriginal: original, fieldStorage: definition().fields, formData: { isMoldRemoved: false, memo: 'changed' } })
    const raw = JSON.parse(String(request.body?.dataStr))
    expect(raw).toMatchObject({ _id: 'old', formTitle: '原标题', unknownTop: original.unknownTop,
      exts: { hidden: ['retained'], audit: { keep: true }, isMoldRemoved: false } })
    expect(original).toEqual(before)
  })
  it('keeps duplicate row identities with one source-backed business copy, and rejects malformed storage evidence', () => {
    const fields = [{ fieldId: 'one', valueKey: 'answer', preset: false }, { fieldId: 'two', valueKey: 'answer', preset: true }]
    expect(projectR1PresetStorage({}, { answer: 0 }, fields)).toEqual({ answer: 0, exts: { answer: 0 } })
    expect(() => projectR1PresetStorage({}, { answer: 0 }, [fields[0]!, fields[0]!])).toThrow()
    expect(() => projectR1PresetStorage({ exts: [] }, { answer: 0 }, fields)).toThrow()
    expect(projectR1PresetStorage({ exts: { retained: true } }, { memo: '' }, definition().fields)).toEqual({ exts: { retained: true }, memo: '' })
  })
})


it('generic Survey create uses the same source field storage but still refuses existing IDs and direct exts injection', () => {
  const fields = definition().fields!, input = { definitionId, purpose: 'survey' as const,
    workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-work'), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'),
    fieldStorage: fields, values: { isMoldRemoved: false, memo: 'root', images1: [{ url: 'https://synthetic.invalid/one.png', objectKey: 'one', extension: 'png' }] } }
  const raw = JSON.parse(String(formDataUpsertCommand(input).body?.dataStr))
  expect(raw.exts).toEqual({ isMoldRemoved: false, images1: [{ url: 'https://synthetic.invalid/one.png', name: 'one', extname: 'png' }] })
  expect(raw.memo).toBe('root'); expect(raw.exts.memo).toBeUndefined()
  expect(() => formDataUpsertCommand({ ...input, formDataId: asOpaqueId<'FormDataId'>('existing') })).toThrow()
  expect(() => formDataUpsertCommand({ ...input, values: { ...input.values, exts: { hidden: 'untrusted' } } as never })).toThrow()
})
