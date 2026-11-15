import { useSessionStore } from '../../../src/shared/state'
import { useWorkOrderDetailStore } from '../../../src/features/work-orders/detail'
import { useQuotationOrderBrowseStore } from '../../../src/features/work-orders/quotation/order-browse-store'
import type { QuotationOrderReadPort, TechnicianApiReadPort, WorkOrderDetail } from '../../../src/shared/ports'
import { createQuotationOrderReadAdapter } from '../../../src/adapters/api/quotation-order-api'
let syntheticDetail: WorkOrderDetail | null = null

/** DEV H5 test-only synthetic read-port outcomes on the actual mounted App.
 * No business command, document URL, external request or production authority. */
export async function installArchiveScenario(mode: 'zero' | 'one' | 'many' | 'partial' | 'failed' | 'denied' | 'loading', followUpExample: 'normal' | 'single' | 'long' = 'normal') {
  const auth = useSessionStore(), detailStore = useWorkOrderDetailStore(), browse = useQuotationOrderBrowseStore()
  const id = String(detailStore.detail!.id)
  if (!syntheticDetail) {
    syntheticDetail = detailStore.detail
    detailStore.configureApi({ getWorkOrderDetail: async requested => {
      if (String(requested) !== String(syntheticDetail?.id)) throw new Error('Foreign synthetic archive scope')
      return { state: 'succeeded', data: syntheticDetail! }
    } } as TechnicianApiReadPort, () => auth.session)
  }
  // Fictional commercial examples, not saved Orders. Keep synthetic identity
  // internal and pass R1-shaped snapshots through the production read mapper.
  // `amount`/`totalAmount` are fixture Order snapshots, never a catalog fallback.
  const totals = [77.2, 115.8, 154.4] as const
  const rows = Array.from({ length: mode === 'zero' ? 0 : mode === 'one' ? 1 : 3 }, (_, index) => ({
    _id: `synthetic-archive-order-${index}`, serviceAppointmentId: id, type: 1,
    orderNumber: `BJ202611${13 + index}000${index + 1}`, state: 1, processState: 1,
    updateTime: `2026-11-${13 + index} 10:00:00`, originPrice: totals[index]!, totalPrice: totals[index]!,
    exts: { isAgain: 0 },
    bjProducts: JSON.stringify({ orderList: [{
      repairParts: ['mock-roof'], partDescription: '屋面落水口防水修补', maintainAreaNum: '2',
      totalAmount: totals[index]!, projPackages: { data: [] }, procedures: { data: [] }, measures: { data: [] },
      materials: { data: [{ materialId: 'mock-catalog-material-butyl-tape', number: index + 2,
        amount: 38.6, totalAmount: totals[index]!,
        material: { _id: 'mock-catalog-material-butyl-tape', name: '丁基防水密封胶带（100mm×10m）', unit: '卷' },
      }] },
    }] }),
  }))
  const orderRead = createQuotationOrderReadAdapter({ execute: async () => ({ data: rows, page: 1, rows: 3,
    ...(mode === 'partial' ? {} : { total: rows.length }),
  }) }, requested => requested === id)
  browse.configure({ getQuotationOrderById: async () => { throw new Error('No direct Order read in archive fixture') }, listTypeOneOrdersForWorkOrder: async () => {
    if (mode === 'loading') return new Promise(() => {})
    if (mode === 'failed' || mode === 'denied') return { state: 'failed_terminal', error: {
      category: mode === 'denied' ? 'authorization_denied' : 'server_terminal', message: 'synthetic read failure', retryable: false,
    } }
    return orderRead.listTypeOneOrdersForWorkOrder(id, 3)
  } } as QuotationOrderReadPort, () => auth.session)
  syntheticDetail = { ...syntheticDetail!, activityReadState: mode === 'failed' ? 'failed' : 'succeeded', activities: mode === 'zero' || mode === 'failed' ? [] : [0, 1, 2].slice(0, followUpExample === 'single' ? 1 : 3).map(index => ({
    id: `synthetic-followup-${index}`, title: followUpExample === 'long' && index === 0 ? '到场安排与屋面检修范围沟通确认' : ['到场安排确认', '维修范围沟通', '客户需求回访'][index]!,
    content: followUpExample === 'long' && index === 0 ? '已与客户确认到场安排，请提前电话联系。现场需检查落水口、女儿墙根及原防水搭接处，核查雨后积水范围，记录现有防水层情况，并与客户逐项确认维修边界及后续处理安排。' : ['已与客户确认到场安排，请提前电话联系。', '已沟通屋面落水口及周边修补范围。', '客户反馈雨后屋面有积水，需现场核查。'][index]!,
    owner: '陈师傅', time: `2026-11-${15 - index} 09:00`, icon: 'task', tone: 'blue', badge: '跟进',
  })) }
  await detailStore.loadFromRoute(id)
}

/** Successful empty visible-field configuration; not a read failure or missing provider. */
export async function installCustomerInformationEmptyScenario() {
  if (!syntheticDetail) throw new Error('Open the actual synthetic detail before configuring customer fields')
  syntheticDetail = { ...syntheticDetail, informationFields: [] }
  await useWorkOrderDetailStore().loadFromRoute(String(syntheticDetail.id))
}

/** Keep successful empty, denied and unavailable follow-up reads distinct from failure. */
export async function installFollowUpReadState(state: 'succeeded' | 'failed' | 'denied' | 'unavailable' | undefined) {
  if (!syntheticDetail) throw new Error('Open a scoped synthetic archive before setting read outcomes')
  syntheticDetail = { ...syntheticDetail, activityReadState: state, activities: [] }
  await useWorkOrderDetailStore().loadFromRoute(String(syntheticDetail.id))
}
