import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRoleScopedTechnicianApiReadAdapter, type ApiReadRequest } from '@adapters/api/technician-api'
import { useWorkOrderListStore } from '@features/work-orders/list'
import type { SessionSnapshot, TechnicianApiReadPort, WorkOrderCategory } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const path = '/pages/serviceAppointment/serviceAppointments'
const menu = (action: string, order = 1, tabDisplay = '1') => ({ order, exts: { tabDisplay }, action })
const todo = () => menu(`${path}?type=SANode&orderState=todo`, 0)
const broad = () => menu(path)
const row = (id: string) => ({ _id: id, state: 1 })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function setup() {
  const actor = { sessionRef: 'session', userId: 'user', roleId: 'role', roleVersion: 'v1' }
  let menus: unknown[] = [todo(), broad()]
  let listHook: ((request: ApiReadRequest) => Promise<unknown>) | undefined
  let menuHook: (() => Promise<unknown>) | undefined
  const calls: ApiReadRequest[] = []
  const execute = vi.fn(async (request: ApiReadRequest) => {
    calls.push(request)
    if (request.path.startsWith('function/')) return menuHook ? menuHook() : { data: { functionList: menus } }
    if (listHook) return listHook(request)
    return { data: request.path.endsWith('querySAWorkflowNode')
      ? [{ _id: 'pending-node', state: 0, nodeDef: { nodeType: 'forms' }, data: row('pending') }]
      : [row('completed')], page: request.body?.page, rows: request.body?.rows, total: 2 }
  })
  const api = createRoleScopedTechnicianApiReadAdapter({ execute }, () => asOpaqueId<'RoleId'>(actor.roleId),
    { getReadAuthorizationScope: () => actor })
  return { api, actor, calls, execute, menus: (value: unknown[]) => { menus = value },
    onList: (hook?: typeof listHook) => { listHook = hook }, onMenu: (hook?: typeof menuHook) => { menuHook = hook },
    listCalls: () => calls.filter(call => !call.path.startsWith('function/')) }
}
const all = { page: 1, pageSize: 20, category: 'all' as const }

