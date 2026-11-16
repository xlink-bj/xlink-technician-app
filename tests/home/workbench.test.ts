import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useWorkbenchStore, projectWorkbench, type WorkbenchDemo } from '@features/home/workbench'
import { matchesWorkKind } from '@features/work-orders/work-kind'
import { useWorkOrderListStore } from '@features/work-orders/list'
import type { SessionSnapshot, TechnicianApiReadPort, WorkOrderSummary } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
const identity: SessionSnapshot = { sessionRef: asOpaqueId('s'), user: { id: asOpaqueId('u'), displayName: '王师傅' }, currentRole: { id: asOpaqueId('r'), name: '现场工程师' }, roleVersion: 'v1', capabilityNames: ['work-order.read'] }
const order: WorkOrderSummary = { id: asOpaqueId('work-1'), taskLabel: '现场勘察', customerName: '示例客户', serviceAddress: '示例小区', workflowNodes: [{ id: asOpaqueId('node-1'), category: 'forms', lifecycle: 'active' }] }
const demo: WorkbenchDemo = { date: '2026-11-16', appointments: [{ id: 'work-1', nodeId:'node-1', time: '10:00', title: '现场勘察', instruction: '核对现场' }, { id: 'hidden', nodeId:'hidden-node', time: '09:00', title: '不可见', instruction: '不可见' }], completedIds: [] }
const page = (items: readonly WorkOrderSummary[] = [order], totalCount = 100) => ({ state: 'succeeded' as const, data: { items, page: 1, totalCount } })
function setup(read = vi.fn().mockResolvedValue(page()), preview: WorkbenchDemo | null = demo) {
 const session = ref<SessionSnapshot | null>(identity), source = ref(preview), invalid = vi.fn(async () => { session.value = null })
 const store = useWorkbenchStore(); store.configure({ listWorkOrders: read } as unknown as TechnicianApiReadPort, () => session.value, () => source.value, invalid)
 return { store, session, source, invalid, read }
}
beforeEach(() => setActivePinia(createPinia()))
describe('C1 scoped workbench read model', () => {
 it('production keeps aggregate/calendar/month unknown despite a nonempty page and a total', async () => {
  const {store, read} = setup(undefined, null); await store.refresh()
  expect(read).toHaveBeenCalledOnce(); expect(read).toHaveBeenCalledWith({page:1,pageSize:20,category:'all'})
  expect(store.counts).toEqual({}); expect(store.tasks).toEqual([]); expect(store.completed).toBeNull(); expect(store.demoDate).toBeNull()
  expect(store.next?.order.id).toBe('work-1'); expect(store.next?.time).toBeUndefined()
 })
 it('takes demo totals from each category response, never page length; appointments must intersect listed IDs', async () => {
  const read = vi.fn().mockResolvedValueOnce(page([order], 8)).mockResolvedValueOnce(page([], 0)).mockResolvedValueOnce(page([order], 7)).mockResolvedValueOnce(page([order], 5)).mockResolvedValueOnce(page())
  const {store} = setup(read); await store.refresh()
  expect(store.counts).toEqual({to_accept:8,need_contact:0,onsite:7,following:5})
  expect(store.tasks.map(t=>t.order.id)).toEqual(['work-1']); expect(store.next).toEqual(store.tasks[0]); expect(store.completed).toBe(0)
  expect(read.mock.calls.map(call=>call[0].category)).toEqual(['to_accept','need_contact','onsite','following','all'])
 })
 it('does not turn missing totals or a successful empty real page into zero aggregates', async () => {
  const {store} = setup(vi.fn().mockResolvedValue({state:'succeeded',data:{items:[]}}), null); await store.refresh()
  expect(store.state).toBe('ready'); expect(store.next).toBeNull(); expect(store.counts).toEqual({}); expect(store.completed).toBeNull()
 })
 it('separates failed reads from empty, clears previous facts and invalidates an expired session', async () => {
  const {store,read,invalid} = setup(); await store.refresh(); expect(store.tasks).toHaveLength(1)
  read.mockResolvedValue({state:'failed_terminal',error:{category:'session_invalid'}}); await store.refresh()
  expect(store.tasks).toEqual([]); expect(store.counts).toEqual({}); expect(store.next).toBeNull(); expect(invalid).toHaveBeenCalledOnce()
 })
 it.each(['session','role','version'] as const)('clears immediately on %s change and ignores a late read', async change => {
  let release!: (value:unknown)=>void
  const {store,read,session} = setup(); await store.refresh()
  read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
  const pending=store.refresh()
  session.value={...identity, ...(change==='session'?{sessionRef:asOpaqueId('new')}:change==='role'?{currentRole:{id:asOpaqueId('other'),name:'其他角色'}}:{roleVersion:'v2'})}
  expect(store.tasks).toEqual([]); expect(store.demoDate).toBeNull()
  release(page()); await pending; expect(store.state).toBe('idle'); expect(store.next).toBeNull()
  await store.refresh(); expect(store.state).toBe('ready')
 })
 it('discards a response when Mock is disabled during the request', async () => {
  let release!: (value:unknown)=>void
  const {store,source} = setup(vi.fn(()=>new Promise(resolve=>{release=resolve})))
  const pending=store.refresh(); source.value=null; release(page()); await pending
  expect(store.tasks).toEqual([]); expect(store.counts).toEqual({}); expect(store.demoDate).toBeNull(); expect(store.state).toBe('idle')
 })
 it('renders a thrown read failure as an error without retaining facts', async () => {
  const {store,read}=setup(); await store.refresh(); read.mockRejectedValue(new Error('transport failed')); await store.refresh()
  expect(store.state).toBe('error'); expect(store.tasks).toEqual([]); expect(store.counts).toEqual({})
 })
 it('rejects a missing role without starting any read', async () => {
  const {store,session,read}=setup(); session.value={...identity,currentRole:undefined}; await store.refresh(); expect(read).not.toHaveBeenCalled(); expect(store.state).toBe('unavailable')
 })
 it('drops a scheduled task when its referenced node closes or changes', () => {
  expect(projectWorkbench([{...order,workflowNodes:[]}],identity,demo).next).toBeNull()
  expect(projectWorkbench([{...order,workflowNodes:[{id:asOpaqueId('node-1'),category:'forms',lifecycle:'closed'}]}],identity,demo).appointments).toEqual([])
 })
 it('never offers a pre-accept task detail merely because the demo referenced its ID', () => {
  const accepting={...order,workflowNodes:[{id:asOpaqueId<'WorkflowNodeRuntimeId'>('n'),category:'accept' as const,lifecycle:'active' as const}]}
  expect(projectWorkbench([accepting],identity,demo).next).toBeNull()
 })
})
describe('C1 work selection keeps ordinary list authority', () => {
 it('filters by visible stage evidence, never turns an entry into an action or trusts an ID', () => {
  expect(matchesWorkKind(order,'survey')).toBe(true); expect(matchesWorkKind(order,'acceptance')).toBe(false)
  const acceptance={...order,taskLabel:'验收回款'}; expect(matchesWorkKind(acceptance,'construction')).toBe(true); expect(matchesWorkKind(acceptance,'acceptance')).toBe(true)
  expect(matchesWorkKind({...order,taskLabel:undefined},'survey')).toBe(false)
 })
 it('resets previous search/category for work selection, and revokes selected rows on role change', async () => {
  const session=ref<SessionSnapshot|null>(identity), read=vi.fn().mockResolvedValue(page())
  const list=useWorkOrderListStore();list.configureApi({listWorkOrders:read} as unknown as TechnicianApiReadPort,()=>session.value)
  await list.search('old'); await list.selectCategory('following'); await list.selectWorkKind('survey')
  expect(read).toHaveBeenLastCalledWith({page:1,pageSize:20,category:'all'});expect(list.visibleItems.map(x=>x.id)).toEqual(['work-1'])
  session.value={...identity,currentRole:{id:asOpaqueId('other'),name:'other'}};expect(list.items).toEqual([]);expect(list.workKind).toBe('all')
 })
})
