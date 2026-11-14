import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSigningReadIsolatedFixture } from '../support/signing-read-isolated-fixture'
import { createRoleScopedTechnicianApiReadAdapter, type ApiReadRequest } from '@adapters/api/technician-api'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import { useSigningReviewReadStore } from '@features/work-orders/signing/signing-review-read-store'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import type { SessionSnapshot } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import { localSigningReadScope } from '@app/local-signing-read-authority'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_API_BASE_URL', 'http://127.0.0.1:5189/xlink/wm')
  vi.stubEnv('VITE_XLINK_MOCK', 'false')
})
afterEach(() => vi.unstubAllEnvs())

const make = () => createSigningReadIsolatedFixture('synthetic-signing-offline-a')
function reader(fixture = make()) {
  const p = fixture.principal
  const actor: SessionSnapshot = { sessionRef: asOpaqueId<'SessionRef'>('offline-session-only'),
    user: { id: asOpaqueId<'UserId'>(p.userId) }, currentRole: { id: asOpaqueId<'RoleId'>(p.roleId) }, capabilityNames: [] }
  const identity = { sessionRef: actor.sessionRef, userId: p.userId, roleId: p.roleId, roleVersion: null }
  const calls: ApiReadRequest[] = [], unexpected: string[] = []
  const transport = { async execute(request: ApiReadRequest): Promise<unknown> {
    calls.push(request)
    const body = request.body
    if (request.method !== 'POST' || request.query) {
      unexpected.push(request.method + ' ' + request.path)
      throw Error('Unexpected request shape')
    }
    if (request.path === 'function/changeRole') return { data: { functionList: [
      { order: 0, action: '/pages/serviceAppointment/serviceAppointments', exts: { tabDisplay: '1' } },
    ] } }
    if (request.path === 'basic/serviceAppointment/query') return {
      data: fixture.cases.map(c => c.serviceAppointment), total: 2, page: 1, rows: 20,
    }
    const detail = fixture.cases.find(c => request.path === `basic/serviceAppointment/queryById/${c.serviceAppointment._id}`)
    if (detail) return { success: true, status: 1, data: { serviceAppointment: detail.serviceAppointment,
      workflow: detail.workflow, workflowNode: [detail.node] } }
    if (request.path === 'basic/order/query') {
      const selected = fixture.cases.find(c => c.serviceAppointment._id === body?.['is:serviceAppointmentId|string#and'])
      expect(selected).toBeDefined(); expect(body).toEqual({ page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
        'is:serviceAppointmentId|string#and': selected!.serviceAppointment._id, 'is:type|integer#and': 1 })
      return { data: [selected!.order], total: 1, page: 1, size: 3 }
    }
    if (request.path === 'biz/extField/query') return { data: [], total: 0, page: 1, size: 200 }
    if (request.path === 'code/query') return { data: [], total: 0, page: 1, rows: 50 }
    if (request.path === 'biz/action/query.do') return { data: [] }
    unexpected.push(request.path)
    throw Error('Unexpected offline request: ' + request.path)
  } }
  const api = createRoleScopedTechnicianApiReadAdapter(transport, () => actor.currentRole!.id,
    { codeTenantId: p.tenantId, getReadTenantId: () => p.tenantId, getReadAuthorizationScope: () => identity })
  const listed = (id: string) => api.isWorkOrderListedForCurrentSession?.(id) === true
  // Preserve the real default-deny Contract policy; no forged authority is injected.
  const orders = createQuotationOrderReadAdapter(transport, listed, () => sessionAuthorizationFingerprint(identity))
  const store = useSigningReviewReadStore()
  store.configure(orders, () => actor, listed, api, () => true)
  return { api, orders, store, calls, unexpected }
}

describe('offline preparation of fresh signing readonly fixtures', () => {
  it('declares unverified local bindings and zero Contract requests without credentials or PII', () => {
    const f = make(), ids = f.cases.flatMap(c => [c.serviceAppointment._id, c.workflow._id, c.node._id, c.order._id])
    expect(new Set(ids).size).toBe(8)
    expect(f).toMatchObject({ phase: 'offline-prepared-not-seeded', metadata: { localBindingsVerified: false },
      contractBoundary: { enabled: false, maxRequests: 0, records: [] } })
    expect(JSON.stringify(f)).not.toMatch(/phone|address|password|cookie|signedDate|fileUrls|bjdPDFurl/i)
    expect(ids).not.toContain(localSigningReadScope.orderId)
    expect(ids).not.toContain(localSigningReadScope.workOrderId)
    expect(f.cases[0]!.serviceAppointment.exts).not.toHaveProperty('scheduleFlag')
  })

  it('allocates disjoint namespaces rather than replaying old records', () => {
    const a = make(), b = createSigningReadIsolatedFixture('synthetic-signing-offline-b')
    expect(b.cases.some(c => JSON.stringify(a).includes(c.serviceAppointment._id))).toBe(false)
  })
  it.each(['production-copy', '../unsafe', '', 'synthetic-signing-a?x'])('rejects an unsafe namespace %j', namespace => {
    expect(() => createSigningReadIsolatedFixture(namespace)).toThrow()
  })

  it.each([0, 1])('reads case %i through the real adapters and Store with Contracts closed', async index => {
    const f = make(), c = f.cases[index]!, h = reader(f)
    expect((await h.api.listWorkOrders({ page: 1, pageSize: 20, category: 'all' })).state).toBe('succeeded')
    expect((await h.store.load(c.serviceAppointment._id, c.order._id)).state).toBe('succeeded')
    await h.store.loadNodeHandlerEvidence()
    expect(h.store.handlerSnapshot.state).toBe(c.expectedHandler ? 'verified' : 'blocked')
    expect(h.store.initialSigningIntent).toMatchObject({ assessment: 'blocked', mayDispatch: false,
      backendPermissionProven: false, actualBusinessOutcomeKnown: false })
    expect(h.store.canReadContracts(c.serviceAppointment._id, c.order._id)).toBe(false)
    // Even a programmatic attempt cannot turn this fixture into Contract authority.
    await h.store.loadContracts()
    expect(h.store.contractSnapshot.state).toBe('failed_terminal')
    expect(h.calls.some(r => /contract|signature|upsert|upload|process|pdf/i.test(r.path))).toBe(false)
    expect(h.unexpected).toEqual([])
  })

  it('detects a wrong Order reference as fixture preparation failure', async () => {
    const f = make(); f.cases[0]!.order.serviceAppointmentId = f.cases[1]!.serviceAppointment._id
    const h = reader(f); await h.api.listWorkOrders({ page: 1, pageSize: 20, category: 'all' })
    expect((await h.store.load(f.cases[0]!.serviceAppointment._id, f.cases[0]!.order._id)).state).not.toBe('succeeded')
    expect(h.store.initialSigningIntent.assessment).toBe('blocked'); expect(h.unexpected).toEqual([])
  })

  it('detects a wrong workflow reference instead of weakening the mapper', async () => {
    const f = make(); f.cases[0]!.node.workflowId = f.cases[1]!.workflow._id
    const h = reader(f); await h.api.listWorkOrders({ page: 1, pageSize: 20, category: 'all' })
    await h.store.load(f.cases[0]!.serviceAppointment._id, f.cases[0]!.order._id)
    await h.store.loadNodeHandlerEvidence()
    expect(h.store.handlerSnapshot.state).toBe('blocked')
    expect(h.store.initialSigningIntent.assessment).toBe('blocked'); expect(h.unexpected).toEqual([])
  })
})
