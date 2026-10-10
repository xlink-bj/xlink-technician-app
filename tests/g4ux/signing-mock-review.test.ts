import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { mockJourneyWorkOrderId } from '@adapters/api/mock/journey'
import {
  isSigningMockReviewAvailable, readSigningMock, signingMockOrderIds, signingMockReviewUrl, signingMockStateLabel,
  type SigningMockScenario,
} from '@app/signing-mock-review'

const base = {
  workOrderId: mockJourneyWorkOrderId,
  userId: 'synthetic-user',
  roleId: 'synthetic-role',
  orderId: signingMockOrderIds[0],
  scenario: 'normal' as SigningMockScenario,
}
beforeEach(() => {
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  resetBusinessMockCache()
  setBusinessMockMode('data')
})
afterEach(() => {
  resetBusinessMockCache()
  vi.unstubAllEnvs()
})

describe('M1 Signing R1-backed contract / complete isolated mock-only UI read cases', () => {
  it('has an explicit route and two separate official type=1 Orders, never one per repair part', () => {
    expect(isSigningMockReviewAvailable()).toBe(true)
    expect(signingMockReviewUrl()).toContain('pages/work-orders/signing-mock-review?id=')
    const result = readSigningMock(base)
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.orders).toHaveLength(2)
    expect(result.orders.map((o) => o.type)).toEqual([1, 1])
    expect(result.orders[0].parts).toHaveLength(2)
    expect(result.selectedOrder.id).toBe(signingMockOrderIds[0])
    expect(result.contract).toBeNull()
  })
  it('binds example Contract to second Order and does not infer a Contract for the first', () => {
    const second = readSigningMock({ ...base, orderId: signingMockOrderIds[1] })
    expect(second.kind).toBe('ready')
    if (second.kind !== 'ready') return
    expect(second.contract?.orderId).toBe(second.selectedOrder.id)
    expect(second.contract?.workOrderId).toBe(second.selectedOrder.workOrderId)
    expect(second.contract?.demoState).toBe('pending')
  })
  it.each(['signed', 'failed', 'expired'] as const)('supports isolated %s state concept without mutations', (scenario) => {
    const result = readSigningMock({ ...base, orderId: signingMockOrderIds[1], scenario })
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') {
      expect(result.contract?.demoState).toBe(scenario)
      expect(signingMockStateLabel(scenario)).toContain('合成概念')
    }
    const original = readSigningMock({ ...base, orderId: signingMockOrderIds[1] })
    expect(original.kind === 'ready' && original.contract?.demoState).toBe('pending')
  })
  it('supports truly empty and read failure cases without constructing an Order', () => {
    expect(readSigningMock({ ...base, scenario: 'no_orders' })).toEqual({ kind: 'no_orders' })
    expect(readSigningMock({ ...base, scenario: 'read_error' })).toEqual({ kind: 'read_error' })
  })
  it('fails closed on user/role/workOrder/order identity mismatch and bad scenarios', () => {
    for (const override of [
      { userId: 'other' }, { roleId: 'other' }, { workOrderId: 'another-work-order' },
      { orderId: 'mock-official-order-019-external' },
      { scenario: 'sent_sms' as SigningMockScenario },
    ]) {
      expect(readSigningMock({ ...base, ...override }).kind).toBe('blocked')
    }
    expect(readSigningMock({ ...base, userId: undefined }).kind).toBe('blocked')
  })
  it('disappears in Mock OFF, empty, Production and non-DEV builds', () => {
    setBusinessMockMode('off')
    expect(isSigningMockReviewAvailable()).toBe(false)
    expect(readSigningMock(base).kind).toBe('blocked')
    setBusinessMockMode('empty')
    expect(readSigningMock(base).kind).toBe('blocked')
    setBusinessMockMode('data')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect(readSigningMock(base).kind).toBe('blocked')
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    expect(readSigningMock(base).kind).toBe('blocked')
  })
})
