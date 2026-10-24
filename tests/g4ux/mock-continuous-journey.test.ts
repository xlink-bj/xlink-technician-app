import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { tryMockCommand, tryMockRead } from '@adapters/api/mock/router'
import { resetMockCommandState } from '@adapters/api/mock/command-state'
import { appointmentFormDefinitionWireId } from '@adapters/api/appointment-contract'
import { mockSurveyFormDefinitionId } from '@adapters/api/mock/survey-contract'
import {
  advanceMockJourneyAfterProcess,
  isDevMockJourneyEnabled,
  mockJourneyNodes,
  mockJourneyStage,
  mockJourneyWorkOrderId,
  mockJourneyWorkflowRunId,
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
  resetMockCommandState()
  resetMockJourney()
})
afterEach(() => {
  resetMockCommandState()
  resetBusinessMockCache()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function readStage() {
  const raw = await tryMockRead(`basic/serviceAppointment/queryById/${mockJourneyWorkOrderId}`)
  const envelope = raw as { data: { serviceAppointment: { _id: string }, workflowNode: { _id: string, state: number }[] } }
  return envelope.data
}

async function processSavedStage(stage: 'appointment' | 'survey'): Promise<unknown> {
  const definitionId = stage === 'appointment' ? appointmentFormDefinitionWireId : mockSurveyFormDefinitionId
  const workflowNodeId = mockJourneyNodes[stage]
  const saved = await tryMockCommand(`biz/extForm/upsert/${definitionId}`, {
    dataStr: JSON.stringify({
      sid: mockJourneyWorkOrderId, smodule: 'serviceAppointment', nodeId: workflowNodeId,
      workflowId: mockJourneyWorkflowRunId, state: 1,
      ...(stage === 'appointment' ? { note: '模拟预约' } : { squareMeter: '18.5' }),
    }),
  }) as { data: { _id: string } }
  expect(saved.data._id).toMatch(/^mock-form-data-/)
  return tryMockCommand('workflow/process', {
    sid: mockJourneyWorkOrderId, smodule: 'serviceAppointment', workflowNodeId,
    nodeFormDefId: definitionId, nodeFormDataId: saved.data._id,
  })
}

describe('019 DEV-only same-identity review workflow', () => {
  it('keeps one WorkOrder ID and projects previous nodes only after saved FormData and Process', async () => {
    expect(isDevMockJourneyEnabled()).toBe(true)
    expect(mockJourneyStage()).toBe('appointment')
    let read = await readStage()
    expect(read.serviceAppointment._id).toBe(mockJourneyWorkOrderId)
    expect(read.workflowNode.map((node) => node._id)).toEqual([mockJourneyNodes.appointment])
    expect(advanceMockJourneyAfterProcess('survey', 'mock-foreign-data')).toBeNull()
    expect(advanceMockJourneyAfterProcess('appointment', 'mock-foreign-data')).toBeNull()
    expect(await processSavedStage('appointment')).toMatchObject({ success: true })
    read = await readStage()
    expect(read.serviceAppointment._id).toBe(mockJourneyWorkOrderId)
    expect(read.workflowNode.map(({ _id, state }) => [_id, state])).toEqual([
      [mockJourneyNodes.appointment, 10],
      [mockJourneyNodes.survey, 0],
    ])
    expect(await processSavedStage('survey')).toMatchObject({ success: true })
    read = await readStage()
    expect(read.workflowNode.map(({ _id, state }) => [_id, state])).toEqual([
      [mockJourneyNodes.appointment, 10],
      [mockJourneyNodes.survey, 10],
      [mockJourneyNodes.quotation, 0],
    ])
    expect(advanceMockJourneyAfterProcess('survey', 'mock-foreign-data')).toBeNull()
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
    expect(advanceMockJourneyAfterProcess('appointment', 'mock-foreign-data')).toBeNull()
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
    setBusinessMockMode('off')
    expect(isDevMockJourneyEnabled()).toBe(false)
    expect(advanceMockJourneyAfterProcess('appointment', 'mock-foreign-data')).toBeNull()
  })

  it('does not falsely advance when local storage cannot persist', () => {
    vi.stubGlobal('uni', {
      getStorageSync: () => undefined,
      setStorageSync: () => { throw new Error('storage blocked') },
      removeStorageSync: () => undefined,
    })
    expect(advanceMockJourneyAfterProcess('appointment', 'mock-foreign-data')).toBeNull()
    expect(mockJourneyStage()).toBe('appointment')
  })
})
