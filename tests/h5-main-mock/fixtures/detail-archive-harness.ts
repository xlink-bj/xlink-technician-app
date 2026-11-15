import { useSessionStore } from '../../../src/shared/state'
import { useWorkOrderDetailStore } from '../../../src/features/work-orders/detail'
import { useQuotationOrderBrowseStore } from '../../../src/features/work-orders/quotation/order-browse-store'
import type { QuotationOrderBrowseItem, QuotationOrderReadPort, TechnicianApiReadPort, WorkOrderDetail } from '../../../src/shared/ports'
let syntheticDetail: WorkOrderDetail | null = null

/** DEV H5 test-only synthetic read-port outcomes on the actual mounted App.
 * No business command, document URL, external request or production authority. */
export async function installArchiveScenario(mode: 'zero' | 'one' | 'many' | 'partial' | 'failed' | 'denied' | 'loading') {
  const auth = useSessionStore(), detailStore = useWorkOrderDetailStore(), browse = useQuotationOrderBrowseStore()
  const id = String(detailStore.detail!.id)
  if (!syntheticDetail) {
    syntheticDetail = detailStore.detail
    detailStore.configureApi({ getWorkOrderDetail: async requested => {
      if (String(requested) !== String(syntheticDetail?.id)) throw new Error('Foreign synthetic archive scope')
      return { state: 'succeeded', data: syntheticDetail! }
    } } as TechnicianApiReadPort, () => auth.session)
  }
  const items: QuotationOrderBrowseItem[] = Array.from({ length: mode === 'zero' ? 0 : mode === 'one' ? 1 : 3 }, (_, index) => ({
    id: `synthetic-archive-order-${index}`, serviceAppointmentId: id, type: 1, displayNumber: `SYNTHETIC-${index + 1}`,
    updateTime: `2026-11-${13 + index} 10:00:00`, totalPrice: 100 + index,
    groups: [], contentSupported: true, pdfState: 'present_no_access',
  }))
  browse.configure({ getQuotationOrderById: async () => { throw new Error('No direct Order read in archive fixture') }, listTypeOneOrdersForWorkOrder: async () => {
    if (mode === 'loading') return new Promise(() => {})
    if (mode === 'failed' || mode === 'denied') return { state: 'failed_terminal', error: {
      category: mode === 'denied' ? 'authorization_denied' : 'server_terminal', message: 'synthetic read failure', retryable: false,
    } }
    return { state: 'succeeded', data: { items, page: 1, pageSize: 3, ...(mode === 'partial' ? {} : { totalCount: items.length }) } }
  } } as QuotationOrderReadPort, () => auth.session)
  syntheticDetail = { ...syntheticDetail!, activityReadState: mode === 'failed' ? 'failed' : 'succeeded', activities: mode === 'zero' || mode === 'failed' ? [] : [0, 1, 2].map(index => ({
    id: `synthetic-followup-${index}`, title: '合成跟进记录', content: `现场服务记录 ${index + 1}`, owner: '合成技术员', time: `2026-11-${15 - index} 09:00`, icon: 'task', tone: 'blue', badge: '跟进',
  })) }
  await detailStore.loadFromRoute(id)
}
