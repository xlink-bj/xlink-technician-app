import { isDevMockJourneyEnabled, mockJourneyWorkOrderId } from '@adapters/api/mock/journey'
import { syntheticMaterialSalesFields, syntheticMaterialSkuRows, syntheticMaterialSpu } from '@adapters/api/mock/material-sku'
import { projectR1MaterialSku, type MaterialSkuRead } from '@shared/material-sku-contract'

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
