import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import type { SessionSnapshot, QuotationOrderReadPort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import { useSigningReviewReadStore } from '@features/work-orders/signing/signing-review-read-store'

const sid = 'local-work-order', oid = 'local-order'
const order = { id: oid, serviceAppointmentId: sid, type: 1 as const, state: 1, groups: [], contentSupported: false, pdfState: 'absent' as const }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { resolve, promise } }
function fixture(injected = true) {
  const session = ref<SessionSnapshot | null>({ sessionRef: asOpaqueId<'SessionRef'>('local-session'), user: { id: asOpaqueId<'UserId'>('u'), displayName: 'test' }, currentRole: { id: asOpaqueId<'RoleId'>('r'), name: 'role' }, capabilityNames: [] })
  const listed = ref(false)
  const key = () => session.value ? String(session.value.sessionRef) : null
  const prepare = vi.fn(async (_s: string, _o: string) => { listed.value = true })
  const read = vi.fn(async () => ({ state: 'succeeded' as const, data: { order, contractReadAuthorized: false as const, signingAuthorized: false as const } }))
  const contracts = vi.fn(async () => ({ state: 'succeeded' as const, data: { items: [], completeness: 'bounded_unverified' as const } }))
  const list = vi.fn(async () => ({ state: 'succeeded' as const, data: { items: [order], page: 1, pageSize: 3, totalCount: 1 } }))
  const port: QuotationOrderReadPort = { listTypeOneOrdersForWorkOrder: list, getQuotationOrderById: vi.fn(), readScopedTypeOneOrderForSigningReview: read, listR1ContractsForSigningReview: contracts }
  const store = useSigningReviewReadStore()
  const authority = { currentKey: key, prepare, isContractReadAllowed: (s: string) => s === sid && listed.value }
  const configure = (enabled: boolean) => store.configure(port, () => session.value, s => listed.value && s === sid, undefined, () => false, enabled ? authority : undefined)
  configure(injected)
  return { store, session, listed, prepare, read, contracts, list, configure }
}
beforeEach(() => setActivePinia(createPinia()))
describe('optional scoped signing read authority, without invented roleVersion', () => {
  it('default path rejects an unlisted WorkOrder before any read, even with a valid nullable-version identity', async () => {
    const f = fixture(false); expect((await f.store.load(sid, oid)).state).toBe('failed_terminal'); expect(f.list).not.toHaveBeenCalled(); expect(f.prepare).not.toHaveBeenCalled()
  })
  it('fresh preparation can rebuild cold membership and allows only capability-false review', async () => {
    const f = fixture(); expect((await f.store.load(sid, oid)).state).toBe('succeeded'); expect(f.prepare).toHaveBeenCalledWith(sid, oid); expect(f.store.snapshot.state).toBe('ready'); expect(f.session.value?.roleVersion).toBeUndefined(); expect(f.store.snapshot.review?.signingAuthorized).toBe(false); expect(f.store.canReadContracts(sid, oid)).toBe(true); expect(f.store.canReadContracts(sid, 'other')).toBe(false)
    await f.store.loadContracts(); expect(f.prepare).toHaveBeenCalledTimes(2); expect(f.contracts).toHaveBeenCalledTimes(1); expect(f.store.contractSnapshot).toEqual({ state: 'succeeded', items: [] })
  })
  it('failed authority makes no order request', async () => {
    const f = fixture(); f.prepare.mockRejectedValueOnce(new Error('denied')); expect((await f.store.load(sid, oid)).state).toBe('failed_terminal'); expect(f.list).not.toHaveBeenCalled(); expect(f.store.snapshot.state).toBe('failed_terminal')
  })
  it('unload while preparing never dispatches the late Order read', async () => {
    const f = fixture(), d = deferred(); f.prepare.mockImplementationOnce(async () => { await d.promise; f.listed.value = true }); const run = f.store.load(sid, oid); f.store.clear(); d.resolve(); await run; expect(f.list).not.toHaveBeenCalled(); expect(f.store.snapshot.state).toBe('idle')
  })
  it('identity change while preparing cannot revive old preview', async () => {
    const f = fixture(), d = deferred(); f.prepare.mockImplementationOnce(async () => { await d.promise; f.listed.value = true }); const run = f.store.load(sid, oid); f.session.value = null; d.resolve(); await run; expect(f.list).not.toHaveBeenCalled(); expect(f.store.snapshot.state).toBe('idle')
  })
  it('newer successful selection is not erased by older prepare failure', async () => {
    const f = fixture(), d = deferred(); f.prepare.mockImplementationOnce(async () => { await d.promise; throw Error('late') }); const old = f.store.load(sid, oid); await f.store.load(sid, oid); d.resolve(); await old; expect(f.store.snapshot.state).toBe('ready'); expect(f.list).toHaveBeenCalledTimes(1)
  })
  it('contract revalidation failure clears prior Order and never calls contract API', async () => {
    const f = fixture(); await f.store.load(sid, oid); f.prepare.mockRejectedValueOnce(new Error('revoked')); await f.store.loadContracts(); expect(f.contracts).not.toHaveBeenCalled(); expect(f.store.snapshot.state).toBe('failed_terminal'); expect(f.store.contractSnapshot.items).toEqual([])
  })
  it('late contract preparation after clear makes no request', async () => {
    const f = fixture(); await f.store.load(sid, oid); const d = deferred(); f.prepare.mockImplementationOnce(async () => { await d.promise }); const run = f.store.loadContracts(); f.store.clear(); d.resolve(); await run; expect(f.contracts).not.toHaveBeenCalled(); expect(f.store.snapshot.state).toBe('idle')
  })
  it('late order response after role loss cannot become ready', async () => {
    const f = fixture(), d = deferred(); f.read.mockImplementationOnce(async () => { await d.promise; return { state: 'succeeded', data: { order, contractReadAuthorized: false, signingAuthorized: false } } }); const run = f.store.load(sid, oid); await vi.waitFor(() => expect(f.read).toHaveBeenCalledOnce()); f.session.value = null; d.resolve(); await run; expect(f.store.snapshot.state).toBe('idle')
  })
  it('reconfiguration back to defaults retains listed read access but discards scoped contract authority', async () => {
    const f = fixture(); await f.store.load(sid, oid); f.configure(false); expect((await f.store.load(sid, oid)).state).toBe('succeeded'); expect(f.prepare).toHaveBeenCalledTimes(1); expect(f.store.canReadContracts(sid, oid)).toBe(false)
  })
})
