import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockCommandScenarioIds, resetBusinessMockCache, resetMockCommandState,
  setBusinessMockMode, tryMockCommand, tryMockRead,
} from '@adapters/api/mock'
import { mockCommandState } from '@adapters/api/mock/command-state'
import { appointmentFormDefinitionWireId } from '@adapters/api/appointment-contract'
import { mockSurveyFormDefinitionId } from '@adapters/api/mock/fixtures'
import { mockJourneyWorkOrderId, mockJourneyNodes } from '@adapters/api/mock/journey'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { asOpaqueId } from '@shared/types'

const appointmentId = mockCommandScenarioIds.appointmentSuccess
const appointmentNode = 'mock-workflow-node-016-appointment'
const surveyId = mockCommandScenarioIds.surveySuccess
const surveyNode = 'mock-workflow-node-017-inspection'

function upsert(definitionId: string, workOrderId: string, nodeId: string, extras: Record<string, unknown> = {}) {
  return tryMockCommand(`biz/extForm/upsert/${definitionId}`, {
    dataStr: JSON.stringify({ sid: workOrderId, nodeId, smodule: 'serviceAppointment', state: 1, ...extras }),
  })
}

function process(definitionId: string, workOrderId: string, nodeId: string, dataId: string) {
  return tryMockCommand('workflow/process', {
    sid: workOrderId, workflowNodeId: nodeId, smodule: 'serviceAppointment',
    nodeFormDefId: definitionId, nodeFormDataId: dataId,
  })
}

async function nodeState(workOrderId: string): Promise<number | undefined> {
  const raw = await tryMockRead(`basic/serviceAppointment/queryById/${workOrderId}`, {}, { latencyMs: 0 })
  const data = (raw as { data: { workflowNode: { state: number }[] } })?.data
  return data?.workflowNode[0]?.state
}

