import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useQuotationOrderBrowseStore } from '@features/work-orders/quotation/order-browse-store'
import type {
  QuotationOrderBrowseItem, QuotationOrderReadPort, ReadPage, SessionSnapshot,
} from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'
import { asOpaqueId } from '@shared/types'

const workOrderId = 'mock-wo-019'
const row = (id: string, owner = workOrderId): QuotationOrderBrowseItem => ({
  id, type: 1, serviceAppointmentId: owner,
  groups: [], contentSupported: false, pdfState: 'absent',
})
const page = (rows: readonly QuotationOrderBrowseItem[], total = rows.length): OperationSnapshot<ReadPage<QuotationOrderBrowseItem>> => ({
  state: 'succeeded',
  data: { items: rows, page: 1, pageSize: 3, totalCount: total },
})
const session = (roleId = 'role-a', version = 'v1'): SessionSnapshot => ({
  sessionRef: asOpaqueId<'SessionRef'>('mock-session-1'),
  user: { id: asOpaqueId<'UserId'>('mock-user'), displayName: 'Synthetic' },
  currentRole: { id: asOpaqueId<'RoleId'>(roleId), name: 'Synthetic Role' },
  roleVersion: version,
  capabilityNames: ['work-order.read'],
})
const setup = (read: (id: string, size: 1 | 3) => Promise<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>>) => {
  const port: QuotationOrderReadPort = {
    getQuotationOrderById: async () => ({ state: 'failed_terminal' }),
    listTypeOneOrdersForWorkOrder: read,
  }
  let activeSession: SessionSnapshot | null = session()
  const store = useQuotationOrderBrowseStore()
  store.configure(port, () => activeSession)
  return {
    store,
    setSession: (next: SessionSnapshot | null) => { activeSession = next },
  }
}
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('M1 #39 official Order read-only list: exact paging + signing identity handoff safety', () => {
  it('never reuses a 1-row cache for a 3-row request, or the reverse', async () => {
    const read = vi.fn(async (_id: string, size: 1 | 3) =>
      size === 1 ? page([row('official-a')], 7) : page([
        row('official-a'), row('official-b'), row('official-c'),
      ], 7))
    const { store } = setup(read)
    const first = await store.load(workOrderId, 1)
    expect(first.state).toBe('succeeded')
    expect(first.data?.items).toHaveLength(1)
    expect(first.data?.totalCount).toBe(7)
    expect((await store.load(workOrderId, 1)).data?.items).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(1)

    const larger = await store.load(workOrderId, 3)
    expect(larger.data?.items).toHaveLength(3)
    expect(larger.data?.totalCount).toBe(7)
    expect(read).toHaveBeenCalledTimes(2)
    expect((await store.load(workOrderId, 3)).data?.items).toHaveLength(3)
    expect(read).toHaveBeenCalledTimes(2)

    const smallerAgain = await store.load(workOrderId, 1)
    expect(smallerAgain.data?.items).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('coalesces only identical in-flight scope and size', async () => {
    const release = deferred<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>>()
    const read = vi.fn(() => release.promise)
    const { store } = setup(read)
    const p1 = store.load(workOrderId, 3)
    const p2 = store.load(workOrderId, 3)
    await Promise.resolve()
    release.resolve(page([row('official-a')]))
    const [a, b] = await Promise.all([p1, p2])
    expect(a.state).toBe('succeeded')
    expect(b.state).toBe('succeeded')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('blocks a 1-row response arriving after a newer 3-row request', async () => {
    const pending1 = deferred<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>>()
    const pending3 = deferred<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>>()
    const read = vi.fn((_id: string, size: 1 | 3) =>
      size === 1 ? pending1.promise : pending3.promise)
    const { store } = setup(read)
    const p1 = store.load(workOrderId, 1)
    const p3 = store.load(workOrderId, 3)
    await Promise.resolve()
    pending3.resolve(page([row('official-new-a'), row('official-new-b')]))
    expect((await p3).data?.items.map(x => x.id)).toEqual(['official-new-a', 'official-new-b'])
    pending1.resolve(page([row('official-old')]))
    expect((await p1).state).toBe('failed_terminal')
    expect(store.items.map(x => x.id)).toEqual(['official-new-a', 'official-new-b'])
  })

  it('rejects foreign work-order, non-type1, duplicate and oversized rows atomically', async () => {
    const cases: readonly QuotationOrderBrowseItem[][] = [
      [row('allowed'), row('foreign', 'other-work-order')],
      [row('allowed'), { ...row('not-official'), type: 0 as 1 }],
      [row('same'), row('same')],
      [row('one'), row('two')],
      [{ ...row('missing-id'), id: '' }],
    ]
    for (const rows of cases) {
      const { store } = setup(async () => page(rows))
      const result = await store.load(workOrderId, 1)
      expect(result).toMatchObject({ state: 'failed_terminal', error: { category: 'server_terminal' } })
      expect(store.items).toEqual([])
      expect(store.state).toBe('failed_terminal')
      expect(JSON.stringify(result)).not.toContain('foreign')
    }
  })

  it('blocks malformed success without data; a retry can recover', async () => {
    let fail = true
    const read = vi.fn(async () => fail
      ? ({ state: 'succeeded' as const })
      : page([row('recovered')]))
    const { store } = setup(read)
    expect((await store.load(workOrderId)).state).toBe('failed_terminal')
    expect(store.items).toEqual([])
    fail = false
    expect((await store.load(workOrderId)).data?.items[0].id).toBe('recovered')
  })

  it('converts thrown transport failure to retryable state without leaking error contents', async () => {
    const secret = 'Private-Debug-Token-Must-Not-Leak'
    const read = vi.fn().mockRejectedValueOnce(new Error(secret)).mockResolvedValueOnce(page([row('ok')]))
    const { store } = setup(read)
    const failed = await store.load(workOrderId)
    expect(failed.state).toBe('failed_retryable')
    expect(JSON.stringify(failed)).not.toContain(secret)
    expect(store.state).toBe('failed_retryable')
    expect(store.errorMessage).not.toContain(secret)
    expect((await store.load(workOrderId)).state).toBe('succeeded')
  })

  it('rejects completion after role-version change, logout and WorkOrder switch', async () => {
    for (const operation of ['role', 'logout', 'workorder'] as const) {
      const old = deferred<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>>()
      const fresh = deferred<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>>()
      const read = vi.fn((id: string) => id === workOrderId ? old.promise : fresh.promise)
      const { store, setSession } = setup(read)
      const pending = store.load(workOrderId)
      await Promise.resolve()
      if (operation === 'role') setSession(session('role-a', 'v2'))
      if (operation === 'logout') setSession(null)
      if (operation === 'workorder') {
        const newer = store.load('other-work-order')
        fresh.resolve(page([row('other-row', 'other-work-order')]))
        expect((await newer).state).toBe('succeeded')
      }
      old.resolve(page([row('sensitive-old')]))
      const result = await pending
      expect(result.state).not.toBe('succeeded')
      expect(JSON.stringify(result)).not.toContain('sensitive-old')
      expect(store.items.some(item => item.id === 'sensitive-old')).toBe(false)
    }
  })

  it('invalid pageSize and invalid WorkOrder fail without read transport', async () => {
    const read = vi.fn(async () => page([]))
    const { store } = setup(read)
    expect((await store.load('../not-workorder')).state).toBe('failed_terminal')
    expect((await store.load(workOrderId, 2 as 1)).state).toBe('failed_terminal')
    expect(read).not.toHaveBeenCalled()
  })

  it('clears previously cached pages and rejects pending reads on manual invalidate', async () => {
    const old = deferred<OperationSnapshot<ReadPage<QuotationOrderBrowseItem>>>()
    const { store } = setup(async () => old.promise)
    const pending = store.load(workOrderId)
    store.clear()
    await Promise.resolve()
    old.resolve(page([row('not-to-show')]))
    expect((await pending).state).toBe('failed_terminal')
    expect(store.items).toEqual([])
    expect(store.state).toBe('idle')
  })
})
