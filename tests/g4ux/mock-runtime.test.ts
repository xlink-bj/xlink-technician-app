import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
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
  isBusinessMockEnabled,
  mockSanodeListResponse,
  mockWorkOrderDetailResponse,
  mockWorkOrderIds,
  resetBusinessMockCache,
  resolveBusinessMockEnabled,
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
    setBusinessMockEnabled(true)
    expect(isBusinessMockEnabled()).toBe(true)
    setBusinessMockEnabled(false)
    expect(isBusinessMockEnabled()).toBe(false)
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

  it('bypasses uni.request for matched reads and falls through for unmatched reads', async () => {
    const request = vi.fn<UniApiRequestExecutor>()
    setBusinessMockEnabled(true)
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => null,
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

    request.mockImplementation((options) => {
      options.success?.({ statusCode: 200, data: { data: [] } } as never)
      return undefined
    })
    const unmatchedTransport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
      request,
    })
    await unmatchedTransport.execute({ method: 'POST', path: 'workflow/queryNode/mock-run' })
    expect(request).toHaveBeenCalledTimes(1)
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
      { id: mockWorkOrderIds[0], title: '演示工单 · 屋面检查 A' },
      { id: mockWorkOrderIds[1], title: '演示工单 · 防水维修 B' },
      { id: mockWorkOrderIds[2], title: '演示工单 · 屋面复查 C' },
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
      displayNumber: 'MOCK-WO-001',
      customerName: '模拟客户 A（演示数据）',
      serviceAddress: '模拟地址 A（非真实地点）',
    })
    expect(requests.at(-1)?.path).toBe(
      'basic/serviceAppointment/queryById/mock-work-order-001',
    )
  })

  it('keeps fixtures raw and free of UI-only aliases', () => {
    const rawNode = mockSanodeListResponse.data[0]
    expect(rawNode).toHaveProperty('_id', 'mock-workflow-node-001')
    expect(rawNode).toHaveProperty('data._id', mockWorkOrderIds[0])
    expect(rawNode).toHaveProperty('data.name')
    expect(rawNode.data).not.toHaveProperty('title')
    expect(mockWorkOrderDetailResponse.entity).not.toHaveProperty('displayNumber')
    expect(mockWorkOrderDetailResponse.entity).not.toHaveProperty('customerName')
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
