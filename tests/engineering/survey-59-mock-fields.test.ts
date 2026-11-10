import { describe, expect, it } from 'vitest'
import { asOpaqueId } from '@shared/types'
import type { FormDefinitionRead, FormFieldRead } from '@shared/ports'
import { formDefinition, formData } from '@adapters/api/read-models/form'
import { projectR1LocalFields, normalizeR1LocalFieldPatch } from '@features/work-orders/r1-local-form-fields'
import { r1SpecialFormUpsert } from '@adapters/api/r1-special-workflow-wires'
import { validateR1SpecialMockFields, type R1SpecialMockFields } from '@features/work-orders/r1-special-mock-form-fields'
import reference from '../fixtures/survey-59-read-reference.json'

const row = (fieldId: string, valueKey = fieldId, extra: Partial<FormFieldRead> = {}): FormFieldRead => ({
  fieldId, valueKey, label: valueKey, type: 'text', required: false, readOnly: false, ...extra,
})
const condition = (value: string) => ({ kind: 'equals' as const, path: 'part', value })
const definition = (fields: readonly FormFieldRead[]): FormDefinitionRead => ({
  id: asOpaqueId<'FormDefinitionId'>('mock-survey-59-write-shape'), fields,
})
const conditional = () => definition([
  row('part', 'part', { type: 'radio', required: true, options: [{ value: 'wall', label: '墙' }, { value: 'floor', label: '地面' }] }),
  row('length-wall', 'length', { type: 'digit', required: true, visibility: condition('wall') }),
  row('length-floor', 'length', { type: 'digit', required: false, visibility: condition('floor') }),
  ...Array.from({ length: 56 }, (_, i) => row('inactive-' + i, undefined, { showList: ['1'] })),
])

