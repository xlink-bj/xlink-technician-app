import { describe, expect, it, vi } from 'vitest'

import type { QuotationOrderCommandPort, QuotationOrderRead, QuotationOrderReadPort } from '@shared/ports'
import type { StoragePort, StorageKey } from '@shared/ports'
import { asOpaqueId, createOperationError, type OperationSnapshot } from '@shared/types'
import type { R1OfficialOrderType1Payload } from '@features/work-orders/quotation/order-encoder'
import {
  retryQuotationOrderReadback,
  restoreQuotationOrderSubmissionState,
  submitQuotationOrder,
  type QuotationOrderSubmissionInput,
} from '@features/work-orders/quotation/order-submission'

const orderId = 'order-synthetic-1'
const workOrderId = asOpaqueId<'WorkOrderId'>('work-order-synthetic')
const nodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('node-synthetic')
const workflowDefinitionId = asOpaqueId<'WorkflowDefinitionId'>('child-workflow-synthetic')
const payload: R1OfficialOrderType1Payload = {
  type: 1,
  serviceAppointmentId: workOrderId,
  productIds: '[]',
  bjProducts: JSON.stringify({ orderList: [] }),
  originPrice: 10,
  totalPrice: 10,
  discount: 1,
  otherAmount: 0,
  preferentialAmount: 0,
  exts: {
    serviceType: 'service-synthetic',
    coupons: '',
    couponsVal: 0,
    couponsName: '',
    isCreateBjdPDF: '1',
  },
}

function success<T>(data: T): OperationSnapshot<T> { return { state: 'succeeded', data } }
function fail<T>(category: 'network_retryable' | 'server_terminal' = 'network_retryable'): OperationSnapshot<T> {
  return { state: 'failed_retryable', error: createOperationError(category, 'sanitized test failure') }
}

function memoryStorage() {
  const values = new Map<string, unknown>()
  const keyOf = (key: StorageKey) => `${key.namespace}:${key.key}`
  const port: StoragePort = {
    read: async <T>(key: StorageKey): Promise<OperationSnapshot<T | null>> => success((values.get(keyOf(key)) as T | undefined) ?? null),
    write: vi.fn(async <T>(key: StorageKey, value: T) => { values.set(keyOf(key), value); return success(undefined) }),
    remove: vi.fn(async (key: StorageKey) => { values.delete(keyOf(key)); return success(undefined) }),
    listKeys: vi.fn(async () => success([])),
  }
  return { port, values }
}

function authoritativeOrder(overrides: Partial<QuotationOrderRead> = {}): QuotationOrderRead {
  return {
    id: orderId,
    type: 1,
    serviceAppointmentId: workOrderId,
    state: 1,
    processState: 0,
    discount: 1,
    preferentialAmount: 0,
    coupons: '',
    bjProducts: { orderList: [], addItems: { data: [] }, deleteItems: { data: [] } },
    replaceSnapshot: {
      _id: orderId,
      type: 1,
      serviceAppointmentId: workOrderId,
      productIds: '[]',
      exts: {},
    },
    ...overrides,
  }
}

let setupCounter = 0

function setup(options: {
  readonly upsert?: QuotationOrderCommandPort['upsertOfficialOrder']
  readonly read?: QuotationOrderReadPort['getQuotationOrderById']
  readonly start?: QuotationOrderCommandPort['startOrderWorkflow']
  readonly finalize?: () => Promise<OperationSnapshot<void>>
} = {}) {
  const storage = memoryStorage()
  const command: QuotationOrderCommandPort = {
    startOrderWorkflow: options.start ?? vi.fn(async () => success('workflow-synthetic')),
    upsertOfficialOrder: options.upsert ?? vi.fn(async () => success(orderId)),
  }
  const read = options.read ?? vi.fn(async () => success(authoritativeOrder()))
  const readApi: QuotationOrderReadPort = {
    getQuotationOrderById: read,
    listTypeOneOrdersForWorkOrder: async () => success({ items: [], page: 1, pageSize: 3, totalCount: 0 }),
  }
  const finalizeDraft = options.finalize ?? vi.fn(async () => success(undefined))
  const input: QuotationOrderSubmissionInput = {
    userId: asOpaqueId<'UserId'>(`user-synthetic-${++setupCounter}`),
    workOrderId,
    workflowNodeId: nodeId,
    workflowDefinitionId,
    expectedDraftVersion: 4,
    evaluatedDraftVersion: 4,
    engineReady: true,
    payload,
    command,
    readApi,
    storage: storage.port,
    finalizeDraft,
  }
  return { input, command, read, finalizeDraft, ...storage }
}

