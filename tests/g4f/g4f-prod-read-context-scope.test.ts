import { describe, expect, it } from 'vitest'
import {
  createPlaceOrderCatalogContextSelector,
  parseCatalogContextAuditArgs,
} from '../../scripts/g4f-prod-read-context-scope.mjs'
import { workOrderOrderLineageReadState } from '../../scripts/g4f-prod-read-summary.mjs'

describe('bounded Production catalog context audit selection', () => {
  it('defaults to the first context and accepts an explicit bounded ordinal', () => {
    expect(parseCatalogContextAuditArgs([])).toEqual({ catalogContextOrdinal: 1, catalogContextOnly: false })
    expect(parseCatalogContextAuditArgs(['--catalog-context-only', '--catalog-context-ordinal=2']))
      .toEqual({ catalogContextOrdinal: 2, catalogContextOnly: true })
    expect(parseCatalogContextAuditArgs(['--', '--catalog-context-ordinal', '20']))
      .toEqual({ catalogContextOrdinal: 20, catalogContextOnly: false })
  })

  it('rejects unsupported, duplicate, malformed, and unbounded command arguments', () => {
    for (const args of [
      ['--all'],
      ['--catalog-context-ordinal'],
      ['--catalog-context-ordinal=0'],
      ['--catalog-context-ordinal=21'],
      ['--catalog-context-ordinal=2x'],
      ['--catalog-context-ordinal=2', '--catalog-context-ordinal=3'],
      ['--catalog-context-only', '--catalog-context-only'],
    ]) expect(() => parseCatalogContextAuditArgs(args)).toThrow()
  })

  it('counts distinct exact service/source pairs only when WorkOrder identity matches', () => {
    const selector = createPlaceOrderCatalogContextSelector(2)
    const first = { workOrderId: 'wo-1', serviceType: 'service-a', sourceType: 'source-a' }
    expect(selector.consider(first, 'wo-1')).toMatchObject({ eligible: true, distinct: true, ordinal: 1, selected: false })
    expect(selector.consider({ ...first, workOrderId: 'wo-2' }, 'wo-2'))
      .toMatchObject({ eligible: true, distinct: false, ordinal: 1, selected: false })
    expect(selector.consider({ ...first, workOrderId: 'other-id', sourceType: 'source-b' }, 'wo-2'))
      .toMatchObject({ eligible: false, distinct: false, ordinal: null, selected: false })
    expect(selector.distinctCount).toBe(1)
    expect(selector.consider({ ...first, workOrderId: 'wo-3', sourceType: 'source-b' }, 'wo-3'))
      .toMatchObject({ eligible: true, distinct: true, ordinal: 2, selected: true })
    expect(selector.distinctCount).toBe(2)
  })

  it('keeps an unqueried Order lineage separate from successful reads', () => {
    expect(workOrderOrderLineageReadState([])).toBe('NOT_RUN')
    expect(workOrderOrderLineageReadState(['SUCCEEDED', 'SUCCEEDED'])).toBe('SUCCEEDED')
    expect(workOrderOrderLineageReadState(['SUCCEEDED', 'FAILED_TERMINAL'])).toBe('PARTIAL')
  })
})
