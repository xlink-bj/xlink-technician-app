import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiReadTransportError, createTechnicianApiReadAdapter, createRoleScopedTechnicianApiReadAdapter,
  type ApiReadRequest,
} from '@adapters/api/technician-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { mockStatusOptionsResponse, resetBusinessMockCache, setBusinessMockEnabled, tryMockRead } from '@adapters/api/mock'
import { mockR1AddFormCodeId } from '@adapters/api/mock/fixtures'
import { createDefaultTechnicianApiReadPort } from '@app/composition'
import type { AuthSessionPort, SessionSnapshot } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const statusQuery = { valueOption: 'STATUS' }
const wireBody = { 'is:type|string#and': 'STATUS', page: 1, rows: 50, sidx: 'order,_id', sord: 'asc' }
const rows = (count: number, start = 0) => Array.from({ length: count }, (_, n) => ({
  _id: `code-${n + start}`, type: 'STATUS', parentId: 'parent-code',
  value: `status-${n + start}`, name: `状态 ${n + start}`, order: n + start,
}))
const envelope = (data = rows(1), total = data.length, page = 1) => ({
  data, total, page, rows: 50, size: 50, dataCount: data.length, pages: Math.ceil(total / 50),
})
const actor = { sessionRef: 'session-a', userId: 'user-a', roleId: 'role-a', roleVersion: null as string | null }

beforeEach(() => {
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_MOCK', 'false')
  vi.stubGlobal('uni', { getStorageSync: () => '', setStorageSync: vi.fn(), removeStorageSync: vi.fn() })
  resetBusinessMockCache()
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetBusinessMockCache() })

