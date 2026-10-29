import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockFaultWireResponse, validatedMockLatency } from '@adapters/api/mock/fault-scenarios'
import {
  mockCommandScenarioIds, tryMockRead, resetBusinessMockCache, setBusinessMockMode,
  resetMockCommandState,
} from '@adapters/api/mock'

const path = 'basic/serviceAppointment/queryById/' + mockCommandScenarioIds.quotationFoundation
describe('EQ05B explicit synthetic read failure/latency scenarios', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    resetBusinessMockCache()
    resetMockCommandState()
  })

  it('exposes deterministic and immutable retryable vs terminal errors, without server/PII data', () => {
    expect(mockFaultWireResponse('retryable')).toEqual({
      success: false, code: 'RETRYABLE', message: 'synthetic retryable read failure',
    })
    expect(mockFaultWireResponse('terminal')).toEqual({
      success: false, code: 'TERMINAL', message: 'synthetic terminal read failure',
    })
    expect(Object.isFrozen(mockFaultWireResponse('retryable'))).toBe(true)
  })

  it.each([-1, 0.1, 5001, NaN, Infinity, -Infinity])('rejects invalid/unbounded latency %s', value => {
    expect(() => validatedMockLatency(value)).toThrow(RangeError)
  })

  it('supports explicit zero latency, default 300ms and bounded 5s', () => {
    expect(validatedMockLatency(0)).toBe(0)
    expect(validatedMockLatency()).toBe(300)
    expect(validatedMockLatency(5000)).toBe(5000)
  })

  it('never fabricates a fixture for an unknown route, even if a fault is requested', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    setBusinessMockMode('data')
    expect(await tryMockRead('unrecognized/real/endpoint', {}, { fault:'terminal', latencyMs:0 })).toBeNull()
  })

  it('injects independent retryable and terminal failures for an owned fixture without changing subsequent success', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    setBusinessMockMode('data')
    const retry = await tryMockRead(path, {}, { fault:'retryable', latencyMs:0 })
    expect(retry).toEqual(mockFaultWireResponse('retryable'))
    const terminal = await tryMockRead(path, {}, { fault:'terminal', latencyMs:0 })
    expect(terminal).toEqual(mockFaultWireResponse('terminal'))
    const success = await tryMockRead(path, {}, { latencyMs:0 })
    expect(success).not.toEqual(retry)
    expect(success).not.toEqual(terminal)
    expect(success).toBeTruthy()
  })

  it('Mock OFF and Production never return a fixture or synthetic error', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    setBusinessMockMode('off')
    expect(await tryMockRead(path, {}, { fault:'terminal', latencyMs:0 })).toBeNull()
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    resetBusinessMockCache()
    expect(await tryMockRead(path, {}, { fault:'terminal', latencyMs:0 })).toBeNull()
  })
})
