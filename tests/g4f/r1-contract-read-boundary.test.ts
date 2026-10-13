import { describe, expect, it, vi } from 'vitest'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import type { ApiReadRequest } from '@adapters/api/technician-api'
import { isProductionReadOnlyReadAllowed } from '@shared/config'
import { isMockOwnedRead } from '@adapters/api/mock/router'

const workOrderId = 'synthetic-workorder-019'
const orderId = 'synthetic-order-123'
const baseOrder = {
  _id: orderId, type: 1, serviceAppointmentId: workOrderId,
  bjProducts: { orderList: [{ repairParts: ['roof'], projPackages: { data: [] },
    procedures: { data: [] }, materials: { data: [] }, measures: { data: [] } }] },
}
const contract = (extra: Record<string, unknown> = {}) => ({
  _id: 'contract-1', orderId, serviceAppointmentId: workOrderId,
  state: 1, contractdocNum: 'C-SYN-1', exts: { contractStatus: '2', secret: 'PRIVATE_EXT' },
  contactsName: 'PRIVATE_NAME', contactsPhone: 'PRIVATE_PHONE',
  qiniuUrls: ['https://synthetic.invalid/legal.pdf'],
  signedDate: '2026-10-12 10:00:00', ...extra,
})
function fakePort(options: {
  read: (request: ApiReadRequest) => Promise<unknown>
  listed?: () => boolean
  identity?: () => string | null
}) {
  const execute = vi.fn(options.read)
  const port = createQuotationOrderReadAdapter(
    { execute }, () => options.listed?.() ?? true,
    () => options.identity ? options.identity() : 'session-user-role-version',
    () => true,
  )
  return { port, execute }
}
describe('M1 I6 actual R1 Contract metadata read — source-accurate, NOT production enabled', () => {
  it('matches the exact R1 Contract query fields, but binds a previously listed type1 Order', async () => {
    const reqs: ApiReadRequest[] = []
    const f = fakePort({ read: async req => {
      reqs.push(req)
      return req.path === 'basic/order/query'
        ? { data: [baseOrder] }
        : { data: [contract()] }
    } })
    const result = await f.port.listR1ContractsForSigningReview!(workOrderId, orderId)
    expect(result).toMatchObject({ state: 'succeeded', data: {
      completeness: 'bounded_unverified',
      items: [{ id: 'contract-1', orderId, serviceAppointmentId: workOrderId,
        contractStatus: '2', displayNumber: 'C-SYN-1', state: 1 }],
    } })
    expect(reqs).toEqual([
      { method: 'POST', path: 'basic/order/query', body: {
        _all: '1', page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
        'is:serviceAppointmentId|string#and': workOrderId, 'is:type|integer#and': 1,
      } },
      { method: 'POST', path: 'basic/contract/query.do', body: {
        _all: '1', page: 1, rows: 3,
        'is:workOrderId|string#and': workOrderId, 'in:state|array-integer#and': '1',
        sortField: 'updateTime', sortOrder: 'asc',
      } },
    ])
    const serialized = JSON.stringify(result)
    for (const forbidden of ['PRIVATE_NAME', 'PRIVATE_PHONE', 'PRIVATE_EXT', 'legal.pdf',
      'contactsPhone', 'qiniuUrls', 'signer', 'signatureUrl']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('zero rows remains bounded-unverified; never claims no contract exists', async () => {
    const f = fakePort({ read: async req =>
      req.path === 'basic/order/query' ? { data: [baseOrder] } : { data: [] } })
    expect(await f.port.listR1ContractsForSigningReview!(workOrderId, orderId))
      .toMatchObject({ state: 'succeeded', data: { items: [], completeness: 'bounded_unverified' } })
  })

  it('filters other Orders within the same WorkOrder without exposing their metadata', async () => {
    const f = fakePort({ read: async req => req.path === 'basic/order/query'
      ? { data: [baseOrder] } : { data: [
        contract({ _id: 'foreign-order-contract', orderId: 'another-order' }), contract(),
      ] } })
    const result = await f.port.listR1ContractsForSigningReview!(workOrderId, orderId)
    expect(result).toMatchObject({ state: 'succeeded', data: { items: [{ id: 'contract-1' }] } })
    expect(JSON.stringify(result)).not.toContain('foreign-order-contract')
  })

  it.each([
    ['wrong WorkOrder', [contract({ serviceAppointmentId: 'other-workorder' })]],
    ['missing WorkOrder', [contract({ serviceAppointmentId: null })]],
    ['missing Order', [contract({ orderId: undefined })]],
    ['duplicate Contract', [contract(), contract()]],
    ['more than three rows', [contract(), contract({ _id: '2' }), contract({ _id: '3' }), contract({ _id: '4' })]],
  ])('fails closed for %s', async (_label, contracts) => {
    const f = fakePort({ read: async req =>
      req.path === 'basic/order/query' ? { data: [baseOrder] } : { data: contracts } })
    const result = await f.port.listR1ContractsForSigningReview!(workOrderId, orderId)
    expect(result.state).toBe('failed_terminal')
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
  })

  it('blocks Contract query when selected Order was not in the bounded type1 list', async () => {
    const f = fakePort({ read: async () => ({ data: [{ ...baseOrder, _id: 'other-order' }] }) })
    const result = await f.port.listR1ContractsForSigningReview!(workOrderId, orderId)
    expect(result.state).toBe('failed_terminal')
    expect(f.execute).toHaveBeenCalledTimes(1)
  })

  it('rejects unavailable role membership, identity or invalid route IDs before any network request', async () => {
    for (const opts of [{ listed: () => false }, { identity: () => null }]) {
      const f = fakePort({ read: async () => ({ data: [] }), ...opts })
      expect((await f.port.listR1ContractsForSigningReview!(workOrderId, orderId)).state).toBe('failed_terminal')
      expect(f.execute).not.toHaveBeenCalled()
    }
    const f = fakePort({ read: async () => ({ data: [] }) })
    expect((await f.port.listR1ContractsForSigningReview!('../other', orderId)).state).toBe('failed_terminal')
    expect(f.execute).not.toHaveBeenCalled()
  })

  it('blocks an in-flight Contract result if role/session changed and hides its rows', async () => {
    let identity = 'user-role-v1'
    let release!: (value: unknown) => void
    const f = fakePort({
      identity: () => identity,
      read: req => req.path === 'basic/order/query'
        ? Promise.resolve({ data: [baseOrder] })
        : new Promise(resolve => { release = resolve }),
    })
    const pending = f.port.listR1ContractsForSigningReview!(workOrderId, orderId)
    for (let i = 0; i < 12 && !release; i += 1) await Promise.resolve()
    expect(release).toBeTypeOf('function')
    identity = 'user-role-v2'
    release({ data: [contract()] })
    const result = await pending
    expect(result.state).toBe('failed_terminal')
    expect(JSON.stringify(result)).not.toContain('C-SYN-1')
  })

  it('never discloses backend errors or retries side-effect endpoints', async () => {
    const f = fakePort({ read: async req => {
      if (req.path === 'basic/order/query') return { data: [baseOrder] }
      throw new Error('SECRET_BACKEND_TOKEN')
    } })
    const result = await f.port.listR1ContractsForSigningReview!(workOrderId, orderId)
    expect(result.state).toBe('failed_retryable')
    expect(JSON.stringify(result)).not.toContain('SECRET')
    expect(f.execute.mock.calls.map(c => c[0].path)).toEqual([
      'basic/order/query', 'basic/contract/query.do',
    ])
  })

  it('Production transport explicitly rejects R1 Contract route until separately approved', () => {
    const body = {
      _all: '1', page: 1, rows: 3, 'is:workOrderId|string#and': workOrderId,
      'in:state|array-integer#and': '1', sortField: 'updateTime', sortOrder: 'asc',
    }
    expect(isProductionReadOnlyReadAllowed({ method: 'POST', path: 'basic/contract/query.do', body })).toBe(false)
    expect(isProductionReadOnlyReadAllowed({ method: 'POST', path: 'signature/applyForElectronicSignature',
      body: { orderId_thread: orderId } })).toBe(false)
    expect(isProductionReadOnlyReadAllowed({ method: 'POST', path: 'signature/handleReminderContract',
      body: { contractId: 'contract-1' } })).toBe(false)
  })

  it('mock-owned synthetic WorkOrders cannot fall through to a real Contract endpoint', () => {
    expect(isMockOwnedRead('basic/contract/query.do', {
      'is:workOrderId|string#and': 'mock-work-order-001',
    })).toBe(true)
  })
})


describe('Contract read capability gate is deny-by-default across environments', () => {
  it('a normal adapter never makes Contract or even Order requests for a Contract preview', async () => {
    const execute = vi.fn(async () => ({ data: [baseOrder] }))
    const port = createQuotationOrderReadAdapter({ execute }, () => true, () => 'role-authenticated')
    const result = await port.listR1ContractsForSigningReview!(workOrderId, orderId)
    expect(result).toMatchObject({ state: 'failed_terminal', error: { category: 'unsupported_capability' } })
    expect(execute).not.toHaveBeenCalled()
  })
  it('even a TEST explicit read grant remains identity-bound and Order-scoped', async () => {
    const execute = vi.fn(async () => ({ data: [] }))
    const port = createQuotationOrderReadAdapter({ execute }, () => false, () => 'role-authenticated', () => true)
    expect((await port.listR1ContractsForSigningReview!(workOrderId, orderId)).state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })
})