describe('G4-F Phase 1I order submission', () => {
  it('creates only official type=1, reads back authoritatively, then finalizes local draft', async () => {
    const ctx = setup()
    const result = await submitQuotationOrder(ctx.input)
    expect(result.state).toBe('succeeded')
    expect(ctx.command.startOrderWorkflow).toHaveBeenCalledTimes(1)
    expect(ctx.command.upsertOfficialOrder).toHaveBeenCalledTimes(1)
    expect(ctx.command.upsertOfficialOrder).toHaveBeenCalledWith(expect.objectContaining({
      order: expect.objectContaining({ type: 1, serviceAppointmentId: workOrderId, workflowId: 'workflow-synthetic' }),
    }))
    expect(ctx.read).toHaveBeenCalledTimes(1)
    expect(ctx.finalizeDraft).toHaveBeenCalledTimes(1)
  })

  it('keeps business success when readback fails and retries readback without mutation', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(success(authoritativeOrder()))
    const ctx = setup({ read })
    const first = await submitQuotationOrder(ctx.input)
    expect(first.state).toBe('write_succeeded_readback_pending')
    expect(ctx.finalizeDraft).not.toHaveBeenCalled()

    // Simulate app restart/re-entry: the new runtime restores the durable receipt
    // before offering only a readback retry, never another business mutation.
    const restored = await restoreQuotationOrderSubmissionState({
      userId: ctx.input.userId,
      workOrderId,
      workflowNodeId: nodeId,
      storage: ctx.port,
    })
    expect(restored.state).toBe('write_succeeded_readback_pending')

    const second = await retryQuotationOrderReadback(ctx.input)
    expect(second.state).toBe('succeeded')
    expect(ctx.command.startOrderWorkflow).toHaveBeenCalledTimes(1)
    expect(ctx.command.upsertOfficialOrder).toHaveBeenCalledTimes(1)
    expect(ctx.finalizeDraft).toHaveBeenCalledTimes(1)
  })

  it('does not delete a newer local draft when delayed readback succeeds', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(success(authoritativeOrder()))
    const ctx = setup({ read })
    expect((await submitQuotationOrder(ctx.input)).state).toBe('write_succeeded_readback_pending')
    const newerInput = { ...ctx.input, payload: { ...payload, totalPrice: 12 } }
    expect((await retryQuotationOrderReadback(newerInput)).state).toBe('succeeded')
    expect(ctx.finalizeDraft).not.toHaveBeenCalled()
  })

  it('blocks blind resubmit after an ambiguous dispatched upsert', async () => {
    const ctx = setup({ upsert: vi.fn(async () => fail<string>()) })
    const first = await submitQuotationOrder(ctx.input)
    const second = await submitQuotationOrder(ctx.input)
    expect(first.state).toBe('failed_ambiguous_after_dispatch')
    expect(second.state).toBe('failed_ambiguous_after_dispatch')
    expect(ctx.command.upsertOfficialOrder).toHaveBeenCalledTimes(1)
    expect(ctx.finalizeDraft).not.toHaveBeenCalled()
    expect(await restoreQuotationOrderSubmissionState({
      userId: ctx.input.userId,
      workOrderId,
      workflowNodeId: nodeId,
      storage: ctx.port,
    })).toMatchObject({ state: 'failed_ambiguous_after_dispatch' })
  })

  it('collapses concurrent submissions to one command flight', async () => {
    let release!: (value: OperationSnapshot<string>) => void
    const upsert: QuotationOrderCommandPort['upsertOfficialOrder'] = vi.fn((_input: { readonly order: Readonly<Record<string, unknown>> }) =>
      new Promise<OperationSnapshot<string>>((resolve) => { release = resolve }))
    const ctx = setup({ upsert })
    const first = submitQuotationOrder(ctx.input)
    const second = submitQuotationOrder(ctx.input)
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1))
    release(success(orderId))
    const results = await Promise.all([first, second])
    expect(results.map((result) => result.state)).toEqual(['succeeded', 'succeeded'])
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('updates the same Order identity after authoritative pre-read', async () => {
    const read = vi.fn(async () => success(authoritativeOrder()))
    const upsert = vi.fn(async () => success(orderId))
    const ctx = setup({ read, upsert })
    const result = await submitQuotationOrder({ ...ctx.input, existingOrderId: orderId })
    expect(result.state).toBe('succeeded')
    expect(read).toHaveBeenCalledTimes(2)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      order: expect.objectContaining({ _id: orderId, processState: 0, type: 1 }),
    }))
    expect(ctx.command.startOrderWorkflow).not.toHaveBeenCalled()
  })

  it('stores only a minimal non-PII receipt and rejects stale evaluated draft versions before dispatch', async () => {
    const ctx = setup()
    const stale = await submitQuotationOrder({ ...ctx.input, evaluatedDraftVersion: 3 })
    expect(stale.state).toBe('failed_terminal')
    expect(ctx.command.upsertOfficialOrder).not.toHaveBeenCalled()
    const result = await submitQuotationOrder(ctx.input)
    expect(result.state).toBe('succeeded')
    const receipt = [...ctx.values.values()][0] as Record<string, unknown>
    expect(Object.keys(receipt).sort()).toEqual(['draftVersion', 'fingerprint', 'orderId', 'state', 'version', 'workflowId', 'workflowNodeId', 'workOrderId'].sort())
    expect(JSON.stringify(receipt)).not.toContain('Synthetic')
    expect(JSON.stringify(receipt)).not.toContain('service-synthetic')
  })

  it('blocks dispatch when readiness, type, WorkOrder identity, or child definition is missing', async () => {
    const ctx = setup()
    const cases = [
      { ...ctx.input, engineReady: false },
      { ...ctx.input, workflowDefinitionId: undefined },
      { ...ctx.input, payload: { ...payload, type: 0 as 1 } },
      { ...ctx.input, payload: { ...payload, serviceAppointmentId: 'other-work-order' } },
    ]
    for (const candidate of cases) {
      expect((await submitQuotationOrder(candidate)).state).toBe('failed_terminal')
    }
    expect(ctx.command.startOrderWorkflow).not.toHaveBeenCalled()
    expect(ctx.command.upsertOfficialOrder).not.toHaveBeenCalled()
  })

  it('keeps the prior prepared workflow identity and does not start it twice', async () => {
    const ctx = setup({ upsert: vi.fn(async () => fail<string>('server_terminal')) })
    expect((await submitQuotationOrder(ctx.input)).state).toBe('failed_terminal')
    expect((await submitQuotationOrder(ctx.input)).state).toBe('failed_terminal')
    expect(ctx.command.startOrderWorkflow).toHaveBeenCalledTimes(1)
    expect(ctx.command.upsertOfficialOrder).toHaveBeenCalledTimes(2)
  })

  it('safely replaces a prepared pre-dispatch receipt when the local payload changed', async () => {
    const ctx = setup()
    const key = `draft:quotation-order-receipt:v1:${encodeURIComponent(String(ctx.input.userId))}:${encodeURIComponent(String(workOrderId))}:${encodeURIComponent(String(nodeId))}`
    ctx.values.set(key, {
      version: 1,
      workOrderId,
      workflowNodeId: nodeId,
      fingerprint: 'prior-local-only-fingerprint',
      draftVersion: 3,
      state: 'prepared',
    })
    expect(ctx.command.startOrderWorkflow).not.toHaveBeenCalled()
    expect(ctx.command.upsertOfficialOrder).not.toHaveBeenCalled()
    const editedPayload = { ...payload, originPrice: 18, totalPrice: 18 }
    const result = await submitQuotationOrder({ ...ctx.input, payload: editedPayload, expectedDraftVersion: 5, evaluatedDraftVersion: 5 })
    expect(result.state).toBe('succeeded')
    expect(ctx.command.startOrderWorkflow).toHaveBeenCalledTimes(1)
    expect(ctx.command.upsertOfficialOrder).toHaveBeenCalledTimes(1)
  })

  it('keeps confirmed write success when local draft cleanup fails', async () => {
    const ctx = setup({ finalize: vi.fn(async () => fail<void>('server_terminal')) })
    const result = await submitQuotationOrder(ctx.input)
    expect(result.state).toBe('succeeded')
    expect(ctx.finalizeDraft).toHaveBeenCalledTimes(1)
    expect(await restoreQuotationOrderSubmissionState({
      userId: ctx.input.userId,
      workOrderId,
      workflowNodeId: nodeId,
      storage: ctx.port,
    })).toMatchObject({ state: 'succeeded' })
  })

  it('does not treat mismatched or non-type-1 readback as success', async () => {
    const read = vi.fn(async () => success(authoritativeOrder({ id: 'different-order' })))
    const ctx = setup({ read })
    expect((await submitQuotationOrder(ctx.input)).state).toBe('write_succeeded_readback_pending')
    expect(ctx.finalizeDraft).not.toHaveBeenCalled()
  })
})
