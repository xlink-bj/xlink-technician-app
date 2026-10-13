import { describe, expect, it } from 'vitest'
import { makeSameCatalogSkuMock } from '@adapters/api/mock/quotation-sku-same-catalog'
import { mockQuotationPackageDetailResponse, mockQuotationPackageListResponse, mockQuotationMaterialListResponse } from '@adapters/api/mock/quotation-catalog'
import { projectR1PackageMaterialSku } from '@shared/package-material-sku-contract'
import { syntheticPackageMaterialLinks, syntheticPackageSkuRows, syntheticPackageSalesFields } from '@adapters/api/mock/package-material-sku'
import { auditP1QuotationSkuLineage } from '@features/work-orders/quotation/sku-identity-review'
import { createQuotationGroup, type QuotationDraft } from '@features/work-orders/quotation/model'

const detailed = mockQuotationPackageDetailResponse.entity
const draft = (): QuotationDraft => ({
  workOrderId: 'mock-019', workflowNodeId: 'mock-place_order', draftVersion: 5,
  groups: [
    { ...createQuotationGroup('group1'),
      projPackages: [{
        selectionId: 'package-1', kind: 'package', catalogId: detailed._id, label: detailed.name, quantity: 1,
        configuration: {
          procedures: [], measures: [],
          materials: [detailed.materialList[0], detailed.materialList[2]].map(row => ({
            providerComponentId: row._id, providerReferenceId: row.materialId,
            catalogId: row.materialId, label: row.material.name,
            layer: row.exts.layer,
          })),
        },
      }],
    },
    { ...createQuotationGroup('group2'),
      materials: [{
        selectionId: 'material-2', kind: 'material',
        catalogId: mockQuotationMaterialListResponse.data[0]._id,
        label: mockQuotationMaterialListResponse.data[0].name, quantity: 1,
      }],
    },
  ],
})

