import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import type { ApiReadRequest } from '@adapters/api/technician-api'
import { useSigningReviewReadStore } from '@features/work-orders/signing/signing-review-read-store'

// Synthetic wire responses drive the real adapter AND the main App read store.
// No backend, Mock router override, signing command or network transport is used.
const workOrderId = 'sa-m06-anomaly'
const orderA = 'ord-m06-a'
const orderB = 'ord-m06-b'
const order = (id: string, contractId?: string) => ({
  _id: id, type: 1, state: 1, serviceAppointmentId: workOrderId,
  ...(contractId ? { contractId } : {}),
  bjProducts: { orderList: [{ repairParts: ['synthetic-roof'],
    projPackages: { data: [] }, procedures: { data: [] },
    materials: { data: [] }, measures: { data: [] } }] },
})
const contract = (id: string, owningOrder = orderA, extra: Record<string, unknown> = {}) => ({
  _id: id, orderId: owningOrder, serviceAppointmentId: workOrderId,
  state: 1, exts: { contractStatus: '10' },
  contractdocNum: `SYNTHETIC-${id}`, contactsPhone: 'PRIVATE-PHONE',
  ...extra,
})
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>(done => { resolve = done })
  return { promise, resolve }
}
function fixture(readContract: () => Promise<unknown>, orders = [order(orderA), order(orderB)]) {
  const identity = ref<string | null>('session-a:user-a:role-a')
  const visible = ref(true)
  const execute = vi.fn(async (request: ApiReadRequest): Promise<unknown> => {
    if (request.path === 'basic/order/query') return { data: orders, total: orders.length }
    if (request.path === 'basic/contract/query.do') return readContract()
    throw new Error(`Unexpected endpoint: ${request.path}`)
  })
  const port = createQuotationOrderReadAdapter({ execute },
    id => visible.value && id === workOrderId, () => identity.value, () => true)
  const store = useSigningReviewReadStore()
  store.configure(port, () => null, id => visible.value && id === workOrderId,
    undefined, undefined, {
      currentKey: () => identity.value,
      prepare: async () => {},
      isContractReadAllowed: id => id === workOrderId,
    })
  return { store, port, execute, identity, visible }
}
function expectOnlyBoundedReads(execute: ReturnType<typeof fixture>['execute']) {
  for (const [request] of execute.mock.calls) {
    expect(['basic/order/query', 'basic/contract/query.do']).toContain(request.path)
    expect(request.method).toBe('POST')
    expect(request.body).toMatchObject({ page: 1, rows: 3,
      'is:serviceAppointmentId|string#and': workOrderId })
    expect(request.body).not.toHaveProperty('_all')
  }
}

beforeEach(() => setActivePinia(createPinia()))

