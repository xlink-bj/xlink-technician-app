import { afterEach, describe, expect, it, vi } from 'vitest'

import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import { createRoleScopedTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { resetBusinessMockCache } from '@adapters/api/mock'
import { asOpaqueId } from '@shared/types'

type Actor = { sessionRef: string; userId: string; roleId: string; roleVersion: string }

const actorA: Actor = {
  sessionRef: 'synthetic-session-shared', userId: 'synthetic-user',
  roleId: 'role-a', roleVersion: 'v1',
}
const roleTree = {
  data: { functionList: [{
    order: 1, exts: { tabDisplay: '1' },
    action: '/pages/serviceAppointment/serviceAppointments',
  }] },
}
const workOrderA = 'work-order-a-synthetic'
const workOrderB = 'work-order-b-synthetic'
const officialOrder = (workOrderId = workOrderA, id = 'order-a-synthetic') => ({
  _id: id,
  type: 1,
  serviceAppointmentId: workOrderId,
  orderNumber: 'SYN-ORDER',
  totalPrice: 99.95,
  ownerPhone: 'SECRET-DO-NOT-RENDER',
  exts: { bjdPDFurl: 'https://synthetic.invalid/private.pdf' },
  bjProducts: { orderList: [] },
})

type Wire = UniNamespace.RequestOptions
function fixture(onOrder: (wire: Wire) => void = (wire) => {
  wire.success?.({ statusCode: 200, data: { data: [officialOrder()] } } as never)
}) {
  let actor: Actor = { ...actorA }
  const sent: Wire[] = []
  const request = vi.fn((wire: Wire) => {
    sent.push(wire)
    const path = new URL(String(wire.url)).pathname
    if (path === '/function/queryTreeByRoleId') {
      wire.success?.({ statusCode: 200, data: roleTree } as never)
    } else if (path === '/basic/serviceAppointment/query') {
      const id = actor.roleId === 'role-a' ? workOrderA : workOrderB
      wire.success?.({ statusCode: 200, data: { data: [{ _id: id }], page: 1, rows: 20, total: 1 } } as never)
    } else if (path === '/basic/order/query') {
      onOrder(wire)
    } else {
      wire.fail?.({ errMsg: 'Unexpected synthetic route' } as never)
    }
  })
  const transport = createUniApiReadTransport({
    apiBaseUrl: 'https://production.invalid',
    getSessionRef: () => actor.sessionRef as never,
    request,
  })
  const workOrders = createRoleScopedTechnicianApiReadAdapter(
    transport,
    () => asOpaqueId<'RoleId'>(actor.roleId),
    { getReadAuthorizationScope: () => actor },
  )
  const orders = createQuotationOrderReadAdapter(
    transport,
    (id) => Boolean(workOrders.isWorkOrderListedForCurrentSession?.(id)),
    () => JSON.stringify([actor.sessionRef, actor.userId, actor.roleId, actor.roleVersion]),
  )
  return { sent, request, workOrders, orders, getActor: () => actor, setActor: (value: Actor) => { actor = value } }
}

describe('C10 P0 synthetic role/tenant negative proof — no live Production API', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetBusinessMockCache()
  })

  it('does not read an official Order before actual role-scoped WorkOrder list membership', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const f = fixture()
    expect((await f.orders.listTypeOneOrdersForWorkOrder(workOrderA)).state).toBe('failed_terminal')
    expect(f.sent).toHaveLength(0)
    expect((await f.workOrders.listWorkOrders({ page: 1, pageSize: 20 })).state).toBe('succeeded')
    expect(f.workOrders.isWorkOrderListedForCurrentSession?.(workOrderA)).toBe(true)
    expect(f.workOrders.isWorkOrderListedForCurrentSession?.(workOrderB)).toBe(false)
    const list = await f.orders.listTypeOneOrdersForWorkOrder(workOrderA)
    expect(list).toMatchObject({ state: 'succeeded', data: { items: [{
      id: 'order-a-synthetic', type: 1, serviceAppointmentId: workOrderA,
      totalPrice: 99.95, pdfState: 'present_no_access',
    }] } })
    expect(JSON.stringify(list)).not.toMatch(/SECRET-DO-NOT-RENDER|private\.pdf|ownerPhone|bjdPDFurl/)
    expect(f.sent.map(w => new URL(String(w.url)).pathname)).toEqual([
      '/function/queryTreeByRoleId', '/basic/serviceAppointment/query', '/basic/order/query',
    ])
    const params = new URLSearchParams(String(f.sent[2]?.data))
    expect(params.has('_all')).toBe(false)
    expect(params.get('rows')).toBe('3')
    expect(params.get('is:serviceAppointmentId|string#and')).toBe(workOrderA)
    expect(params.get('is:type|integer#and')).toBe('1')
    const before = f.sent.length
    expect((await f.orders.listTypeOneOrdersForWorkOrder(workOrderB)).state).toBe('failed_terminal')
    expect(f.sent).toHaveLength(before)
  })

  it.each([
    ['user switch', { userId: 'other-synthetic-user' }],
    ['role switch', { roleId: 'role-b' }],
    ['role revision', { roleVersion: 'v2' }],
    ['session switch', { sessionRef: 'other-synthetic-session' }],
  ] as const)('revokes old WorkOrder Order-read membership on %s even when synthetic session previously listed it', async (_label, delta) => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const f = fixture()
    await f.workOrders.listWorkOrders({ page: 1, pageSize: 20 })
    expect((await f.orders.listTypeOneOrdersForWorkOrder(workOrderA)).state).toBe('succeeded')
    f.setActor({ ...f.getActor(), ...delta })
    const oldRequestCount = f.sent.length
    const stale = await f.orders.listTypeOneOrdersForWorkOrder(workOrderA)
    expect(stale.state).toBe('failed_terminal')
    expect(f.sent.length).toBe(oldRequestCount)
    expect(JSON.stringify(stale)).not.toContain('order-a-synthetic')
  })

  it('discards an in-flight Order response when role changes; cannot display stale Order or signer authority', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    let release!: (body: unknown) => void
    const f = fixture((wire) => {
      release = (body) => wire.success?.({ statusCode: 200, data: body } as never)
    })
    await f.workOrders.listWorkOrders({ page: 1, pageSize: 20 })
    const pending = f.orders.listTypeOneOrdersForWorkOrder(workOrderA)
    for (let tries = 0; tries < 30 && !release; tries += 1) await Promise.resolve()
    expect(release).toBeTypeOf('function')
    f.setActor({ ...f.getActor(), roleId: 'role-b', roleVersion: 'v2' })
    release({ data: [officialOrder()] })
    const result = await pending
    expect(result.state).toBe('failed_terminal')
    expect(JSON.stringify(result)).not.toMatch(/order-a-synthetic|99\.95|SECRET-DO-NOT-RENDER/)
    const before = f.sent.length
    expect((await f.orders.readScopedTypeOneOrderForSigningReview!(workOrderA, 'order-a-synthetic')).state).toBe('failed_terminal')
    expect(f.sent.length).toBe(before)
  })

  it('rejects a cross-WorkOrder Order row from a currently-listed synthetic WorkOrder without partial disclosure', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const f = fixture((wire) => wire.success?.({
      statusCode: 200,
      data: { data: [officialOrder(workOrderB, 'foreign-order-sensitive')] },
    } as never))
    await f.workOrders.listWorkOrders({ page: 1, pageSize: 20 })
    const result = await f.orders.listTypeOneOrdersForWorkOrder(workOrderA)
    expect(result.state).toBe('failed_terminal')
    expect(JSON.stringify(result)).not.toMatch(/foreign-order-sensitive|SECRET-DO-NOT-RENDER|private\.pdf/)
  })

  it('does not upgrade a sanitized bounded official Order into Contract, PDF or signer authorization', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const f = fixture()
    await f.workOrders.listWorkOrders({ page: 1, pageSize: 20 })
    const review = await f.orders.readScopedTypeOneOrderForSigningReview!(workOrderA, 'order-a-synthetic')
    expect(review).toMatchObject({ state: 'succeeded', data: {
      contractReadAuthorized: false, signingAuthorized: false,
      order: { id: 'order-a-synthetic', type: 1, pdfState: 'present_no_access' },
    } })
    const json = JSON.stringify(review)
    expect(json).not.toMatch(/ownerPhone|SECRET-DO-NOT-RENDER|private\.pdf|qiniuList|bjProducts/)
    const precheckOnly = f.sent.filter(w => new URL(String(w.url)).pathname === '/basic/order/query')
    expect(precheckOnly).toHaveLength(1)
    expect(f.sent.every(w => !/\/basic\/contract\/|\/signature\/|\/basic\/order\/upsert/.test(new URL(String(w.url)).pathname))).toBe(true)
  })
})
