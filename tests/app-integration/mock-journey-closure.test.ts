import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { mockJourneyNodes, mockJourneyStage, mockJourneyWorkOrderId, resetMockJourney } from '@adapters/api/mock/journey'
import { mockCommandState, resetMockCommandState } from '@adapters/api/mock/command-state'
import { tryMockCommand, tryMockRead } from '@adapters/api/mock/router'
import { appointmentFormDefinitionWireId } from '@adapters/api/appointment-contract'
import { mockSurveyFormDefinitionId } from '@adapters/api/mock/fixtures'
import { advanceMockJourneyWithSavedDraft as advanceWithGuard, hasLocalJourneyEvidence } from '@app/mock-journey-closure'
import type { ReadPriorDraft } from '@app/mock-journey-context'
import { asOpaqueId } from '@shared/types'

const stored = new Map<string, unknown>()
beforeEach(() => {
  stored.clear()
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => stored.get(key),
    setStorageSync: (key: string, value: unknown) => { stored.set(key, value) },
    removeStorageSync: (key: string) => { stored.delete(key) },
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

function saved(values: Readonly<Record<string, unknown>>, overrides?: {
  readonly status?: 'completed' | 'unfinished'
  readonly nodeId?: string
}): ReadPriorDraft {
  return async (identity) => ({ state: 'succeeded', data: {
    version: 1,
    identity: {
      ...identity, version: 1,
      userId: asOpaqueId<'UserId'>('synthetic-user'),
      ...(overrides?.nodeId ? { workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(overrides.nodeId) } : {}),
    },
    status: overrides?.status ?? 'unfinished',
    updatedAt: '2026-10-24T00:00:00Z', values,
  } })
}

const advanceMockJourneyWithSavedDraft = (
  stage: Parameters<typeof advanceWithGuard>[0],
  read: Parameters<typeof advanceWithGuard>[1],
  authorizationCurrent: () => boolean = () => true,
) => advanceWithGuard(stage, read, authorizationCurrent)

describe('DEV Mock saved-form → workflow projection handoff', () => {
  it('requires known, nonempty local field evidence', () => {
    expect(hasLocalJourneyEvidence('appointment', { unknown: 'fake' })).toBe(false)
    expect(hasLocalJourneyEvidence('appointment', { note: '   ' })).toBe(false)
    expect(hasLocalJourneyEvidence('appointment', { need: '0' })).toBe(true)
    expect(hasLocalJourneyEvidence('survey', { squareMeter: 0 })).toBe(true)
    expect(hasLocalJourneyEvidence('survey', { part: [] })).toBe(false)
    expect(hasLocalJourneyEvidence('survey', { part: ['roof'] })).toBe(true)
  })

  it('does not advance from empty, completed, malformed-identity or missing local drafts', async () => {
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({}))).state).toBe('blocked')
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({ note: '现场核验' }, { status: 'completed' }))).state).toBe('blocked')
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({ note: '现场核验' }, { nodeId: 'foreign-node' }))).state).toBe('blocked')
    expect(mockJourneyStage()).toBe('appointment')
    expect(await advanceMockJourneyWithSavedDraft('appointment', async () => ({ state: 'succeeded', data: null })))
      .toEqual({ state: 'blocked', reason: 'missing_draft' })
  })

  it('advances only after exact saved draft readback, preserving synthetic node progression', async () => {
    expect(await advanceMockJourneyWithSavedDraft('appointment', saved({ note: '平屋顶渗漏' })))
      .toEqual({ state: 'advanced', next: 'survey' })
    expect(mockJourneyStage()).toBe('survey')
    const appointment = [...mockCommandState().formData.values()] as Record<string, unknown>[]
    expect(appointment).toHaveLength(1)
    expect(appointment[0]).toMatchObject({
      sid: mockJourneyWorkOrderId, nodeId: mockJourneyNodes.appointment,
      extId: appointmentFormDefinitionWireId, state: 1, exts: { note: '平屋顶渗漏' },
    })
    const afterAppointment = await tryMockRead(`basic/serviceAppointment/queryById/${mockJourneyWorkOrderId}`,
      {}, { latencyMs: 0 }) as { data: { workflowNode: { _id: string; state: number }[] } }
    expect(afterAppointment.data.workflowNode).toMatchObject([
      { _id: mockJourneyNodes.appointment, state: 10, formDataId: appointment[0]._id },
      { _id: mockJourneyNodes.survey, state: 0 },
    ])
    expect(await advanceMockJourneyWithSavedDraft('survey', saved({ squareMeter: '18.5' })))
      .toEqual({ state: 'advanced', next: 'quotation' })
    expect(mockJourneyStage()).toBe('quotation')
    const records = [...mockCommandState().formData.values()] as Record<string, unknown>[]
    expect(records).toHaveLength(2)
    expect(records[1]).toMatchObject({
      sid: mockJourneyWorkOrderId, nodeId: mockJourneyNodes.survey,
      extId: mockSurveyFormDefinitionId, state: 1, exts: { squareMeter: '18.5' },
    })
    const afterSurvey = await tryMockRead(`basic/serviceAppointment/queryById/${mockJourneyWorkOrderId}`,
      {}, { latencyMs: 0 }) as { data: { workflowNode: { _id: string; state: number; formDataId?: string }[] } }
    expect(afterSurvey.data.workflowNode).toMatchObject([
      { _id: mockJourneyNodes.appointment, state: 10, formDataId: records[0]._id },
      { _id: mockJourneyNodes.survey, state: 10, formDataId: records[1]._id },
      { _id: mockJourneyNodes.quotation, state: 0 },
    ])
    expect((await advanceMockJourneyWithSavedDraft('survey', saved({ squareMeter: '18.5' }))).state).toBe('blocked')
  })

  it('rehydrates exact saved FormData after a Mock router restart without replaying Workflow', async () => {
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({ note: '预约留存' }))).state).toBe('advanced')
    const [savedAppointment] = [...mockCommandState().formData.values()] as Record<string, unknown>[]
    resetMockCommandState() // Simulate a fresh router instance / H5 refresh.
    expect(mockCommandState().formData.size).toBe(0)
    const readback = await tryMockRead(`biz/extForm/query/${appointmentFormDefinitionWireId}`,
      { 'is:_id|string#and': savedAppointment._id }, { latencyMs: 0 }) as { data: unknown[] }
    expect(readback.data).toMatchObject([savedAppointment])
    expect(mockJourneyStage()).toBe('survey')
    const detail = await tryMockRead(`basic/serviceAppointment/queryById/${mockJourneyWorkOrderId}`,
      {}, { latencyMs: 0 }) as { data: { workflowNode: Record<string, unknown>[] } }
    expect(detail.data.workflowNode[0]).toMatchObject({ state: 10, formDataId: savedAppointment._id })
    expect((await advanceMockJourneyWithSavedDraft('survey', saved({ squareMeter: 24 }))).state).toBe('advanced')
    resetMockCommandState()
    const quotationDetail = await tryMockRead(`basic/serviceAppointment/queryById/${mockJourneyWorkOrderId}`,
      {}, { latencyMs: 0 }) as { data: { workflowNode: Record<string, unknown>[] } }
    expect(quotationDetail.data.workflowNode.map(({ state }) => state)).toEqual([10, 10, 0])
    expect(quotationDetail.data.workflowNode[1]).toHaveProperty('formDataId')
  })

  it('rejects Process without matching saved FormData, wrong node and cross-stage replay', async () => {
    const command = (workflowNodeId: string, nodeFormDataId: string) => tryMockCommand('workflow/process', {
      sid: mockJourneyWorkOrderId, smodule: 'serviceAppointment', workflowNodeId,
      nodeFormDefId: appointmentFormDefinitionWireId, nodeFormDataId,
    })
    expect(await command(mockJourneyNodes.appointment, 'mock-foreign-form-id'))
      .toMatchObject({ success: false, code: 'TERMINAL' })
    expect(await command(mockJourneyNodes.survey, 'mock-foreign-form-id'))
      .toMatchObject({ success: false, code: 'TERMINAL' })
    expect(mockJourneyStage()).toBe('appointment')
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({ note: '已留存' }))).state).toBe('advanced')
    const [savedAppointment] = [...mockCommandState().formData.values()] as Record<string, unknown>[]
    expect(await command(mockJourneyNodes.appointment, String(savedAppointment._id)))
      .toMatchObject({ success: false, code: 'TERMINAL' })
    expect(mockJourneyStage()).toBe('survey')
    expect(await tryMockCommand('workflow/process', {
      sid: mockJourneyWorkOrderId, smodule: 'serviceAppointment',
      workflowNodeId: mockJourneyNodes.survey, nodeFormDefId: mockSurveyFormDefinitionId,
      nodeFormDataId: savedAppointment._id,
    })).toMatchObject({ success: false, code: 'TERMINAL' })
  })

  it('rechecks actor scope after FormData dispatch and does not complete Workflow after revocation', async () => {
    let checks = 0
    const stillAuthorized = () => ++checks < 5
    expect(await advanceMockJourneyWithSavedDraft('appointment', saved({ note: '留痕不可跳过' }), stillAuthorized))
      .toEqual({ state: 'blocked', reason: 'protocol_failed' })
    expect(mockJourneyStage()).toBe('appointment')
    const records = [...mockCommandState().formData.values()] as Record<string, unknown>[]
    expect(records).toHaveLength(1) // Save may already have happened; never pretend rollback.
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({ note: '留痕不可跳过' }))).state)
      .toBe('advanced')
    expect(mockCommandState().formData.size).toBe(1) // Retry reuses the persisted FormData identity.
  })

  it('fails closed on read error, scope flip, disabled DEV flag and local persistence failure', async () => {
    expect(await advanceMockJourneyWithSavedDraft('appointment', async () => ({ state: 'failed_terminal' })))
      .toEqual({ state: 'blocked', reason: 'read_failed' })
    expect(await advanceMockJourneyWithSavedDraft('appointment', async () => {
      setBusinessMockMode('off')
      return saved({ note: 'draft' })({
        workOrderId: asOpaqueId<'WorkOrderId'>('mock-work-order-019-continuous-journey'),
        workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-019-appointment'),
        actionIntent: 'set_appointment', contentKind: 'dynamic_form',
        contentIdentity: 'mock-appointment',
      })
    })).toEqual({ state: 'blocked', reason: 'scope' })
    setBusinessMockMode('data')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect((await advanceMockJourneyWithSavedDraft('appointment', saved({ note: 'draft' }))).state).toBe('blocked')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
    vi.stubGlobal('uni', {
      getStorageSync: () => null,
      setStorageSync: () => { throw new Error('no storage') },
      removeStorageSync: () => {},
    })
    expect(await advanceMockJourneyWithSavedDraft('appointment', saved({ note: 'draft' })))
      .toEqual({ state: 'blocked', reason: 'protocol_failed' })
  })
})
