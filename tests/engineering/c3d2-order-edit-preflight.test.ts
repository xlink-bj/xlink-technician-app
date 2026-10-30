import { describe, expect, it, vi } from 'vitest'
import type { QuotationOrderRead, QuotationOrderReadPort } from '@shared/ports'
import { asOpaqueId, createOperationError, type OperationSnapshot } from '@shared/types'
import { readQuotationOrderEditCandidate } from '@features/work-orders/quotation/order-edit-preflight'

const workOrderId = asOpaqueId<'WorkOrderId'>('work-order-d2')
const workflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('workflow-node-d2')
function validOrder(overrides: Partial<QuotationOrderRead> = {}): QuotationOrderRead {
  return {
    id: 'order-d2', type: 1, serviceAppointmentId: workOrderId,
    state: 1, processState: 0, discount: 1, preferentialAmount: 0, coupons: '',
    bjProducts: {
      orderList: [{
        repairParts: ['roof', 'flat-roof'], partDescription: 'area', maintainAreaNum: '12',
        projPackages: { data: [], totalAmount: 0 },
        procedures: { data: [{ _id: 'procedure-d2', name: 'procedure', number: 1 }] },
        materials: { data: [] }, measures: { data: [] },
      }],
      addItems: { data: [] }, deleteItems: { data: [] },
    },
    replaceSnapshot: {
      _id: 'order-d2', type: 1, serviceAppointmentId: workOrderId,
      productIds: '[]', exts: {},
    },
    ...overrides,
  }
}
function succeeded<T>(data: T): OperationSnapshot<T> { return { state: 'succeeded', data } }
function readPort(response: OperationSnapshot<QuotationOrderRead> = succeeded(validOrder())) {
  return {
    getQuotationOrderById: vi.fn(async () => response),
  } as unknown as QuotationOrderReadPort
}
function request(
  port = readPort(),
  overrides: Partial<Parameters<typeof readQuotationOrderEditCandidate>[0]> = {},
) {
  return { orderId: 'order-d2', workOrderId, workflowNodeId,
    orderRead: port, stillCurrent: () => true, ...overrides }
}

describe('C3-D2 quotation Order edit read preflight', () => {
  it('returns the reconstructed authoritative type=1 Order with exact workOrder and workflow identity', async () => {
    const port = readPort()
    const result = await readQuotationOrderEditCandidate(request(port))
    expect(port.getQuotationOrderById).toHaveBeenCalledTimes(1)
    expect(port.getQuotationOrderById).toHaveBeenCalledWith('order-d2')
    expect(result.state).toBe('ready')
    if (result.state === 'ready') {
      expect(result.draft.workOrderId).toBe(workOrderId)
      expect(result.draft.workflowNodeId).toBe(workflowNodeId)
      expect(result.draft.groups[0]?.repairParts).toEqual(['roof', 'flat-roof'])
      expect(result.draft.groups[0]?.procedures[0]?.catalogId).toBe('procedure-d2')
    }
  })
  it('never fetches an Order when the caller has already lost its role or Work Order scope', async () => {
    const port = readPort()
    expect((await readQuotationOrderEditCandidate(request(port, { stillCurrent: () => false }))).state).toBe('stale')
    expect(port.getQuotationOrderById).not.toHaveBeenCalled()
  })
  it('discards an in-flight read after scope revocation, even when the Order would be valid', async () => {
    const port = readPort()
    let current = true
    let resolve!: (result: OperationSnapshot<QuotationOrderRead>) => void
    const gate = new Promise<OperationSnapshot<QuotationOrderRead>>(accept => { resolve = accept })
    port.getQuotationOrderById = vi.fn(async () => gate)
    const pending = readQuotationOrderEditCandidate(request(port, { stillCurrent: () => current }))
    current = false
    resolve(succeeded(validOrder()))
    expect((await pending).state).toBe('stale')
  })
  it('blocks mismatched Order ID, type and foreign WorkOrder without reconstructing a draft', async () => {
    for (const order of [
      validOrder({ id: 'foreign-order' }),
      validOrder({ type: 2 }),
      validOrder({ serviceAppointmentId: 'foreign-work-order' }),
    ]) {
      const result = await readQuotationOrderEditCandidate(request(readPort(succeeded(order))))
      expect(result).toEqual({ state: 'blocked', message: '待编辑订单无法权威读取或不属于当前工单。' })
    }
  })
  it('fails closed on missing or failed authoritative Order read', async () => {
    const failed: OperationSnapshot<QuotationOrderRead> = {
      state: 'failed_retryable', error: createOperationError('network_retryable', 'offline'),
    }
    const result = await readQuotationOrderEditCandidate(request(readPort(failed)))
    expect(result).toMatchObject({ state: 'blocked', message: '待编辑订单无法权威读取或不属于当前工单。' })
    const empty = await readQuotationOrderEditCandidate(request(readPort(succeeded(undefined as unknown as QuotationOrderRead))))
    expect(empty.state).toBe('blocked')
  })
  it('denies paid/contracted/executing/discounted or non-neutral Order snapshots', async () => {
    const bad = [
      validOrder({ processState: 1 }),
      validOrder({ discount: 0.8 }),
      validOrder({ replaceSnapshot: { ...validOrder().replaceSnapshot, paidAmount: 1 } }),
      validOrder({ replaceSnapshot: { ...validOrder().replaceSnapshot, contractId: 'contract-d2' } }),
    ]
    for (const order of bad) {
      const result = await readQuotationOrderEditCandidate(request(readPort(succeeded(order))))
      expect(result.state).toBe('blocked')
      if (result.state === 'blocked') expect(result.message).not.toBe('待编辑订单无法权威读取或不属于当前工单。')
    }
  })
  it('blocks unsupported addItems and incomplete grouped snapshot instead of losing details', async () => {
    const base = validOrder()
    const badAdd = validOrder({ bjProducts: { ...base.bjProducts,
      addItems: { data: [{ name: 'unsaved' }] } } })
    const noRepairParts = validOrder({ bjProducts: { ...base.bjProducts,
      orderList: [{ repairParts: [], projPackages: { data: [] }, procedures: { data: [] },
        materials: { data: [] }, measures: { data: [] } }] } })
    const add = await readQuotationOrderEditCandidate(request(readPort(succeeded(badAdd))))
    const missing = await readQuotationOrderEditCandidate(request(readPort(succeeded(noRepairParts))))
    expect(add.state).toBe('blocked')
    expect(missing).toMatchObject({ state: 'blocked', message: '订单缺少维修部位路径，不能安全恢复编辑。' })
  })
  it('rejects SKU/Package material ambiguity rather than guessing its catalog identity', async () => {
    const base = validOrder()
    const invalid = validOrder({ bjProducts: {
      ...base.bjProducts, orderList: [{
        repairParts: ['roof'], projPackages: { data: [{ _id: 'package-d2', name: 'package',
          number: 1, exts: { pricingMethod: '1' } }] },
        procedures: { data: [] }, materials: { data: [] }, measures: { data: [] },
      }],
    } })
    const result = await readQuotationOrderEditCandidate(request(readPort(succeeded(invalid))))
    expect(result.state).toBe('blocked')
  })
})
