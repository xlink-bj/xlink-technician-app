import { describe, expect, it } from 'vitest'
import type { DirectProviderOrderDiscoverySummary } from '../../scripts/g4f-direct-provider-order-discovery.mjs'
import {
  hasRequestedDirectProviderLines,
  inspectDirectProviderOrderPage,
} from '../../scripts/g4f-direct-provider-order-discovery.mjs'

describe('bounded direct Procedure/Measure Order discovery', () => {
  it('counts top-level provider rows under the exact type-1 WorkOrder only', () => {
    const result = inspectDirectProviderOrderPage('work-order-1', { items: [{
      type: 1,
      serviceAppointmentId: 'work-order-1',
      groups: [{ lines: [
        { kind: 'procedure' },
        { kind: 'measure' },
        { kind: 'package', children: [{ kind: 'procedure' }, { kind: 'measure' }] },
      ] }],
    }] })
    expect(result).toEqual({
      state: 'FOUND', orders: 1, directProcedureLines: 1, directMeasureLines: 1,
    } satisfies DirectProviderOrderDiscoverySummary)
  })

  it('keeps empty pages separate from malformed pages and association conflicts', () => {
    expect(inspectDirectProviderOrderPage('work-order-1', { items: [] }))
      .toMatchObject({ state: 'NO_DIRECT_PROVIDER_LINES', orders: 0 })
    expect(inspectDirectProviderOrderPage('work-order-1', { items: [
      { type: 1, serviceAppointmentId: 'other-work-order', groups: [] },
    ] })).toMatchObject({ state: 'ORDER_ASSOCIATION_CONFLICT', directProcedureLines: 0 })
    expect(inspectDirectProviderOrderPage('', { items: [] })).toMatchObject({ state: 'UNKNOWN_INVALID_INPUT' })
  })

  it('can target Measure rows while continuing past Procedure-only Orders', () => {
    const proceduresOnly = inspectDirectProviderOrderPage('work-order-1', { items: [{
      type: 1,
      serviceAppointmentId: 'work-order-1',
      groups: [{ lines: [{ kind: 'procedure' }] }],
    }] })
    expect(hasRequestedDirectProviderLines(proceduresOnly)).toBe(true)
    expect(hasRequestedDirectProviderLines(proceduresOnly, 'measure')).toBe(false)
    const includesMeasure = inspectDirectProviderOrderPage('work-order-1', { items: [{
      type: 1,
      serviceAppointmentId: 'work-order-1',
      groups: [{ lines: [{ kind: 'measure' }] }],
    }] })
    expect(hasRequestedDirectProviderLines(includesMeasure, 'measure')).toBe(true)
  })
})
