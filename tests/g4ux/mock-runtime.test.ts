import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiReadTransportError,
  createRoleScopedTechnicianApiReadAdapter,
  createTechnicianApiReadAdapter,
  type ApiReadRequest,
  type ApiReadTransport,
} from '@adapters/api/technician-api'
import {
  createUniApiReadTransport,
  type UniApiRequestExecutor,
} from '@adapters/api/uni-api-read-transport'
import {
  businessMockModeStorageKey,
  isBusinessMockEnabled,
  isBusinessMockMode,
  mockOrdinaryListResponse,
  mockSanodeListResponse,
  mockWorkOrderDetailResponse,
  mockWorkOrderDetailResponses,
  mockWorkOrderIds,
  resetBusinessMockCache,
  resolveBusinessMockEnabled,
  setBusinessMockMode,
  setBusinessMockEnabled,
  tryMockRead,
} from '@adapters/api/mock'
import { readFileSync } from 'node:fs'
import { asOpaqueId } from '@shared/types'

describe('G4-UX business mock runtime', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_MOCK', '')
    vi.stubGlobal('uni', {
      getStorageSync: vi.fn(() => undefined),
      setStorageSync: vi.fn(),
    })
    resetBusinessMockCache()
  })

  it('defaults off and resolves runtime storage enable/disable deterministically', () => {
    expect(resolveBusinessMockEnabled({ environment: 'test' })).toBe(false)
    expect(resolveBusinessMockEnabled({ environment: 'test', storageValue: true })).toBe(true)
    expect(resolveBusinessMockEnabled({ environment: 'test', storageValue: false })).toBe(false)

    expect(isBusinessMockEnabled()).toBe(false)
    expect(isBusinessMockMode()).toBe('off')
    setBusinessMockEnabled(true)
    expect(isBusinessMockEnabled()).toBe(true)
    expect(isBusinessMockMode()).toBe('data')
    setBusinessMockMode('empty')
    expect(isBusinessMockMode()).toBe('empty')
    setBusinessMockEnabled(false)
    expect(isBusinessMockEnabled()).toBe(false)

    vi.mocked(uni.getStorageSync).mockImplementation((key: string) =>
      key === businessMockModeStorageKey ? 'empty' : undefined,
    )
    resetBusinessMockCache()
    expect(isBusinessMockMode()).toBe('empty')
  })

  it('hard-disables mock data in production even when storage/build flags request it', () => {
    expect(
      resolveBusinessMockEnabled({
        environment: 'prod',
        storageValue: true,
        buildEnabled: true,
      }),
    ).toBe(false)

    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    vi.stubEnv('VITE_XLINK_MOCK', 'true')
    resetBusinessMockCache()
    expect(isBusinessMockEnabled()).toBe(false)
  })

  it('requires a session before mock reads and bypasses uni.request for authenticated matches', async () => {
    const request = vi.fn<UniApiRequestExecutor>()
    setBusinessMockMode('data')
    const unauthenticatedTransport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => null,
      request,
      mockLatencyMs: 0,
    })
    await expect(
      unauthenticatedTransport.execute({
        method: 'POST',
        path: 'basic/serviceAppointment/querySAWorkflowNode',
        body: { page: 1, rows: 20 },
      }),
    ).rejects.toMatchObject({ category: 'session_invalid' } satisfies Partial<ApiReadTransportError>)
    expect(request).not.toHaveBeenCalled()

    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
      request,
      mockLatencyMs: 0,
    })
    const matched = await transport.execute({
      method: 'POST',
      path: 'basic/serviceAppointment/querySAWorkflowNode',
      body: { page: 1, rows: 20 },
    })
    expect(request).not.toHaveBeenCalled()
    expect(matched).toEqual(mockSanodeListResponse)
  })

  it('blocks locally-owned synthetic detail reads when mock mode is off', async () => {
    setBusinessMockMode('off')
    const request = vi.fn<UniApiRequestExecutor>()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
      request,
    })

    await expect(
      transport.execute({
        method: 'POST',
        path: 'basic/serviceAppointment/queryById/mock-work-order-001',
        body: { type: 'query' },
      }),
    ).rejects.toMatchObject({ category: 'server_terminal' })
    expect(request).not.toHaveBeenCalled()
  })

  it('falls through for unmatched reads and keeps empty mode local', async () => {
    const request = vi.fn<UniApiRequestExecutor>()
    request.mockImplementation((options) => {
      options.success?.({ statusCode: 200, data: { data: [] } } as never)
      return undefined
    })
    setBusinessMockMode('empty')
    const unmatchedTransport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
      request,
    })
    await unmatchedTransport.execute({ method: 'POST', path: 'workflow/queryNode/mock-run' })
    expect(request).toHaveBeenCalledTimes(1)

    request.mockClear()
    const empty = await unmatchedTransport.execute({
      method: 'POST',
      path: 'basic/serviceAppointment/querySAWorkflowNode',
      body: { page: 1, rows: 20 },
    })
    expect(empty).toEqual({ data: [], page: 1, rows: 20, total: 0 })
    expect(request).not.toHaveBeenCalled()
  })

  it('never mocks Login and disabling restores the real transport path', async () => {
    setBusinessMockEnabled(true)
    expect(await tryMockRead('index/phoneLogin.do', { phone: 'synthetic' }, { latencyMs: 0 })).toBeNull()

    setBusinessMockEnabled(false)
    const request = vi.fn<UniApiRequestExecutor>((options) => {
      options.success?.({ statusCode: 200, data: { data: [] } } as never)
      return undefined
    })
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
      request,
    })
    await transport.execute({ method: 'POST', path: 'basic/serviceAppointment/query' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('passes raw SANODE and detail fixtures through the real adapter normalization', async () => {
    setBusinessMockEnabled(true)
    const requests: ApiReadRequest[] = []
    const transport: ApiReadTransport = {
      execute: async (request) => {
        requests.push(request)
        const raw = await tryMockRead(request.path, request.body ?? {}, { latencyMs: 0 })
        if (raw === null) throw new Error(`No mock fixture for ${request.path}`)
        return raw
      },
    }
    const roleScoped = createRoleScopedTechnicianApiReadAdapter(
      transport,
      () => asOpaqueId<'RoleId'>('synthetic-role'),
    )
    const list = await roleScoped.listWorkOrders({ page: 1, pageSize: 20 })

    expect(list.data?.items).toEqual([
      {
        id: mockWorkOrderIds[0],
        displayNumber: 'DEMO-SA-001',
        customerName: '演示客户甲',
        serviceDistrict: '朝阳区',
        serviceAddress: '演示服务地址一号',
      },
      {
        id: mockWorkOrderIds[1],
        displayNumber: 'DEMO-SA-002',
        customerName: '演示客户乙（长名称结构样本）',
        serviceAddress: '演示区域二号服务地址，长地址字段示例用于换行校验',
      },
      {
        id: mockWorkOrderIds[2],
        displayNumber: 'DEMO-SA-003',
        customerName: '演示客户丙',
      },
    ])
    expect(list.data?.items[0].id).not.toBe('mock-workflow-node-001')
    expect(requests.map((request) => request.path)).toEqual([
      'function/changeRole',
      'basic/serviceAppointment/querySAWorkflowNode',
    ])

    const detail = await createTechnicianApiReadAdapter(transport).getWorkOrderDetail(
      asOpaqueId<'WorkOrderId'>(mockWorkOrderIds[0]),
    )
    expect(detail.data).toEqual({
      id: mockWorkOrderIds[0],
      workflowRunId: 'mock-workflow-run-001',
      displayNumber: 'DEMO-SA-001',
      customerName: '演示客户甲',
      serviceAddress: '演示服务地址一号',
    })
    expect(requests.at(-1)?.path).toBe(
      'basic/serviceAppointment/queryById/mock-work-order-001',
    )
  })

  it('normalizes enriched ordinary service-appointment rows into the same summary semantics', async () => {
    setBusinessMockMode('data')
    const request = vi.fn<UniApiRequestExecutor>()
    const api = createTechnicianApiReadAdapter(
      createUniApiReadTransport({
        apiBaseUrl: 'https://example.invalid',
        getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
        request,
        mockLatencyMs: 0,
      }),
    )

    const result = await api.listWorkOrders({ page: 1, pageSize: 20 })

    expect(result.data?.items).toEqual([
      {
        id: mockWorkOrderIds[0],
        displayNumber: 'DEMO-SA-001',
        customerName: '演示客户甲',
        serviceDistrict: '朝阳区',
        serviceAddress: '演示服务地址一号',
      },
      {
        id: mockWorkOrderIds[1],
        displayNumber: 'DEMO-SA-002',
        customerName: '演示客户乙（长名称结构样本）',
        serviceAddress: '演示区域二号服务地址，长地址字段示例用于换行校验',
      },
    ])
    expect(request).not.toHaveBeenCalled()
  })

  it('keeps every synthetic list entity inside the local detail journey', async () => {
    setBusinessMockMode('data')
    const request = vi.fn<UniApiRequestExecutor>()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
      request,
      mockLatencyMs: 0,
    })
    const api = createTechnicianApiReadAdapter(transport)

    for (const id of mockWorkOrderIds) {
      const detail = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(id))
      expect(detail.state).toBe('succeeded')
      expect(detail.data?.id).toBe(id)
      expect(mockWorkOrderDetailResponses[id]).toBeDefined()
    }

    expect(request).not.toHaveBeenCalled()
  })

  it('normalizes the bounded search input and keeps search server-side inside the adapter', async () => {
    setBusinessMockMode('data')
    const requests: ApiReadRequest[] = []
    const transport: ApiReadTransport = {
      execute: async (request) => {
        requests.push(request)
        const raw = await tryMockRead(request.path, request.body ?? {}, { latencyMs: 0 })
        if (raw === null) throw new Error(`No mock fixture for ${request.path}`)
        return raw
      },
    }
    const api = createRoleScopedTechnicianApiReadAdapter(
      transport,
      () => asOpaqueId<'RoleId'>('synthetic-role'),
    )

    for (const term of ['DEMO-SA-002', '演示客户乙', '长地址字段示例']) {
      const result = await api.listWorkOrders({ page: 1, pageSize: 20, searchText: `  ${term}  ` })
      expect(result.data?.items).toHaveLength(1)
      expect(result.data?.items[0].id).toBe(mockWorkOrderIds[1])
    }

    const listRequests = requests.filter((request) => request.path.includes('serviceAppointment/query'))
    expect(listRequests).toHaveLength(3)
    for (const request of listRequests) {
      expect(request.body).toMatchObject({
        'regex:title|string#or': expect.any(String),
        'regex:name|string#or': expect.any(String),
        'regex:phone|string#or': expect.any(String),
        'regex:address|string#or': expect.any(String),
        'regex:describe|string#or': expect.any(String),
        'regex:orderNum|string#or': expect.any(String),
      })
      expect(request.body).not.toHaveProperty('searchText')
    }
  })

  it('keeps blank search as full data and unmatched search as deterministic empty', async () => {
    setBusinessMockMode('data')
    const transport: ApiReadTransport = {
      execute: async (request) => {
        const raw = await tryMockRead(request.path, request.body ?? {}, { latencyMs: 0 })
        if (raw === null) throw new Error(`No mock fixture for ${request.path}`)
        return raw
      },
    }
    const api = createRoleScopedTechnicianApiReadAdapter(
      transport,
      () => asOpaqueId<'RoleId'>('synthetic-role'),
    )

    const full = await api.listWorkOrders({ page: 1, pageSize: 20, searchText: '   ' })
    const none = await api.listWorkOrders({ page: 1, pageSize: 20, searchText: 'not-in-demo-fixtures' })

    expect(full.data?.items).toHaveLength(mockWorkOrderIds.length)
    expect(none.data?.items).toEqual([])
    expect(none.data?.totalCount).toBe(0)
  })

  it('keeps every synthetic list row consistent with its normalized detail', async () => {
    setBusinessMockMode('data')
    const request = vi.fn<UniApiRequestExecutor>()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
      request,
      mockLatencyMs: 0,
    })
    const api = createRoleScopedTechnicianApiReadAdapter(
      transport,
      () => asOpaqueId<'RoleId'>('synthetic-role'),
    )

    const list = await api.listWorkOrders({ page: 1, pageSize: 20 })
    expect(list.state).toBe('succeeded')
    expect(list.data?.items).toHaveLength(mockWorkOrderIds.length)
    for (const item of list.data?.items ?? []) {
      expect(item).not.toHaveProperty('status')
      expect(item).not.toHaveProperty('state')
      expect(item).not.toHaveProperty('serviceType')
      expect(item).not.toHaveProperty('nodeDef')
      expect(item).not.toHaveProperty('_id')
    }

    for (const item of list.data?.items ?? []) {
      const detail = await createTechnicianApiReadAdapter(transport).getWorkOrderDetail(item.id)
      expect(detail.state).toBe('succeeded')
      expect(detail.data).toMatchObject({
        id: item.id,
        ...(item.displayNumber ? { displayNumber: item.displayNumber } : {}),
        ...(item.customerName ? { customerName: item.customerName } : {}),
        ...(item.serviceAddress ? { serviceAddress: item.serviceAddress } : {}),
      })
    }

    expect(request).not.toHaveBeenCalled()
  })

  it('keeps fixtures raw and free of UI-only aliases', () => {
    const rawNode = mockSanodeListResponse.data[0]
    expect(rawNode).toHaveProperty('_id', 'mock-workflow-node-001')
    expect(rawNode).toHaveProperty('data._id', mockWorkOrderIds[0])
    expect(rawNode).toHaveProperty('data.name')
    expect(rawNode.data).not.toHaveProperty('title')
    expect(rawNode.data).not.toHaveProperty('displayNumber')
    expect(rawNode.data).not.toHaveProperty('customerName')
    expect(rawNode.data).not.toHaveProperty('serviceAddress')
    expect(mockWorkOrderDetailResponse.entity).not.toHaveProperty('displayNumber')
    expect(mockWorkOrderDetailResponse.entity).not.toHaveProperty('customerName')
    expect(mockWorkOrderDetailResponse.entity).not.toHaveProperty('serviceAddress')
  })

  it('keeps representative mock fixtures sanitized and excludes credential/contact values', () => {
    const serialized = JSON.stringify({
      mockSanodeListResponse,
      mockOrdinaryListResponse,
      mockWorkOrderDetailResponses,
    })

    expect(serialized).toContain('DEMO-SA-001')
    expect(serialized).toContain('演示客户')
    expect(serialized).not.toMatch(/186\d{8}/)
    expect(serialized).not.toMatch(/phone|contactIds|JSESSIONID|token/i)
  })

  it('exposes the developer switch only behind the hidden non-production control', () => {
    const homePage = readFileSync(new URL('../../src/pages/index/index.vue', import.meta.url), 'utf8')
    const homeTemplate = homePage.slice(
      homePage.indexOf('<view v-else-if="showHome"'),
      homePage.indexOf('<view v-else class="login-page">'),
    )
    expect(homeTemplate).toContain('@tap="handleHomeBrandTap"')
    expect(homeTemplate).toContain('v-if="mockControlVisible"')
    expect(homeTemplate).toContain('演示数据')
    expect(homePage).toContain('isBusinessMockDeveloperModeAvailable')
  })
})
