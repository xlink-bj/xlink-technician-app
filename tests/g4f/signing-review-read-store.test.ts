import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import type {
  QuotationOrderBrowseItem, QuotationOrderReadPort,
  ScopedSigningOrderReviewRead, SessionSnapshot,
} from '@shared/ports'
import { asOpaqueId, createOperationError } from '@shared/types'
import { useSigningReviewReadStore } from '@features/work-orders/signing/signing-review-read-store'
import { signingOrderReadRouteFor } from '@features/work-orders/signing/signing-review-read-workspace'

const wo = 'workorder-001'
const orderId = 'official-order-001'
const order = (id = orderId): QuotationOrderBrowseItem => ({
  id, serviceAppointmentId: wo, type: 1, displayNumber: 'SYNTHETIC-ORDER',
  groups: [], contentSupported: false, pdfState: 'present_no_access',
})
const doc = (id = orderId): ScopedSigningOrderReviewRead => ({
  order: order(id), contractReadAuthorized: false, signingAuthorized: false,
})
const session = (role = 'role-a', version = 'v1'): SessionSnapshot => ({
  sessionRef: asOpaqueId<'SessionRef'>('s1'),
  user: { id: asOpaqueId<'UserId'>('tech1'), displayName: 'test technician' },
  currentRole: { id: asOpaqueId<'RoleId'>(role), name: role },
  roleVersion: version,
  capabilityNames: [],
})
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
type ListResult = Awaited<ReturnType<QuotationOrderReadPort['listTypeOneOrdersForWorkOrder']>>
type ReadResult = Awaited<ReturnType<NonNullable<QuotationOrderReadPort['readScopedTypeOneOrderForSigningReview']>>>

function fixture(overrides: {
  readonly list?: (workOrderId: string, pageSize?: 1 | 3) => Promise<ListResult>
  readonly read?: (workOrderId: string, orderId: string) => Promise<ReadResult>
  readonly membership?: boolean
  readonly contracts?: (workOrderId: string, orderId: string) => Promise<import('@shared/types').OperationSnapshot<import('@shared/ports').R1ScopedContractRead>>
  readonly readSupported?: boolean
} = {}) {
  const current = ref<SessionSnapshot | null>(session())
  const visible = ref(overrides.membership ?? true)
  const getQuotationOrderById = vi.fn(async () => ({ state: 'failed_terminal' as const }))
  const listImpl: QuotationOrderReadPort['listTypeOneOrdersForWorkOrder'] = overrides.list ?? (async () => ({
    state: 'succeeded',
    data: { items: [order()], page: 1, pageSize: 3, totalCount: 1 },
  }))
  const listTypeOneOrdersForWorkOrder = vi.fn(listImpl)
  const read = vi.fn(
    overrides.read ?? (async () => ({ state: 'succeeded' as const, data: doc() })),
  )
  const contracts = vi.fn(overrides.contracts ?? (async () => ({
    state: 'succeeded' as const,
    data: { completeness: 'bounded_unverified' as const,
      items: [{ id: 'contract-1', orderId, serviceAppointmentId: wo, contractStatus: '2' }] },
  })))
  const port: QuotationOrderReadPort = {
    getQuotationOrderById,
    listTypeOneOrdersForWorkOrder,
    listR1ContractsForSigningReview: contracts,
    ...(overrides.readSupported === false ? {} : { readScopedTypeOneOrderForSigningReview: read }),
  }
  const store = useSigningReviewReadStore()
  store.configure(port, () => current.value, id => visible.value && id === wo)
  return { store, current, visible, read, contracts, port, getQuotationOrderById, listTypeOneOrdersForWorkOrder }
}

