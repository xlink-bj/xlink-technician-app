import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import type { SessionSnapshot, TechnicianApiReadPort, WorkOrderDetail } from '@shared/ports'
import { asOpaqueId, createOperationError, type OperationSnapshot } from '@shared/types'

const id = (value: string) => asOpaqueId<'WorkOrderId'>(value)
const session = (): SessionSnapshot => ({
  sessionRef: asOpaqueId<'SessionRef'>('synthetic-detail-session'),
  user: { id: asOpaqueId<'UserId'>('synthetic-user'), displayName: 'Synthetic' },
  currentRole: { id: asOpaqueId<'RoleId'>('role-a'), name: 'Synthetic role' },
  capabilityNames: ['work-order.read'],
})
const ok = (value: string): OperationSnapshot<WorkOrderDetail> => ({
  state: 'succeeded', data: { id: id(value), customerName: `synthetic-${value}` },
})
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
function setup(read: TechnicianApiReadPort['getWorkOrderDetail'], invalidation = vi.fn(async () => {})) {
  let current: SessionSnapshot | null = session()
  const store = useWorkOrderDetailStore()
  store.configureApi({ getWorkOrderDetail: read } as TechnicianApiReadPort, () => current, invalidation)
  return { store, invalidation, setSession: (value: SessionSnapshot | null) => { current = value } }
}

beforeEach(() => setActivePinia(createPinia()))

describe('detail load owns the latest route rather than a global in-flight request', () => {
  it('starts B while A is pending and rejects the late A success', async () => {
    const a = deferred<OperationSnapshot<WorkOrderDetail>>()
    const b = deferred<OperationSnapshot<WorkOrderDetail>>()
    const read = vi.fn((value: string) => value === 'a' ? a.promise : b.promise)
    const { store } = setup(read)
    const old = store.loadFromRoute('a')
    const next = store.loadFromRoute('b')
    expect(read.mock.calls.map(([value]) => value)).toEqual(['a', 'b'])
    expect(store.currentWorkOrderId).toBe('b')
    expect(store.detail).toBeNull()
    b.resolve(ok('b'))
    expect((await next).state).toBe('succeeded')
    a.resolve(ok('a'))
    expect((await old).state).toBe('failed_terminal')
    expect(store.detail?.id).toBe('b')
    expect(store.loadState).toBe('succeeded')
  })

  it('keeps duplicate same-ID clicks to one request', async () => {
    const pending = deferred<OperationSnapshot<WorkOrderDetail>>()
    const read = vi.fn(() => pending.promise)
    const { store } = setup(read)
    const first = store.load(id('a'))
    expect((await store.load(id('a'))).error?.category).toBe('validation')
    expect(read).toHaveBeenCalledTimes(1)
    pending.resolve(ok('a'))
    expect((await first).state).toBe('succeeded')
  })

  it.each(['sync', 'async'] as const)('normalizes %s throws and lets explicit retry recover', async (mode) => {
    let count = 0
    const read = vi.fn((value: string): Promise<OperationSnapshot<WorkOrderDetail>> => {
      if (++count !== 1) return Promise.resolve(ok(value))
      if (mode === 'sync') throw new Error('synthetic-private-diagnostic')
      return Promise.reject(new Error('synthetic-private-diagnostic'))
    })
    const { store } = setup(read)
    const failed = await store.load(id('a'))
    expect(failed.state).toBe('failed_retryable')
    expect(store.loadState).toBe('failed_retryable')
    expect(store.detail).toBeNull()
    expect(JSON.stringify(failed)).not.toContain('synthetic-private-diagnostic')
    expect((await store.retry()).state).toBe('succeeded')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('does not let a stale session failure log out the newer route', async () => {
    const pending = deferred<OperationSnapshot<WorkOrderDetail>>()
    const { store, invalidation } = setup(value => value === 'a' ? pending.promise : Promise.resolve(ok('b')))
    const old = store.load(id('a'))
    await store.load(id('b'))
    pending.resolve({ state: 'failed_terminal', error: createOperationError('session_invalid', 'Old read') })
    expect((await old).state).toBe('failed_terminal')
    expect(invalidation).not.toHaveBeenCalled()
    expect(store.detail?.id).toBe('b')
  })

  it('does not let a stale transport rejection erase newer success', async () => {
    const pending = deferred<OperationSnapshot<WorkOrderDetail>>()
    const { store } = setup(value => value === 'a' ? pending.promise : Promise.resolve(ok('b')))
    const old = store.load(id('a'))
    await store.load(id('b'))
    pending.reject(new Error('Late A transport failure'))
    expect((await old).state).toBe('failed_terminal')
    expect(store.detail?.id).toBe('b')
    expect(store.loadState).toBe('succeeded')
  })

  it('clear invalidates a pending read without resurrecting its data', async () => {
    const pending = deferred<OperationSnapshot<WorkOrderDetail>>()
    const { store } = setup(() => pending.promise)
    const old = store.load(id('a'))
    store.clear()
    pending.resolve(ok('a'))
    expect((await old).state).toBe('failed_terminal')
    expect(store.detail).toBeNull()
    expect(store.loadState).toBe('idle')
  })

  it.each(['role', 'logout'] as const)('rejects a late read after %s even for a non-reactive provider', async (change) => {
    const pending = deferred<OperationSnapshot<WorkOrderDetail>>()
    const { store, setSession } = setup(() => pending.promise)
    const old = store.load(id('a'))
    setSession(change === 'logout' ? null : { ...session(), currentRole: { id: asOpaqueId<'RoleId'>('role-b'), name: 'B' } })
    pending.resolve(ok('a'))
    expect((await old).state).toBe('failed_terminal')
    expect(store.detail).toBeNull()
  })

  it('malformed route supersedes old work without another API call', async () => {
    const pending = deferred<OperationSnapshot<WorkOrderDetail>>()
    const read = vi.fn(() => pending.promise)
    const { store } = setup(read)
    const old = store.load(id('a'))
    expect((await store.loadFromRoute(undefined)).error?.category).toBe('validation')
    pending.resolve(ok('a'))
    expect((await old).state).toBe('failed_terminal')
    expect(store.detail).toBeNull()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('retries the new route after its failure, never the displaced route', async () => {
    const pending = deferred<OperationSnapshot<WorkOrderDetail>>()
    let bCount = 0
    const read = vi.fn((value: string): Promise<OperationSnapshot<WorkOrderDetail>> => value === 'a'
      ? pending.promise
      : Promise.resolve(++bCount === 1
        ? { state: 'failed_retryable', error: createOperationError('network_retryable', 'B failed') }
        : ok('b')))
    const { store } = setup(read)
    const old = store.load(id('a'))
    expect((await store.load(id('b'))).state).toBe('failed_retryable')
    expect((await store.retry()).state).toBe('succeeded')
    pending.resolve(ok('a'))
    await old
    expect(read.mock.calls.map(([value]) => value)).toEqual(['a', 'b', 'b'])
    expect(store.detail?.id).toBe('b')
  })
})
