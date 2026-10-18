import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIsolatedMockCommandStateStore,
} from '@adapters/api/mock/command-state'
import {
  mockCommandScenarioIds, resetBusinessMockCache, resetMockCommandState,
  tryMockRead, isMockOwnedRead,
} from '@adapters/api/mock'

describe('EQ05 isolated Mock command state lifetime and provenance', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetMockCommandState()
    resetBusinessMockCache()
  })

  it('does not share mutable list, detail or saved FormData between independent scenarios', () => {
    const a = createIsolatedMockCommandStateStore()
    const b = createIsolatedMockCommandStateStore()
    const left = a.current()
    const right = b.current()
    expect(left).not.toBe(right)
    expect(left.listResponse).toEqual(right.listResponse)
    expect(left.detailResponses.size).toBeGreaterThan(0)
    const key = mockCommandScenarioIds.appointmentSuccess
    expect(left.detailResponses.has(key)).toBe(true)
    const initial = JSON.stringify(right.detailResponses.get(key))
    left.detailResponses.set(key, { data: { serviceAppointment: { phone: 'synthetic-private-marker' } } })
    left.formData.set('synthetic-form', { extId: 'synthetic-contract', state: 10 })
    expect(JSON.stringify(right.detailResponses.get(key))).toBe(initial)
    expect(right.formData.has('synthetic-form')).toBe(false)
    expect(JSON.stringify(right.listResponse)).not.toContain('synthetic-private-marker')
    expect(a.current()).toBe(left)
    expect(b.current()).toBe(right)
  })

  it('resets one scenario to a deep clean baseline without resetting another scenario', () => {
    const a = createIsolatedMockCommandStateStore()
    const b = createIsolatedMockCommandStateStore()
    const left = a.current()
    const oldList = JSON.stringify(left.listResponse)
    const workOrderId = mockCommandScenarioIds.appointmentSuccess
    const oldDetail = JSON.stringify(left.detailResponses.get(workOrderId))
    left.listResponse = { data: [{ _id: 'mutated-mock-only' }] }
    left.formData.set('locally-saved-form', { state: 1 })
    left.detailResponses.set(workOrderId, { data: { state: 999 } })
    const independent = b.current()
    independent.formData.set('independent-form', { state: 2 })
    a.reset()
    expect(a.current()).not.toBe(left)
    expect(JSON.stringify(a.current().listResponse)).toBe(oldList)
    expect(JSON.stringify(a.current().detailResponses.get(workOrderId))).toBe(oldDetail)
    expect(a.current().formData.size).toBe(0)
    expect(b.current().formData.has('independent-form')).toBe(true)
  })

  it('defensively clones caller-provided seeds at construction, before first access', () => {
    const seeds = {
      listResponse: { data: [{ _id: 'original' }] },
      detailResponses: { 'synthetic-work-order': { data: { order: 'original' } } },
    }
    const a = createIsolatedMockCommandStateStore(seeds)
    seeds.listResponse.data[0]!._id = 'tampered-outside'
    seeds.detailResponses['synthetic-work-order']!.data.order = 'tampered-outside'
    const result = a.current()
    expect(result.listResponse).toEqual({ data: [{ _id: 'original' }] })
    expect(result.detailResponses.get('synthetic-work-order')).toEqual({ data: { order: 'original' } })
    a.reset()
    expect(result).not.toBe(a.current())
    expect(a.current().detailResponses.get('synthetic-work-order')).toEqual({ data: { order: 'original' } })
  })

  it('preserves original Mock router runtime reset and fail-closed synthetic routing contract', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_MOCK', 'true')
    resetBusinessMockCache()
    const orderId = mockCommandScenarioIds.quotationFoundation
    const path = 'basic/order/query'
    const body = { 'is:serviceAppointmentId|string#and': orderId, 'is:type|integer#and': 1 }
    expect(isMockOwnedRead(path, body)).toBe(true)
    const first = await tryMockRead(path, body)
    resetMockCommandState()
    const second = await tryMockRead(path, body)
    expect(second).toEqual(first)
    expect(isMockOwnedRead(path, body)).toBe(true)
  })
})
