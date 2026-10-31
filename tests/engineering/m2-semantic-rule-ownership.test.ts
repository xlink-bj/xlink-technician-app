import { describe, expect, it } from 'vitest'
import {
  isWorkflowFieldReadOnly,
} from '@features/work-orders/action-form-schema'
import {
  dynamicActionFieldsFor,
  normalizeDynamicFieldValue,
  normalizeDynamicForm,
} from '@features/work-orders/dynamic-form-action'
import { surveyLeakageCauseFieldStateFor } from '@features/work-orders/survey-leakage-cause'
import type { DynamicFormRead, FormFieldRead } from '@shared/ports'

const memo: FormFieldRead = {
  fieldId: 'memo-field', valueKey: 'memo', label: '备注', type: 'text',
  required: true, readOnly: false, showList: ['4'],
}

function generalForm(workflowReadOnlyFieldIds?: readonly string[]): DynamicFormRead {
  return {
    fields: [memo], values: { memo: '原有现场记录' }, workflowReadOnlyFieldIds,
  }
}

const surveyTrigger: FormFieldRead = {
  fieldId: 'survey-trigger', valueKey: 'leakageCauseSelect', label: '选择渗漏原因',
  type: 'select', required: false, readOnly: false, showList: ['4'],
  visibility: { kind: 'includes', path: 'part', value: 'roof' },
}
const surveyValue: FormFieldRead = {
  fieldId: 'survey-value', valueKey: 'leakageCause', label: '渗漏原因',
  type: 'data', multiple: true, required: true, readOnly: false, showList: ['4'],
  visibility: { kind: 'includes', path: 'part', value: 'roof' },
}

function surveyForm(workflowReadOnlyFieldIds?: readonly string[]): DynamicFormRead {
  return {
    purpose: 'survey', fields: [surveyTrigger, surveyValue],
    values: { part: ['roof'], leakageCause: ['cause-roof-1'] },
    workflowReadOnlyFieldIds,
  }
}

describe('M2-B single Workflow readonly field identity owner', () => {
  it('preserves the historical string-coercing identity membership and missing-field default', () => {
    expect(isWorkflowFieldReadOnly({}, memo)).toBe(false)
    expect(isWorkflowFieldReadOnly({ workflowReadOnlyFieldIds: [] }, memo)).toBe(false)
    expect(isWorkflowFieldReadOnly({ workflowReadOnlyFieldIds: ['another', 'memo-field'] }, memo)).toBe(true)
    expect(isWorkflowFieldReadOnly({ workflowReadOnlyFieldIds: ['memo'] }, memo)).toBe(false)
    const legacyNumericForm = { workflowReadOnlyFieldIds: [7] } as unknown as Pick<DynamicFormRead, 'workflowReadOnlyFieldIds'>
    expect(isWorkflowFieldReadOnly(legacyNumericForm, { fieldId: '7' })).toBe(true)
    expect(isWorkflowFieldReadOnly(legacyNumericForm, { fieldId: '07' })).toBe(false)
  })

  it('applies the same decision to generic rendering, individual updates, and form submission', () => {
    const writable = generalForm()
    expect(dynamicActionFieldsFor(writable)[0]?.runtime).toMatchObject({ visible: true, readOnly: false })
    expect(normalizeDynamicFieldValue(writable, memo, '新的现场记录')).toEqual({ state: 'succeeded', data: '新的现场记录' })
    expect(normalizeDynamicForm(writable)).toEqual({ state: 'succeeded', data: { memo: '原有现场记录' } })

    const locked = generalForm(['memo-field'])
    expect(dynamicActionFieldsFor(locked)[0]?.runtime).toMatchObject({ visible: true, readOnly: true })
    expect(normalizeDynamicFieldValue(locked, memo, '篡改值')).toMatchObject({
      state: 'failed_terminal', error: { category: 'validation' },
    })
    expect(normalizeDynamicForm(locked)).toEqual({ state: 'succeeded', data: { memo: '原有现场记录' } })
    expect(locked.values.memo).toBe('原有现场记录')
  })

  it('uses the identical Workflow identity policy for controlled Survey field state', () => {
    const writable = surveyForm()
    expect(surveyLeakageCauseFieldStateFor(writable, surveyValue)).toMatchObject({
      capability: 'CONDITIONAL_CAPABILITY', visible: true, readOnly: false, required: true,
    })
    expect(dynamicActionFieldsFor(writable)[1]?.runtime.readOnly).toBe(false)
    expect(normalizeDynamicFieldValue(writable, surveyValue, ['cause-roof-2'])).toEqual({
      state: 'succeeded', data: ['cause-roof-2'],
    })

    const locked = surveyForm(['survey-value'])
    expect(surveyLeakageCauseFieldStateFor(locked, surveyValue)).toMatchObject({
      visible: true, readOnly: true, required: false,
    })
    expect(dynamicActionFieldsFor(locked)[1]?.runtime.readOnly).toBe(true)
    expect(normalizeDynamicFieldValue(locked, surveyValue, ['cause-roof-2'])).toMatchObject({
      state: 'failed_terminal', error: { category: 'validation' },
    })
    expect(normalizeDynamicForm(locked)).toEqual({ state: 'succeeded', data: { leakageCause: ['cause-roof-1'] } })
  })

  it('does not turn a hidden controlled Survey value into a visible or required field', () => {
    const form = { ...surveyForm(['survey-value']), values: { part: ['bath'], leakageCause: ['cause-roof-1'] } }
    expect(surveyLeakageCauseFieldStateFor(form, surveyValue)).toMatchObject({
      visible: false, readOnly: true, required: false,
    })
    expect(normalizeDynamicForm(form)).toEqual({ state: 'succeeded', data: {} })
  })
})
