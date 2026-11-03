import { describe, expect, it } from 'vitest'
import { normalizeFieldValue, normalizeSubmission } from '@runtimes/dynamic-form'
import {
  dynamicActionFieldsFor,
  normalizeDynamicFieldValue,
  normalizeDynamicForm,
} from '@features/work-orders/dynamic-form-action'
import type { DynamicFormRead, FormFieldRead } from '@shared/ports'

/**
 * Two independent R1-style branches. IDs are deliberately all valid in the
 * same source FormDef: only their PARENT/CHILD relationship distinguishes a
 * legitimate path from a forged cross-branch combination.
 */
const choices = [
  { value: 'roof', label: '平屋顶', children: [{ value: 'parapet', label: '女儿墙' }] },
  { value: 'bath', label: '卫生间', children: [{ value: 'drain', label: '地漏' }] },
] as const

const locationField: FormFieldRead = {
  fieldId: 'location-field-row', valueKey: 'inspectionArea',
  label: '选择检查位置', type: 'cascade', required: true, readOnly: false,
  showList: ['4'], options: choices,
}
const noteField: FormFieldRead = {
  fieldId: 'note-field-row', valueKey: 'repairNote',
  label: '屋顶备注', type: 'text', required: true, readOnly: false,
  showList: ['4'],
  visibility: { kind: 'includes', path: 'inspectionArea', value: 'parapet' },
}
const base: DynamicFormRead = {
  fields: [locationField, noteField],
  values: { inspectionArea: ['roof', 'parapet'], repairNote: '需检查女儿墙' },
}

describe('R1 dynamic FormDef dependency and cascade-path closure', () => {
  it('accepts a verified parent-to-child path and rejects a cross-branch forgery', () => {
    expect(normalizeFieldValue('cascade', ['roof', 'parapet'], choices)).toEqual({
      ok: true, value: ['roof', 'parapet'],
    })
    expect(normalizeFieldValue('cascade', ['bath', 'drain'], choices)).toEqual({
      ok: true, value: ['bath', 'drain'],
    })
    // 'roof' and 'drain' exist in FormDef, but are not in the same branch.
    expect(normalizeFieldValue('cascade', ['roof', 'drain'], choices))
      .toMatchObject({ ok: false, reason: 'invalid_value' })
    expect(normalizeFieldValue('cascade', ['bath', 'parapet'], choices))
      .toMatchObject({ ok: false, reason: 'invalid_value' })
    expect(normalizeFieldValue('cascade', ['roof', 'unknown'], choices))
      .toMatchObject({ ok: false, reason: 'invalid_value' })
  })

  it('enforces the same path topology on form save and on a field edit', () => {
    const malformed: DynamicFormRead = {
      ...base,
      values: { inspectionArea: ['roof', 'drain'], repairNote: '不能保存' },
    }
    expect(normalizeDynamicFieldValue(base, locationField, ['roof', 'drain']))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    expect(normalizeDynamicForm(malformed))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    expect(normalizeSubmission({
      fields: [{
        fieldId: locationField.fieldId, valueKey: locationField.valueKey,
        type: 'cascade', required: true, inlineOptions: choices,
      }],
      values: { inspectionArea: ['roof', 'drain'] },
      surface: 'mobile_detail',
    })).toMatchObject({ ok: false, reason: 'validation', fieldId: locationField.fieldId })
  })

  it('reacts to a controlling field change: hidden dependent values are not submitted or editable', () => {
    const changed: DynamicFormRead = {
      ...base,
      values: { inspectionArea: ['bath', 'drain'], repairNote: '旧屋顶备注不能混入新的部位' },
    }
    const before = dynamicActionFieldsFor(base).find(field => field.fieldId === noteField.fieldId)
    const after = dynamicActionFieldsFor(changed).find(field => field.fieldId === noteField.fieldId)
    expect(before?.runtime).toMatchObject({ visible: true, required: true, readOnly: false })
    expect(after?.runtime).toMatchObject({ visible: false, required: false })
    expect(normalizeDynamicFieldValue(changed, noteField, '伪造隐藏字段写入'))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    expect(normalizeDynamicForm(changed)).toEqual({
      state: 'succeeded', data: { inspectionArea: ['bath', 'drain'] },
    })
  })

  it('applies workflow instance readonly by fieldId, not valueKey; retained values remain readback-safe', () => {
    const locked: DynamicFormRead = {
      ...base, workflowReadOnlyFieldIds: ['location-field-row'],
    }
    const location = dynamicActionFieldsFor(locked).find(field => field.fieldId === locationField.fieldId)
    expect(location?.runtime).toMatchObject({ visible: true, readOnly: true, required: false })
    expect(normalizeDynamicFieldValue(locked, locationField, ['bath', 'drain']))
      .toMatchObject({ state: 'failed_terminal', error: { category: 'validation' } })
    // Readonly is an EDIT restriction, not permission to erase persisted data.
    expect(normalizeDynamicForm(locked)).toEqual({
      state: 'succeeded',
      data: { inspectionArea: ['roof', 'parapet'], repairNote: '需检查女儿墙' },
    })
  })

  it('does not reinterpret unresolved multi-value cascades as single hierarchical paths', () => {
    // A distinct R1 source contract is needed before changing multi-cascade
    // wire semantics. This slice validates only single hierarchical paths.
    expect(normalizeFieldValue('cascade', ['roof', 'drain'], choices, true)).toEqual({
      ok: true, value: ['roof', 'drain'],
    })
    expect(normalizeFieldValue('cascade', ['a', 'b'], [
      { value: 'a', label: 'A' }, { value: 'b', label: 'B' },
    ])).toEqual({ ok: true, value: ['a', 'b'] })
  })
})
