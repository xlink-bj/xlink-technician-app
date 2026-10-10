import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { tryMockRead } from '@adapters/api/mock/router'
import {
  advanceMockJourney,
  isDevMockJourneyEnabled,
  mockJourneyNodes,
  mockJourneyStage,
  mockJourneyWorkOrderId,
  resetMockJourney,
} from '@adapters/api/mock/journey'

const storage = new Map<string, unknown>()
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

async function readStage() {
  const raw = await tryMockRead(`basic/serviceAppointment/queryById/${mockJourneyWorkOrderId}`)
  const envelope = raw as { data: { serviceAppointment: { _id: string }, workflowNode: { _id: string, state: number }[] } }
  return envelope.data
}

describe('019 DEV-only same-identity review workflow', () => {
  it('keeps one WorkOrder ID and projects previous nodes as completed locally', async () => {
    expect(isDevMockJourneyEnabled()).toBe(true)
    expect(mockJourneyStage()).toBe('appointment')
    let read = await readStage()
    expect(read.serviceAppointment._id).toBe(mockJourneyWorkOrderId)
    expect(read.workflowNode.map((node) => node._id)).toEqual([mockJourneyNodes.appointment])
    expect(advanceMockJourney('survey')).toBeNull()
    expect(advanceMockJourney('appointment')).toBe('survey')
    read = await readStage()
    expect(read.serviceAppointment._id).toBe(mockJourneyWorkOrderId)
    expect(read.workflowNode.map(({ _id, state }) => [_id, state])).toEqual([
      [mockJourneyNodes.appointment, 10],
      [mockJourneyNodes.survey, 0],
    ])
    expect(advanceMockJourney('survey')).toBe('quotation')
    read = await readStage()
    expect(read.workflowNode.map(({ _id, state }) => [_id, state])).toEqual([
      [mockJourneyNodes.appointment, 10],
      [mockJourneyNodes.survey, 10],
      [mockJourneyNodes.quotation, 0],
    ])
    expect(advanceMockJourney('quotation')).toBeNull()
    // Browser route change/reload reads this same local stage, not a real workflow.
    expect(mockJourneyStage()).toBe('quotation')
    const quote = await tryMockRead('__mock/quotation/action-content', {
      workOrderId: mockJourneyWorkOrderId,
      workflowNodeId: mockJourneyNodes.quotation,
    })
    expect(quote).toMatchObject({ data: { workOrderId: mockJourneyWorkOrderId } })
  })

  it('fails closed when the isolated DEV Mock flag or data mode is absent', () => {
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect(isDevMockJourneyEnabled()).toBe(false)
    expect(advanceMockJourney('appointment')).toBeNull()
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
    setBusinessMockMode('off')
    expect(isDevMockJourneyEnabled()).toBe(false)
    expect(advanceMockJourney('appointment')).toBeNull()
  })

  it('does not falsely advance when local storage cannot persist', () => {
    vi.stubGlobal('uni', {
      getStorageSync: () => undefined,
      setStorageSync: () => { throw new Error('storage blocked') },
      removeStorageSync: () => undefined,
    })
    expect(advanceMockJourney('appointment')).toBeNull()
    expect(mockJourneyStage()).toBe('appointment')
  })
})
