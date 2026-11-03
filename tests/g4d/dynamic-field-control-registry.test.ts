import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fieldControlFor } from '@features/work-orders/field-control-registry'

const nested = [{ value: 'building', label: '楼宇', children: [{ value: 'roof', label: '屋顶' }] }]
const flat = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]

describe('source-shaped dynamic field control registry', () => {
  it('routes the SAME verified hierarchy on Survey and non-Survey FormDefs', () => {
    expect(fieldControlFor({ type: 'cascade', valueKey: 'part', options: nested }, 'task')).toBe('cascade-sheet')
    expect(fieldControlFor({ type: 'cascade', valueKey: 'acceptanceArea', options: nested }, 'task')).toBe('cascade-sheet')
    expect(fieldControlFor({ type: 'cascade', valueKey: 'part', options: nested }, 'standard')).toBe('cascade-inline')
    expect(fieldControlFor({ type: 'cascade', valueKey: 'part', options: flat }, 'task')).toBe('cascade-inline')
  })
  it('retains exact option cardinality semantics regardless of valueKey', () => {
    expect(fieldControlFor({ type: 'select', valueKey: 'cause', options: flat, multiple: true }, 'task')).toBe('multi-choice')
    expect(fieldControlFor({ type: 'checkbox', valueKey: 'defects', options: flat }, 'standard')).toBe('multi-choice')
    expect(fieldControlFor({ type: 'radio', valueKey: 'result', options: flat }, 'standard')).toBe('single-choice')
    expect(fieldControlFor({ type: 'select', valueKey: 'result', options: flat }, 'task')).toBe('single-choice')
  })
  it('preserves historical fallback ordering, including multiline before media', () => {
    expect(fieldControlFor({ type: 'text', valueKey: 'remarks' }, 'standard')).toBe('textarea')
    expect(fieldControlFor({ type: 'file', valueKey: 'images' }, 'task')).toBe('media')
    expect(fieldControlFor({ type: 'image', valueKey: 'image' }, 'standard')).toBe('media')
    expect(fieldControlFor({ type: 'file', valueKey: 'remarks' }, 'task')).toBe('textarea')
    expect(fieldControlFor({ type: 'number', valueKey: 'length' }, 'task')).toBe('input')
    expect(fieldControlFor({ type: 'unknown', valueKey: 'unknown' }, 'task')).toBe('input')
  })
  it('does not move Runtime or provider authority into the renderer', () => {
    const registry = readFileSync(new URL('../../src/features/work-orders/field-control-registry.ts', import.meta.url), 'utf8')
    const generic = readFileSync(new URL('../../src/features/work-orders/components/GenericDynamicFormActionContent.vue', import.meta.url), 'utf8')
    const leakage = readFileSync(new URL('../../src/features/work-orders/components/SurveyLeakageCauseExperience.vue', import.meta.url), 'utf8')
    const heading = readFileSync(new URL('../../src/shared/ui/AppTaskSectionHeading.vue', import.meta.url), 'utf8')
    expect(registry).not.toContain('formPurpose')
    expect(registry).not.toContain("valueKey === 'part'")
    expect(registry).not.toContain('useActionWorkspaceStore')
    expect(generic).not.toContain('SurveyTaskSectionHeading')
    expect(generic).not.toContain('SurveyPartPicker')
    expect(generic).toContain("controlFor(field) === 'media'")
    expect(leakage).toContain('AppTaskSectionHeading')
    expect(heading).not.toContain('useActionWorkspaceStore')
    expect(heading).not.toContain('WorkflowNode')
  })
})
