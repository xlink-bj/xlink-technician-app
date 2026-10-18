import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIsolatedMockCommandStateStore } from '@adapters/api/mock/command-state'
import { createMockCommandTransitionEngine } from '@adapters/api/mock/command-transitions'
import { mockCommandFailureFor, mockScenarioResponsePlanFor } from '@adapters/api/mock/scenario-policy'
import {
  mockCommandScenarioIds, resetBusinessMockCache, setBusinessMockMode,
  tryMockRead,
} from '@adapters/api/mock'

function fixture() {
  const store = createIsolatedMockCommandStateStore()
  const engine = createMockCommandTransitionEngine({ current: store.current })
  return { store, engine }
}
function detail(state: unknown, id: string): any {
  const rows = state as { detailResponses: Map<string, unknown> }
  return rows.detailResponses.get(id) as any
}

describe('EQ05B independent synthetic command transitions (no HTTP/network)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    resetBusinessMockCache()
  })

  it('accept transition updates only owning instance and restores a clean fixture after reset', () => {
    const a = fixture(), b = fixture()
    const id = mockCommandScenarioIds.acceptDirect
    const before = JSON.stringify(detail(b.store.current(), id))
    a.engine.acceptMockWorkOrder(id)
    expect(JSON.stringify(detail(a.store.current(), id))).not.toBe(before)
    expect(JSON.stringify(detail(b.store.current(), id))).toBe(before)
    const item = detail(a.store.current(), id).data
    expect(item.serviceAppointment.status).toBe('mock-status-appointment-pending')
    expect(item.workflowNode[0].nodeDef.nodeType).toBe('forms')
    a.store.reset()
    expect(JSON.stringify(detail(a.store.current(), id))).toBe(before)
  })

  it('persists appointment form payload only in that scenario and completes the exact existing node', () => {
    const a = fixture(), b = fixture()
    const id = mockCommandScenarioIds.appointmentSuccess
    const formId = a.engine.saveMockAppointment(JSON.stringify({
      _id: 'synthetic-eq05b-appointment', need: 'synthetic-need', datetime: '2030-01-01', note: 'synthetic-note',
    }))
    expect(formId).toBe('synthetic-eq05b-appointment')
    expect(a.store.current().formData.get(formId)).toMatchObject({
      _id: formId, state: 1,
      exts: { need: 'synthetic-need', datetime: '2030-01-01', note: 'synthetic-note' },
    })
    expect(b.store.current().formData.has(formId)).toBe(false)
    a.engine.completeMockAppointment(id, formId)
    expect(JSON.stringify(detail(b.store.current(), id))).not.toContain(formId)
    expect(JSON.stringify(detail(a.store.current(), id))).toContain(formId)
  })

  it('Survey / dynamic form save omits transport metadata and completes only matching form node', () => {
    const a = fixture(), b = fixture()
    const id = mockCommandScenarioIds.surveySuccess
    const definitionId = 'mock-survey-definition'
    const formDataId = a.engine.saveMockDynamicForm(JSON.stringify({
      _id: 'synthetic-eq05b-survey', sid: id,
      smodule: 'serviceAppointment', workflowId: 'mock-workflow-run',
      leakageCause: 'synthetic-cause', state: 1,
    }), definitionId)
    expect(a.store.current().formData.get(formDataId)).toMatchObject({
      _id: formDataId, extId: definitionId,
      exts: { leakageCause: 'synthetic-cause' },
      workflowId: 'mock-workflow-run', workflowRunId: 'mock-workflow-run',
    })
    expect(JSON.stringify(a.store.current().formData.get(formDataId))).not.toContain('smodule')
    expect(b.store.current().formData.has(formDataId)).toBe(false)
    a.engine.completeMockDynamicForm(id, formDataId, definitionId)
    expect(JSON.stringify(detail(b.store.current(), id))).not.toContain(formDataId)
  })

  it('missing and malformed form data fails deterministically without touching any scenario', () => {
    const a = fixture()
    expect(() => a.engine.saveMockAppointment(undefined)).toThrow('Appointment form data is missing')
    expect(() => a.engine.saveMockDynamicForm(null,'synthetic')).toThrow('Dynamic form data is missing')
    expect(() => a.engine.saveMockAppointment('{invalid-json')).toThrow()
    expect(a.store.current().formData.size).toBe(0)
  })

  it('catalog and command failure classifications follow registered intent and no external identity', () => {
    expect(mockCommandFailureFor('accept', mockCommandScenarioIds.acceptRetryable)).toBe('retryable')
    expect(mockCommandFailureFor('accept', mockCommandScenarioIds.acceptTerminal)).toBe('terminal')
    expect(mockCommandFailureFor('appointment', mockCommandScenarioIds.appointmentRetryable)).toBe('retryable')
    expect(mockCommandFailureFor('appointment', mockCommandScenarioIds.appointmentTerminal)).toBe('terminal')
    expect(mockCommandFailureFor('accept', mockCommandScenarioIds.appointmentTerminal)).toBeNull()
    expect(mockCommandFailureFor('appointment', mockCommandScenarioIds.acceptTerminal)).toBeNull()
    expect(mockCommandFailureFor('accept', 'foreign-real-work-order')).toBeNull()
    expect(mockScenarioResponsePlanFor('appointmentRetryable', 0)).toMatchObject({
      outcome: 'retryable', latencyMs: 0, network: 'mock-owned', businessWrites: 'synthetic-only',
    })
    expect(mockScenarioResponsePlanFor('quotationFoundation').latencyMs).toBe(300)
    for (const illegal of [-1, Number.NaN, Number.POSITIVE_INFINITY, 10001]) {
      expect(() => mockScenarioResponsePlanFor('appointmentSuccess', illegal)).toThrow()
    }
  })

  it('read latency can be controlled by a fake clock; response remains synthetic and never authorizes writes', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_MOCK', 'true')
    resetBusinessMockCache()
    setBusinessMockMode('data')
    vi.useFakeTimers()
    const path = 'basic/serviceAppointment/queryById/'+mockCommandScenarioIds.appointmentSuccess
    const pending = tryMockRead(path, {}, { latencyMs: mockScenarioResponsePlanFor('appointmentSuccess', 120).latencyMs })
    let settled = false
    void pending.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(119)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const result = await pending
    expect(result).not.toBeNull()
    expect(JSON.stringify(result)).toContain(mockCommandScenarioIds.appointmentSuccess)
  })
})
