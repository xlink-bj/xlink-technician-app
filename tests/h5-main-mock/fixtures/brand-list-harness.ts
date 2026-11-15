import { useWorkOrderListStore } from '../../../src/features/work-orders/list'
import { useSessionStore } from '../../../src/shared/state'
import type { TechnicianApiReadPort, WorkOrderSummary } from '../../../src/shared/ports'
import { createOperationError } from '../../../src/shared/types'

let original: readonly WorkOrderSummary[] = []
let release: (() => void) | undefined

/** Only synthetic read outcomes on the real mounted App. */
export async function installListScenario(mode: 'empty' | 'failed' | 'loading' | 'long' | 'pages') {
  const store = useWorkOrderListStore(), auth = useSessionStore()
  if (!original.length) original = [...store.items]
  if (!original.length) throw new Error('Open the actual synthetic work-order list before installing read outcomes')
  release?.(); release = undefined
  store.configureApi({
    listWorkOrders: async input => {
      if (mode === 'loading') await new Promise<void>(resolve => { release = resolve })
      if (mode === 'failed') return { state: 'failed_retryable', error: createOperationError('network_retryable', 'Synthetic list read interrupted') }
      const items = mode === 'empty' ? [] : mode === 'pages' ? original.slice(input.page === 1 ? 0 : 2, input.page === 1 ? 2 : 3)
        : mode === 'long' ? [{ ...original[0]!, customerName: '王女士（现场维修联系人）', serviceDistrict: '朝阳区', serviceAddress: '望京花园西区东侧三号楼一单元屋面与设备平台交接处，请从南门进入并提前联系现场负责人' }]
          : original
      return { state: 'succeeded', data: { items, page: input.page, pageSize: input.pageSize, totalCount: mode === 'pages' ? 3 : items.length } }
    },
  } as TechnicianApiReadPort, () => auth.session)
  const loading = store.load()
  if (mode !== 'loading') await loading
}

export function releaseListLoading() { release?.(); release = undefined }

/** R1 precheck may require confirmation. This fixture cannot accept an order. */
export function installAcceptConfirmation() {
  useWorkOrderListStore().configureCommandApi({
    inspectAcceptOrder: async () => ({ state: 'succeeded', data: { requiresConfirmation: true } }),
    acceptOrder: async () => { throw new Error('Confirmation review must never execute an order command') },
    readAppointmentForm: async () => { throw new Error('Confirmation fixture cannot load an appointment') },
    submitAppointment: async () => { throw new Error('Confirmation fixture cannot submit an appointment') },
  })
}
