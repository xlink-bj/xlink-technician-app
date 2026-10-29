import { describe, expect, it } from 'vitest'
import { projectR1MaterialSku } from '@shared/material-sku-contract'
import { projectR1PackageMaterialSku } from '@shared/package-material-sku-contract'
import { auditP1QuotationSkuLineage } from '@features/work-orders/quotation/sku-identity-review'
import { createQuotationGroup, type QuotationDraft, type QuotationGroup } from '@features/work-orders/quotation/model'
import { mockQuotationPackageDetailResponse } from '@adapters/api/mock/quotation-catalog'
import { syntheticMaterialSalesFields as sales, syntheticMaterialSpu, syntheticMaterialSkuRows } from '@adapters/api/mock/material-sku'
import { syntheticPackageId, syntheticPackageMaterialLinks as links, syntheticPackageSkuRows as skus } from '@adapters/api/mock/package-material-sku'

const source = () => ({
  direct: [projectR1MaterialSku({ spu: syntheticMaterialSpu, salesFields: sales, skuRows: syntheticMaterialSkuRows })],
  packages: [projectR1PackageMaterialSku({
    packageId: syntheticPackageId, pricingMethod: '1', materialLinks: links,
    salesFields: sales, skuRows: skus,
  })],
})
const make = (groups: readonly QuotationGroup[]): QuotationDraft => ({
  workOrderId: 'synthetic-work-order',
  workflowNodeId: 'synthetic-place-order',
  draftVersion: 6, groups,
})
const direct = (catalogId: string) => ({
  selectionId: 'sel-material', kind: 'material' as const,
  catalogId, label: '材料', quantity: 1,
})
const quotePackage = (catalogId: string, childOverride: Record<string, unknown> = {}) => ({
  selectionId: 'sel-package', kind: 'package' as const,
  catalogId, label: '套餐', quantity: 1,
  configuration: {
    procedures: [], measures: [],
    materials: [
      { layer: '1', providerComponentId: 'synthetic-link-l1-roof', catalogId: 'synthetic-spu-roof', label: '材料 A', ...childOverride },
      { layer: '2', providerComponentId: 'synthetic-link-l2-coating', catalogId: 'synthetic-spu-coating', label: '材料 B' },
    ],
  },
})
describe('P1 exact quotation catalog ID ↔ R1 SKU/SPU/body identity review', () => {
  it('explicitly rejects currently differing quotation-catalog and standalone SKU fixture IDs', () => {
    const raw = mockQuotationPackageDetailResponse.entity
    expect(raw._id).not.toBe(syntheticPackageId)
    expect(raw.materialList[0].materialId).not.toBe(syntheticMaterialSpu._id)
    const g = {
      ...createQuotationGroup('g1'),
      projPackages: [quotePackage(raw._id)],
      materials: [direct(raw.materialList[0].materialId)],
    }
    const result = auditP1QuotationSkuLineage(make([g]), source())
    expect(result.total).toBe(4)
    expect(result.mismatched).toBe(4)
    expect(result.findings.every((x) => x.status === 'catalog_id_mismatch')).toBe(true)
    expect(result.realSkuAuthorized).toBe(false)
    expect(result.officialOrderAllowed).toBe(false)
  })
  it('recognizes exact synthetic identity correlation, but NOT chosen SKU or authorized Order', () => {
    const g = {
      ...createQuotationGroup('g1'), materials: [direct(syntheticMaterialSpu._id)],
      projPackages: [quotePackage(syntheticPackageId)],
    }
    const report = auditP1QuotationSkuLineage(make([g]), source())
    expect(report.findings.map((x) => x.status)).toEqual(Array(4).fill('demo_ids_correspond'))
    expect(report.correlatedForDemo).toBe(4)
    expect(report.realSkuAuthorized).toBe(false)
    expect(report.officialOrderAllowed).toBe(false)
    expect(report.findings.every(x => x.skuSelected === false)).toBe(true)
  })
  it('rejects a same-layer but wrong package body component ID', () => {
    const g = { ...createQuotationGroup('g1'), projPackages: [quotePackage(syntheticPackageId, { providerComponentId: 'forged' })] }
    const out = auditP1QuotationSkuLineage(make([g]), source())
    expect(out.findings.map(x => x.status)).toEqual([
      'demo_ids_correspond', 'body_id_mismatch', 'demo_ids_correspond',
    ])
  })
  it('requires component catalogId to equal the exact R1 body materialId', () => {
    const g = { ...createQuotationGroup('g1'), projPackages: [quotePackage(syntheticPackageId, { catalogId: 'synthetic-spu-alternative' })] }
    expect(auditP1QuotationSkuLineage(make([g]), source()).findings[1].status).toBe('body_id_mismatch')
  })
  it('rejects contradictory providerReferenceId even when body/component matches', () => {
    const g = { ...createQuotationGroup('g1'), projPackages: [quotePackage(syntheticPackageId, { providerReferenceId: 'another-spu' })] }
    expect(auditP1QuotationSkuLineage(make([g]), source()).findings[1].status).toBe('body_id_mismatch')
  })
  it('does not silently coerce raw number layer 2 to serialized text layer "2"', () => {
    const g = { ...createQuotationGroup('g1'), projPackages: [quotePackage(syntheticPackageId, { layer: 2 })] }
    expect(auditP1QuotationSkuLineage(make([g]), source()).findings[1].status).toBe('layer_unverified')
  })
  it('never accepts duplicate or ambiguous identity providers', () => {
    const data = source(), g = { ...createQuotationGroup('g1'), materials: [direct(syntheticMaterialSpu._id)] }
    const report = auditP1QuotationSkuLineage(make([g]), { ...data, direct: [...data.direct, data.direct[0]] })
    expect(report.findings[0].status).toBe('source_ambiguous')
  })
  it('distinguishes omitted source and different package pricing path from SKU identity', () => {
    const base = source()
    const g = { ...createQuotationGroup('g1'), projPackages: [quotePackage(syntheticPackageId)] }
    expect(auditP1QuotationSkuLineage(make([g]), { ...base, packages: [] }).findings[0].status).toBe('source_missing')
    const other = projectR1PackageMaterialSku({
      packageId: syntheticPackageId, pricingMethod: 2,
      materialLinks: links, salesFields: sales, skuRows: skus,
    })
    expect(auditP1QuotationSkuLineage(make([g]), { ...base, packages: [other] }).findings[0].status)
      .toBe('pricing_path_not_applicable')
  })
  it('keeps repair groups separate and never mutates the original grouped draft', () => {
    const g1 = { ...createQuotationGroup('g1'), projPackages: [quotePackage(syntheticPackageId)] }
    const g2 = { ...createQuotationGroup('g2'), materials: [direct('wrong-source')] }
    const input = make([g1, g2]), snapshot = JSON.stringify(input)
    const r = auditP1QuotationSkuLineage(input, source())
    expect(r.findings.map(f => f.groupId)).toEqual(['g1', 'g1', 'g1', 'g2'])
    expect(r.findings[3].status).toBe('catalog_id_mismatch')
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})
