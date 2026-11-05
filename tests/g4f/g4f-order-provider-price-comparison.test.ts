import { describe, expect, it } from 'vitest'
import type { DirectProviderPriceLine, DirectProviderPriceOrder } from '../../scripts/g4f-order-provider-price-comparison.mjs'
import { summarizeDirectProviderPriceSnapshots } from '../../scripts/g4f-order-provider-price-comparison.mjs'

const line = (
  kind: 'procedure' | 'measure', id: string, unitPrice: number, quantity = 1, lineTotal = unitPrice,
): DirectProviderPriceLine => ({
  kind, unitPrice, quantity, lineTotal, contentSupported: true,
  identity: { providerRowId: id, providerRowIdSource: 'r1_direct_provider_row_id' },
})

const order = (...lines: DirectProviderPriceLine[]): DirectProviderPriceOrder => ({
  type: 1, serviceAppointmentId: 'work-order-1', groups: [{ lines }],
})

const options = {
  expectedWorkOrderId: 'work-order-1',
  procedureCatalogComplete: true,
  measureCatalogComplete: true,
}

describe('bounded direct Procedure/Measure Order price snapshot comparison', () => {
  it('compares exact R1 provider row identities and current guide unit prices', () => {
    const result = summarizeDirectProviderPriceSnapshots({
      ...options,
      orders: [order(
        line('procedure', 'procedure-1', 12, 1, 20),
        line('measure', 'measure-1', 5, 2, 10),
      )],
      catalogProcedures: [{ id: 'procedure-1', kind: 'procedure', guideUnitPrice: 12 }],
      catalogMeasures: [{ id: 'measure-1', kind: 'measure', guideUnitPrice: 6 }],
    })

    expect(result).toMatchObject({
      state: 'COMPARED', directProcedureLines: 1, directMeasureLines: 1,
      catalogProviderMatches: 2, comparableLines: 2, equalToCurrent: 1,
      differentFromCurrent: 1, unknownLines: 0, identityConflicts: 0,
      byKind: {
        procedure: { comparableLines: 1, equalToCurrent: 1, differentFromCurrent: 0 },
        measure: { comparableLines: 1, equalToCurrent: 0, differentFromCurrent: 1 },
      },
    })
    expect(JSON.stringify(result)).not.toContain('procedure-1')
    expect(JSON.stringify(result)).not.toContain('measure-1')
  })

  it('keeps generic IDs, mismatched references, incomplete prices and absent providers unknown', () => {
    const result = summarizeDirectProviderPriceSnapshots({
      ...options,
      orders: [order(
        { ...line('procedure', 'generic-id', 8), identity: { providerRowId: 'generic-id' } },
        { ...line('measure', 'measure-1', 5), identity: {
          providerRowId: 'measure-1', providerRowIdSource: 'r1_direct_provider_row_id', providerReferenceId: 'conflicting-id',
        } },
        { ...line('procedure', 'procedure-missing', 8), contentSupported: false },
      )],
      catalogProcedures: [{ id: 'generic-id', kind: 'procedure', guideUnitPrice: 8 }, { id: 'procedure-missing', kind: 'procedure' }],
      catalogMeasures: [{ id: 'measure-1', kind: 'measure', guideUnitPrice: 5 }],
    })

    expect(result).toMatchObject({
      state: 'NO_COMPARABLE_LINES', comparableLines: 0, catalogProviderMatches: 1,
      unknownLines: 3,
    })
  })

  it('excludes Package children and reports WorkOrder ownership conflicts', () => {
    const packageOnly = summarizeDirectProviderPriceSnapshots({
      ...options,
      orders: [{ ...order(), groups: [{ lines: [{
        kind: 'package', children: [line('procedure', 'procedure-1', 9)],
      }] }] }],
      catalogProcedures: [{ id: 'procedure-1', kind: 'procedure', guideUnitPrice: 9 }],
      catalogMeasures: [],
    })
    expect(packageOnly).toMatchObject({ state: 'NO_DIRECT_PROVIDER_LINES', directProcedureLines: 0 })

    const conflict = summarizeDirectProviderPriceSnapshots({
      ...options,
      orders: [{ ...order(line('procedure', 'procedure-1', 9)), serviceAppointmentId: 'other-work-order' }],
      catalogProcedures: [{ id: 'procedure-1', kind: 'procedure', guideUnitPrice: 9 }],
      catalogMeasures: [],
    })
    expect(conflict).toMatchObject({ state: 'ORDER_ASSOCIATION_CONFLICT', identityConflicts: 1 })
  })

  it('keeps truncation visible and makes no comparison without complete provider pages', () => {
    const result = summarizeDirectProviderPriceSnapshots({
      ...options,
      orders: [order(line('procedure', 'procedure-1', 9))],
      catalogProcedures: [{ id: 'procedure-1', kind: 'procedure', guideUnitPrice: 9 }],
      catalogMeasures: [],
      measureCatalogComplete: false,
      orderListTruncated: true,
    })
    expect(result).toMatchObject({
      state: 'PARTIAL_COMPARISON', comparableLines: 1, unknownLines: 0, orderListTruncated: true,
      byKind: { measure: { directLines: 0 } },
    })
  })
})
