import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoleScopedTechnicianApiReadAdapter, createTechnicianApiReadAdapter, type ApiReadRequest } from '@adapters/api/technician-api'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock/config'
import { isMockOwnedCommand, isMockOwnedRead, resetMockCommandState, tryMockCommand, tryMockRead } from '@adapters/api/mock/router'
import { categoryMockDetail, withCategoryMockRows } from '@adapters/api/mock/work-order-category-fixtures'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import * as businessMock from '@adapters/api/mock'
import { asOpaqueId } from '@shared/types'

const listPath = 'basic/serviceAppointment/querySAWorkflowNode'
const detailPath = 'basic/serviceAppointment/queryById/'
const syntheticId = (status: string) => `mock-work-order-category-${status}`
const read = (path: string, body: Record<string, unknown> = {}) => tryMockRead(path, body, { latencyMs: 0 })
const execute = async (request: ApiReadRequest) => {
  const result = await read(request.path, request.body ?? request.query ?? {})
  if (result === null) throw new Error('Unsupported synthetic read; network is forbidden in this test')
  return result
}

beforeEach(() => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubEnv('VITE_XLINK_R1_CATEGORY_FIXTURES', 'true')
  vi.stubEnv('VITE_XLINK_R1_MP_UX_FIXTURES', 'false')
  resetBusinessMockCache(); resetMockCommandState(); setBusinessMockMode('data')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); resetBusinessMockCache(); resetMockCommandState() })

describe('current App Mock wire parity: category / list / exact detail', () => {
  it.each([
    ['need_contact', ['104']], ['onsite', ['105', '202']],
  ] as const)('uses real role-scoped adapter for %s and exact list/detail identities', async (category, statuses) => {
    const api = createRoleScopedTechnicianApiReadAdapter({ execute }, () => asOpaqueId<'RoleId'>('synthetic-role'))
    const result = await api.listWorkOrders({ page: 1, pageSize: 20, category })
    expect(result.state).toBe('succeeded')
    expect(result.data?.items.map(item => item.id)).toEqual(statuses.map(syntheticId))
    for (const item of result.data!.items) {
      const detail = await api.getWorkOrderDetail(item.id)
      expect(detail.state).toBe('succeeded')
      expect(detail.data?.id).toBe(item.id)
      expect(detail.data?.workflowNodes?.map(node => node.id)).toEqual(item.workflowNodes?.map(node => node.id))
      // Unknown node type/state/handler are NOT fabricated to unlock commands.
      expect(detail.data?.workflowNodes?.[0]).toMatchObject({ category: 'unsupported', lifecycle: 'unknown' })
    }
  })

  it.each([listPath, 'basic/serviceAppointment/query'])('filters before paging on %s and retains exact total', async path => {
    const request = { 'in:status|array#and': '105,202', page: 1, rows: 1 }
    const first = await read(path, request) as { data: Array<{ _id: string; data?: { _id: string } }>; total: number }
    const second = await read(path, { ...request, page: 2 }) as typeof first
    expect(first.total).toBe(2); expect(second.total).toBe(2)
    expect(first.data[0]?.data?._id ?? first.data[0]?._id).toBe(syntheticId('105'))
    expect(second.data[0]?.data?._id ?? second.data[0]?._id).toBe(syntheticId('202'))
    expect(await read(path, { ...request, page: 3 })).toMatchObject({ data: [], total: 2 })
    expect(await read(path, { ...request, 'regex:address|string#or': '三号院' })).toMatchObject({ total: 1 })
    expect(await read(path, { ...request, 'regex:address|string#or': '不存在' })).toMatchObject({ data: [], total: 0 })
  })

  it('all paging has no duplicate rows or loss and unknown status never falls into following', async () => {
    const ids: string[] = []
    for (let page = 1; page <= 5; page++) {
      const result = await read(listPath, { page, rows: 4 }) as { data: Array<{ data: { _id: string } }>; total: number }
      expect(result.total).toBe(15)
      ids.push(...result.data.map(row => row.data._id))
    }
    expect(ids).toHaveLength(15); expect(new Set(ids).size).toBe(15)
    expect(await read(listPath, { page: 1, rows: 20, 'in:status|array#and': 'UNKNOWN-UNPROVEN' }))
      .toMatchObject({ data: [], total: 0 })
  })

  it.each(['retryable', 'terminal'] as const)('propagates %s failures and recovers only on a fresh explicit read', async fault => {
    const path = detailPath + syntheticId('104')
    const request = vi.fn()
    const original = businessMock.tryMockRead
    const injected = vi.spyOn(businessMock, 'tryMockRead').mockImplementation((route, body, options) =>
      original(route, body, { ...options, latencyMs: 0, fault }))
    const api = createTechnicianApiReadAdapter(createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid', getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'),
      request, blockRealRequests: true, mockLatencyMs: 0,
    }))
    expect((await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(syntheticId('104')))).state)
      .toBe(fault === 'retryable' ? 'failed_retryable' : 'failed_terminal')
    expect(request).not.toHaveBeenCalled()
    injected.mockRestore()
    expect(await read(path)).toMatchObject({ data: { serviceAppointment: { _id: syntheticId('104'), status: '104' } } })
  })

  it('rejects a real transport HTTP-200 explicit business failure, without assuming unknown server codes', async () => {
    setBusinessMockMode('off')
    const request = vi.fn((options: UniNamespace.RequestOptions) => options.success?.({
      statusCode: 200, data: { success: false, code: 'UNOBSERVED_SERVER_CODE' },
      header: {}, cookies: [], errMsg: 'request:ok',
    }))
    const api = createTechnicianApiReadAdapter(createUniApiReadTransport({ apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'), request }))
    const result = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('synthetic-wire-failure'))
    expect(result.state).toBe('failed_terminal'); expect(result.data).toBeUndefined()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not fabricate activity, FormDef or command success for read-only category rows', async () => {
    const id = syntheticId('104')
    expect(await read('biz/action/query.do', { bizType: 'serviceAppointment', actionType: '1,2,3,4,5,6', sid: id })).toBeNull()
    const body = { sid: id, smodule: 'serviceAppointment', workflowNodeId: 'mock-workflow-node-category-104' }
    expect(isMockOwnedCommand('workflow/process', body)).toBe(true)
    expect(await tryMockCommand('workflow/process', body)).toBeNull()
    expect(await read(detailPath + syntheticId('unobserved'))).toBeNull()
  })

  it('keeps default visual fixtures unchanged and synthetic IDs locally owned with opt-in disabled', async () => {
    vi.stubEnv('VITE_XLINK_R1_CATEGORY_FIXTURES', 'false')
    expect(await read(listPath, { page: 1, rows: 20 })).toMatchObject({ total: 12 })
    expect(await read(detailPath + syntheticId('104'))).toBeNull()
    expect(isMockOwnedRead(detailPath + syntheticId('104'))).toBe(true)
  })

  it.each(['prod', 'beta', 'test'])('does not add optional rows or details in %s', environment => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', environment)
    const original = { data: [], total: 0 }
    expect(withCategoryMockRows(original, true)).toBe(original)
    expect(categoryMockDetail(syntheticId('104'))).toBeNull()
  })
  it('keeps empty, Mock off and non-DEV separate from a valid populated read', async () => {
    setBusinessMockMode('empty')
    expect(await read(listPath, { page: 1, rows: 20 })).toMatchObject({ data: [], total: 0 })
    expect(await read(detailPath + syntheticId('104'))).toBeNull()
    setBusinessMockMode('off')
    expect(await read(listPath, { page: 1, rows: 20 })).toBeNull()
    vi.stubEnv('DEV', false)
    expect(categoryMockDetail(syntheticId('104'))).toBeNull()
  })
})

