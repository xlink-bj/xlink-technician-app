import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isMockOwnedCommand, isMockOwnedRead,
  mockBusinessScenarioFor, mockBusinessScenarios,
  mockCommandScenarioIds, resetBusinessMockCache, setBusinessMockMode,
  tryMockRead,
} from '@adapters/api/mock'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'

describe('Canonical Mock Scenario Registry and no-network ownership', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetBusinessMockCache()
  })

  it('registers every existing business scenario exactly once with no-write provenance', () => {
    const keys = Object.keys(mockCommandScenarioIds).sort()
    const registrations = mockBusinessScenarios.map(s => s.key).sort()
    expect(registrations).toEqual(keys)
    expect(new Set(registrations).size).toBe(registrations.length)
    expect(new Set(mockBusinessScenarios.map(s=>s.workOrderId)).size).toBe(keys.length)
    for (const scene of mockBusinessScenarios) {
      expect(scene.workOrderId).toBe(mockCommandScenarioIds[scene.key])
      expect(scene.workOrderId).toMatch(/^mock-work-order-/)
      expect(scene.businessWrites).toBe('synthetic-only')
      expect(scene.network).toBe('mock-owned')
      expect(mockBusinessScenarioFor(scene.key)).toBe(scene)
    }
    expect(mockBusinessScenarioFor('quotationFoundation')).toMatchObject({
      family: 'quotation', expectedOutcome: 'local-only',
      workflowNodeId: 'mock-workflow-node-018-place-order',
    })
    expect(mockBusinessScenarioFor('continuousJourney')).toMatchObject({
      family: 'journey', expectedOutcome: 'local-only',
    })
  })

  it('keeps all known synthetic detail, Order query and order-command paths owned, even when Mock is OFF', () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    setBusinessMockMode('off')
    for (const scene of mockBusinessScenarios) {
      const id = scene.workOrderId
      expect(isMockOwnedRead('basic/serviceAppointment/queryById/' + encodeURIComponent(id))).toBe(true)
      expect(isMockOwnedRead('basic/order/query', {
        'is:serviceAppointmentId|string#and': id, 'is:type|integer#and': 1,
      })).toBe(true)
      expect(isMockOwnedCommand('basic/order/upsert', {
        order: JSON.stringify({ type: 1, serviceAppointmentId: id }),
      })).toBe(true)
      expect(isMockOwnedCommand('workflow/startWorkflow/order/null/unsafe', { saId: id })).toBe(true)
    }
    expect(isMockOwnedRead('basic/order/query', {
      'is:serviceAppointmentId|string#and': 'external-ordinary-work-order',
    })).toBe(false)
    expect(isMockOwnedCommand('basic/order/upsert', {
      order: JSON.stringify({ type: 1, serviceAppointmentId: 'external-ordinary-work-order' }),
    })).toBe(false)
  })

  it('prevents a Mock OFF synthetic Order read falling through to the injected real request', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    setBusinessMockMode('off')
    const request = vi.fn()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://test.invalid',
      getSessionRef: () => 'synthetic-eq01-session' as never,
      request,
    })
    for (const key of ['quotationFoundation', 'continuousJourney'] as const) {
      await expect(transport.execute({
        method: 'POST', path: 'basic/order/query',
        body: {
          page: 1, rows: 3,
          'is:serviceAppointmentId|string#and': mockBusinessScenarioFor(key).workOrderId,
          'is:type|integer#and': 1,
        },
      })).rejects.toMatchObject({ category: 'server_terminal' })
    }
    expect(request).not.toHaveBeenCalled()
  })

  it('keeps the unconfigured 26018 Order list unknown in normal DEV Mock DATA, without inventing an empty page or network fallback', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
    vi.stubEnv('VITE_XLINK_R1_MP_UX_FIXTURES', 'true')
    setBusinessMockMode('data')
    const workOrderId = mockCommandScenarioIds.quotationFoundation
    const body = { page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
      'is:serviceAppointmentId|string#and': workOrderId, 'is:type|integer#and': 1 }
    // The editor's empty quotation is not evidence of an empty formal Order list.
    expect(await tryMockRead('basic/order/query', body, { latencyMs: 0 })).toBeNull()
    expect(isMockOwnedRead('basic/order/query', body)).toBe(true)
    const request = vi.fn()
    const transport = createUniApiReadTransport({ apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => 'synthetic-eq01-session' as never, mockLatencyMs: 0, request })
    const result = await createQuotationOrderReadAdapter(transport, id => id === workOrderId)
      .listTypeOneOrdersForWorkOrder(workOrderId, 3)
    expect(result).toMatchObject({ state: 'failed_terminal', error: {
      category: 'server_terminal', message: 'Synthetic mock read is disabled',
    } })
    expect(result.data).toBeUndefined()
    expect(request).not.toHaveBeenCalled()
  })

  it('classifies forged and malformed synthetic references consistently without granting real write authority', () => {
    expect(isMockOwnedRead('basic/contract/query.do', {
      'is:serviceAppointmentId|string#and': mockBusinessScenarioFor('continuousJourney').workOrderId,
    })).toBe(true)
    expect(isMockOwnedRead('biz/projPackage/findById/%ZZ')).toBe(false)
    expect(isMockOwnedCommand('basic/order/upsert', { order: '{malformed-json' })).toBe(false)
    expect(isMockOwnedCommand('basic/order/upsert', {
      order: JSON.stringify({ type: 1, serviceAppointmentId: mockBusinessScenarioFor('quotationFoundation').workOrderId }),
    })).toBe(true)
  })
})