beforeEach(() => { setActivePinia(createPinia()); vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test') })

describe('explicit R2 All uses only a fresh authorized ordinary menu', () => {
  it('keeps the exact ordinary wire without tenant, permission or workflow bypasses', async () => {
    const h = setup(); const result = await h.api.listWorkOrders(all)
    expect(result.data?.items.map(item => item.id)).toEqual(['completed'])
    expect(h.listCalls()).toEqual([{ method: 'POST', path: 'basic/serviceAppointment/query', body: {
      page: 1, rows: 20, sortField: 'createTime', sortOrder: 'desc', 'is:state|integer#and': 1,
    } }])
    expect(h.api.isWorkOrderListedForCurrentSession?.('completed')).toBe(true)
    for (const key of ['orderState', 'tenantId', 'type', 'notFilterBelongTo', 'notFilterOrgId', '_all']) {
      expect(h.listCalls()[0]?.body).not.toHaveProperty(key)
    }
  })

  it.each(['to_accept', 'need_contact', 'onsite', 'following'] as const)('leaves %s in the first menu with the existing status intersection', async category => {
    const h = setup(); await h.api.listWorkOrders({ ...all, category })
    expect(h.listCalls()[0]?.path).toBe('basic/serviceAppointment/querySAWorkflowNode')
    expect(h.listCalls()[0]?.body).toMatchObject({ orderState: 'todo' })
    expect(h.listCalls()[0]?.body?.['in:status|array#and']).toBeTruthy()
  })

  it('keeps absent category backward-compatible and does not inherit All membership', async () => {
    const h = setup(); await h.api.listWorkOrders(all)
    await h.api.listWorkOrders({ page: 1, pageSize: 20 })
    expect(h.listCalls()[1]?.path).toBe('basic/serviceAppointment/querySAWorkflowNode')
    expect(h.api.isWorkOrderListedForCurrentSession?.('completed')).toBe(false)
    expect(h.api.isWorkOrderListedForCurrentSession?.('pending')).toBe(true)
  })

  it.each([
    () => [todo()],
    () => [todo(), menu(path, 1, '0')],
    () => [todo(), { ...broad(), functionList: [menu('/pages/unrelated', 0)] }],
    () => [todo(), menu(`/unrelated${path}`)],
    () => [todo(), menu(`${path}?unknownConstraint=private`)],
    () => [todo(), menu(`${path}?status=104`)],
  ])('never promotes absent, hidden, nonleaf, wrong-route or query-constrained entries into an unrestricted All', async menus => {
    const h = setup(); h.menus(menus()); await h.api.listWorkOrders(all)
    expect(h.listCalls()[0]?.path).toBe('basic/serviceAppointment/querySAWorkflowNode')
    expect(h.listCalls()[0]?.body?.orderState).toBe('todo')
  })

  it('preserves an original status constraint when it is the only ordinary menu', async () => {
    const h = setup(); h.menus([menu(`${path}?status=104,105`)])
    await h.api.listWorkOrders(all)
    expect(h.listCalls()[0]?.body?.['in:status|array#and']).toBe('104,105')
  })

  it.each([`${path}?notFilterOrgId=true`, `${path}?status=104&status=999`, `${path}?tenantId=other`, `${path}?type=unknown`, `${path}?orderState=todo`])('refuses a selected unsupported/ambiguous menu instead of discarding constraints: %s', async action => {
    const h = setup(); h.menus([menu(action)])
    expect((await h.api.listWorkOrders(all)).state).toBe('failed_terminal')
    expect(h.listCalls()).toHaveLength(0)
  })

  it('uses the production read-only role tree, never changeRole, for this same selection', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod'); const h = setup()
    expect((await h.api.listWorkOrders(all)).state).toBe('succeeded')
    expect(h.calls[0]).toEqual({ method: 'POST', path: 'function/queryTreeByRoleId', query: { roleId: 'role' } })
    expect(h.listCalls()[0]?.path).toBe('basic/serviceAppointment/query')
  })
})

describe('menu/query membership revocation and stale requests', () => {
  it('re-reads menus on every page and rejects withdrawal before any fallback page query', async () => {
    const h = setup(); await h.api.listWorkOrders(all); h.menus([todo()])
    const result = await h.api.listWorkOrders({ ...all, page: 2 })
    expect(result.error?.category).toBe('authorization_denied')
    expect(h.listCalls()).toHaveLength(1)
    expect(h.api.isWorkOrderListedForCurrentSession?.('completed')).toBe(false)
    expect((await h.api.listWorkOrders(all)).state).toBe('succeeded')
    expect(h.listCalls()[1]?.body?.orderState).toBe('todo')
  })

  it('fails closed and revokes old IDs when all visible menus disappear', async () => {
    const h = setup(); await h.api.listWorkOrders(all); h.menus([])
    expect((await h.api.listWorkOrders({ ...all, page: 2 })).error?.category).toBe('authorization_denied')
    expect(h.api.isWorkOrderListedForCurrentSession?.('completed')).toBe(false)
    expect(h.listCalls()).toHaveLength(1)
  })

  it.each([{ searchText: 'new search' }, { pageSize: 7 }, { category: 'following' as WorkOrderCategory }])('does not append with a different query intent: %o', async change => {
    const h = setup(); await h.api.listWorkOrders(all)
    expect((await h.api.listWorkOrders({ ...all, page: 2, ...change })).error?.category).toBe('authorization_denied')
    expect(h.listCalls()).toHaveLength(1)
    expect(h.api.isWorkOrderListedForCurrentSession?.('completed')).toBe(false)
  })

  it('allows consistent paging/search only within the same menu protocol', async () => {
    const h = setup(); await h.api.listWorkOrders({ ...all, searchText: ' terrace ' })
    await h.api.listWorkOrders({ ...all, page: 2, searchText: 'terrace' })
    expect(h.calls.filter(call => call.path.startsWith('function/'))).toHaveLength(2)
    expect(h.listCalls()[1]?.body).toMatchObject({ page: 2, rows: 20, 'regex:title|string#or': 'terrace' })
    expect(h.listCalls()[1]?.body).not.toHaveProperty('orderState')
  })

  it('revokes previous membership on a menu-read network failure', async () => {
    const h = setup(); await h.api.listWorkOrders(all)
    h.onMenu(async () => { throw Error('synthetic network failure') })
    expect((await h.api.listWorkOrders({ ...all, page: 2 })).state).not.toBe('succeeded')
    expect(h.api.isWorkOrderListedForCurrentSession?.('completed')).toBe(false)
  })

  it('revokes previous membership on malformed list data and requires a fresh first page', async () => {
    const h = setup(); await h.api.listWorkOrders(all); h.onList(async () => ({ data: 'malformed' }))
    expect((await h.api.listWorkOrders({ ...all, page: 2 })).state).toBe('failed_terminal')
    expect(h.api.isWorkOrderListedForCurrentSession?.('completed')).toBe(false)
    h.onList(); expect((await h.api.listWorkOrders({ ...all, page: 2 })).error?.category).toBe('authorization_denied')
    expect((await h.api.listWorkOrders(all)).state).toBe('succeeded')
  })

  it('empty category intersection removes previous All IDs without a list query', async () => {
    const h = setup(); await h.api.listWorkOrders(all)
    h.menus([menu(`${path}?type=SANode&orderState=todo&status=999`, 0), broad()])
    expect((await h.api.listWorkOrders({ ...all, category: 'to_accept' })).data?.items).toEqual([])
    expect(h.listCalls()).toHaveLength(1)
    expect(h.api.isWorkOrderListedForCurrentSession?.('completed')).toBe(false)
  })

  it('does not query after the actor changes during a menu read', async () => {
    const h = setup(); const pending = deferred<unknown>(); h.onMenu(() => pending.promise)
    const old = h.api.listWorkOrders(all); h.actor.roleId = 'other-role'
    pending.resolve({ data: { functionList: [todo(), broad()] } })
    expect((await old).error?.category).toBe('authorization_denied'); expect(h.listCalls()).toHaveLength(0)
  })

  it.each(['success', 'failure'] as const)('late old %s neither grants old IDs nor revokes the new list owner', async outcome => {
    const h = setup(); const pending = deferred<unknown>(); h.onList(() => pending.promise)
    const old = h.api.listWorkOrders(all)
    await vi.waitFor(() => expect(h.listCalls()).toHaveLength(1))
    h.onList(); await h.api.listWorkOrders({ page: 1, pageSize: 20 })
    if (outcome === 'success') pending.resolve({ data: [row('completed')], page: 1, rows: 20, total: 1 })
    else pending.reject(Error('late failure'))
    expect((await old).state).toBe('failed_terminal')
    expect(h.api.isWorkOrderListedForCurrentSession?.('completed')).toBe(false)
    expect(h.api.isWorkOrderListedForCurrentSession?.('pending')).toBe(true)
  })

  it('does not grant a list response after an identity change', async () => {
    const h = setup(); const pending = deferred<unknown>(); h.onList(() => pending.promise)
    const result = h.api.listWorkOrders(all); await vi.waitFor(() => expect(h.listCalls()).toHaveLength(1))
    h.actor.sessionRef = 'new-session'; pending.resolve({ data: [row('completed')], total: 1 })
    expect((await result).error?.category).toBe('authorization_denied')
    expect(h.api.isWorkOrderListedForCurrentSession?.('completed')).toBe(false)
  })
})

it('list store retries a failed/revoked append from page one with explicit All', async () => {
  const actor: SessionSnapshot = { sessionRef: asOpaqueId<'SessionRef'>('s'), user: { id: asOpaqueId<'UserId'>('u') },
    currentRole: { id: asOpaqueId<'RoleId'>('r') }, capabilityNames: [] }
  const listWorkOrders = vi.fn().mockResolvedValueOnce({ state: 'succeeded', data: { items: [{ id: 'old' }], totalCount: 40 } })
    .mockResolvedValueOnce({ state: 'failed_terminal', error: { category: 'authorization_denied', message: 'menu changed', retryable: false } })
    .mockResolvedValueOnce({ state: 'succeeded', data: { items: [{ id: 'fresh' }], totalCount: 1 } })
  const store = useWorkOrderListStore(); store.configureApi({ listWorkOrders } as unknown as TechnicianApiReadPort, () => actor)
  await store.load(); await store.loadMore(); expect(store.items).toEqual([])
  await store.retry(); expect(listWorkOrders).toHaveBeenLastCalledWith(all)
  expect(store.items.map(item => item.id)).toEqual(['fresh'])
})
