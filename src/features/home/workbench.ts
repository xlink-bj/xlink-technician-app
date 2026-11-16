import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { SessionSnapshot, TechnicianApiReadPort, WorkOrderSummary, WorkOrderCategory } from '@shared/ports'
import { workOrderReadScopeKey, workOrderListActionFor } from '@features/work-orders'

export const todoCategories = ['to_accept', 'need_contact', 'onsite', 'following'] as const
export interface WorkbenchDemo {
  readonly date: string
  readonly appointments: readonly { id: string; nodeId: string; time: string; title: string; instruction: string }[]
  readonly completedIds: readonly string[]
}
export interface WorkbenchTask {
  readonly order: WorkOrderSummary
  readonly time?: string
  readonly title: string
  readonly instruction: string
}
/** No production calendar/completion contract exists. Demo metadata never supplies authority. */
export function projectWorkbench(items: readonly WorkOrderSummary[], session: SessionSnapshot | null, demo: WorkbenchDemo | null) {
  const visible = items.filter(item => workOrderListActionFor(item, session).detailAccessible)
  const appointments: WorkbenchTask[] = demo ? demo.appointments.flatMap(entry => {
    const order = visible.find(item => item.id === entry.id)
    return order && order.workflowNodes?.some(node => node.id === entry.nodeId && node.lifecycle === 'active') ? [{ order, time: entry.time, title: entry.title, instruction: entry.instruction }] : []
  }).sort((a, b) => a.time!.localeCompare(b.time!)) : []
  return {
    appointments,
    next: demo ? appointments[0] ?? null : (visible[0] ? { order: visible[0], title: visible[0].taskLabel || '工单事项', instruction: '进入工单查看当前阶段与可处理事项' } : null),
    completed: demo ? demo.completedIds.filter(id => visible.some(item => item.id === id)).length : null,
  }
}

export const useWorkbenchStore = defineStore('workbench', () => {
  const state = ref<'idle' | 'loading' | 'ready' | 'error' | 'unavailable'>('idle')
  const counts = ref<Partial<Record<WorkOrderCategory, number>>>({})
  const tasks = ref<WorkbenchTask[]>([])
  const next = ref<WorkbenchTask | null>(null)
  const completed = ref<number | null>(null)
  const demoDate = ref<string | null>(null)
  let api: TechnicianApiReadPort | null = null
  let getSession: () => SessionSnapshot | null = () => null
  let getDemo: () => WorkbenchDemo | null = () => null
  let invalidateSession: () => Promise<unknown> = async () => undefined
  let version = 0
  let stop: (() => void) | undefined
  function clear() {
    version++; state.value = 'idle'; counts.value = {}; tasks.value = []; next.value = null
    completed.value = null; demoDate.value = null
  }
  function configure(reader: TechnicianApiReadPort, session: typeof getSession, demo: typeof getDemo, invalid: typeof invalidateSession) {
    stop?.(); clear(); api = reader; getSession = session; getDemo = demo; invalidateSession = invalid
    stop = watch(() => workOrderReadScopeKey(getSession()), clear, { flush: 'sync' })
  }
  async function refresh() {
    clear()
    const scope = workOrderReadScopeKey(getSession())
    if (!scope || !api) { state.value = 'unavailable'; return }
    const ticket = version
    const demo = getDemo()
    const sourceKey = demo?.date ?? null
    const current = () => version === ticket && scope === workOrderReadScopeKey(getSession()) && (getDemo()?.date ?? null) === sourceKey
    state.value = 'loading'
    const totals: Partial<Record<WorkOrderCategory, number>> = {}
    // Sequential: the existing read adapter intentionally invalidates earlier list intents.
    // Real aggregate coverage is unverified, so do not promote page counts to totals.
    try {
      for (const category of demo ? todoCategories : []) {
        const result = await api.listWorkOrders({ page: 1, pageSize: 20, category })
        if (!current()) { if (version === ticket) clear(); return }
        if (result.state !== 'succeeded' || !result.data) {
          clear(); state.value = 'error'
          if (result.error?.category === 'session_invalid') await invalidateSession()
          return
        }
        if (result.data.totalCount !== undefined) totals[category] = result.data.totalCount
      }
      const result = await api.listWorkOrders({ page: 1, pageSize: 20, category: 'all' })
      if (!current()) { if (version === ticket) clear(); return }
      if (result.state !== 'succeeded' || !result.data) {
        clear(); state.value = 'error'
        if (result.error?.category === 'session_invalid') await invalidateSession()
        return
      }
      const projection = projectWorkbench(result.data.items, getSession(), demo)
      counts.value = totals; tasks.value = projection.appointments; next.value = projection.next
      completed.value = projection.completed; demoDate.value = demo?.date ?? null; state.value = 'ready'
    } catch {
      if (current()) { clear(); state.value = 'error' }
    }
  }
  return { state, counts, tasks, next, completed, demoDate, clear, configure, refresh }
})