describe('ABC A: R1-shaped Mock FormData → Workflow readback, never a real write', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_MOCK', 'true')
    resetBusinessMockCache()
    setBusinessMockMode('data')
    resetMockCommandState()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetBusinessMockCache()
    resetMockCommandState()
  })

  it('denies process before FormData, wrong source IDs, and then completes exactly once after a scoped save', async () => {
    expect(await nodeState(appointmentId)).toBe(0)
    expect(await process(appointmentFormDefinitionWireId, appointmentId, appointmentNode, 'mock-unknown-data'))
      .toMatchObject({ success: false })
    expect(await upsert(appointmentFormDefinitionWireId, appointmentId, 'mock-wrong-node'))
      .toMatchObject({ success: false })
    expect(mockCommandState().formData.size).toBe(0)
    const saved = await upsert(appointmentFormDefinitionWireId, appointmentId, appointmentNode, {
      need: '1', datetime: '2026-10-25 14:00', note: '合成预约',
    }) as { data: { _id: string } }
    expect(saved.data._id).toMatch(/^mock-/)
    expect(await upsert(appointmentFormDefinitionWireId, appointmentId, appointmentNode, {
      _id: saved.data._id, need: '1', datetime: '2026-10-25 15:00', note: '已修改预约',
    })).toMatchObject({ data: { _id: saved.data._id } })
    const read = await tryMockRead(`biz/extForm/query/${appointmentFormDefinitionWireId}`,
      { 'is:_id|string#and': saved.data._id }, { latencyMs: 0 })
    expect(read).toMatchObject({ total: 1, data: [{
      _id: saved.data._id, sid: appointmentId, nodeId: appointmentNode,
      exts: { datetime: '2026-10-25 15:00', note: '已修改预约' },
    }] })
    expect(await process(appointmentFormDefinitionWireId, appointmentId, 'mock-wrong-node', saved.data._id))
      .toMatchObject({ success: false })
    expect(await nodeState(appointmentId)).toBe(0)
    expect(await process(appointmentFormDefinitionWireId, appointmentId, appointmentNode, saved.data._id))
      .toMatchObject({ success: true })
    expect(await nodeState(appointmentId)).toBe(10)
    expect(await process(appointmentFormDefinitionWireId, appointmentId, appointmentNode, saved.data._id))
      .toMatchObject({ success: false })
  })

  it('separates survey and appointment identities, rejects cross-workorder reuse and wrong-definition reads', async () => {
    const survey = await upsert(mockSurveyFormDefinitionId, surveyId, surveyNode, {
      squareMeter: 16, leakageCause: 'synthetic',
    }) as { data: { _id: string } }
    const dataId = survey.data._id
    expect(await upsert(appointmentFormDefinitionWireId, appointmentId, appointmentNode, {
      _id: dataId, datetime: '2026-10-25 15:00', need: '1',
    })).toMatchObject({ success: false })
    expect(await process(appointmentFormDefinitionWireId, appointmentId, appointmentNode, dataId))
      .toMatchObject({ success: false })
    expect(await tryMockRead(`biz/extForm/query/${appointmentFormDefinitionWireId}`,
      { 'is:_id|string#and': dataId }, { latencyMs: 0 })).toMatchObject({ data: [], total: 0 })
    expect(await process(mockSurveyFormDefinitionId, surveyId, surveyNode, dataId))
      .toMatchObject({ success: true })
    expect(await nodeState(surveyId)).toBe(10)
  })

  it('does not let the local-only 019 walkthrough become a backend-shaped Workflow success', async () => {
    const attempt = await upsert(appointmentFormDefinitionWireId, mockJourneyWorkOrderId, mockJourneyNodes.appointment,
      { need: '1', datetime: '2026-10-25 10:00' })
    expect(attempt).toMatchObject({ success: false })
    expect(await process(appointmentFormDefinitionWireId, mockJourneyWorkOrderId,
      mockJourneyNodes.appointment, 'mock-data-019')).toMatchObject({ success: false })
    expect(mockCommandState().formData.size).toBe(0)
    expect(await nodeState(mockJourneyWorkOrderId)).toBe(0)
  })

  it('rejects malformed upserts without mutating fixtures and never enables Mock in Production', async () => {
    expect(await tryMockCommand(`biz/extForm/upsert/${appointmentFormDefinitionWireId}`,
      { dataStr: '{broken' })).toMatchObject({ success: false })
    expect(mockCommandState().formData.size).toBe(0)
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    resetBusinessMockCache()
    expect(await upsert(appointmentFormDefinitionWireId, appointmentId, appointmentNode)).toBeNull()
    expect(await process(appointmentFormDefinitionWireId, appointmentId, appointmentNode, 'mock-data')).toBeNull()
  })

  it('refuses forged workflow run or module metadata before creating synthetic FormData', async () => {
    expect(await upsert(appointmentFormDefinitionWireId, appointmentId, appointmentNode,
      { _id: 'mock-unowned-record', need: '1' })).toMatchObject({ success: false })
    expect(await upsert(appointmentFormDefinitionWireId, appointmentId, appointmentNode,
      { workflowId: 'mock-other-workflow', need: '1' })).toMatchObject({ success: false })
    expect(await upsert(appointmentFormDefinitionWireId, appointmentId, appointmentNode,
      { smodule: 'other-module', need: '1' })).toMatchObject({ success: false })
    expect(await upsert(appointmentFormDefinitionWireId, appointmentId, appointmentNode,
      { state: -1, need: '1' })).toMatchObject({ success: false })
    expect(mockCommandState().formData.size).toBe(0)
  })

  it('executes the adapter-shaped synthetic save/process without ever calling HTTP', async () => {
    const network = vi.fn(() => { throw new Error('Network must not be used') })
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'),
      request: network,
      blockRealRequests: true,
    })
    const saved = await transport.execute({ method: 'POST',
      path: `biz/extForm/upsert/${appointmentFormDefinitionWireId}`,
      body: { dataStr: JSON.stringify({ sid: appointmentId, nodeId: appointmentNode,
        smodule: 'serviceAppointment', workflowId: 'mock-workflow-run-016',
        state: 1, need: '1', datetime: '2026-10-25 10:00' }) },
    }) as { data: { _id: string } }
    await transport.execute({ method: 'POST', path: 'workflow/process', body: {
      sid: appointmentId, workflowNodeId: appointmentNode, smodule: 'serviceAppointment',
      nodeFormDefId: appointmentFormDefinitionWireId, nodeFormDataId: saved.data._id,
    } })
    expect(await nodeState(appointmentId)).toBe(10)
    expect(network).not.toHaveBeenCalled()
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    resetBusinessMockCache()
    const production = createUniApiCommandTransport({
      apiBaseUrl: 'https://xlink.fsgo365.cn',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'),
      request: network,
    })
    await expect(production.execute({ method: 'POST', path: 'workflow/process', body: {
      sid: appointmentId, workflowNodeId: appointmentNode,
    } })).rejects.toMatchObject({ category: 'server_terminal' })
    await expect(production.execute({ method: 'POST', path: 'workflow/process', body: {
      sid: 'non-synthetic-work-order', workflowNodeId: 'non-synthetic-node',
    } })).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(network).not.toHaveBeenCalled()
  })
})
