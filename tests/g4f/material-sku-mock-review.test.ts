import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { setBusinessMockMode, resetBusinessMockCache } from '@adapters/api/mock/config'
import { mockJourneyWorkOrderId } from '@adapters/api/mock/journey'
import { canReadMaterialSkuMock, readMaterialSkuReview, readPackageSkuMockReview } from '@app/material-sku-mock-review'

beforeEach(() => {
  vi.stubEnv('VITE_XLINK_ENVIRONMENT','dev')
  vi.stubEnv('VITE_XLINK_MOCK','true')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E','true')
  resetBusinessMockCache()
  setBusinessMockMode('data')
})
afterEach(() => { resetBusinessMockCache();vi.unstubAllEnvs() })
const ctx={workOrderId:mockJourneyWorkOrderId,userId:'synthetic-user',roleId:'synthetic-role'}
describe('main-App SKU Mock route is identity- and DEV-guarded',()=>{
  it('only shows the read-only SKU review to the exact synthetic principal',()=>{
    expect(canReadMaterialSkuMock(ctx)).toBe(true)
    expect(canReadMaterialSkuMock({...ctx,roleId:'other'})).toBe(false)
    expect(canReadMaterialSkuMock({...ctx,userId:'other'})).toBe(false)
    expect(canReadMaterialSkuMock({...ctx,workOrderId:'foreign'})).toBe(false)
  })
  it('disappears with Mock off, empty and Production target',()=>{
    setBusinessMockMode('off')
    expect(canReadMaterialSkuMock(ctx)).toBe(false)
    setBusinessMockMode('empty')
    expect(canReadMaterialSkuMock(ctx)).toBe(false)
    setBusinessMockMode('data')
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','prod')
    expect(canReadMaterialSkuMock(ctx)).toBe(false)
  })
  it('separates package SKU Mock normal, ambiguous, orphan, duplicate and pricing path',()=>{
    expect(readPackageSkuMockReview('normal').state).toBe('ready')
    expect(readPackageSkuMockReview('no_skus').state).toBe('ready')
    expect(readPackageSkuMockReview('ambiguous').state).toBe('ready')
    expect(readPackageSkuMockReview('orphan')).toEqual({state:'blocked',reason:'orphan_sku_parent'})
    expect(readPackageSkuMockReview('duplicate')).toEqual({state:'blocked',reason:'duplicate_sku_id'})
    expect(readPackageSkuMockReview('pricing_other').state).toBe('not_applicable')
    expect(readMaterialSkuReview('normal').state).toBe('ready')
  })
  it('preserves independent synthetic error outcomes',()=>{
    expect(readMaterialSkuReview('normal').state).toBe('ready')
    expect(readMaterialSkuReview('no_skus').state).toBe('no_skus')
    expect(readMaterialSkuReview('ambiguous').state).toBe('ready')
    expect(readMaterialSkuReview('foreign').state).toBe('blocked')
    expect(readMaterialSkuReview('malformed').state).toBe('blocked')
  })
})
