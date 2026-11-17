import { describe, expect, it } from 'vitest'
import { workOrderNumberDisplay } from '@shared/ui/work-order-number-display'

describe('commercial presentation of synthetic work order numbers', () => {
  it('normalizes presentation regardless of source and inspection mode', () => {
    expect(workOrderNumberDisplay('MOCK-018', true, false)).toBe('#018')
    expect(workOrderNumberDisplay('mock-work-order-019-continuous-journey', true, false)).toBe('#019')
    expect(workOrderNumberDisplay('04009', true, false)).toBe('#04009')
  })

  it('never changes a visible number when only the data source or QA flag changes', () => {
    expect(workOrderNumberDisplay('MOCK-018', true, true)).toBe('#018')
    expect(workOrderNumberDisplay('MOCK-018', false, false)).toBe('#018')
    expect(workOrderNumberDisplay('990328', false, false)).toBe('#990328')
    expect(workOrderNumberDisplay('#990328', false, false)).toBe('#990328')
    expect(workOrderNumberDisplay(undefined, true, false)).toBe('')
  })
})
