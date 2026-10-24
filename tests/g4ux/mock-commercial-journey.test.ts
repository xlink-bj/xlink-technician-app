import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { advanceMockJourney, resetMockJourney, mockJourneyWorkOrderId } from '@adapters/api/mock/journey'
import {
  canReviewMockCommercial, confirmMockCommercialCheckpoint,
  pauseMockCommercialReview, readMockCommercialProgress,
  resetMockCommercialReview, resumeMockCommercialReview, revokeLastMockCommercialCheckpoint,
} from '@app/mock-commercial-journey'

const storage = new Map<string, unknown>()
const scope = { workOrderId: mockJourneyWorkOrderId, userId: 'synthetic-user', roleId: 'synthetic-role' }
beforeEach(() => {
  storage.clear()
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => { storage.set(key, value) },
    removeStorageSync: (key: string) => { storage.delete(key) },
  })
  resetBusinessMockCache()
  setBusinessMockMode('data')
  resetMockJourney()
})
afterEach(() => {
  resetBusinessMockCache()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
function reachQuotation() {
  expect(advanceMockJourney('appointment')).toBe('survey')
  expect(advanceMockJourney('survey')).toBe('quotation')
}

describe('synthetic 019 cross-page commercial checkpoints', () => {
  it('requires the previous saved Workflow stage and all 3 checkpoints in order', () => {
    expect(canReviewMockCommercial(scope)).toBe(false)
    expect(confirmMockCommercialCheckpoint(scope, 'quotation_preview')).toBe(false)
    reachQuotation()
    expect(canReviewMockCommercial(scope)).toBe(true)
    expect(confirmMockCommercialCheckpoint(scope, 'order_contract_review')).toBe(false)
    expect(confirmMockCommercialCheckpoint(scope, 'sku_review')).toBe(false)
    expect(confirmMockCommercialCheckpoint(scope, 'quotation_preview')).toBe(true)
    expect(confirmMockCommercialCheckpoint(scope, 'quotation_preview')).toBe(false)
    expect(confirmMockCommercialCheckpoint(scope, 'order_contract_review')).toBe(false)
    expect(confirmMockCommercialCheckpoint(scope, 'sku_review')).toBe(true)
    expect(confirmMockCommercialCheckpoint(scope, 'order_contract_review')).toBe(true)
    expect(readMockCommercialProgress(scope)).toEqual({
      confirmed: ['quotation_preview', 'sku_review', 'order_contract_review'], paused: false, complete: true,
    })
    expect(pauseMockCommercialReview(scope)).toBe(false)
    expect(revokeLastMockCommercialCheckpoint(scope)).toBe(true)
    expect(readMockCommercialProgress(scope).complete).toBe(false)
    expect(readMockCommercialProgress(scope).confirmed).toEqual(['quotation_preview', 'sku_review'])
    expect(confirmMockCommercialCheckpoint(scope, 'order_contract_review')).toBe(true)
  })

  it('pauses, recovers saved checkpoints on re-read, resumes and resets', () => {
    reachQuotation()
    expect(confirmMockCommercialCheckpoint(scope, 'quotation_preview')).toBe(true)
    expect(pauseMockCommercialReview(scope)).toBe(true)
    expect(confirmMockCommercialCheckpoint(scope, 'sku_review')).toBe(false)
    expect(revokeLastMockCommercialCheckpoint(scope)).toBe(false)
    expect(readMockCommercialProgress(scope)).toEqual({
      confirmed: ['quotation_preview'], paused: true, complete: false,
    })
    expect(pauseMockCommercialReview(scope)).toBe(false)
    expect(resumeMockCommercialReview(scope)).toBe(true)
    expect(resumeMockCommercialReview(scope)).toBe(false)
    expect(confirmMockCommercialCheckpoint(scope, 'sku_review')).toBe(true)
    expect(resetMockCommercialReview()).toBe(true)
    expect(readMockCommercialProgress(scope)).toEqual({ confirmed: [], paused: false, complete: false })
  })

  it('rejects other principals, work orders, malformed storage and disabled DEV mode', () => {
    reachQuotation()
    expect(confirmMockCommercialCheckpoint({ ...scope, roleId: 'other-role' }, 'quotation_preview')).toBe(false)
    expect(confirmMockCommercialCheckpoint({ ...scope, workOrderId: 'other-order' }, 'quotation_preview')).toBe(false)
    expect(confirmMockCommercialCheckpoint(scope, 'quotation_preview')).toBe(true)
    expect(readMockCommercialProgress({ ...scope, roleId: 'other-role' }).confirmed).toEqual([])
    const ledgerKey = [...storage.keys()].find(key => key.includes('commercial-review'))!
    storage.set(ledgerKey, { version: 1, ...scope, paused: false, confirmed: ['sku_review'] })
    expect(readMockCommercialProgress(scope).confirmed).toEqual([])
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect(confirmMockCommercialCheckpoint(scope, 'quotation_preview')).toBe(false)
    expect(readMockCommercialProgress(scope).confirmed).toEqual([])
  })

  it('never reports success on storage failure', () => {
    reachQuotation()
    vi.stubGlobal('uni', {
      getStorageSync: () => undefined,
      setStorageSync: () => { throw new Error('storage disabled') },
      removeStorageSync: () => { throw new Error('storage disabled') },
    })
    expect(confirmMockCommercialCheckpoint(scope, 'quotation_preview')).toBe(false)
    expect(pauseMockCommercialReview(scope)).toBe(false)
    expect(resetMockCommercialReview()).toBe(false)
  })
})