describe('P1 same Quote Catalog IDs with explicitly SYNTHETIC sale/SKU overlay', () => {
  it('preserves original package, direct SPU, package child link IDs and raw typed layers', () => {
    const source = makeSameCatalogSkuMock()
    expect(source.state).toBe('ready_synthetic_only')
    if (source.state !== 'ready_synthetic_only') return
    expect(source.quoteCatalogMaterialIds).toEqual([
      'mock-catalog-material-sealant',
      'mock-catalog-material-ordinary-1',
      'mock-catalog-material-ordinary-2',
    ])
    // All three IDs remain in the ordinary Quotation Catalog. Only the
    // synthetic option-bearing SPU is eligible for this DEV-only SKU overlay.
    // The two ordinary, optionless products never acquire an invented SKU.
    expect(source.direct).toHaveLength(1)
    expect(source.direct[0].state).toBe('ready')
    expect(source.packages[0].state).toBe('ready')
    const pkg = source.packages[0]
    if (pkg.state !== 'ready') return
    expect(pkg.packageId).toBe(detailed._id)
    expect(pkg.layers.map(layer => [layer.layer, layer.rawLayer])).toEqual([
      ['mock-layer-1','mock-layer-1'], ['2',2],
    ])
    expect(pkg.layers[0].options.map(v => v.linkId)).toEqual([
      'mock-package-material-row', 'mock-package-material-row-alternative',
    ])
    expect(pkg.layers[0].options[0].materialId).toBe(detailed.materialList[0].materialId)
  })
  it('returns four exact DEMO correspondences for two groups, but zero real authorization', () => {
    const source = makeSameCatalogSkuMock()
    if (source.state !== 'ready_synthetic_only') throw Error('Synthetic-only fixture must be valid')
    const report = auditP1QuotationSkuLineage(draft(), {
      direct: source.direct, packages: source.packages,
    }, 'same_quote_catalog_synthetic_overlay')
    expect(report.source).toBe('same_quote_catalog_synthetic_overlay')
    expect(report.total).toBe(4)
    expect(report.correlatedForDemo).toBe(4)
    expect(report.mismatched).toBe(0)
    expect(report.findings.every(f => f.status === 'demo_ids_correspond')).toBe(true)
    expect(report.findings.every(f => f.skuSelected === false)).toBe(true)
    expect(report.realSkuAuthorized).toBe(false)
    expect(report.officialOrderAllowed).toBe(false)
    expect(source.syntheticPricingMethod).toBe('1')
    expect(source.syntheticSaleAttributes).toBe(true)
    expect(source.realSourceAuthorized).toBe(false)
  })
  it('does NOT infer match from numeric/text raw layer equivalence', () => {
    const source = makeSameCatalogSkuMock()
    if (source.state !== 'ready_synthetic_only') throw Error('synthetic sample required')
    const groups = draft().groups.map((g, i) => i !== 0 ? g : ({
      ...g,
      projPackages: g.projPackages.map(p => ({
        ...p, configuration: p.configuration && {
          ...p.configuration,
          materials: p.configuration.materials.map(m => m.layer === 2 ? { ...m, layer: '2' } : m),
        },
      })),
    }))
    const report = auditP1QuotationSkuLineage({ ...draft(), groups }, {
      direct: source.direct, packages: source.packages,
    })
    expect(report.findings.find(f => f.catalogId === 'mock-catalog-material-layer-2')?.status)
      .toBe('layer_unverified')
  })
  it('rejects package detail with an ID absent from the same Quote Catalog package list', () => {
    const broken = { ...mockQuotationPackageDetailResponse,
      entity: { ...detailed, _id: 'foreign-package-id' } }
    expect(makeSameCatalogSkuMock({ packageDetail: broken }))
      .toEqual({ state: 'blocked', reason: 'package_not_listed' })
  })
  it('rejects direct and package material SPU identity collision with incompatible source name', () => {
    const bad = { ...mockQuotationPackageDetailResponse,
      entity: { ...detailed, materialList: detailed.materialList.map((row, i) =>
        i === 0 ? { ...row, material: { ...row.material, name: '冲突产品名称' } } : row) } }
    expect(makeSameCatalogSkuMock({ packageDetail: bad }))
      .toEqual({ state: 'blocked', reason: 'incomplete_layer_reference' })
  })
  it('rejects a child link whose materialId and exact material SPU ID differ', () => {
    const bad = { ...mockQuotationPackageDetailResponse,
      entity: { ...detailed, materialList: detailed.materialList.map((row, i) =>
        i === 0 ? { ...row, materialId: 'foreign-spu' } : row) } }
    expect(makeSameCatalogSkuMock({ packageDetail: bad }))
      .toEqual({ state: 'blocked', reason: 'incomplete_layer_reference' })
  })
  it('refuses unlisted direct SPU duplicates and malformed material catalogs', () => {
    expect(makeSameCatalogSkuMock({ materialList: {
      ...mockQuotationMaterialListResponse,
      data: [...mockQuotationMaterialListResponse.data, mockQuotationMaterialListResponse.data[0]],
    } })).toEqual({ state: 'blocked', reason: 'conflicting_spu_identity' })
    expect(makeSameCatalogSkuMock({ materialList: { data: undefined } }))
      .toEqual({ state: 'blocked', reason: 'malformed_catalog' })
    expect(makeSameCatalogSkuMock({ packageList: { ...mockQuotationPackageListResponse, data: [] } }))
      .toEqual({ state: 'blocked', reason: 'package_not_listed' })
  })
  it('never synthesizes price, stock or official Order fields from current catalog', () => {
    const source = makeSameCatalogSkuMock()
    if (source.state !== 'ready_synthetic_only') throw Error('synthetic data required')
    expect(JSON.stringify(source)).not.toContain('servicePrice')
    expect(JSON.stringify(source)).not.toContain('storeCostPrice')
    expect('orderId' in source).toBe(false)
    expect('totalAmount' in source).toBe(false)
  })
  it('never changes original source responses or draft while projecting overlays', () => {
    const before = JSON.stringify([mockQuotationMaterialListResponse, mockQuotationPackageDetailResponse])
    const beforeDraft = JSON.stringify(draft())
    const sample = makeSameCatalogSkuMock()
    expect(sample.state).toBe('ready_synthetic_only')
    expect(JSON.stringify([mockQuotationMaterialListResponse, mockQuotationPackageDetailResponse])).toBe(before)
    const source = makeSameCatalogSkuMock()
    if (source.state !== 'ready_synthetic_only') throw Error('synthetic data required')
    auditP1QuotationSkuLineage(draft(), { direct: source.direct, packages: source.packages })
    expect(JSON.stringify(draft())).toBe(beforeDraft)
  })
  it('rejects same normalized layer with a different raw type in R1 package projection', () => {
    const links = [
      syntheticPackageMaterialLinks[0],
      { ...syntheticPackageMaterialLinks[1], exts: { layer: 1 } },
      syntheticPackageMaterialLinks[2],
    ]
    expect(projectR1PackageMaterialSku({
      packageId: 'synthetic-package-roof', pricingMethod: '1',
      materialLinks: links, salesFields: syntheticPackageSalesFields, skuRows: syntheticPackageSkuRows,
    })).toEqual({ state: 'blocked', reason: 'invalid_material_link' })
  })
})
