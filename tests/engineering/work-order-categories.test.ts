import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { createRoleScopedTechnicianApiReadAdapter, createTechnicianApiReadAdapter, type ApiReadRequest } from '@adapters/api/technician-api'
import { workOrderCategoryStatusFilter } from '@adapters/api/work-order-category'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { workOrderCategories } from '@features/work-orders/list-categories'
import type { SessionSnapshot, TechnicianApiReadPort, WorkOrderCategory } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const session: SessionSnapshot = { sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'), user: {id: asOpaqueId<'UserId'>('user')}, currentRole: {id: asOpaqueId<'RoleId'>('role')}, capabilityNames: [] }
const row = (id: string) => ({ id: asOpaqueId<'WorkOrderId'>(id) })
const page = (id: string, totalCount = 30) => ({state: 'succeeded' as const, data: {items: [row(id)], totalCount}})
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => {resolve = r}); return {promise, resolve} }
function adapter(scope = 'type=SANode&orderState=todo&status=104,105,999') {
  const calls: ApiReadRequest[] = []
  const execute = vi.fn(async (request: ApiReadRequest) => {
    calls.push(request)
    if (request.path.startsWith('function/')) return {data: {functionList: [{order: 1, exts: {tabDisplay: '1'}, action: `/pages/serviceAppointment/serviceAppointments?${scope}`}]}}
    return {data: [], page: request.body?.page, rows: request.body?.rows, total: 0}
  })
  return {calls, execute, api: createRoleScopedTechnicianApiReadAdapter({execute}, () => session.currentRole!.id)}
}

beforeEach(() => { setActivePinia(createPinia()); vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test') })
describe('R2 categories constrained by R1 role scope', () => {
  it('retains the five accepted labels and exact stage groups, without unknown-state fallback', () => {
    expect(workOrderCategories.map(x => x.label)).toEqual(['待接单', '待联系', '待上门', '待跟进', '全部'])
    expect(workOrderCategoryStatusFilter('to_accept')).toBe('101,102,103')
    expect(workOrderCategoryStatusFilter('need_contact')).toBe('104')
    expect(workOrderCategoryStatusFilter('onsite')).toBe('105,202')
    expect(workOrderCategoryStatusFilter('following')).toBe('200,201,203,204,205,206,207,300,301,302,401,402,403,407,501,502,999')
    expect(workOrderCategoryStatusFilter('following', 'unknown')).toBeNull()
    expect(workOrderCategoryStatusFilter('all', 'unknown')).toBe('unknown')
  })
  it.each(['to_accept', 'need_contact', 'onsite', 'following'] as const)('intersects %s rather than replacing the role filter', category => {
    const allowed = '101,104,105,200'
    const actual = workOrderCategoryStatusFilter(category, allowed)!
    expect(actual.split(',').every(code => allowed.split(',').includes(code))).toBe(true)
  })
  it('preserves role endpoint, todo filter, paging and search with an extra category', async () => {
    const {api, calls} = adapter()
    await api.listWorkOrders({page: 2, pageSize: 7, searchText: '露台', category: 'onsite'})
    expect(calls[1]?.path).toBe('basic/serviceAppointment/querySAWorkflowNode')
    expect(calls[1]?.body).toMatchObject({page: 2, rows: 7, orderState: 'todo', 'in:status|array#and': '105', 'regex:title|string#or': '露台'})
    expect(calls[1]?.body).not.toHaveProperty('_all')
  })
  it('all removes only the category, preserving every original role constraint', async () => {
    const {api, calls} = adapter()
    await api.listWorkOrders({page: 1, pageSize: 20, category: 'all'})
    expect(calls[1]?.body).toMatchObject({orderState: 'todo', 'in:status|array#and': '104,105,999'})
  })
  it('empty intersection does not send a broader list request', async () => {
    const {api, calls} = adapter()
    expect((await api.listWorkOrders({page: 1, pageSize: 20, category: 'to_accept'})).data).toEqual({items: [], page: 1, pageSize: 20, totalCount: 0})
    expect(calls).toHaveLength(1)
  })
  it('ordinary service-appointment menu remains ordinary and role filters are refreshed each read', async () => {
    const {api, calls} = adapter('status=104,202')
    await api.listWorkOrders({page: 1, pageSize: 20, category: 'onsite'})
    await api.listWorkOrders({page: 1, pageSize: 20, category: 'need_contact'})
    expect(calls.filter(x => x.path === 'function/changeRole')).toHaveLength(2)
    expect(calls[1]?.path).toBe('basic/serviceAppointment/query')
    expect(calls[1]?.body).not.toHaveProperty('orderState')
    expect(calls[1]?.body?.['in:status|array#and']).toBe('202')
    expect(calls[3]?.body?.['in:status|array#and']).toBe('104')
  })
  it.each(['bogus','__proto__','constructor'])('rejects invalid category %s before transport', async value => {
    const execute = vi.fn()
    const api = createTechnicianApiReadAdapter({execute})
    const result = await api.listWorkOrders({page: 1, pageSize: 20, category: value as WorkOrderCategory})
    expect(result.state).toBe('failed_terminal'); expect(execute).not.toHaveBeenCalled()
  })
})
describe('category list lifecycle', () => {
  it('switches at page one, preserves search, discards stale pages and keeps subsequent pagination scoped', async () => {
    const old = deferred<ReturnType<typeof page>>()
    const read = vi.fn().mockResolvedValueOnce(page('old')).mockImplementationOnce(() => old.promise).mockResolvedValue(page('new'))
    const store = useWorkOrderListStore()
    store.configureApi({listWorkOrders: read} as unknown as TechnicianApiReadPort, () => session)
    await store.search('露台')
    const pending = store.loadMore()
    await store.selectCategory('onsite')
    expect(read).toHaveBeenLastCalledWith({page: 1, pageSize: 20, searchText: '露台', category: 'onsite'})
    old.resolve(page('late'))
    await pending
    expect(store.items.map(x => x.id)).toEqual(['new'])
    await store.loadMore()
    expect(read).toHaveBeenLastCalledWith({page: 2, pageSize: 20, searchText: '露台', category: 'onsite'})
  })
  it('a new principal clears category, search and rows, including late responses', async () => {
    const old = deferred<ReturnType<typeof page>>()
    const actor = ref(session)
    const store = useWorkOrderListStore()
    store.configureApi({listWorkOrders: () => old.promise} as unknown as TechnicianApiReadPort, () => actor.value)
    store.searchText = 'private'
    const pending = store.selectCategory('following')
    actor.value = {...session, currentRole: {id: asOpaqueId<'RoleId'>('other-role')}}
    old.resolve(page('late'))
    await pending
    expect(store.category).toBe('all'); expect(store.searchText).toBe(''); expect(store.items).toEqual([])
  })
  it('a failed category load does not display old category data and explicit retry retains category', async () => {
    const read = vi.fn().mockResolvedValueOnce(page('old')).mockResolvedValueOnce({state: 'failed_retryable', error: {category: 'network_retryable', retryable: true, message: 'retry'}}).mockResolvedValue(page('new'))
    const store = useWorkOrderListStore()
    store.configureApi({listWorkOrders: read} as unknown as TechnicianApiReadPort, () => session)
    await store.load(); await store.selectCategory('to_accept')
    expect(store.items).toEqual([]); expect(store.loadState).toBe('failed_retryable')
    await store.retry()
    expect(read).toHaveBeenLastCalledWith({page: 1, pageSize: 20, category: 'to_accept'})
  })
})