describe('59-row Special Mock field selection, not live write authority', () => {
  it('retains all 59 row identities while resolving only the conditionally active duplicate', () => {
    const fields = projectR1LocalFields(conditional(), { part: 'floor' })
    expect(fields).toHaveLength(59)
    expect(fields.filter(f => f.valueKey === 'length').map(f => f.fieldId)).toEqual(['length-wall', 'length-floor'])
    expect(fields.filter(f => f.supported).map(f => f.fieldId)).toEqual(['part', 'length-floor'])
    expect(normalizeR1LocalFieldPatch(conditional(), { part: 'floor' }, 'length', '12.5')).toEqual({ part: 'floor', length: 12.5 })
  })
  it('validates a 59-row definition by its actual payload keys, independent of row order', () => {
    const d = conditional(), input = { part: 'floor', length: '12.5' }
    expect(validateR1SpecialMockFields(d, input)).toEqual({ ok: true, fields: { part: 'floor', length: 12.5 } })
    expect(validateR1SpecialMockFields({ ...d, fields: [...d.fields!].reverse() }, input))
      .toEqual(validateR1SpecialMockFields(d, input))
  })
  it('uses the active row required flag and does not inherit required from the hidden duplicate', () => {
    expect(validateR1SpecialMockFields(conditional(), { part: 'floor' }).ok).toBe(true)
    expect(validateR1SpecialMockFields(conditional(), { part: 'wall' }).ok).toBe(false)
    expect(validateR1SpecialMockFields(conditional(), { part: 'wall', length: 0 }).ok).toBe(true)
  })
  it.each(['overlap', 'readonly', 'unknown-condition', 'unknown-config', 'unknown-type', 'missing-provider', 'presentation'] as const)(
    'rejects duplicate selection with %s evidence', change => {
      const d = conditional(), fields = [...d.fields!]
      if (change === 'overlap') fields[1] = { ...fields[1]!, visibility: condition('floor') }
      if (change === 'readonly') fields[2] = { ...fields[2]!, readOnly: true }
      if (change === 'unknown-condition') fields[1] = { ...fields[1]!, visibility: { kind: 'unverified' } as never }
      if (change === 'unknown-config') fields[1] = { ...fields[1]!, unsupportedReason: 'unknown source rule' }
      if (change === 'unknown-type') fields[1] = { ...fields[1]!, type: 'unverified' }
      if (change === 'missing-provider') fields[1] = { ...fields[1]!, type: 'select' }
      if (change === 'presentation') fields[1] = { ...fields[1]!, presentationOnly: true }
      const changed = { ...d, fields }
      expect(normalizeR1LocalFieldPatch(changed, { part: 'floor' }, 'length', '1')).toBeNull()
      expect(validateR1SpecialMockFields(changed, { part: 'floor', length: '1' }).ok).toBe(false)
    },
  )
  it('rejects a submitted duplicate when no row is visible', () => {
    const d = conditional()
    expect(normalizeR1LocalFieldPatch(d, { part: 'unknown' }, 'length', '1')).toBeNull()
    expect(validateR1SpecialMockFields(d, { part: 'unknown', length: '1' }).ok).toBe(false)
  })
  it('preserves fieldId uniqueness and explicit definition and payload bounds', () => {
    const duplicateIds = definition([row('same', 'a'), row('same', 'b')])
    expect(projectR1LocalFields(duplicateIds)).toEqual([])
    expect(validateR1SpecialMockFields(duplicateIds, { a: '1' }).ok).toBe(false)
    const tooMany = definition(Array.from({ length: 201 }, (_, i) => row('field-' + i)))
    expect(projectR1LocalFields(tooMany)).toEqual([])
    expect(validateR1SpecialMockFields(tooMany, {}).ok).toBe(false)
    const fiftyOne = definition(Array.from({ length: 51 }, (_, i) => row('field-' + i)))
    const fifty = Object.fromEntries(fiftyOne.fields!.slice(0, 50).map(f => [f.valueKey, 'value']))
    expect(validateR1SpecialMockFields(fiftyOne, fifty).ok).toBe(true)
    expect(normalizeR1LocalFieldPatch(fiftyOne, fifty, 'field-50', 'new')).toBeNull()
    expect(validateR1SpecialMockFields(fiftyOne, { ...fifty, 'field-50': 'new' }).ok).toBe(false)
    expect(normalizeR1LocalFieldPatch(fiftyOne, fifty, 'field-0', 'changed')).not.toBeNull()
  })
  it('does not submit static hidden fields or grant unverified options', () => {
    expect(validateR1SpecialMockFields(conditional(), { part: 'floor', 'inactive-0': 'tamper' }).ok).toBe(false)
    expect(validateR1SpecialMockFields(conditional(), { part: 'not-an-option' }).ok).toBe(false)
  })
  it('keeps file wire validation and presentation-only image blocking unchanged', () => {
    const d = definition([...conditional().fields!, row('photo', 'photo', { type: 'file' }),
      row('reference', 'reference', { type: 'image', presentationOnly: true })])
    const photo = [{ url: 'https://synthetic.invalid/photo.png', name: 'synthetic-photo', extname: 'png' }]
    expect(validateR1SpecialMockFields(d, { part: 'floor', photo }).ok).toBe(true)
    expect(validateR1SpecialMockFields(d, { part: 'floor', photo: ['unuploaded'] }).ok).toBe(false)
    expect(validateR1SpecialMockFields(d, { part: 'floor', reference: photo }).ok).toBe(false)
  })

  it.each(['unknown-config', 'unknown-condition', 'missing-provider', 'unresolved-provider'] as const)(
    'does not let static surface exclusion conceal %s on a duplicate row', change => {
      const d = conditional(), fields = [...d.fields!]
      fields[1] = { ...fields[1]!, showList: ['1'] }
      if (change === 'unknown-config') fields[1] = { ...fields[1]!, unsupportedReason: 'unverified' }
      if (change === 'unknown-condition') fields[1] = { ...fields[1]!, visibility: { kind: 'unknown' } as never }
      if (change === 'missing-provider') fields[1] = { ...fields[1]!, type: 'select' }
      if (change === 'unresolved-provider') fields[1] = { ...fields[1]!, type: 'select', valueOption: 'not-resolved' }
      for (const ordered of [fields, [...fields].reverse()]) {
        expect(normalizeR1LocalFieldPatch({ ...d, fields: ordered }, { part: 'floor' }, 'length', '1')).toBeNull()
        expect(validateR1SpecialMockFields({ ...d, fields: ordered }, { part: 'floor', length: '1' }).ok).toBe(false)
      }
    },
  )
  it('rejects unresolved options on a conditionally hidden duplicate too', () => {
    const d = conditional(), fields = [...d.fields!]
    fields[1] = { ...fields[1]!, type: 'select', valueOption: 'not-resolved' }
    expect(validateR1SpecialMockFields({ ...d, fields }, { part: 'floor', length: '1' }).ok).toBe(false)
  })
  it.each(['readonly', 'required', 'type', 'file'] as const)(
    'rejects normalization that changes the selected duplicate %s contract', change => {
      const numeric = { kind: 'equals' as const, path: 'part', value: 1 }
      const text = { kind: 'equals' as const, path: 'part', value: '1' }
      const fields = [
        row('part', 'part', { type: 'number' }),
        row('x-number', 'x', { visibility: numeric,
          ...(change === 'readonly' ? { readOnly: true } : {}),
          ...(change === 'required' ? { required: true } : {}),
          ...(change === 'type' ? { type: 'number' } : {}),
          ...(change === 'file' ? { type: 'file' } : {}) }),
        row('x-string', 'x', { visibility: text }),
      ]
      for (const ordered of [fields, [...fields].reverse()]) {
        const input: R1SpecialMockFields = change === 'required' ? { part: '1' } : { part: '1', x: 'forbidden' }
        expect(validateR1SpecialMockFields(definition(ordered), input).ok).toBe(false)
      }
    },
  )
  it('rejects trimming a control field into a different condition branch', () => {
    const fields = [
      row('part'),
      row('x-space', 'x', { visibility: condition(' floor ') }),
      row('x-trimmed', 'x', { visibility: condition('floor'), readOnly: true }),
    ]
    expect(validateR1SpecialMockFields(definition(fields), { part: ' floor ', x: 'forbidden' }).ok).toBe(false)
  })
  it('accepts the 200-row boundary and removes a value at the 50-key boundary', () => {
    const d = definition(Array.from({ length: 200 }, (_, i) => row('field-' + i)))
    expect(projectR1LocalFields(d)).toHaveLength(200)
    const input = Object.fromEntries(d.fields!.slice(0, 50).map(f => [f.valueKey, 'value']))
    expect(validateR1SpecialMockFields(d, input).ok).toBe(true)
    expect(Object.keys(normalizeR1LocalFieldPatch(d, input, 'field-0', '')!)).toHaveLength(49)
  })
  it('validates only the visible duplicate file wire and never an overlapping or presentation-only sibling', () => {
    const photo = [{ url: 'https://synthetic.invalid/photo.png', name: 'synthetic-photo', extname: 'png' }]
    const d = definition([row('part'), row('file-wall', 'photo', { type: 'file', visibility: condition('wall') }),
      row('file-floor', 'photo', { type: 'file', visibility: condition('floor') })])
    expect(validateR1SpecialMockFields(d, { part: 'floor', photo }).ok).toBe(true)
    expect(validateR1SpecialMockFields(d, { part: 'floor', photo: ['unuploaded'] }).ok).toBe(false)
    for (const extra of [{ visibility: condition('floor') }, { type: 'image', presentationOnly: true }]) {
      const fields = d.fields!.map(f => f.fieldId === 'file-wall' ? { ...f, ...extra } : f)
      expect(validateR1SpecialMockFields({ ...d, fields }, { part: 'floor', photo }).ok).toBe(false)
    }
  })


  it('round-trips the validated 59-row synthetic shape through the real wire and read mapper', () => {
    const source = conditional(), d = { ...source, fields: source.fields!.map(f => ({ ...f, preset: f.valueKey !== 'length' })) }
    const checked = validateR1SpecialMockFields(d, { part: 'floor', length: '12.5' })
    if (!checked.ok) throw new Error(checked.message)
    const context = { sourceNodeType: 'repeat' as const, definitionId: d.id, state: 1 as const,
      workOrderId: asOpaqueId<'WorkOrderId'>('mock-work-order-survey-59'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-node-survey-59'),
      workflowRunId: asOpaqueId<'WorkflowRunId'>('mock-run-survey-59'), fieldStorage: d.fields }
    const request = r1SpecialFormUpsert({ ...context, formData: checked.fields })
    expect(request.path).toBe('biz/extForm/upsert/' + d.id)
    const created = JSON.parse(String(request.body?.dataStr))
    expect(created.exts).toEqual({ length: 12.5 })
    const saved = { ...created, _id: 'mock-saved-59', exts: { ...created.exts, hidden: 'preserved' } }
    expect(saved.length).toBe(12.5)
    expect(formData(saved, undefined, d.id).values?.length).toBe(12.5)
    const before = structuredClone(saved)
    const edited = validateR1SpecialMockFields(d, { part: 'floor', length: '0' })
    if (!edited.ok) throw new Error(edited.message)
    const update = r1SpecialFormUpsert({ ...context, formData: edited.fields,
      existingFormDataId: asOpaqueId<'FormDataId'>('mock-saved-59'), authoritativeOriginal: saved })
    const reread = JSON.parse(String(update.body?.dataStr))
    expect(reread.length).toBe(0)
    expect(reread.exts).toEqual({ length: 0, hidden: 'preserved' })
    expect(formData(reread, undefined, d.id).values?.length).toBe(0)
    expect(saved).toEqual(before)
  })


  it.each([false, true])('rejects a hidden rate multiselect sibling (static exclusion %s)', excluded => {
    const d = definition([row('part'), row('x-rate', 'x', { type: 'rate', multiple: true,
      visibility: condition('wall'), ...(excluded ? { showList: ['1'] } : {}) }),
      row('x-text', 'x', { visibility: condition('floor') })])
    expect(validateR1SpecialMockFields(d, { part: 'floor', x: 'content' }).ok).toBe(false)
  })
  it.each(['text', 'textarea', 'phone', 'IDNumber'])('rejects required %s that normalizes to an empty string', type => {
    expect(validateR1SpecialMockFields(definition([row('required', 'required', { type, required: true })]), { required: '  ' }).ok).toBe(false)
  })
  it('honors an explicit mobile detail exclusion without permitting a hidden payload', () => {
    const d = definition([row('hidden', 'hidden', { mobileDetailHidden: true })])
    expect(projectR1LocalFields(d)[0]?.supported).toBe(false)
    expect(validateR1SpecialMockFields(d, { hidden: 'tamper' }).ok).toBe(false)
  })

  it('maps the captured 59-row structure and resolves source-known length/width branches without fabricating provider data', () => {
    const id = asOpaqueId<'FormDefinitionId'>('mock-survey-59-captured-shape')
    const d = formDefinition({ data: reference.fields.map(f => ({ ...f.row, state: 1, extId: id })) }, id)
    for (const part of [['1', '130'], ['3', '310']]) {
      const fields = projectR1LocalFields(d, { part })
      expect(fields).toHaveLength(59)
      expect(fields.filter(f => f.valueKey === 'length')).toHaveLength(2)
      expect(fields.filter(f => f.valueKey === 'width')).toHaveLength(2)
      expect(fields.filter(f => ['length', 'width'].includes(f.valueKey) && f.supported)).toHaveLength(2)
      expect(normalizeR1LocalFieldPatch(d, { part }, 'length', '2.5')).toEqual({ part, length: 2.5 })
      expect(fields.find(f => f.valueKey === 'part')?.supported).toBe(false)
      expect(validateR1SpecialMockFields(d, { part, length: 2.5 }).ok).toBe(false)
    }
  })
})