describe('M06 synthetic wire → real Contract adapter → signing store anomalies', () => {
  it('keeps Order A empty, shows only exact B, and rejects a foreign-workorder row even alongside valid B', async () => {
    let response: unknown = { data: [contract('contract-b', orderB)] }
    const f = fixture(async () => response)
    await f.store.load(workOrderId, orderA)
    await f.store.loadContracts()
    expect(f.store.contractSnapshot).toEqual({ state: 'succeeded', items: [] })
    await f.store.load(workOrderId, orderB)
    await f.store.loadContracts()
    expect(f.store.contractSnapshot.items.map(item => item.id)).toEqual(['contract-b'])
    response = { data: [contract('contract-b', orderB), contract('foreign', orderB,
      { serviceAppointmentId: 'sa-foreign' })] }
    await f.store.loadContracts()
    expect(f.store.contractSnapshot).toEqual({ state: 'failed_terminal', items: [] })
    expect(f.store.snapshot.state).toBe('failed_terminal')
    expect(JSON.stringify(f.store.contractSnapshot)).not.toContain('PRIVATE')
    expectOnlyBoundedReads(f.execute)
  })

  it('does not substitute a same-Order historical contract when the exact contractId is absent from the small page', async () => {
    const f = fixture(async () => ({ data: [contract('historical')], total: 9 }),
      [order(orderA, 'contract-current')])
    await f.store.load(workOrderId, orderA)
    await f.store.loadContracts()
    expect(f.store.contractSnapshot).toEqual({ state: 'succeeded', items: [] })
    expect(f.execute.mock.calls.filter(([request]) => request.path === 'basic/contract/query.do')).toHaveLength(1)
    expectOnlyBoundedReads(f.execute)
  })

  it.each([
    ['remaining pages', { data: [], total: 9 }],
    ['missing total', { data: [] }],
    ['contradictory zero total', { data: [contract('contract-a')], total: 0 }],
    ['contradictory nested total', { data: { records: [contract('contract-a')], total: 0 } }],
  ])('never upgrades completeness or expands reads for %s', async (_label, response) => {
    const f = fixture(async () => response)
    const result = await f.port.listR1ContractsForSigningReview!(workOrderId, orderA)
    // The current adapter does not validate total. These tests prove only that
    // even contradictory totals cannot claim full coverage or trigger page 2.
    expect(result).toMatchObject({ state: 'succeeded', data: { completeness: 'bounded_unverified' } })
    expect(f.execute).toHaveBeenCalledTimes(2)
    expectOnlyBoundedReads(f.execute)
  })

  it('treats a missing row array as failure rather than a valid empty page and clears prior metadata', async () => {
    let response: unknown = { data: [contract('contract-a')] }
    const f = fixture(async () => response)
    await f.store.load(workOrderId, orderA)
    await f.store.loadContracts()
    expect(f.store.contractSnapshot.items).toHaveLength(1)
    response = { data: { total: 1 } }
    await f.store.loadContracts()
    expect(f.store.contractSnapshot).toEqual({ state: 'failed_terminal', items: [] })
    expectOnlyBoundedReads(f.execute)
  })

  it('does not let a late A response replace the newly selected B contract', async () => {
    const late = deferred()
    let reads = 0
    const f = fixture(() => ++reads === 1 ? late.promise : Promise.resolve({ data: [contract('contract-b', orderB)] }))
    await f.store.load(workOrderId, orderA)
    const first = f.store.loadContracts()
    await vi.waitFor(() => expect(reads).toBe(1))
    await f.store.load(workOrderId, orderB)
    await f.store.loadContracts()
    late.resolve({ data: [contract('contract-a')] })
    await first
    expect(f.store.snapshot).toMatchObject({ state: 'ready', orderId: orderB })
    expect(f.store.contractSnapshot.items.map(item => item.id)).toEqual(['contract-b'])
    expectOnlyBoundedReads(f.execute)
  })

  it.each(['session', 'role', 'membership'] as const)('discards a late wire response after %s changes while a fresh scope succeeds', async change => {
    const late = deferred()
    let reads = 0
    const f = fixture(() => ++reads === 1 ? late.promise : Promise.resolve({ data: [contract('fresh')] }))
    await f.store.load(workOrderId, orderA)
    const first = f.store.loadContracts()
    await vi.waitFor(() => expect(reads).toBe(1))
    if (change === 'membership') f.visible.value = false
    else f.identity.value = change === 'session' ? 'session-b:user-a:role-a' : 'session-a:user-a:role-b'
    expect(f.store.contractSnapshot).toEqual({ state: 'idle', items: [] })
    if (change === 'membership') f.visible.value = true
    await f.store.load(workOrderId, orderA)
    await f.store.loadContracts()
    late.resolve({ data: [contract('stale')] })
    await first
    expect(f.store.contractSnapshot.items.map(item => item.id)).toEqual(['fresh'])
    expect(f.store.snapshot.review).toMatchObject({ contractReadAuthorized: false, signingAuthorized: false })
    expectOnlyBoundedReads(f.execute)
  })
})
