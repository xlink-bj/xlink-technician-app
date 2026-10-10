import { isDevMockJourneyEnabled, mockJourneyWorkOrderId } from '@adapters/api/mock/journey'
import { syntheticMaterialSalesFields, syntheticMaterialSkuRows, syntheticMaterialSpu } from '@adapters/api/mock/material-sku'
import { projectR1MaterialSku, type MaterialSkuRead } from '@shared/material-sku-contract'
import { projectR1PackageMaterialSku, type PackageMaterialSkuRead } from '@shared/package-material-sku-contract'
import { syntheticPackageId, syntheticPackageMaterialLinks, syntheticPackageSalesFields, syntheticPackageSkuRows } from '@adapters/api/mock/package-material-sku'

export const materialSkuReviewRoute = '/pages/work-orders/material-sku-mock-review' as const
export const materialSkuReviewUrl = (): string =>
  materialSkuReviewRoute + '?id=' + encodeURIComponent(mockJourneyWorkOrderId)
export const materialSkuScenarios = [
  { value: 'normal', label: '完整规格' },
  { value: 'no_skus', label: '无 SKU' },
  { value: 'ambiguous', label: '重复属性' },
  { value: 'foreign', label: '跨 SPU' },
  { value: 'malformed', label: '字段异常' },
] as const
export type MaterialSkuReviewScenario = typeof materialSkuScenarios[number]['value']
export function isMaterialSkuMockAvailable(): boolean {
  return isDevMockJourneyEnabled()
}
export function canReadMaterialSkuMock(input: {
  readonly workOrderId: string
  readonly userId?: string
  readonly roleId?: string
}): boolean {
  return isMaterialSkuMockAvailable()
    && input.workOrderId === mockJourneyWorkOrderId
    && input.userId === 'synthetic-user'
    && input.roleId === 'synthetic-role'
}
/** All outcomes are static in-memory read projections; NO mutation or SKU port. */
export function readMaterialSkuReview(scenario: MaterialSkuReviewScenario): MaterialSkuRead {
  if (scenario === 'no_skus') {
    return projectR1MaterialSku({ spu: syntheticMaterialSpu, salesFields: syntheticMaterialSalesFields, skuRows: [] })
  }
  if (scenario === 'ambiguous') {
    return projectR1MaterialSku({
      spu: syntheticMaterialSpu, salesFields: syntheticMaterialSalesFields,
      skuRows: [syntheticMaterialSkuRows[0], { ...syntheticMaterialSkuRows[0], _id: 'synthetic-sku-ambiguous' }],
    })
  }
  if (scenario === 'foreign') {
    return projectR1MaterialSku({
      spu: syntheticMaterialSpu, salesFields: syntheticMaterialSalesFields,
      skuRows: [{ ...syntheticMaterialSkuRows[0], spuid: 'other-synthetic-spu' }],
    })
  }
  if (scenario === 'malformed') {
    return projectR1MaterialSku({
      spu: syntheticMaterialSpu,
      salesFields: [{ ...syntheticMaterialSalesFields[0], frontEndConfig: '{invalid' }],
      skuRows: syntheticMaterialSkuRows,
    })
  }
  return projectR1MaterialSku({
    spu: syntheticMaterialSpu, salesFields: syntheticMaterialSalesFields, skuRows: syntheticMaterialSkuRows,
  })
}


export const packageSkuMockScenarios = [
  { value: 'normal', label: '两层材料' },
  { value: 'no_skus', label: '缺失 SKU' },
  { value: 'ambiguous', label: '规格歧义' },
  { value: 'orphan', label: '异源 SKU' },
  { value: 'duplicate', label: '重复 SKU' },
  { value: 'pricing_other', label: '非 SKU 计价' },
] as const
export type PackageSkuMockScenario = typeof packageSkuMockScenarios[number]['value']

/** R1 one-price SKU branch only. The source is entirely synthetic. */
export function readPackageSkuMockReview(scenario: PackageSkuMockScenario): PackageMaterialSkuRead {
  const rows: readonly unknown[] =
    scenario === 'no_skus'
      ? syntheticPackageSkuRows.filter((row) => row.spuid !== 'synthetic-spu-coating')
      : scenario === 'ambiguous'
        ? [...syntheticPackageSkuRows,
          { ...syntheticPackageSkuRows[0], _id: 'synthetic-sku-ambiguous-package' }]
        : scenario === 'orphan'
          ? [...syntheticPackageSkuRows,
            { ...syntheticPackageSkuRows[0], _id: 'synthetic-foreign-sku', spuid: 'other-spu' }]
          : scenario === 'duplicate'
            ? [...syntheticPackageSkuRows, syntheticPackageSkuRows[0]]
            : syntheticPackageSkuRows
  return projectR1PackageMaterialSku({
    packageId: syntheticPackageId,
    pricingMethod: scenario === 'pricing_other' ? '2' : '1',
    materialLinks: syntheticPackageMaterialLinks,
    salesFields: syntheticPackageSalesFields,
    skuRows: rows,
  })
}