describe('M1 engineering first: main App official Order → Signing read store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('two bounded WorkOrder scoped reads produce a verified, capability-false view', async () => {
    const f = fixture()
    const x = await f.store.load(wo, orderId)
    expect(x.state).toBe('succeeded')
    expect(f.store.snapshot).toMatchObject({
      state: 'ready', workOrderId: wo, orderId,
      review: { order: { id: orderId, serviceAppointmentId: wo, type: 1 },
        contractReadAuthorized: false, signingAuthorized: false },
    })
    expect(f.listTypeOneOrdersForWorkOrder).toHaveBeenCalledWith(wo, 3)
    expect(f.read).toHaveBeenCalledWith(wo, orderId)
    expect(f.getQuotationOrderById).not.toHaveBeenCalled()
    expect(f.port).not.toHaveProperty('signContract')
    expect(f.port).not.toHaveProperty('sendSms')
  })

  it('role switch immediately purges a ready Signing review, never reuses its Order', async () => {
    const f = fixture()
    await f.store.load(wo, orderId)
    f.current.value = session('role-b')
    expect(f.store.snapshot).toEqual({ state: 'idle' })
    f.current.value = session('role-a', 'v2')
    expect(f.store.snapshot.review).toBeUndefined()
  })

  it('logout and missing authorization metadata deny all reads', async () => {
    const f = fixture()
    f.current.value = null
    expect((await f.store.load(wo, orderId)).state).toBe('failed_terminal')
    f.current.value = { ...session(), roleVersion: undefined }
    expect((await f.store.load(wo, orderId)).state).toBe('failed_terminal')
    expect(f.listTypeOneOrdersForWorkOrder).not.toHaveBeenCalled()
  })

  it('a role change during the list read does not disclose stale verified Order', async () => {
    const waiting = deferred<ListResult>()
    const f = fixture({ list: () => waiting.promise })
    const result = f.store.load(wo, orderId)
    f.current.value = session('role-b')
    waiting.resolve({ state: 'succeeded', data: { items: [order()], page: 1, pageSize: 3, totalCount: 1 } })
    expect((await result).state).toBe('failed_terminal')
    expect(f.store.snapshot.review).toBeUndefined()
    expect(f.read).not.toHaveBeenCalled()
  })

  it('revoked WorkOrder membership is blocked and prevents a direct Order fetch', async () => {
    const f = fixture({ membership: false })
    expect((await f.store.load(wo, orderId)).state).toBe('failed_terminal')
    expect(f.listTypeOneOrdersForWorkOrder).not.toHaveBeenCalled()
    expect(f.read).not.toHaveBeenCalled()
  })

  it('a missing authoritative Order-scoped read API is fail-closed', async () => {
    const f = fixture({ readSupported: false })
    expect((await f.store.load(wo, orderId)).state).toBe('failed_terminal')
    expect(f.listTypeOneOrdersForWorkOrder).not.toHaveBeenCalled()
  })

  it('newer selected Order wins against an older response with no mixed identities', async () => {
    const pending = deferred<ReadResult>()
    const other = 'official-order-002'
    const f = fixture({
      list: async () => ({
        state: 'succeeded', data: { items: [order(), order(other)], page: 1, pageSize: 3, totalCount: 2 },
      }),
      read: async (_w, id) => id === orderId ? pending.promise : ({ state: 'succeeded', data: doc(other) }),
    })
    const first = f.store.load(wo, orderId)
    await Promise.resolve()
    await Promise.resolve()
    const second = f.store.load(wo, other)
    expect((await second).state).toBe('succeeded')
    pending.resolve({ state: 'succeeded', data: doc() })
    expect((await first).state).toBe('failed_terminal')
    expect(f.store.snapshot).toMatchObject({ state: 'ready', orderId: other })
  })

  it('revoking visible WorkOrder membership AFTER a successful read erases rendered Order synchronously', async () => {
    const f = fixture()
    await f.store.load(wo, orderId)
    expect(f.store.snapshot.state).toBe('ready')
    f.visible.value = false
    expect(f.store.snapshot).toEqual({ state: 'idle' })
    expect(f.store.snapshot.review).toBeUndefined()
    const again = await f.store.load(wo, orderId)
    expect(again.state).toBe('failed_terminal')
    expect(f.read).toHaveBeenCalledTimes(1)
  })

  it('revocation during a SECOND authoritative Order read prevents stale render', async () => {
    const pending = deferred<ReadResult>()
    const f = fixture({ read: () => pending.promise })
    const first = f.store.load(wo, orderId)
    for (let i = 0; i < 5; i += 1) await Promise.resolve()
    f.visible.value = false
    pending.resolve({ state: 'succeeded', data: doc() })
    expect((await first).state).toBe('failed_terminal')
    expect(f.store.snapshot).toEqual({ state: 'idle' })
  })

  it('retryable transport failure can recover with a fresh, fully scoped two-read attempt', async () => {
    let attempts = 0
    const f = fixture({
      read: async () => {
        attempts += 1
        if (attempts === 1) return {
          state: 'failed_retryable',
          error: createOperationError('network_retryable', 'synthetic connection lost'),
        }
        return { state: 'succeeded', data: doc() }
      },
    })
    expect((await f.store.load(wo, orderId)).state).toBe('failed_retryable')
    expect(f.store.snapshot.state).toBe('failed_retryable')
    expect((await f.store.load(wo, orderId)).state).toBe('succeeded')
    expect(f.store.snapshot.state).toBe('ready')
    expect(f.listTypeOneOrdersForWorkOrder).toHaveBeenCalledTimes(2)
    expect(f.read).toHaveBeenCalledTimes(2)
  })

  it('transport errors are sanitized; raw exception data cannot be displayed', async () => {
    const secret = 'PRIVATE_CONTRACT_ACCESS_TOKEN_321'
    const f = fixture({ read: async () => { throw new Error(secret) } })
    const result = await f.store.load(wo, orderId)
    expect(result.state).toBe('failed_retryable')
    expect(f.store.snapshot.state).toBe('failed_retryable')
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(f.store.snapshot)).not.toContain(secret)
  })

  it('route is constructed only for already valid WorkOrder and official Order identities', () => {
    expect(signingOrderReadRouteFor(wo, orderId))
      .toBe('/pages/work-orders/signing-order-read?workOrderId=workorder-001&orderId=official-order-001')
    for (const id of ['', '../orders', 'a?role=admin', 'spaces here', 'a'.repeat(101)]) {
      expect(signingOrderReadRouteFor(wo, id)).toBeNull()
      expect(signingOrderReadRouteFor(id, orderId)).toBeNull()
    }
  })

  it('a new configure resets old scoped data and does not promote the previous port', async () => {
    const first = fixture()
    await first.store.load(wo, orderId)
    const second = fixture({ membership: false })
    expect(second.store.snapshot).toEqual({ state: 'idle' })
    expect((await second.store.load(wo, orderId)).state).toBe('failed_terminal')
    expect(second.store.snapshot.review).toBeUndefined()
  })
})


