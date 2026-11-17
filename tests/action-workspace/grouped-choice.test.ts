import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { countGroupedChoices, toggleGroupedChoice } from '@shared/ui/grouped-choice'

const groups = [
  { value: 'roof', label: '屋面', children: [{ value: 'a', label: '原因 A' }, { value: 'b', label: '原因 B' }] },
  { value: 'window', label: '窗户', children: [{ value: 'c', label: '原因 C' }] },
] as const

describe('generic grouped multi-select control', () => {
  it('retains all provider groups; a default group never filters choices', () => {
    expect(toggleGroupedChoice(groups, ['b'], 'c')).toEqual(['b', 'c'])
    expect(countGroupedChoices(groups, 'roof', ['b', 'c'])).toBe(1)
    expect(countGroupedChoices(groups, 'window', ['b', 'c'])).toBe(1)
  })
  it('rejects stale option IDs and uses provider order rather than tap order', () => {
    expect(toggleGroupedChoice(groups, ['c'], 'unknown')).toEqual(['c'])
    expect(toggleGroupedChoice(groups, ['c'], 'a')).toEqual(['a', 'c'])
    expect(toggleGroupedChoice(groups, ['a', 'c'], 'a')).toEqual(['c'])
  })
  it('is field-domain independent, including an acceptance checklist', () => {
    const acceptance = [{ value: 'quality', label: '质量', children: [
      { value: 'missing-photo', label: '缺少照片' }, { value: 'measurement', label: '测量异常' },
    ] }]
    expect(toggleGroupedChoice(acceptance, [], 'measurement')).toEqual(['measurement'])
    expect(countGroupedChoices(acceptance, 'quality', ['measurement'])).toBe(1)
  })
  it('does not import WorkOrder or Survey store into shared picker', () => {
    const source = readFileSync(new URL('../../src/shared/ui/AppGroupedMultiSelectField.vue', import.meta.url), 'utf8')
    expect(source).not.toContain('useActionWorkspaceStore')
    expect(source).not.toContain('leakageCauseSelect')
    expect(source).not.toContain('biz/extForm/')
    expect(source).toContain('applySelection')
  })
})
