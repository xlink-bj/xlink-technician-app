import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { QuotationOrderBrowseItem, QuotationOrderReadPort, ReadPage, SessionSnapshot } from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'
import { asOpaqueId } from '@shared/types'
import { useQuotationOrderBrowseStore } from '@features/work-orders/quotation/order-browse-store'

function succeeded<T>(data: T): OperationSnapshot<T> { return { state: 'succeeded', data } }

function session(ref: string): SessionSnapshot {
  return {
    sessionRef: asOpaqueId<'SessionRef'>(ref),
    user: { id: asOpaqueId<'UserId'>('synthetic-user') },
    capabilityNames: [],
  }
}

const quote: QuotationOrderBrowseItem = {
  id: 'synthetic-order-id',
  type: 1,
  serviceAppointmentId: 'synthetic-work-order-id',
  groups: [],
  contentSupported: false,
  pdfState: 'absent',
}

describe('Production Work-Order-scoped quotation browse store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads one bounded server page, caches only in memory for the session, and returns no quote IDs through status copy', async () => {
    let currentSession: SessionSnapshot | null = session('synthetic-session-a')
    const list = vi.fn(async (workOrderId: string) => succeeded<ReadPage<QuotationOrderBrowseItem>>({
      items: [{ ...quote, serviceAppointmentId: workOrderId }], page: 1, pageSize: 3, totalCount: 42,
    }))
    const port: QuotationOrderReadPort = {
      getQuotationOrderById: async () => ({ state: 'failed_terminal' }),
      listTypeOneOrdersForWorkOrder: list,
    }
    const store = useQuotationOrderBrowseStore()
    store.configure(port, () => currentSession)

    await store.load('synthetic-work-order-id')
    await store.load('synthetic-work-order-id')
    expect(list).toHaveBeenCalledTimes(1)
    expect(store.items).toEqual([quote])
    expect(store.fetchedSessionRef).toBe('synthetic-session-a')
    expect(store.errorMessage).toBe('')

    await store.load('synthetic-other-work-order-id')
    expect(list).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenLastCalledWith('synthetic-other-work-order-id', 3)
    expect(store.fetchedWorkOrderId).toBe('synthetic-other-work-order-id')

    currentSession = session('synthetic-session-b')
    store.clear()
    expect(store.items).toEqual([])
    expect(store.fetchedSessionRef).toBeNull()
    await store.load('synthetic-work-order-id')
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('does not retain a response that resolves after the authenticated session changes', async () => {
    let currentSession: SessionSnapshot | null = session('synthetic-session-a')
    let resolveList: ((result: OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>) => void) | undefined
    const pending = new Promise<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>>((resolve) => { resolveList = resolve })
    const port: QuotationOrderReadPort = {
      getQuotationOrderById: async () => ({ state: 'failed_terminal' }),
      listTypeOneOrdersForWorkOrder: () => pending,
    }
    const store = useQuotationOrderBrowseStore()
    store.configure(port, () => currentSession)

    const request = store.load('synthetic-work-order-id')
    currentSession = session('synthetic-session-b')
    resolveList?.(succeeded({ items: [quote], page: 1, pageSize: 3 }))
    const result = await request
    expect(result.state).toBe('failed_terminal')
    expect(store.items).toEqual([])
    expect(store.fetchedSessionRef).toBeNull()
  })
})
