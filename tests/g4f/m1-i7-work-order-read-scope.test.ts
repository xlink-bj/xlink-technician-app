import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import type { SessionSnapshot, TechnicianApiReadPort, WorkOrderDetail, WorkOrderSummary } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'

const id = asOpaqueId<'WorkOrderId'>('synthetic-workorder-1')
const id2 = asOpaqueId<'WorkOrderId'>('synthetic-workorder-2')
const row: WorkOrderSummary = {
  id, displayNumber: 'SYNTHETIC-1',
  contact: { normalizedPhone: '13800000000' },
}
const detail: WorkOrderDetail = { id, customerName: 'synthetic customer',
  contact: { normalizedPhone: '13800000000' } }
function session(role = 'role-1', version = 'v1'): SessionSnapshot {
  return {
    sessionRef: asOpaqueId<'SessionRef'>('session-1'),
    user: { id: asOpaqueId<'UserId'>('user-1') },
    currentRole: { id: asOpaqueId<'RoleId'>(role) },
    roleVersion: version, capabilityNames: [],
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
const listResponse = () => ({
  state: 'succeeded' as const,
  data: { items: [row], page: 1, pageSize: 20, totalCount: 1 },
})
const detailResponse = () => ({ state: 'succeeded' as const, data: detail })

describe('M1 I7 WorkOrder read scope invalidation at the feature boundary', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('scope key covers user, role and role version, not just sessionRef', () => {
    const initial = session()
    expect(workOrderReadScopeKey(initial)).not.toBe(workOrderReadScopeKey(session('role-2')))
    expect(workOrderReadScopeKey(initial)).not.toBe(workOrderReadScopeKey(session('role-1','v2')))
    expect(workOrderReadScopeKey(initial)).not.toBe(workOrderReadScopeKey({
      ...initial, user: { id: asOpaqueId<'UserId'>('other-user') },
    }))
    expect(workOrderReadScopeKey(null)).toBeNull()
  })

  it('a role switch instantly purges previously rendered WorkOrder list and detail, including contact', async () => {
    const actor = ref<SessionSnapshot | null>(session())
    const getWorkOrderDetail = vi.fn(async () => detailResponse())
    const listWorkOrders = vi.fn(async () => listResponse())
    const api = { getWorkOrderDetail, listWorkOrders } as unknown as TechnicianApiReadPort
    const list = useWorkOrderListStore()
    const details = useWorkOrderDetailStore()
    list.configureApi(api, () => actor.value)
    details.configureApi(api, () => actor.value)
    expect((await list.load({ refresh: true })).state).toBe('succeeded')
    expect((await details.load(id)).state).toBe('succeeded')
    expect(list.items).toHaveLength(1)
    expect(details.detail?.contact?.normalizedPhone).toBe('13800000000')

    actor.value = session('role-2')
    expect(list.items).toEqual([])
    expect(list.loadState).toBe('idle')
    expect(details.detail).toBeNull()
    expect(details.loadState).toBe('idle')
    expect(details.currentWorkOrderId).toBeNull()
  })

  it('even a same-role roleVersion change invalidates both stores and cannot reuse old data', async () => {
    const actor = ref<SessionSnapshot | null>(session())
    const api = { getWorkOrderDetail: vi.fn(async () => detailResponse()),
      listWorkOrders: vi.fn(async () => listResponse()) } as unknown as TechnicianApiReadPort
    const list = useWorkOrderListStore()
    const details = useWorkOrderDetailStore()
    list.configureApi(api, () => actor.value)
    details.configureApi(api, () => actor.value)
    await list.load()
    await details.load(id)
    actor.value = session('role-1','v2')
    expect(list.items).toHaveLength(0)
    expect(details.detail).toBeNull()
    expect(details.currentWorkOrderId).toBeNull()
  })

  it('an old in-flight list response cannot reintroduce rows after role switch', async () => {
    const pending = deferred<ReturnType<typeof listResponse>>()
    const actor = ref<SessionSnapshot | null>(session())
    const list = useWorkOrderListStore()
    list.configureApi({ listWorkOrders: vi.fn(() => pending.promise) } as unknown as TechnicianApiReadPort,
      () => actor.value)
    const stale = list.load()
    actor.value = session('role-2')
    pending.resolve(listResponse())
    const result = await stale
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('authorization_denied')
    expect(list.items).toEqual([])
  })

  it('an old in-flight detail response cannot reveal the customer after role switch', async () => {
    const pending = deferred<ReturnType<typeof detailResponse>>()
    const actor = ref<SessionSnapshot | null>(session())
    const store = useWorkOrderDetailStore()
    store.configureApi({ getWorkOrderDetail: vi.fn(() => pending.promise) } as unknown as TechnicianApiReadPort,
      () => actor.value)
    const stale = store.load(id)
    actor.value = session('role-2')
    pending.resolve(detailResponse())
    const result = await stale
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('authorization_denied')
    expect(store.detail).toBeNull()
    expect(store.currentWorkOrderId).toBeNull()
  })

  it('rejects a backend detail response for a different WorkOrder', async () => {
    const store = useWorkOrderDetailStore()
    store.configureApi({
      getWorkOrderDetail: vi.fn(async () => ({
        state:'succeeded', data: { ...detail, id: id2 },
      })),
    } as unknown as TechnicianApiReadPort, () => session())
    const outcome = await store.load(id)
    expect(outcome.state).toBe('failed_terminal')
    expect(outcome.error?.category).toBe('authorization_denied')
    expect(store.detail).toBeNull()
  })

  it('stale list card refs and detail phone refs cannot trigger a customer call after logout or role switch', async () => {
    const actor = ref<SessionSnapshot | null>(session())
    const api = { listWorkOrders: vi.fn(async () => listResponse()),
      getWorkOrderDetail: vi.fn(async () => detailResponse()) } as unknown as TechnicianApiReadPort
    const dial = vi.fn(async () => ({ capability: 'phone' as const, state: 'granted' as const }))
    const list = useWorkOrderListStore()
    const details = useWorkOrderDetailStore()
    list.configureApi(api, () => actor.value)
    details.configureApi(api, () => actor.value)
    list.configurePhone({ dial })
    details.configurePhone({ dial })
    await list.load()
    await details.load(id)
    const oldCard = list.items[0]!
    actor.value = null
    expect((await list.dialContact(oldCard)).state).toBe('unavailable')
    expect((await details.dialContact()).state).toBe('unavailable')
    expect(dial).not.toHaveBeenCalled()
  })

  it('a new scoped list/detail read after switching role is allowed to load fresh data', async () => {
    const actor = ref<SessionSnapshot | null>(session())
    const api = { listWorkOrders: vi.fn(async () => listResponse()),
      getWorkOrderDetail: vi.fn(async () => detailResponse()) } as unknown as TechnicianApiReadPort
    const list = useWorkOrderListStore()
    const details = useWorkOrderDetailStore()
    list.configureApi(api, () => actor.value)
    details.configureApi(api, () => actor.value)
    await list.load()
    await details.load(id)
    actor.value = session('role-2')
    expect((await list.load()).state).toBe('succeeded')
    expect((await details.load(id)).state).toBe('succeeded')
    expect(list.items).toHaveLength(1)
    expect(details.detail?.id).toBe(id)
  })
})
