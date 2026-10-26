import { describe, expect, it } from 'vitest'
import { workOrderNumberDisplay } from '@shared/ui/work-order-number-display'

describe('commercial presentation of synthetic work order numbers', () => {
  it('removes development prefixes only for explicitly synthetic fixtures in customer mode', () => {
    expect(workOrderNumberDisplay('MOCK-018', true, false)).toBe('#018')
    expect(workOrderNumberDisplay('mock-work-order-019-continuous-journey', true, false)).toBe('#019')
    expect(workOrderNumberDisplay('04009', true, false)).toBe('#04009')
  })

  it('preserves developer identity and all non-synthetic real order numbers', () => {
    expect(workOrderNumberDisplay('MOCK-018', true, true)).toBe('#MOCK-018')
    expect(workOrderNumberDisplay('MOCK-018', false, false)).toBe('#MOCK-018')
    expect(workOrderNumberDisplay('990328', false, false)).toBe('#990328')
    expect(workOrderNumberDisplay('#990328', false, false)).toBe('#990328')
    expect(workOrderNumberDisplay(undefined, true, false)).toBe('')
  })
})
