import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { resetMockCommandState } from '@adapters/api/mock/command-state'
import {
  mockJourneyNodes, mockJourneyOfficialOrderId, mockJourneyOrderWorkflowDefinitionId,
  mockJourneyWorkOrderId, resetMockJourney,
} from '@adapters/api/mock/journey'
import { mockQuotationCatalogServiceType, mockQuotationCatalogSourceType } from '@adapters/api/mock/quotation-catalog'
import { tryMockCommand, tryMockRead } from '@adapters/api/mock/router'
import { isMockOwnedCommand } from '@adapters/api/mock/ownership'
import { ApiCommandTransportError } from '@adapters/api/technician-api-commands'
import { createQuotationOrderCommandAdapter } from '@adapters/api/quotation-order-commands'
import { QuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import { submitQuotationOrder, restoreQuotationOrderSubmissionState } from '@features/work-orders/quotation/order-submission'
import type { R1OfficialOrderType1Payload } from '@features/work-orders/quotation/order-encoder'
import { reachMockQuotationForTest } from '../g4ux/mock-journey-test-fixture'
import type { StoragePort, StorageKey } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const local = new Map<string, unknown>()
beforeEach(() => {
  local.clear()
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => local.get(key),
    setStorageSync: (key: string, value: unknown) => { local.set(key, value) },
    removeStorageSync: (key: string) => { local.delete(key) },
  })
  resetBusinessMockCache()
  setBusinessMockMode('data')
  resetMockCommandState()
  resetMockJourney()
})
afterEach(() => {
  resetMockCommandState()
  resetBusinessMockCache()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const workOrderId = asOpaqueId<'WorkOrderId'>(mockJourneyWorkOrderId)
const payload: R1OfficialOrderType1Payload = {
  type: 1, serviceAppointmentId: mockJourneyWorkOrderId, productIds: '[]',
  bjProducts: JSON.stringify({ orderList: [{
    repairParts: ['repair-part-code-001'], partDescription: '合成平屋顶修缮',
    projPackages: { data: [] }, procedures: { data: [] },
    materials: { data: [] }, measures: { data: [] },
  }] }),
  originPrice: 100, totalPrice: 100, discount: 1, otherAmount: 0, preferentialAmount: 0,
  exts: { serviceType: mockQuotationCatalogServiceType, sourceType: mockQuotationCatalogSourceType,
    coupons: '', couponsVal: 0, couponsName: '', isCreateBjdPDF: '1' },
}

function syntheticPorts() {
  const execute = vi.fn(async (request: { path: string; body?: Readonly<Record<string, unknown>> }) => {
    const raw = await tryMockCommand(request.path, request.body ?? {})
    if (raw === null && isMockOwnedCommand(request.path, request.body ?? {})) {
      throw new ApiCommandTransportError('Synthetic command is disabled', 'server_terminal')
    }
    if (raw === null) throw new Error('Synthetic command not owned')
    return raw
  })
  const reads = vi.fn(async (request: { path: string; body?: Readonly<Record<string, unknown>> }) => {
    const raw = await tryMockRead(request.path, request.body ?? {}, { latencyMs: 0 })
    if (raw === null) throw new Error('Synthetic read not owned')
    return raw
  })
  const values = new Map<string, unknown>()
  const key = (item: StorageKey) => `${item.namespace}:${item.key}`
  const storage: StoragePort = {
    read: async <T>(item: StorageKey) => ({ state: 'succeeded', data: (values.get(key(item)) as T | undefined) ?? null }),
    write: async <T>(item: StorageKey, value: T) => {
      values.set(key(item), value)
      return { state: 'succeeded', data: undefined }
    },
    remove: async (item: StorageKey) => { values.delete(key(item)); return { state: 'succeeded', data: undefined } },
    listKeys: async () => ({ state: 'succeeded', data: [] }),
  }
  return {
    execute,
    command: createQuotationOrderCommandAdapter({ execute }),
    readApi: new QuotationOrderReadAdapter({ execute: reads }),
    storage,
  }
}

function submission(ports: ReturnType<typeof syntheticPorts>) {
  return {
    userId: asOpaqueId<'UserId'>('synthetic-user'),
    authorizationIdentityKey: 'synthetic-user:synthetic-role:mock-019',
    authorizationCurrent: () => true,
    workOrderId,
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(mockJourneyNodes.quotation),
    workflowDefinitionId: asOpaqueId<'WorkflowDefinitionId'>(mockJourneyOrderWorkflowDefinitionId),
    expectedDraftVersion: 1, evaluatedDraftVersion: 1, engineReady: true,
    payload, command: ports.command, readApi: ports.readApi, storage: ports.storage,
    finalizeDraft: vi.fn(async () => ({ state: 'succeeded' as const, data: undefined })),
  }
}

describe('A DEV Mock R1 Order subflow / upsert / authoritative readback', () => {
  it('uses the real command and read adapters, then persists one synthetic type=1 Order across restart', async () => {
    const ports = syntheticPorts()
    expect(await ports.command.startOrderWorkflow({ workOrderId,
      workflowDefinitionId: asOpaqueId<'WorkflowDefinitionId'>(mockJourneyOrderWorkflowDefinitionId) }))
      .toMatchObject({ state: 'failed_terminal' })
    await reachMockQuotationForTest()
    const ctx = submission(ports)
    const result = await submitQuotationOrder(ctx)
    expect(result).toMatchObject({ state: 'succeeded', order: {
      id: mockJourneyOfficialOrderId, type: 1, serviceAppointmentId: mockJourneyWorkOrderId,
      totalPrice: 100,
    } })
    expect(ctx.finalizeDraft).toHaveBeenCalledTimes(1)
    expect(ports.execute.mock.calls.map(([request]) => request.path)).toEqual([
      `workflow/startWorkflow/order/null/${mockJourneyOrderWorkflowDefinitionId}`,
      `workflow/startWorkflow/order/null/${mockJourneyOrderWorkflowDefinitionId}`,
      'basic/order/upsert',
    ])
    resetMockCommandState()
    expect((await ports.readApi.getQuotationOrderById(mockJourneyOfficialOrderId)).state).toBe('succeeded')
    const scoped = await tryMockRead('basic/order/query', {
      'is:serviceAppointmentId|string#and': mockJourneyWorkOrderId,
      'is:type|integer#and': 1, page: 1, rows: 3,
    }, { latencyMs: 0 })
    expect(scoped).toMatchObject({ total: 1, data: [{ _id: mockJourneyOfficialOrderId }] })
    expect((await submitQuotationOrder(ctx)).state).toBe('succeeded')
    expect(ports.execute).toHaveBeenCalledTimes(3)
    expect(await tryMockRead('basic/contract/query.do', {
      'is:serviceAppointmentId|string#and': mockJourneyWorkOrderId,
    }, { latencyMs: 0 })).toBeNull() // No synthetic signing side effect.
  })

  it('refuses wrong child definition, no workflow start, forged Order identity and duplicate upsert', async () => {
    await reachMockQuotationForTest()
    const ports = syntheticPorts()
    expect(await ports.command.startOrderWorkflow({ workOrderId,
      workflowDefinitionId: asOpaqueId<'WorkflowDefinitionId'>('mock-wrong-definition') }))
      .toMatchObject({ state: 'failed_terminal' })
    expect(await ports.command.upsertOfficialOrder({ order: { ...payload,
      workflowId: 'mock-workflow-run-019-order' } })).toMatchObject({ state: 'failed_terminal' })
    const ctx = submission(ports)
    expect((await submitQuotationOrder(ctx)).state).toBe('succeeded')
    expect(await ports.command.upsertOfficialOrder({ order: { ...payload,
      workflowId: 'mock-workflow-run-019-order' } })).toMatchObject({ state: 'failed_terminal' })
    expect(await ports.command.upsertOfficialOrder({ order: { ...payload,
      serviceAppointmentId: 'mock-work-order-999-foreign', workflowId: 'mock-workflow-run-019-order',
    } })).toMatchObject({ state: 'failed_terminal' })
  })

  it('preserves uncertain Order ACK and prevents submission replay even if Mock persistence succeeded', async () => {
    await reachMockQuotationForTest()
    const ports = syntheticPorts()
    const ctx = submission(ports)
    const real = ports.command.upsertOfficialOrder.bind(ports.command)
    ctx.command.upsertOfficialOrder = async (input) => {
      await real(input)
      return { state: 'failed_retryable' as const } // Simulated lost ACK after persistence.
    }
    expect((await submitQuotationOrder(ctx)).state).toBe('failed_ambiguous_after_dispatch')
    expect((await restoreQuotationOrderSubmissionState(ctx)).state).toBe('failed_ambiguous_after_dispatch')
    expect((await submitQuotationOrder(ctx)).state).toBe('failed_ambiguous_after_dispatch')
    expect((await ports.readApi.getQuotationOrderById(mockJourneyOfficialOrderId)).state).toBe('succeeded')
  })

  it('fails closed on tampered child Workflow state, storage failure and disabled DEV isolation', async () => {
    await reachMockQuotationForTest()
    const ports = syntheticPorts()
    const workflowKey = [...local.keys()].find((key) => key.includes('order-workflow.v1'))
    expect(workflowKey).toBeUndefined()
    const definitionId = asOpaqueId<'WorkflowDefinitionId'>(mockJourneyOrderWorkflowDefinitionId)
    const started = await ports.command.startOrderWorkflow({ workOrderId, workflowDefinitionId: definitionId })
    expect(started.state).toBe('succeeded')
    const key = [...local.keys()].find((candidate) => candidate.includes('order-workflow.v1'))!
    local.set(key, 'malformed-existing-workflow')
    expect((await ports.command.startOrderWorkflow({ workOrderId, workflowDefinitionId: definitionId })).state)
      .toBe('failed_terminal')
    expect((await ports.command.upsertOfficialOrder({ order: { ...payload,
      workflowId: 'mock-workflow-run-019-order',
    } })).state).toBe('failed_terminal')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect(isMockOwnedCommand('workflow/startWorkflow/order/null/' + mockJourneyOrderWorkflowDefinitionId,
      { saId: mockJourneyWorkOrderId })).toBe(true)
    expect((await ports.command.startOrderWorkflow({ workOrderId, workflowDefinitionId: definitionId })).state)
      .toBe('failed_terminal')
  })
})
