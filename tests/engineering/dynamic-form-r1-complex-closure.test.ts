import { describe, expect, it } from 'vitest'
import { actionDraftIdentityFor } from '@runtimes/action'
import { normalizeSubmission } from '@runtimes/dynamic-form'
import { normalizeDynamicFieldValue, normalizeDynamicForm } from '@features/work-orders/dynamic-form-action'
import { dynamicDraftRecordFor } from '@features/work-orders/action-workspace-draft-utils'
import { surveyMediaCapacityError, surveyMediaDescriptorFor } from '@features/work-orders/survey-media'
import { surveyMediaValueCodec } from '@adapters/api/survey-form-codec'
import { asOpaqueId } from '@shared/types'
import type { DynamicFormRead, FormFieldRead } from '@shared/ports'

const identity = actionDraftIdentityFor({
  userId: asOpaqueId<'UserId'>('capability-user'),
  workOrderId: asOpaqueId<'WorkOrderId'>('capability-order'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('capability-node'),
  actionIntent: 'interact_with_form',
  contentKind: 'dynamic_form',
})
const record = (values: Record<string, unknown>) => ({
  version: 1, identity, status: 'unfinished',
  updatedAt: '2026-11-03T00:00:00.000Z', values,
})

const part: FormFieldRead = {
  fieldId: 'part-row', valueKey: 'part', label: '部位',
  type: 'select', required: true, readOnly: false, showList: ['4'],
  options: [{ value: 'roof', label: '平屋顶' }, { value: 'bath', label: '卫生间' }],
}
const details: FormFieldRead = {
  fieldId: 'detail-row', valueKey: 'details', label: '屋顶描述', type: 'text',
  required: true, readOnly: false, showList: ['4'],
  visibility: { kind: 'equals', path: 'part', value: 'roof' },
}

describe('source-backed dynamic FormDef draft, dependency and duplicate-value closure', () => {
  it('uses pre-edit visibility, preventing a field from making itself editable', () => {
    const self: FormFieldRead = {
      fieldId: 'self-row', valueKey: 'unlock', label: '自我激活',
      type: 'text', required: false, readOnly: false,
      visibility: { kind: 'equals', path: 'unlock', value: 'yes' },
    }
    const form: DynamicFormRead = { fields: [self], values: { unlock: 'no' } }
    expect(normalizeDynamicFieldValue(form, self, 'yes'))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    expect(normalizeDynamicFieldValue({ ...form, values: { unlock: 'yes' } }, self, 'yes'))
      .toMatchObject({ state: 'succeeded', data: 'yes' })
  })

  it('restores a dependent draft using the full candidate value set, regardless of key order', () => {
    const form: DynamicFormRead = {
      fields: [details, part],
      values: { part: 'roof', details: '原始屋面记录' },
    }
    const recovered = dynamicDraftRecordFor(record({
      details: '切换部位前的旧内容', part: 'bath',
    }), identity, form)
    // A hidden field is not restored into the writable draft and cannot
    // overwrite a different branch during the next FormData upsert.
    expect(recovered?.values).toEqual({ part: 'bath' })
    expect(normalizeDynamicForm({ ...form, values: { ...form.values, ...recovered?.values } }))
      .toMatchObject({ state: 'succeeded', data: { part: 'bath' } })
    const visible = dynamicDraftRecordFor(record({
      details: '屋顶重新确认', part: 'roof',
    }), identity, form)
    expect(visible?.values).toEqual({ details: '屋顶重新确认', part: 'roof' })
  })

  it('does not replay forged read-only values from local drafts, including Workflow field identities', () => {
    const form: DynamicFormRead = {
      fields: [part],
      values: { part: 'roof' },
      workflowReadOnlyFieldIds: ['part-row'],
    }
    expect(dynamicDraftRecordFor(record({ part: 'bath' }), identity, form)).toBeNull()
    expect(dynamicDraftRecordFor(record({ part: 'roof' }), identity, form)?.values).toEqual({})
  })

  it('compares server/read-only media arrays by value, not detached JSON object references', () => {
    const photo: FormFieldRead = {
      fieldId: 'photo-row', valueKey: 'images1', label: '现场图片',
      type: 'file', required: false, readOnly: true, showList: ['4'],
    }
    const persisted = [{ url: 'https://synthetic.invalid/photo.jpg', objectKey: 'safe/photo', extension: 'jpg' }]
    const form: DynamicFormRead = { purpose: 'survey', fields: [photo], values: { images1: persisted } }
    const equalSerialized = JSON.parse(JSON.stringify(persisted))
    expect(dynamicDraftRecordFor(record({ images1: equalSerialized }), identity, form)?.values).toEqual({})
    expect(dynamicDraftRecordFor(record({ images1: [
      { ...persisted[0], url: 'https://synthetic.invalid/forged.jpg' },
    ] }), identity, form)).toBeNull()
  })

  it('permits repeat visible rows only when they agree on the SAME normalized value', () => {
    const duplicates = [
      { fieldId: 'length-a', valueKey: 'length', type: 'digit' },
      { fieldId: 'length-b', valueKey: 'length', type: 'digit' },
    ]
    expect(normalizeSubmission({ fields: duplicates, values: { length: '2.5' } }))
      .toEqual({ ok: true, value: { values: { length: 2.5 } } })
    expect(normalizeSubmission({ fields: [
      { fieldId: 'length-a', valueKey: 'length', type: 'text' },
      { fieldId: 'length-b', valueKey: 'length', type: 'digit' },
    ], values: { length: '2.5' } })).toMatchObject({
      ok: false, reason: 'validation', fieldId: 'length-b', valueKey: 'length',
    })
  })

  it('blocks changing a hidden dependent field without changing a controlling field', () => {
    const form: DynamicFormRead = { fields: [part, details], values: { part: 'bath', details: '旧值' } }
    expect(normalizeDynamicFieldValue(form, details, '非法修改'))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    expect(normalizeDynamicForm(form)).toEqual({ state: 'succeeded', data: { part: 'bath' } })
  })
})

describe('R1 Survey media persisted shape, selection limits and readback', () => {
  const infrared = surveyMediaDescriptorFor('survey', { valueKey: 'infraredImageList', type: 'file' })
  const drawing = surveyMediaDescriptorFor('survey', { valueKey: 'surveyDrawing', type: 'file' })
  const ordinary = surveyMediaDescriptorFor('survey', { valueKey: 'images1', type: 'file' })

  it('uses the verified aggregate media max count rather than per-picker count', () => {
    expect(infrared).toMatchObject({ selectionMode: 'album_only', maxCount: 4, persistedShape: 'media_object_list' })
    const existing = Array.from({ length: 3 }, (_, i) => ({ url: `https://synthetic.invalid/p${i}.jpg` }))
    expect(surveyMediaCapacityError(infrared, existing, 1)).toBeUndefined()
    expect(surveyMediaCapacityError(infrared, existing, 2)).toMatch(/最多选择 4 项/)
    expect(surveyMediaCapacityError(infrared, existing, 0)).toBeUndefined()
    expect(surveyMediaCapacityError(drawing, [{ url: 'https://synthetic.invalid/drawing.jpg' }], 1))
      .toMatch(/最多选择 1 项/)
    // R1 ordinary image maxCount is UNKNOWN; never invent one.
    expect(surveyMediaCapacityError(ordinary, existing, 20)).toBeUndefined()
  })

  it('roundtrips legacy object-list media through a domain Adapter codec', () => {
    const wire = [{ url: 'https://synthetic.invalid/roof.jpg', name: 'blob/roof.jpg', extname: 'jpg', fileName: 'roof.jpg' }]
    const context = { valueKey: 'images1' }
    const decoded = surveyMediaValueCodec.decode(wire, context)
    expect(decoded).toEqual([{
      url: 'https://synthetic.invalid/roof.jpg',
      objectKey: 'blob/roof.jpg', extension: 'jpg', fileName: 'roof.jpg',
    }])
    expect(surveyMediaValueCodec.encode(decoded!, context)).toEqual(wire)
    const form: DynamicFormRead = {
      purpose: 'survey',
      fields: [{ fieldId: 'media-row', valueKey: 'images1', label: '照片', type: 'file',
        readOnly: false, required: true, multiple: false, showList: ['4'] }],
      values: { images1: decoded! },
    }
    expect(normalizeDynamicForm(form)).toEqual({ state: 'succeeded', data: { images1: decoded } })
  })

  it('rejects malformed R1 media records and unsupported wire shape', () => {
    expect(() => surveyMediaValueCodec.decode([{ name: 'missing URL' }], { valueKey: 'images1' }))
      .toThrow(/usable url/)
    expect(() => surveyMediaValueCodec.decode('https://synthetic.invalid/photo.jpg', { valueKey: 'images1' }))
      .toThrow(/list is malformed/)
    expect(() => surveyMediaValueCodec.encode([{ url: 'https://synthetic.invalid/photo.jpg', unknown: 'x' }] as never,
      { valueKey: 'images1' })).toThrow(/media list is malformed/)
  })
})
