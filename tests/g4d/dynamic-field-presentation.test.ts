import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fieldPresentationKind, usesCascadeSheet } from '@features/work-orders/form-presentation'

const nested = [{ value: 'building', label: '楼宇', children: [{ value: 'roof', label: '屋面' }] }]
const flat = [{ value: 'a', label: '分类' }]

describe('dynamic field presentation registry', () => {
  it('chooses hierarchical cascade from verified options, independent of key or business', () => {
    const forSurvey = { type: 'cascade', valueKey: 'part', options: nested }
    const forAcceptance = { type: 'cascade', valueKey: 'inspectionArea', options: nested }
    expect(fieldPresentationKind(forSurvey, 'task')).toBe('part')
    expect(fieldPresentationKind(forAcceptance, 'task')).toBe('part')
    expect(usesCascadeSheet(forAcceptance, 'task')).toBe(true)
    expect(fieldPresentationKind(forSurvey, 'standard')).toBe('field')
  })
  it('does not infer hierarchy when no verified child options exist', () => {
    expect(usesCascadeSheet({ type: 'cascade', options: flat }, 'task')).toBe(false)
    expect(usesCascadeSheet({ type: 'cascade' }, 'task')).toBe(false)
  })
  it('groups any numeric and media fields in the task visual preset only', () => {
    for (const type of ['number', 'digit']) expect(fieldPresentationKind({ type }, 'task')).toBe('measure')
    for (const type of ['file', 'image']) expect(fieldPresentationKind({ type }, 'task')).toBe('media')
    expect(fieldPresentationKind({ type: 'file' }, 'standard')).toBe('field')
    expect(fieldPresentationKind({ type: 'text' }, 'task')).toBe('field')
  })
  it('keeps the shared cascade sheet independent of Survey and Workflow', () => {
    const source = readFileSync(new URL('../../src/shared/ui/AppCascadeSheetField.vue', import.meta.url), 'utf8')
    expect(source).not.toContain('useActionWorkspaceStore')
    expect(source).not.toContain('formPurpose')
    expect(source).not.toContain('workflow/process')
    expect(source).toContain('emit(\'update:modelValue\', draft.value)')
  })
  it('prohibits business-key field dispatch and a second Survey form entrypoint', () => {
    const generic = readFileSync(new URL('../../src/features/work-orders/components/GenericDynamicFormActionContent.vue', import.meta.url), 'utf8')
    const page = readFileSync(new URL('../../src/pages/work-orders/action-workspace.vue', import.meta.url), 'utf8')
    const harness = readFileSync(new URL('../../tools/review/harness/g4e-survey-harness.vue', import.meta.url), 'utf8')
    expect(generic).not.toContain('isSurvey')
    expect(generic).not.toContain("field.valueKey === 'part'")
    expect(generic).not.toContain('SurveyPartPicker')
    expect(generic).toContain('usesCascadeSheet(field, props.presentationMode)')
    expect(page).not.toContain('<SurveyActionContent')
    expect(harness).not.toContain('<SurveyActionContent')
    expect(page).toContain('<GenericDynamicFormActionContent')
    expect(harness).toContain('<GenericDynamicFormActionContent')
  })
})
