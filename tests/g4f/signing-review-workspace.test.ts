import { describe, expect, it, vi } from 'vitest'
import { asOpaqueId, createOperationError } from '@shared/types'
import type { QuotationOrderBrowseItem, QuotationOrderReadPort, ScopedSigningOrderReviewRead, SessionSnapshot } from '@shared/ports'
import { createSigningReviewReadWorkspace } from '@features/work-orders/signing/signing-review-read-workspace'

const wo = 'workorder-allowed'
const order = 'order-allowed'
const row = (id = order, workOrder = wo): QuotationOrderBrowseItem => ({
  id, serviceAppointmentId: workOrder, type: 1, displayNumber: 'SYN-ONLY',
  groups: [], contentSupported: false, pdfState: 'present_no_access',
})
const data = (id = order, workOrder = wo): ScopedSigningOrderReviewRead => ({
  order: row(id, workOrder), contractReadAuthorized: false, signingAuthorized: false,
})
const session = (role = 'role-a', version = 'v1', sessionRef = 'session-a'): SessionSnapshot => ({
  sessionRef: asOpaqueId<'SessionRef'>(sessionRef),
  user: { id: asOpaqueId<'UserId'>('user-a'), displayName: 'Synthetic only' },
  currentRole: { id: asOpaqueId<'RoleId'>(role), name: role },
  roleVersion: version, capabilityNames: [],
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
type Listed = Awaited<ReturnType<QuotationOrderReadPort['listTypeOneOrdersForWorkOrder']>>
type Detail = Awaited<ReturnType<NonNullable<QuotationOrderReadPort['readScopedTypeOneOrderForSigningReview']>>>
function setup(opts: {
  listed?: (id: string) => Promise<Listed>
  detail?: (woId: string, orderId: string) => Promise<Detail>
  allowed?: boolean
} = {}) {
  let active: SessionSnapshot | null = session()
  let visible = opts.allowed ?? true
  const boundedList: QuotationOrderReadPort['listTypeOneOrdersForWorkOrder'] = opts.listed ?? (async () => ({
    state: 'succeeded', data: { items: [row()], page: 1, pageSize: 3, totalCount: 1 },
  }))
  const listTypeOneOrdersForWorkOrder = vi.fn(boundedList)
  const readScopedTypeOneOrderForSigningReview = vi.fn(opts.detail ?? (async () => ({
    state: 'succeeded' as const, data: data(),
  })))
  const port: QuotationOrderReadPort = {
    getQuotationOrderById: vi.fn(async () => ({ state: 'failed_terminal' as const })),
    listTypeOneOrdersForWorkOrder,
    readScopedTypeOneOrderForSigningReview,
  }
  const workspace = createSigningReviewReadWorkspace({
    port, getSession: () => active, isCurrentWorkOrderListed: id => visible && id === wo,
  })
  return {
    workspace, port, listTypeOneOrdersForWorkOrder, readScopedTypeOneOrderForSigningReview,
    changeSession: (s: SessionSnapshot | null) => { active = s },
    setVisible: (b: boolean) => { visible = b },
  }
}

describe('M1-I6 scoped signing-read handoff — no Contract or signature authority', () => {
  it('accepts only a listed type1 Order and performs two explicit read calls, no write', async () => {
    const s = setup()
    const x = await s.workspace.load(wo, order)
    expect(x).toMatchObject({ state: 'succeeded', data: { order: { id: order }, signingAuthorized: false, contractReadAuthorized: false } })
    expect(s.workspace.snapshot()).toMatchObject({ state: 'ready', workOrderId: wo, orderId: order })
    expect(s.listTypeOneOrdersForWorkOrder).toHaveBeenCalledOnce()
    expect(s.listTypeOneOrdersForWorkOrder).toHaveBeenCalledWith(wo, 3)
    expect(s.readScopedTypeOneOrderForSigningReview).toHaveBeenCalledOnce()
    expect(s.readScopedTypeOneOrderForSigningReview).toHaveBeenCalledWith(wo, order)
    expect(s.port.getQuotationOrderById).not.toHaveBeenCalled()
    expect(s.port).not.toHaveProperty('sendSMS')
    expect(s.port).not.toHaveProperty('generatePDF')
    expect(s.port).not.toHaveProperty('signContract')
  })

  it('refuses an unlisted or foreign Order without probing direct details', async () => {
    const s = setup()
    expect((await s.workspace.load(wo, 'guessed-other-order')).state).toBe('failed_terminal')
    expect(s.readScopedTypeOneOrderForSigningReview).not.toHaveBeenCalled()
    expect(s.workspace.snapshot().review).toBeUndefined()
  })

  it('denies a missing role/version, invisible WorkOrder, invalid IDs, and no scoped signing capability', async () => {
    const s = setup()
    s.changeSession({ ...session(), roleVersion: undefined })
    expect((await s.workspace.load(wo, order)).state).toBe('failed_terminal')
    s.changeSession(null)
    expect((await s.workspace.load(wo, order)).state).toBe('failed_terminal')
    s.changeSession(session())
    s.setVisible(false)
    expect((await s.workspace.load(wo, order)).state).toBe('failed_terminal')
    s.setVisible(true)
    for (const [w, o] of [['../foreign', order], [wo, ''], [wo, '../bad'], [wo, 'a'.repeat(101)]]) {
      expect((await s.workspace.load(w, o)).state).toBe('failed_terminal')
    }
    expect(s.listTypeOneOrdersForWorkOrder).not.toHaveBeenCalled()
    expect(s.readScopedTypeOneOrderForSigningReview).not.toHaveBeenCalled()
    const portWithoutScope: QuotationOrderReadPort = {
      getQuotationOrderById: s.port.getQuotationOrderById,
      listTypeOneOrdersForWorkOrder: s.port.listTypeOneOrdersForWorkOrder,
    }
    const notSupported = createSigningReviewReadWorkspace({
      port: portWithoutScope, getSession: () => session(), isCurrentWorkOrderListed: () => true,
    })
    expect((await notSupported.load(wo, order)).state).toBe('failed_terminal')
    expect(s.port.listTypeOneOrdersForWorkOrder).not.toHaveBeenCalled()
  })

  it('rejects foreign/duplicate/non-type1, oversized and mismatched list content atomically', async () => {
    const cases: QuotationOrderBrowseItem[][] = [
      [row(), row('foreign', 'other-workorder')],
      [row(), { ...row('bad-type'), type: 0 as 1 }],
      [row(), row()],
      [row('a'), row('b'), row('c'), row('d')],
      [row('missing'), { ...row(), id: '' }],
    ]
    for (const rows of cases) {
      const s = setup({ listed: async () => ({
        state: 'succeeded', data: { items: rows, page: 1, pageSize: 3, totalCount: rows.length },
      }) })
      expect((await s.workspace.load(wo, order)).state).toBe('failed_terminal')
      expect(s.readScopedTypeOneOrderForSigningReview).not.toHaveBeenCalled()
      expect(s.workspace.snapshot().review).toBeUndefined()
    }
  })

  it('refuses foreign Order/detail/type or forged signing and Contract authority', async () => {
    const forged: ScopedSigningOrderReviewRead[] = [
      data('other-order'),
      data(order, 'foreign-wo'),
      { ...data(), order: { ...row(), type: 0 as 1 } },
      { ...data(), signingAuthorized: true as false },
      { ...data(), contractReadAuthorized: true as false },
    ]
    for (const candidate of forged) {
      const s = setup({ detail: async () => ({ state: 'succeeded', data: candidate }) })
      expect((await s.workspace.load(wo, order)).state).toBe('failed_terminal')
      expect(s.workspace.snapshot().review).toBeUndefined()
    }
  })

  it('rejects late Order-list completion after role switch or logout; never reads detail', async () => {
    for (const changed of [session('role-b'), session('role-a', 'v2'), null]) {
      const pending = deferred<Listed>()
      const s = setup({ listed: () => pending.promise })
      const wait = s.workspace.load(wo, order)
      s.changeSession(changed)
      pending.resolve({ state: 'succeeded', data: { items: [row()], page: 1, pageSize: 3, totalCount: 1 } })
      expect((await wait).state).toBe('failed_terminal')
      expect(s.readScopedTypeOneOrderForSigningReview).not.toHaveBeenCalled()
      expect(s.workspace.snapshot().review).toBeUndefined()
    }
  })

  it('rejects stale detail after WorkOrder authorization disappears, role changes, or clear()', async () => {
    for (const change of ['scope', 'role', 'clear'] as const) {
      const pending = deferred<Detail>()
      const s = setup({ detail: () => pending.promise })
      const waiting = s.workspace.load(wo, order)
      // Let list load complete and the scoped read be scheduled.
      await Promise.resolve()
      await Promise.resolve()
      if (change === 'scope') s.setVisible(false)
      if (change === 'role') s.changeSession(session('role-b'))
      if (change === 'clear') s.workspace.clear()
      pending.resolve({ state: 'succeeded', data: data() })
      expect((await waiting).state).toBe('failed_terminal')
      expect(s.workspace.snapshot().review).toBeUndefined()
    }
  })

  it('a newer Order selection supersedes a delayed old response and preserves only the latest ID', async () => {
    const old = deferred<Detail>()
    const second = 'order-second'
    const s = setup({
      listed: async () => ({ state: 'succeeded', data: { items: [row(), row(second)], page: 1, pageSize: 3, totalCount: 2 } }),
      detail: async (_w, o) => o === order ? old.promise : ({ state: 'succeeded', data: data(second) }),
    })
    const first = s.workspace.load(wo, order)
    await Promise.resolve()
    await Promise.resolve()
    const next = s.workspace.load(wo, second)
    expect((await next).state).toBe('succeeded')
    old.resolve({ state: 'succeeded', data: data() })
    expect((await first).state).toBe('failed_terminal')
    expect(s.workspace.snapshot()).toMatchObject({ state: 'ready', orderId: second, review: { order: { id: second } } })
  })

  it('does not leak transport error text, unknown payload, Contract docs or sensitive fields', async () => {
    const secret = 'PRIVATE_CUSTOMER_PHONE_SESSION_TOKEN'
    const s = setup({ detail: async () => { throw new Error(secret) } })
    const x = await s.workspace.load(wo, order)
    expect(x.state).toBe('failed_retryable')
    expect(JSON.stringify(x)).not.toContain(secret)
    expect(s.workspace.snapshot().review).toBeUndefined()
    const failed = setup({ listed: async () => ({
      state: 'failed_retryable', error: createOperationError('network_retryable', secret),
    }) })
    const result = await failed.workspace.load(wo, order)
    expect(result.state).toBe('failed_retryable')
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(failed.readScopedTypeOneOrderForSigningReview).not.toHaveBeenCalled()
  })

  it('contract/sign permission always stays FALSE through this read workflow', async () => {
    const s = setup()
    const result = await s.workspace.load(wo, order)
    expect(result.data?.contractReadAuthorized).toBe(false)
    expect(result.data?.signingAuthorized).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/contractId|contractUrl|signatureUrl|pdfUrl|phone|ownerPhone|replaceSnapshot/i)
  })
})