describe('F19 raw Order snapshot wire through actual quotation adapter', () => {
  it('keeps bjProducts as the evidenced JSON string on the wire and parses at the adapter boundary', async () => {
    const request = { 'is:serviceAppointmentId|string#and': 'mock-work-order-002',
      'is:type|integer#and': 1, page: 1, rows: 3 }
    const raw = await read('basic/order/query', request) as { data: Array<{ bjProducts: unknown }> }
    expect(typeof raw.data[0]?.bjProducts).toBe('string')
    expect(JSON.parse(raw.data[0]!.bjProducts as string).orderList).toHaveLength(1)
    const api = createQuotationOrderReadAdapter({ execute }, () => true)
    const result = await api.listTypeOneOrdersForWorkOrder('mock-work-order-002')
    expect(result.state).toBe('succeeded')
    expect(result.data?.items[0]).toMatchObject({ id: 'mock-official-order-001', serviceAppointmentId: 'mock-work-order-002', type: 1 })
  })
  it('does not widen the bounded Order route to another workorder, type, page or _all', async () => {
    const body = { 'is:serviceAppointmentId|string#and': 'mock-work-order-002', 'is:type|integer#and': 1, page: 1, rows: 3 }
    for (const change of [{ 'is:serviceAppointmentId|string#and': 'mock-work-order-999' },
      { 'is:type|integer#and': 0 }, { page: 2 }, { rows: 100 }, { _all: '1' }]) {
      expect(await read('basic/order/query', { ...body, ...change })).toBeNull()
    }
  })
})
