import { describe, expect, it } from 'vitest'
import { asOpaqueId } from '@shared/types'
import type { DynamicFormRead, FormFieldValue } from '@shared/ports'
import { r1SurveyPlaneAreaAfterChange } from '@features/work-orders/survey-plane-area'
import { normalizeDynamicFieldValue, normalizeDynamicForm } from '@features/work-orders/dynamic-form-action'
import { updateR1FormDraftValue } from '@features/work-orders/r1-repeat-form'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'

const form = (values: Readonly<Record<string, FormFieldValue>> = {}): DynamicFormRead => ({
  definitionId: asOpaqueId<'FormDefinitionId'>('7971040108398070730'), purpose: 'survey',
  fields: ['length', 'width', 'planeArea'].map(valueKey => ({ fieldId: valueKey, valueKey, label: valueKey,
    type: 'digit', required: true, readOnly: false })), values: { part: ['3', '310'], ...values },
})

describe('pinned R1 planeArea rule; not calculateConfig execution', () => {
  const snapshot = (): R1NodeFormsSnapshot => {
    const f = form()
    return { workOrderId: 'synthetic', node: { id: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'), category: 'forms', lifecycle: 'active' },
      definition: { id: f.definitionId!, purpose: f.purpose, fields: f.fields }, records: [] }
  }
  it('projects one normal-panel draft transition without dropping other local values', () => {
    const values = { part: ['3', '310'], length: '2', width: '3', memo: 'retained' }
    expect(updateR1FormDraftValue(snapshot(), values, 'length', '2.345')).toEqual({ ...values, length: '2.345', planeArea: 7.04 })
    expect(values.length).toBe('2')
  })
  it('keeps pre-window input types in both draft paths and waits for the next measurement to calculate', () => {
    const s = snapshot(), f = form({ part: ['1', '130'], width: 3 })
    expect(normalizeDynamicFieldValue(f, f.fields[1]!, '0').data).toBe('0')
    expect(normalizeDynamicFieldValue(f, f.fields[1]!, '').data).toBe('')
    expect(normalizeDynamicFieldValue({ ...f, definitionId: asOpaqueId<'FormDefinitionId'>('other') }, f.fields[1]!, '0').data).toBe(0)
    let values = updateR1FormDraftValue(s, { part: ['1', '130'], length: 2, width: 3, planeArea: 6 }, 'width', '0')
    expect(values).toMatchObject({ width: '0', planeArea: 6 })
    values = updateR1FormDraftValue(s, values, 'part', ['3', '310'])
    expect(values.planeArea).toBe(6)
    values = updateR1FormDraftValue(s, values, 'length', '')
    expect(values).toMatchObject({ length: '', width: '0', planeArea: '' })
  })
  it.each(['source-readonly', 'target-readonly', 'target-hidden', 'duplicate-target', 'bad-peer'])(
    'keeps normal-panel draft transitions fail-closed: %s', boundary => {
      const s = snapshot(), values = { part: ['3', '310'], length: '2', width: boundary === 'bad-peer' ? 'invalid' : '3' }
      if (boundary === 'source-readonly') Object.assign(s.definition.fields![0]!, { readOnly: true })
      if (boundary === 'target-readonly') Object.assign(s.node, { formFieldIdsReadOnly: ['planeArea'] })
      if (boundary === 'target-hidden') Object.assign(s.definition.fields![2]!, { showList: ['5'] })
      if (boundary === 'duplicate-target') Object.assign(s.definition, { fields: [...s.definition.fields!, { ...s.definition.fields![2]!, fieldId: 'other-area' }] })
      expect(() => updateR1FormDraftValue(s, values, 'length', '2.345')).toThrow()
      expect(values.length).toBe('2')
    })
  for (const [length, width, expected] of [
    [2.345, 3, 7.04], ['2.345', '3', 7.04], [1.005, 1, 1], [-2.345, 3, -7.04],
    [0, '', 0], ['', 0, 0], ['0', '', ''], ['', '0', ''], ['0', '3', 0],
    [2, '', ''], ['', 2, ''], ['', '', ''],
  ] as const) {
    it(`keeps the R1 branch and rounding for ${JSON.stringify(length)} x ${JSON.stringify(width)}`, () => {
      const f = form({ length, width, planeArea: 123 })
      const before = structuredClone(f)
      expect(r1SurveyPlaneAreaAfterChange(f, 'length', f.values)).toEqual({ value: expected })
      expect(r1SurveyPlaneAreaAfterChange(f, 'width', f.values)).toEqual({ value: expected })
      expect(f).toEqual(before)
    })
  }
  for (const override of [
    { definitionId: asOpaqueId<'FormDefinitionId'>('other') }, { definitionId: undefined },
    { purpose: 'appointment' as const }, { purpose: undefined },
    { values: { part: ['1', '130'], length: 2, width: 3 } },
    { values: { part: [], length: 2, width: 3 } },
  ]) it(`does not apply outside the exact identity/purpose/part: ${JSON.stringify(override)}`, () => {
    const f = { ...form({ length: 2, width: 3 }), ...override }
    expect(r1SurveyPlaneAreaAfterChange(f, 'length', f.values)).toBeUndefined()
  })
  it('does not calculate on part/memo/planeArea changes or merely reading a record', () => {
    const f = form({ length: 2, width: 3, planeArea: 123 })
    for (const key of ['part', 'memo', 'planeArea', '']) expect(r1SurveyPlaneAreaAfterChange(f, key, f.values)).toBeUndefined()
    expect(r1SurveyPlaneAreaAfterChange(f, 'length', { ...f.values, part: ['1', '130'] })).toBeUndefined()
  })
  it('keeps the truthy nonnumeric R1 arithmetic result non-finite for the caller to reject', () => {
    const f = form({ length: 'not-a-number', width: 3 })
    expect(r1SurveyPlaneAreaAfterChange(f, 'length', f.values)?.value).toBeNaN()
  })
  it('retains event input types and empty drafts only in the exact existing rule', () => {
    const f = form({ length: 2, width: '' }), field = f.fields[0]!
    for (const raw of ['0', 0, '', '2.345'] as const) expect(normalizeDynamicFieldValue(f, field, raw).data).toBe(raw)
    for (const raw of ['illegal', '1e3', Infinity, false] as const) expect(normalizeDynamicFieldValue(f, field, raw).state).not.toBe('succeeded')
    expect(normalizeDynamicFieldValue({ ...f, purpose: 'appointment' }, field, '').state).not.toBe('succeeded')
    expect(normalizeDynamicFieldValue(f, { ...field, readOnly: true }, '').state).not.toBe('succeeded')
    expect(normalizeDynamicFieldValue({ ...f, workflowReadOnlyFieldIds: [field.fieldId] }, field, '').state).not.toBe('succeeded')
    expect(normalizeDynamicFieldValue(form({ length: '', width: '0', planeArea: '' }), f.fields[2]!, '').state).toBe('succeeded')
    expect(normalizeDynamicFieldValue(form({ length: 2, width: 3, planeArea: 6 }), f.fields[2]!, '').state).not.toBe('succeeded')
  })
  it('still validates required empties and normalizes numeric values at submission', () => {
    const f = form({ length: '2.345', width: '3', planeArea: 7.04 })
    expect(normalizeDynamicForm(f).data).toMatchObject({ length: 2.345, width: 3, planeArea: 7.04 })
    expect(normalizeDynamicForm(form({ length: '', width: '3', planeArea: '' })).state).not.toBe('succeeded')
  })
})
