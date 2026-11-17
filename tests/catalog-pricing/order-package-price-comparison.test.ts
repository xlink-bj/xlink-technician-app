import { describe, expect, it } from 'vitest'
import type { PackagePriceLine, PackagePriceOrder } from '../../scripts/g4f-order-package-price-comparison.mjs'
import { summarizePackagePriceSnapshots } from '../../scripts/g4f-order-package-price-comparison.mjs'

const packageLine = (overrides: Partial<PackagePriceLine> = {}): PackagePriceLine => ({
  kind: 'package', quantity: 2,
  r1PackagePriceSnapshot: { unitAmount: 90, totalAmount: 180 },
  packagePricingMethod: '0', identity: { providerRowId: 'package-a' },
  children: [{
    kind: 'material', packageMaterialLayer: '1', packageComponentMarkup: 10,
    identity: {
      providerRowId: 'component-a', providerReferenceId: 'material-a',
      spuId: 'material-a', spuIdSource: 'embedded_material_id',
    },
  }],
  ...overrides,
})

const order = (...lines: PackagePriceLine[]): PackagePriceOrder => ({
  type: 1,
  serviceAppointmentId: 'work-order-a',
  groups: [{ lines }],
})

const catalog = [{ id: 'package-a', kind: 'package', price: 80, minimumPrice: 100, pricingMethod: '0' }]
const details = [{
  package: { id: 'package-a' },
  materials: [
    { id: 'component-a', referenceId: 'material-a', layer: 1, price: 10 },
    { id: 'component-b', referenceId: 'material-b', layer: 1, price: 0 },
  ],
  procedures: [],
  measures: [],
}]

const compare = (orders: readonly PackagePriceOrder[], overrides: Partial<Parameters<typeof summarizePackagePriceSnapshots>[0]> = {}) =>
  summarizePackagePriceSnapshots({
    expectedWorkOrderId: 'work-order-a', orders,
    catalogPackages: catalog, packageDetails: details,
    packageCatalogComplete: true, packageDetailsComplete: true,
    ...overrides,
  })

describe('bounded R1 Package price snapshot comparison', () => {
  it('compares an exact package, selected layer material, markup, quantity and R1 total', () => {
    const result = compare([order(packageLine())])
    expect(result).toEqual({
      state: 'COMPARED', orders: 1, packageLines: 1, catalogPackageMatches: 1, detailMatches: 1,
      comparableLines: 1, equalToCurrent: 1, differentFromCurrent: 0, unknownLines: 0,
      skuPackageLines: 0, ambiguousIdentityLines: 0, componentSnapshotDifferences: 0,
      identityConflicts: 0, orderListTruncated: false,
    })
    expect(JSON.stringify(result)).not.toContain('package-a')
    expect(JSON.stringify(result)).not.toContain('180')
  })

  it('uses the current minimum-price floor when comparing a lower package amount', () => {
    const lowPackage = [{ id: 'package-a', kind: 'package', price: 40, minimumPrice: 100 }]
    const noMaterials = [{ package: { id: 'package-a' }, materials: [], procedures: [], measures: [] }]
    const result = compare([order(packageLine({ quantity: 1, r1PackagePriceSnapshot: { unitAmount: 40, totalAmount: 100 }, children: [] }))], {
      catalogPackages: lowPackage,
      packageDetails: noMaterials,
    })
    expect(result).toMatchObject({ state: 'COMPARED', equalToCurrent: 1, unknownLines: 0 })
  })

  it('marks a changed historical/current amount as different and records changed component markup', () => {
    const result = compare([order(packageLine({ r1PackagePriceSnapshot: { unitAmount: 89, totalAmount: 178 }, children: [{
      kind: 'material', packageMaterialLayer: 1, packageComponentMarkup: 9,
      identity: { providerRowId: 'component-a', providerReferenceId: 'material-a' },
    }] }))])
    expect(result).toMatchObject({
      state: 'COMPARED', comparableLines: 1, equalToCurrent: 0,
      differentFromCurrent: 1, componentSnapshotDifferences: 1,
    })
  })

  it('keeps SKU pricing, changed component identities, missing price snapshots and incomplete catalogs unknown', () => {
    const skuPackage = packageLine({ packagePricingMethod: '1' })
    const wrongComponent = packageLine({ children: [{
      kind: 'material', packageMaterialLayer: 1, packageComponentMarkup: 10,
      identity: { providerRowId: 'other-component', providerReferenceId: 'material-a' },
    }] })
    const selectedSkuComposition = packageLine({ packageSkuCompositionUnsupported: true })
    const conflictingComponentIdentity = packageLine({ children: [{
      kind: 'material', packageMaterialLayer: 1, packageComponentMarkup: 10,
      identity: {
        providerReferenceId: 'material-a', spuId: 'other-material',
        spuIdSource: 'embedded_material_id',
      },
    }] })
    const result = compare([order(
      skuPackage, wrongComponent, packageLine({ r1PackagePriceSnapshot: undefined }),
      selectedSkuComposition, conflictingComponentIdentity,
    )])
    expect(result).toMatchObject({
      state: 'NO_COMPARABLE_LINES', packageLines: 5, skuPackageLines: 2,
      unknownLines: 5, comparableLines: 0,
    })
    expect(compare([order(packageLine())], { packageCatalogComplete: false }))
      .toMatchObject({ state: 'INCOMPLETE_CATALOG', unknownLines: 1, comparableLines: 0 })
  })

  it('rejects duplicate current identities and mismatched Order ownership, and marks a truncated page partial', () => {
    const duplicate = compare([order(packageLine())], { catalogPackages: [...catalog, ...catalog] })
    expect(duplicate).toMatchObject({ state: 'NO_COMPARABLE_LINES', ambiguousIdentityLines: 1, unknownLines: 1 })

    const conflict = compare([{ ...order(packageLine()), serviceAppointmentId: 'another-work-order' }])
    expect(conflict).toMatchObject({ state: 'ORDER_ASSOCIATION_CONFLICT', identityConflicts: 1 })

    const truncated = compare([order(packageLine())], { orderListTruncated: true })
    expect(truncated).toMatchObject({ state: 'PARTIAL_COMPARISON', comparableLines: 1, orderListTruncated: true })
  })
})
