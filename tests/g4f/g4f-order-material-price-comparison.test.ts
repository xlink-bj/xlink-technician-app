import { describe, expect, it } from 'vitest'
import type { DirectMaterialPriceLine, DirectMaterialPriceOrder } from '../../scripts/g4f-order-material-price-comparison.mjs'
import { summarizeDirectMaterialPriceSnapshots } from '../../scripts/g4f-order-material-price-comparison.mjs'

type PriceLineOverrides = Omit<Partial<DirectMaterialPriceLine>, 'identity'> & {
  identity?: Partial<NonNullable<DirectMaterialPriceLine['identity']>>
}

const line = (spuId: string, unitPrice: number | undefined, overrides: PriceLineOverrides = {}): DirectMaterialPriceLine => {
  const { identity, ...rest } = overrides
  return {
    kind: 'material',
    label: 'Material',
    contentSupported: true,
    unitPrice,
    identity: {
      spuId,
      spuIdSource: 'order_line_spu' as const,
      ...identity,
    },
    children: [],
    ...rest,
  }
}

const order = (...lines: DirectMaterialPriceLine[]): DirectMaterialPriceOrder => ({
  id: 'order-1',
  type: 1,
  serviceAppointmentId: 'work-order-1',
  groups: [{ lines }],
})

describe('bounded direct Material SPU price snapshot comparison', () => {
  it('compares only exact no-SKU SPU lines to current normalized catalog price and returns counts only', () => {
    const result = summarizeDirectMaterialPriceSnapshots({
      expectedWorkOrderId: 'work-order-1',
      orders: [order(line('spu-a', 10), line('spu-b', 12))],
      catalogMaterials: [
        { id: 'spu-a', kind: 'material', price: 10 },
        { id: 'spu-b', kind: 'material', price: 11 },
      ],
      activeSkuRows: [],
    })

    expect(result).toEqual({
      state: 'COMPARED',
      orders: 1,
      directMaterialLines: 2,
      catalogSpuMatches: 2,
      comparableLines: 2,
      equalToCurrent: 1,
      differentFromCurrent: 1,
      unknownLines: 0,
      skuOrAmbiguousIdentity: 0,
      currentSkuVariantAmbiguity: 0,
      duplicateCatalogIdentities: 0,
      identityConflicts: 0,
      orderListTruncated: false,
    })
    expect(JSON.stringify(result)).not.toContain('10')
    expect(JSON.stringify(result)).not.toContain('spu-a')
  })

  it('keeps SKU-coded, SKU-ID, active-variant, missing-price and missing-SPU rows unknown', () => {
    const result = summarizeDirectMaterialPriceSnapshots({
      expectedWorkOrderId: 'work-order-1',
      orders: [order(
        line('spu-a', 10, { identity: { spuId: 'spu-a', skuCode: 'historic-code' } }),
        line('spu-b', 10, { identity: { spuId: 'spu-b', skuId: 'sku-b' } }),
        line('spu-c', 10),
        line('spu-d', 10, { identity: { spuId: undefined, spuIdSource: undefined } }),
        line('spu-e', undefined as unknown as number),
      )],
      catalogMaterials: [
        { id: 'spu-a', kind: 'material', price: 10 },
        { id: 'spu-b', kind: 'material', price: 10 },
        { id: 'spu-c', kind: 'material', price: 10 },
        { id: 'spu-d', kind: 'material', price: 10 },
        { id: 'spu-e', kind: 'material' },
      ],
      activeSkuRows: [{ id: 'current-sku', spuId: 'spu-c' }],
    })

    expect(result).toMatchObject({
      state: 'NO_COMPARABLE_LINES',
      directMaterialLines: 5,
      catalogSpuMatches: 4,
      comparableLines: 0,
      unknownLines: 5,
      skuOrAmbiguousIdentity: 2,
      currentSkuVariantAmbiguity: 1,
    })
  })

  it('excludes package child materials and detects Order ownership conflicts', () => {
    const valid = {
      ...order(),
      groups: [{ lines: [{ kind: 'package', label: 'Package', children: [line('spu-package-child', 4)] }] }],
    }
    const packageOnly = summarizeDirectMaterialPriceSnapshots({
      expectedWorkOrderId: 'work-order-1',
      orders: [valid],
      catalogMaterials: [{ id: 'spu-package-child', kind: 'material', price: 4 }],
      activeSkuRows: [],
    })
    expect(packageOnly).toMatchObject({ state: 'NO_DIRECT_MATERIAL_LINES', directMaterialLines: 0 })

    const conflict = summarizeDirectMaterialPriceSnapshots({
      expectedWorkOrderId: 'work-order-1',
      orders: [{ ...order(line('spu-a', 1)), serviceAppointmentId: 'other-work-order' }],
      catalogMaterials: [{ id: 'spu-a', kind: 'material', price: 1 }],
      activeSkuRows: [],
    })
    expect(conflict).toMatchObject({ state: 'ORDER_ASSOCIATION_CONFLICT', identityConflicts: 1 })
  })

  it('leaves duplicate catalog identities unknown and preserves first-page truncation', () => {
    const result = summarizeDirectMaterialPriceSnapshots({
      expectedWorkOrderId: 'work-order-1',
      orders: [order(line('spu-a', 10))],
      catalogMaterials: [
        { id: 'spu-a', kind: 'material', price: 10 },
        { id: 'spu-a', kind: 'material', price: 10 },
      ],
      activeSkuRows: [],
      orderListTruncated: true,
    })
    expect(result).toMatchObject({
      state: 'NO_COMPARABLE_LINES',
      duplicateCatalogIdentities: 1,
      unknownLines: 1,
      orderListTruncated: true,
    })
  })

  it('does not use a projected row ID fallback as an SPU link even when strings match', () => {
    const result = summarizeDirectMaterialPriceSnapshots({
      expectedWorkOrderId: 'work-order-1',
      orders: [order(line('spu-a', 10, { identity: { spuIdSource: 'row_id_fallback' } }))],
      catalogMaterials: [{ id: 'spu-a', kind: 'material', price: 10 }],
      activeSkuRows: [],
    })
    expect(result).toMatchObject({
      state: 'NO_COMPARABLE_LINES',
      catalogSpuMatches: 0,
      comparableLines: 0,
      unknownLines: 1,
    })
  })
})