describe('M1 I6 R1 Contract status read store integration', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('never fetches Contracts automatically during Order precheck', async () => {
    const f = fixture()
    await f.store.load(wo, orderId)
    expect(f.contracts).not.toHaveBeenCalled()
    expect(f.store.contractSnapshot).toEqual({ state: 'idle', items: [] })
  })

  it('allows explicitly triggered bounded read after validated Order only', async () => {
    const f = fixture()
    await f.store.loadContracts()
    expect(f.contracts).not.toHaveBeenCalled()
    await f.store.load(wo, orderId)
    await f.store.loadContracts()
    expect(f.contracts).toHaveBeenCalledWith(wo, orderId)
    expect(f.store.contractSnapshot).toMatchObject({
      state: 'succeeded', items: [{ id: 'contract-1', orderId }],
    })
  })

  it('session or role switch immediately erases previously displayed Contract metadata', async () => {
    const f = fixture()
    await f.store.load(wo, orderId)
    await f.store.loadContracts()
    f.current.value = session('role-switch')
    expect(f.store.snapshot).toEqual({ state: 'idle' })
    expect(f.store.contractSnapshot).toEqual({ state: 'idle', items: [] })
  })

  it('revoked WorkOrder membership immediately clears Contract status', async () => {
    const f = fixture()
    await f.store.load(wo, orderId)
    await f.store.loadContracts()
    f.visible.value = false
    expect(f.store.contractSnapshot).toEqual({ state: 'idle', items: [] })
  })

  it('delayed Contract read after logout never resurrects the old card', async () => {
    const pending = deferred<import('@shared/types').OperationSnapshot<import('@shared/ports').R1ScopedContractRead>>()
    const f = fixture({ contracts: () => pending.promise })
    await f.store.load(wo, orderId)
    const request = f.store.loadContracts()
    f.current.value = null
    pending.resolve({ state: 'succeeded', data: { completeness: 'bounded_unverified',
      items: [{ id: 'contract-1', orderId, serviceAppointmentId: wo }] } })
    await request
    expect(f.store.contractSnapshot).toEqual({ state: 'idle', items: [] })
  })

  it('rejects any injected Contract row from another WorkOrder or Order', async () => {
    for (const unexpected of [
      { id: 'c', orderId: 'other-order', serviceAppointmentId: wo },
      { id: 'c', orderId, serviceAppointmentId: 'other-wo' },
    ]) {
      setActivePinia(createPinia())
      const f = fixture({ contracts: async () => ({
        state: 'succeeded', data: { completeness: 'bounded_unverified', items: [unexpected] },
      }) })
      await f.store.load(wo, orderId)
      await f.store.loadContracts()
      expect(f.store.contractSnapshot).toEqual({ state: 'failed_terminal', items: [] })
    }
  })

  it('leaves empty bounded Contract page inconclusive (never "no contract")', async () => {
    const f = fixture({ contracts: async () => ({
      state: 'succeeded', data: { completeness: 'bounded_unverified', items: [] },
    }) })
    await f.store.load(wo, orderId)
    await f.store.loadContracts()
    expect(f.store.contractSnapshot).toEqual({ state: 'succeeded', items: [] })
  })
})