describe('source-verified Code query complete read', () => {
  it('maps type and parent filters, fixes stable ordering, and returns all pages without page-one metadata', async () => {
    const requests: ApiReadRequest[] = []
    const all = rows(123)
    const execute = vi.fn(async (request: ApiReadRequest) => {
      requests.push(request)
      const page = Number(request.body?.page)
      return envelope(all.slice((page - 1) * 50, page * 50), all.length, page)
    })
    const result = await createTechnicianApiReadAdapter({ execute }).getCodeOptions({
      ...statusQuery, parentValue: 'parent-code',
    })
    expect(result.state).toBe('succeeded')
    expect(result.data).toEqual({ items: all.map(row => ({ value: row.value, label: row.name })), totalCount: 123 })
    expect(requests).toEqual([1, 2, 3].map(page => ({
      method: 'POST', path: 'code/query', body: { ...wireBody, page, parentId: 'parent-code' },
    })))
  })

  it('preserves parent-only queries without adding STATUS or valueOption filters', async () => {
    const execute = vi.fn(async () => envelope())
    expect((await createTechnicianApiReadAdapter({ execute }).getCodeOptions({ parentValue: 'parent-code' })).state).toBe('succeeded')
    expect(execute).toHaveBeenCalledWith({ method: 'POST', path: 'code/query', body: {
      parentId: 'parent-code', page: 1, rows: 50, sidx: 'order,_id', sord: 'asc',
    } })
  })

  it.each([0, 35, 50, 500])('completes exactly %i items within the 10-page cap', async count => {
    const all = rows(count)
    const execute = vi.fn(async (request: ApiReadRequest) => {
      const page = Number(request.body?.page)
      return envelope(all.slice((page - 1) * 50, page * 50), count, page)
    })
    const result = await createTechnicianApiReadAdapter({ execute }).getCodeOptions(statusQuery)
    expect(result.data?.items).toHaveLength(count)
    expect(result.data?.totalCount).toBe(count)
    expect(execute).toHaveBeenCalledTimes(Math.max(1, Math.ceil(count / 50)))
  })

  it('accepts integer-string pagination without confusing dataCount with total', async () => {
    const execute = vi.fn(async (request: ApiReadRequest) => {
      const page = Number(request.body?.page)
      const data = rows(page === 1 ? 50 : 1, (page - 1) * 50)
      return { data, total: '51', page: String(page), rows: '50', size: '50', dataCount: String(data.length), pages: '2' }
    })
    const result = await createTechnicianApiReadAdapter({ execute }).getCodeOptions(statusQuery)
    expect(result.data?.items).toHaveLength(51)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['missing total', { total: undefined }], ['null total', { total: null }],
    ['blank total', { total: '' }], ['negative total', { total: -1 }],
    ['fraction total', { total: 1.5 }], ['unsafe total', { total: Number.MAX_SAFE_INTEGER + 1 }],
    ['excessive total', { total: 501 }], ['no total fallback', { total: undefined, dataCount: 1 }],
    ['missing page', { page: undefined }], ['wrong page', { page: 2 }],
    ['wrong rows', { rows: 20 }], ['wrong size', { size: 20 }],
    ['wrong page count', { pages: 4 }], ['wrong data count', { dataCount: 0 }],
    ['malformed data', { data: {} }], ['failed envelope', { success: false }],
    ['uncounted response', { needTotal: false }], ['unbounded response', { all: true }],
    ['unstable sort', { sortField: 'order' }], ['wrong sort direction', { sortOrder: 'desc' }],
    ['truncated first page', { total: 51, pages: 2 }],
    ['empty before total', { data: [], dataCount: 0 }],
    ['overfull page', { data: rows(51), dataCount: 51, total: 51, pages: 2 }],
  ])('rejects %s without exposing partial data or fetching more pages', async (_, patch) => {
    const execute = vi.fn(async () => ({ ...envelope(), ...patch }))
    const result = await createTechnicianApiReadAdapter({ execute }).getCodeOptions(statusQuery)
    expect(result.state).toBe('failed_terminal')
    expect(result.error?.category).toBe('server_terminal')
    expect(result.data).toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['missing database ID', { _id: undefined }], ['blank database ID', { _id: '' }],
    ['contradictory ID', { id: 'different' }], ['missing value', { value: undefined }],
    ['blank value', { value: ' ' }], ['missing name', { name: undefined }],
    ['non-string name', { name: 123 }], ['wrong type', { type: 'OTHER' }],
    ['missing type', { type: undefined }], ['legacy label alias only', { name: undefined, codelabel: 'not Code.name' }],
  ])('rejects malformed row: %s', async (_, patch) => {
    const execute = vi.fn(async () => ({ ...envelope(), data: [{ ...rows(1)[0], ...patch }] }))
    const result = await createTechnicianApiReadAdapter({ execute }).getCodeOptions(statusQuery)
    expect(result.state).toBe('failed_terminal')
    expect(result.data).toBeUndefined()
  })

  it('rejects rows from another parent instead of ignoring the caller filter', async () => {
    const execute = vi.fn(async () => envelope())
    const result = await createTechnicianApiReadAdapter({ execute }).getCodeOptions({ ...statusQuery, parentValue: 'other-parent' })
    expect(result.state).toBe('failed_terminal')
    expect(result.data).toBeUndefined()
  })

  it.each([
    ['duplicate ID', { _id: 'code-0' }],
    ['duplicate value with same label', { value: 'status-0', name: '状态 0' }],
    ['conflicting value label', { value: 'status-0', name: 'conflicting label' }],
  ])('rejects %s within and across pages', async (_, patch) => {
    for (const acrossPages of [false, true]) {
      const execute = vi.fn(async (request: ApiReadRequest) => {
        const page = Number(request.body?.page)
        if (!acrossPages) return { ...envelope(rows(2)), data: [rows(1)[0], { ...rows(1, 1)[0], ...patch }] }
        return page === 1 ? envelope(rows(50), 51) : { ...envelope(rows(1, 50), 51, 2), data: [{ ...rows(1, 50)[0], ...patch }] }
      })
      const result = await createTechnicianApiReadAdapter({ execute }).getCodeOptions(statusQuery)
      expect(result.state).toBe('failed_terminal')
      expect(result.data).toBeUndefined()
      expect(execute).toHaveBeenCalledTimes(acrossPages ? 2 : 1)
    }
  })

  it.each([
    ['changed total', { total: 52 }], ['stale page', { page: 1 }],
    ['missing last row', { data: [], dataCount: 0 }],
    ['missing last ID', { data: [{ ...rows(1, 50)[0], _id: undefined }] }],
  ])('discards all earlier rows for %s on page 2', async (_, patch) => {
    const execute = vi.fn(async (request: ApiReadRequest) => Number(request.body?.page) === 1
      ? envelope(rows(50), 51) : { ...envelope(rows(1, 50), 51, 2), ...patch })
    const result = await createTechnicianApiReadAdapter({ execute }).getCodeOptions(statusQuery)
    expect(result.state).toBe('failed_terminal')
    expect(result.data).toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it.each(['network_retryable', 'authorization_denied', 'server_terminal'] as const)('preserves %s and never retries a failed later page', async category => {
    const execute = vi.fn(async (request: ApiReadRequest) => {
      if (Number(request.body?.page) === 2) throw new ApiReadTransportError('page failed', category)
      return envelope(rows(50), 51)
    })
    const result = await createTechnicianApiReadAdapter({ execute }).getCodeOptions(statusQuery)
    expect(result.error?.category).toBe(category)
    expect(result.data).toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it.each([{ valueOption: '' }, { parentValue: ' ' }, { valueOption: ' STATUS' }])('never widens a malformed filter %j', async query => {
    const execute = vi.fn()
    const result = await createTechnicianApiReadAdapter({ execute }).getCodeOptions(query)
    expect(result.state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })

  it('captures the query before awaiting and does not mix changing caller filters', async () => {
    const query = { ...statusQuery, parentValue: 'parent-code' }
    const execute = vi.fn(async (request: ApiReadRequest) => {
      const page = Number(request.body?.page)
      query.parentValue = 'another-parent'
      query.valueOption = 'ANOTHER'
      return page === 1 ? envelope(rows(50), 51) : envelope(rows(1, 50), 51, 2)
    })
    expect((await createTechnicianApiReadAdapter({ execute }).getCodeOptions(query)).state).toBe('succeeded')
    expect(execute.mock.calls.every(([request]) => request.body?.parentId === 'parent-code'
      && request.body?.['is:type|string#and'] === 'STATUS')).toBe(true)
  })

  it.each(['sessionRef', 'userId', 'roleId', 'roleVersion'] as const)('rejects stale pages after %s changes', async key => {
    let current = { ...actor }
    const execute = vi.fn(async (request: ApiReadRequest) => {
      const page = Number(request.body?.page)
      if (page === 2) current = { ...current, [key]: 'changed' }
      return page === 1 ? envelope(rows(50), 51) : envelope(rows(1, 50), 51, 2)
    })
    const result = await createTechnicianApiReadAdapter({ execute }, { getReadAuthorizationScope: () => current }).getCodeOptions(statusQuery)
    expect(result.error?.category).toBe('authorization_denied')
    expect(result.data).toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('requires a valid current identity when the runtime supplies the scope callback', async () => {
    const execute = vi.fn()
    const result = await createTechnicianApiReadAdapter({ execute }, { getReadAuthorizationScope: () => null }).getCodeOptions(statusQuery)
    expect(result.error?.category).toBe('authorization_denied')
    expect(execute).not.toHaveBeenCalled()
  })

  it.each(['list', 'detail'])('resolves a STATUS label on page 2 for the %s consumer', async consumer => {
    const execute = vi.fn(async (request: ApiReadRequest) => {
      if (request.path === 'code/query') return request.body?.page === 1
        ? envelope(rows(50), 51) : envelope(rows(1, 50), 51, 2)
      if (request.path.startsWith('function/')) return { data: { functionList: [{ action: '/pages/serviceAppointment/serviceAppointments', exts: { tabDisplay: '1' } }] } }
      if (request.path === 'biz/action/query.do') return { data: [] }
      if (consumer === 'detail' && request.path === 'basic/serviceAppointment/query') return { data: [{ _id: 'work-order-a', tenantId: 'synthetic-tenant' }], total: 1 }
      const row = { _id: 'work-order-a', tenantId: 'synthetic-tenant', status: 'status-50' }
      return consumer === 'list' ? { data: [row], total: 1, page: 1, rows: 20 }
        : { data: { serviceAppointment: row } }
    })
    const api = consumer === 'list' ? createTechnicianApiReadAdapter({ execute })
      : createRoleScopedTechnicianApiReadAdapter({ execute }, () => asOpaqueId<'RoleId'>(actor.roleId), { codeTenantId: 'synthetic-tenant', getReadAuthorizationScope: () => actor })
    if (consumer === 'list') {
      expect((await api.listWorkOrders({ page: 1, pageSize: 20 })).data?.items[0]?.taskLabel).toBe('状态 50')
    } else {
      await api.listWorkOrders({ page: 1, pageSize: 20, category: 'all' })
      expect((await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('work-order-a'))).data?.taskLabel).toBe('状态 50')
    }
    expect(execute.mock.calls.filter(([request]) => request.path === 'code/query')).toHaveLength(2)
  })

  it('discards a stale first page without requesting page 2', async () => {
    let current: typeof actor | null = { ...actor }
    const execute = vi.fn(async () => {
      current = null
      return envelope(rows(50), 51)
    })
    const result = await createTechnicianApiReadAdapter({ execute }, { getReadAuthorizationScope: () => current }).getCodeOptions(statusQuery)
    expect(result.error?.category).toBe('authorization_denied')
    expect(result.data).toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('keeps STATUS presentation dictionary-only when a later page fails', async () => {
    const execute = vi.fn(async (request: ApiReadRequest) => {
      if (request.path === 'code/query') {
        if (request.body?.page === 2) throw new Error('offline')
        return envelope(rows(50), 51)
      }
      if (request.path.startsWith('function/')) return { data: { functionList: [{ action: '/pages/serviceAppointment/serviceAppointments', exts: { tabDisplay: '1' } }] } }
      if (request.path === 'basic/serviceAppointment/query') return { data: [{ _id: 'work-order-a', tenantId: 'synthetic-tenant' }], total: 1 }
      if (request.path === 'biz/action/query.do') return { data: [] }
      return { data: { serviceAppointment: { _id: 'work-order-a', tenantId: 'synthetic-tenant', status: 'status-0' },
        workflowNode: [{ _id: 'node-a', nodeDef: { name: 'Do not use node name as status' } }] } }
    })
    const api = createRoleScopedTechnicianApiReadAdapter({ execute }, () => asOpaqueId<'RoleId'>(actor.roleId), { codeTenantId: 'synthetic-tenant', getReadAuthorizationScope: () => actor })
    await api.listWorkOrders({ page: 1, pageSize: 20, category: 'all' })
    const result = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('work-order-a'))
    expect(result.state).toBe('succeeded')
    expect(result.data?.taskLabel).toBeUndefined()
  })
})

describe('Code query runtime protocol boundaries', () => {
  it('Mock accepts the verified request, applies parent and paging, and rejects the old or unbounded wire', async () => {
    setBusinessMockEnabled(true)
    expect(await tryMockRead('code/query', wireBody, { latencyMs: 0 })).toEqual(mockStatusOptionsResponse)
    expect(await tryMockRead('code/query', { ...wireBody, page: 2 }, { latencyMs: 0 }))
      .toMatchObject({ data: [], page: 2, rows: 50, total: 10, dataCount: 0 })
    expect(await tryMockRead('code/query', { ...wireBody, parentId: 'missing-parent' }, { latencyMs: 0 }))
      .toMatchObject({ data: [], total: 0 })
    expect(await tryMockRead('code/query', { ...wireBody, parentId: 'mock-status-type' }, { latencyMs: 0 }))
      .toMatchObject({ total: 10, dataCount: 10 })
    for (const body of [
      { valueOption: 'STATUS' }, { ...wireBody, valueOption: 'STATUS' },
      { valueOption: 'STATUS', parentId: mockR1AddFormCodeId },
      { ...wireBody, _all: '1' }, { ...wireBody, page: 11 }, { ...wireBody, rows: 500 },
      { ...wireBody, sidx: 'order' }, { ...wireBody, unexpectedFilter: 'x' },
    ]) expect(await tryMockRead('code/query', body, { latencyMs: 0 })).toBeNull()
  })

  it('keeps the Production transport denial unchanged with zero network calls', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn()
    const transport = createUniApiReadTransport({ apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'), request })
    const result = await createTechnicianApiReadAdapter(transport).getCodeOptions(statusQuery)
    expect(result.error?.category).toBe('unsupported_capability')
    expect(result.data).toBeUndefined()
    expect(request).not.toHaveBeenCalled()
  })

  it('actual application composition and Uni transport discard an in-flight page after the current session role changes', async () => {
    vi.stubEnv('VITE_XLINK_PLATFORM', 'mp-weixin')
    vi.stubEnv('VITE_XLINK_API_BASE_URL', 'http://127.0.0.1:5189/xlink/wm')
    vi.stubEnv('VITE_XLINK_AUTH_TENANT', 'synthetic-tenant')
    vi.stubEnv('VITE_XLINK_AUTH_METHOD', 'phone')
    vi.stubEnv('VITE_XLINK_AUTH_API_BASE_URL', '')
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    let session: SessionSnapshot = { sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'),
      user: { id: asOpaqueId<'UserId'>('synthetic-user') },
      currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role') }, capabilityNames: [] }
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      const body = new URLSearchParams(String(options.data))
      const page = Number(body.get('page'))
      expect(options.url).toBe('http://127.0.0.1:5189/xlink/wm/code/query')
      expect(body.get('is:type|string#and')).toBe('STATUS')
      expect(body.get('valueOption')).toBeNull()
      expect(body.get('sidx')).toBe('order,_id')
      if (page === 2) session = { ...session, currentRole: { id: asOpaqueId<'RoleId'>('changed-role') } }
      options.success?.({ statusCode: 200, data: page === 1 ? envelope(rows(50), 51) : envelope(rows(1, 50), 51, 2) } as never)
    })
    vi.stubGlobal('uni', { request, getStorageSync: () => '', setStorageSync: vi.fn(), removeStorageSync: vi.fn() })
    const api = createDefaultTechnicianApiReadPort({ getCurrentSession: () => session } as AuthSessionPort)
    const result = await api.getCodeOptions(statusQuery)
    expect(result.error?.category).toBe('authorization_denied')
    expect(result.data).toBeUndefined()
    expect(request).toHaveBeenCalledTimes(2)
  })
})
