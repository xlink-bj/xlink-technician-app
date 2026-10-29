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
import { detailWorkflowUiProjectionFor } from '@features/work-orders/detail-workflow'
import {
  businessMockModeStorageKey,
  isBusinessMockDeveloperModeAvailable,
  isBusinessMockEnabled,
  isBusinessMockMode,
  mockOrdinaryListResponse,
  mockRepairPartsCascadeResponse,
  mockDetailScenarioIds,
  mockListScenarioIds,
  mockSanodeListResponse,
  mockStatusOptionsResponse,
  mockStatusSampleIds,
  mockSyntheticStatusCodes,
  mockQuotationCatalogServiceType,
  mockQuotationCatalogSourceType,
  mockCommandScenarioIds,
  mockQuotationWorkflowNodeId,
  isMockOwnedCommand,
  isMockOwnedRead,
  mockWorkOrderActivityResponses,
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
import { isBusinessMockQuotationPreview } from '@app/business-mock'
import { mockActionWorkspaceScenarios } from '@app/action-workspace-harness'

const mockAdapterOptions = { cascadeTenantId: 'synthetic-tenant' } as const

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

  it('defaults on in non-production and resolves runtime storage enable/disable deterministically', () => {
    expect(resolveBusinessMockEnabled({ environment: 'dev' })).toBe(true)
    expect(resolveBusinessMockEnabled({ environment: 'test' })).toBe(true)
    expect(resolveBusinessMockEnabled({ environment: 'test', buildEnabled: false })).toBe(false)
    expect(resolveBusinessMockEnabled({ environment: 'test', storageValue: true })).toBe(true)
    expect(resolveBusinessMockEnabled({ environment: 'test', storageValue: false })).toBe(false)

    expect(isBusinessMockEnabled()).toBe(true)
    expect(isBusinessMockMode()).toBe('data')
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
    expect(isBusinessMockDeveloperModeAvailable()).toBe(false)
    expect(isBusinessMockEnabled()).toBe(false)
  })

  it('exposes main-App quotation via the same authenticated action scenario infrastructure as Appointment', () => {
    const scenario = mockActionWorkspaceScenarios.find((candidate) => candidate.key === 'quotation')
    expect(scenario).toBeDefined()
    expect(scenario?.route).toContain(encodeURIComponent(mockCommandScenarioIds.quotationFoundation))
    expect(scenario?.route).toContain(encodeURIComponent(mockQuotationWorkflowNodeId))
    expect(scenario?.route).toContain('action=place_order')
    expect(scenario?.description).toContain('不创建服务器订单')
  })

  it('labels legacy standalone Appointment and Survey scenarios as blocked instead of promising unsafe form submission', () => {
    for (const key of ['fresh', 'retryable', 'terminal', 'survey']) {
      const scenario = mockActionWorkspaceScenarios.find(candidate => candidate.key === key)
      expect(scenario?.description).toContain('当前安全阻断')
      expect(scenario?.description).not.toContain('成功提交')
    }
  })

  it('only enables the bounded quotation product preview for its synthetic work order in DEV Mock DATA', () => {
    vi.stubEnv('DEV', true)
    setBusinessMockMode('data')
    expect(isBusinessMockQuotationPreview(mockCommandScenarioIds.quotationFoundation)).toBe(true)
    expect(isBusinessMockQuotationPreview('ordinary-real-work-order')).toBe(false)
    setBusinessMockMode('off')
    expect(isBusinessMockQuotationPreview(mockCommandScenarioIds.quotationFoundation)).toBe(false)
    setBusinessMockMode('empty')
    expect(isBusinessMockQuotationPreview(mockCommandScenarioIds.quotationFoundation)).toBe(false)
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    resetBusinessMockCache()
    expect(isBusinessMockQuotationPreview(mockCommandScenarioIds.quotationFoundation)).toBe(false)
  })

  it('never forwards synthetic official Order writes to real transport, even outside Mock DATA mode', () => {
    const syntheticOrder = JSON.stringify({
      type: 1, serviceAppointmentId: mockCommandScenarioIds.quotationFoundation,
    })
    expect(isMockOwnedCommand('basic/order/upsert', { order: syntheticOrder })).toBe(true)
    expect(isMockOwnedCommand('workflow/startWorkflow/order/null/example', {
      saId: mockCommandScenarioIds.quotationFoundation,
    })).toBe(true)
    expect(isMockOwnedCommand('basic/order/upsert', {
      order: JSON.stringify({ type: 1, serviceAppointmentId: 'ordinary-real-work-order' }),
    })).toBe(false)
    expect(isMockOwnedCommand('basic/order/upsert', { order: 'broken-json' })).toBe(false)
  })

  it('owns synthetic quotation Order reads without allowing a real HTTP fallback', async () => {
    const workOrderId = mockCommandScenarioIds.quotationFoundation
    expect(isMockOwnedRead('basic/order/query', {
      'is:serviceAppointmentId|string#and': workOrderId,
      'is:type|integer#and': 1,
    })).toBe(true)
    expect(isMockOwnedRead('basic/order/queryById', { id: 'order-synthetic-review' })).toBe(true)
    expect(isMockOwnedRead('basic/order/query', {
      'is:serviceAppointmentId|string#and': 'ordinary-real-work-order',
    })).toBe(false)
    setBusinessMockMode('data')
    const request = vi.fn<UniApiRequestExecutor>()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
      request,
      mockLatencyMs: 0,
    })
    await expect(transport.execute({
      method: 'POST', path: 'basic/order/query',
      body: { 'is:serviceAppointmentId|string#and': workOrderId },
    })).rejects.toMatchObject({ category: 'server_terminal' } satisfies Partial<ApiReadTransportError>)
    expect(request).not.toHaveBeenCalled()
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

  it('binds positive detail markers to the authenticated actor without changing fixture semantics', async () => {
    setBusinessMockMode('data')
    const request = vi.fn<UniApiRequestExecutor>()
    const actor = {
      userId: 'real-test-user',
      roleId: 'real-test-role',
    }
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => asOpaqueId<'SessionRef'>('real-test-session'),
      getMockActor: () => actor,
      request,
      mockLatencyMs: 0,
    })
    const api = createTechnicianApiReadAdapter(transport, mockAdapterOptions)

    const first = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockWorkOrderIds[0]))
    const second = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockWorkOrderIds[1]))
    const third = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockWorkOrderIds[2]))
    const session = {
      sessionRef: asOpaqueId<'SessionRef'>('real-test-session'),
      user: { id: asOpaqueId<'UserId'>(actor.userId) },
      currentRole: { id: asOpaqueId<'RoleId'>(actor.roleId) },
      capabilityNames: [],
    } as const

    expect(first.data?.workflowNodes?.[0].visibility).toEqual({
      evidenceState: 'verified',
      selectableRoleIds: ['real-test-role'],
    })
    expect(second.data?.workflowNodes?.[0].visibility).toEqual({
      evidenceState: 'verified',
      viewableRoleIds: ['real-test-role'],
    })
    expect(third.data?.workflowNodes?.[0].handlers).toEqual([
      { kind: 'unclassified', value: 'real-test-user' },
    ])
    expect(detailWorkflowUiProjectionFor(first.data ?? null, session).currentTask).toMatchObject({
      title: '勘察',
      actionLabel: '处理表单',
    })
    expect(detailWorkflowUiProjectionFor(second.data ?? null, session).currentTask).toMatchObject({
      title: '下单',
      actionLabel: '去下单',
    })
    expect(detailWorkflowUiProjectionFor(third.data ?? null, session).currentTask).toMatchObject({
      title: '派工',
      actionLabel: '查看子流程',
    })
    expect(mockWorkOrderDetailResponses[mockWorkOrderIds[0]].data.workflowNode[0].nodeDef.userChoose).toEqual([
      'synthetic-role',
    ])
    expect(mockWorkOrderDetailResponses[mockWorkOrderIds[2]].data.workflowNode[0].handlerIds).toEqual([
      'synthetic-user',
    ])
    expect(request).not.toHaveBeenCalled()
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

    await expect(
      transport.execute({
        method: 'POST',
        path: 'biz/action/query.do',
        body: {
          bizType: 'serviceAppointment',
          sid: 'mock-work-order-001',
          actionType: '1,2,3,4,5,6',
        },
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
      mockAdapterOptions,
    )
    const list = await roleScoped.listWorkOrders({ page: 1, pageSize: 20 })

    expect(list.data?.items).toMatchObject([
      {
        id: mockWorkOrderIds[0],
        displayNumber: '09077',
        taskLabel: '跟进签约',
        servicePartLabel: '屋面',
        customerName: '张先生',
        serviceDistrict: '朝阳区',
        serviceAddress: '日坛东一街',
        distanceText: '2.6 km',
        communityOrderCount: 2,
        contact: { normalizedPhone: '13800000000', displayMask: '138****0000' },
      },
      {
        id: mockWorkOrderIds[1],
        displayNumber: '04009',
        taskLabel: '验收回款',
        servicePartLabel: '屋面',
        customerName: '陈女士（东坝国际商贸中心业主）',
        serviceAddress: '东坝北路17号国际贸易中心A座',
        distanceText: '2.6 km',
        communityOrderCount: 2,
        contact: { normalizedPhone: '13800000001', displayMask: '138****0001' },
      },
      {
        id: mockWorkOrderIds[2],
        displayNumber: '11850',
        taskLabel: '待接单',
        servicePartLabel: '屋面',
        customerName: '李先生',
        serviceDistrict: '朝阳区',
        serviceAddress: '日坛国际贸易中心A座',
        distanceText: '4.2 km',
        communityOrderCount: 2,
      },
      {
        id: mockDetailScenarioIds[3],
        displayNumber: '16204',
        taskLabel: '待预约',
        servicePartLabel: '屋面',
        customerName: '王女士',
        serviceDistrict: '朝阳区',
        serviceAddress: '建国门外大街',
        distanceText: '5.1 km',
        communityOrderCount: 0,
      },
      {
        id: mockDetailScenarioIds[4],
        displayNumber: '17505',
        taskLabel: '暂不上门',
        servicePartLabel: '屋面',
        customerName: '刘先生',
        serviceAddress: '朝阳路16号',
        distanceText: '3.8 km',
        communityOrderCount: 1,
      },
      {
        id: mockDetailScenarioIds[5],
        displayNumber: '19006',
        taskLabel: '待下单',
        customerName: '赵女士',
        serviceDistrict: '朝阳区',
        serviceAddress: '朝阳区青年路',
        distanceText: '6.8 km',
        communityOrderCount: 0,
      },
      {
        id: mockStatusSampleIds[0],
        displayNumber: '09090',
        taskLabel: '现场服务',
        servicePartLabel: '屋面',
        customerName: '周先生',
        serviceDistrict: '朝阳区',
        serviceAddress: '日坛路',
        distanceText: '0.9 km',
        communityOrderCount: 3,
      },
      {
        id: mockStatusSampleIds[1],
        displayNumber: '00067',
        taskLabel: '上门服务',
        servicePartLabel: '屋面',
        customerName: '孙女士',
        serviceDistrict: '朝阳区',
        serviceAddress: '朝阳门地铁站',
        distanceText: '4.9 km',
        communityOrderCount: 4,
      },
      {
        id: mockStatusSampleIds[2],
        displayNumber: '14825',
        taskLabel: '跟进方案',
        servicePartLabel: '卫生间',
        customerName: '何先生',
        serviceDistrict: '朝阳区',
        serviceAddress: '天福园小区',
        distanceText: '0.5 km',
        communityOrderCount: 1,
      },
      {
        id: mockStatusSampleIds[3],
        displayNumber: '09224',
        taskLabel: '待评价',
        servicePartLabel: '屋面',
        customerName: '郑女士',
        serviceDistrict: '朝阳区',
        serviceAddress: '日坛国际贸易中心A座',
        distanceText: '1.6 km',
        communityOrderCount: 1,
      },
      {
        id: mockCommandScenarioIds.quotationFoundation,
        displayNumber: '26018',
        taskLabel: '待下单',
        customerName: '吴先生',
        serviceDistrict: '朝阳区',
        serviceAddress: '望京花园西区',
      },
      {
        id: mockCommandScenarioIds.continuousJourney,
        displayNumber: '26019',
        taskLabel: '待预约',
        customerName: '蒋女士',
        serviceDistrict: '朝阳区',
        serviceAddress: '北苑家园望春园',
      },
    ])
    expect(list.data?.items[0].id).not.toBe('mock-workflow-node-001')
    expect(requests.map((request) => request.path)).toEqual([
      'function/changeRole',
      'basic/serviceAppointment/querySAWorkflowNode',
      'code/query',
      'i/code/selectMultistageCode.do',
    ])

    const detail = await createTechnicianApiReadAdapter(transport, mockAdapterOptions).getWorkOrderDetail(
      asOpaqueId<'WorkOrderId'>(mockWorkOrderIds[0]),
    )
    expect(detail.data).toEqual({
      id: mockWorkOrderIds[0],
      workflowRunId: 'mock-workflow-run-001',
      displayNumber: '09077',
      taskLabel: '跟进签约',
      quotationCatalogContext: {
        workOrderId: mockWorkOrderIds[0],
        serviceType: mockQuotationCatalogServiceType,
        sourceType: mockQuotationCatalogSourceType,
      },
      servicePartLabel: '屋面',
      serviceDistrict: '朝阳区',
      customerName: '张先生',
      serviceAddress: '日坛东一街',
      distanceText: '2.6 km',
      contact: { normalizedPhone: '13800000000', displayMask: '138****0000' },
      activities: [
        {
          id: 'mock-activity-001-003',
          title: '已完成现场服务',
          content: '现场服务节点已完成。',
          owner: '调度中心',
          time: '2026-04-13 15:20',
          icon: 'location',
          tone: 'green',
          badge: '系统',
        },
        {
          id: 'mock-activity-001-002',
          title: '通话记录',
          content: '已与客户确认上门安排。',
          owner: '现场工程师',
          time: '2026-04-13 14:32',
          icon: 'phone',
          tone: 'blue',
          badge: '电话',
        },
        {
          id: 'mock-activity-001-001',
          title: '跟进笔记',
          content: '客户确认按预约时间上门。',
          owner: '现场工程师',
          time: '2026-04-13 14:10',
          icon: 'location',
          tone: 'orange',
          badge: '笔记',
        },
      ],
      workflowNodes: [
        {
          id: 'mock-workflow-node-001-current',
          displayName: '勘察',
          category: 'forms',
          sourceNodeType: 'forms',
          nodeTypeEvidence: 'runtime_node_def',
          lifecycle: 'active',
          visibility: {
            evidenceState: 'verified',
            selectableRoleIds: ['synthetic-role'],
          },
        },
      ],
    })
    expect(requests.filter((request) => request.path.includes('queryById/')).at(-1)?.path).toBe(
      'basic/serviceAppointment/queryById/mock-work-order-001',
    )
    expect(requests.find((request) => request.path === 'biz/action/query.do')).toMatchObject({
      method: 'POST',
      body: {
        bizType: 'serviceAppointment',
        sid: mockWorkOrderIds[0],
        actionType: '1,2,3,4,5,6',
      },
    })
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
      mockAdapterOptions,
    )

    const result = await api.listWorkOrders({ page: 1, pageSize: 20 })

    expect(result.data?.items).toEqual([
      {
        id: mockWorkOrderIds[0],
        displayNumber: '09077',
        taskLabel: '跟进签约',
        servicePartLabel: '屋面',
        customerName: '张先生',
        serviceDistrict: '朝阳区',
        serviceAddress: '日坛东一街',
        distanceText: '2.6 km',
        communityOrderCount: 2,
        contact: { normalizedPhone: '13800000000', displayMask: '138****0000' },
      },
      {
        id: mockWorkOrderIds[1],
        displayNumber: '04009',
        taskLabel: '验收回款',
        servicePartLabel: '屋面',
        customerName: '陈女士（东坝国际商贸中心业主）',
        serviceAddress: '东坝北路17号国际贸易中心A座',
        distanceText: '2.6 km',
        communityOrderCount: 2,
        contact: { normalizedPhone: '13800000001', displayMask: '138****0001' },
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
    const api = createTechnicianApiReadAdapter(transport, mockAdapterOptions)

    for (const id of mockWorkOrderIds) {
      const detail = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(id))
      expect(detail.state).toBe('succeeded')
      expect(detail.data?.id).toBe(id)
      expect(mockWorkOrderDetailResponses[id]).toBeDefined()
    }

    expect(request).not.toHaveBeenCalled()
  })

  it('normalizes R2-shaped action rows into a newest-first read-only timeline', async () => {
    setBusinessMockMode('data')
    const request = vi.fn<UniApiRequestExecutor>()
    const api = createTechnicianApiReadAdapter(
      createUniApiReadTransport({
        apiBaseUrl: 'https://example.invalid',
        getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
        request,
        mockLatencyMs: 0,
      }),
      mockAdapterOptions,
    )

    const result = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockWorkOrderIds[0]))

    expect(result.state).toBe('succeeded')
    expect(result.data?.activities).toEqual([
      {
        id: 'mock-activity-001-003',
        title: '已完成现场服务',
        content: '现场服务节点已完成。',
        owner: '调度中心',
        time: '2026-04-13 15:20',
        icon: 'location',
        tone: 'green',
        badge: '系统',
      },
      {
        id: 'mock-activity-001-002',
        title: '通话记录',
        content: '已与客户确认上门安排。',
        owner: '现场工程师',
        time: '2026-04-13 14:32',
        icon: 'phone',
        tone: 'blue',
        badge: '电话',
      },
      {
        id: 'mock-activity-001-001',
        title: '跟进笔记',
        content: '客户确认按预约时间上门。',
        owner: '现场工程师',
        time: '2026-04-13 14:10',
        icon: 'location',
        tone: 'orange',
        badge: '笔记',
      },
    ])
    expect(mockWorkOrderActivityResponses[mockWorkOrderIds[0]]).toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })

  it('keeps Mock EMPTY follow-up records local and empty', async () => {
    setBusinessMockMode('empty')
    const request = vi.fn<UniApiRequestExecutor>()
    const api = createTechnicianApiReadAdapter(
      createUniApiReadTransport({
        apiBaseUrl: 'https://example.invalid',
        getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
        request,
        mockLatencyMs: 0,
      }),
      mockAdapterOptions,
    )

    const result = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockWorkOrderIds[0]))

    expect(result.state).toBe('succeeded')
    expect(result.data?.activities).toBeUndefined()
    expect(request).not.toHaveBeenCalled()
  })

  it('normalizes every bounded raw detail scenario through the same adapter', async () => {
    setBusinessMockMode('data')
    const request = vi.fn<UniApiRequestExecutor>()
    const api = createTechnicianApiReadAdapter(
      createUniApiReadTransport({
        apiBaseUrl: 'https://example.invalid',
        getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
        request,
        mockLatencyMs: 0,
      }),
      mockAdapterOptions,
    )

    for (const id of mockDetailScenarioIds) {
      const result = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(id))
      expect(result.state).toBe('succeeded')
      expect(result.data?.id).toBe(id)
      expect(result.data).not.toHaveProperty('status')
      expect(result.data?.workflowNodes).toBeDefined()
      expect(result.data?.workflowNodes?.every((node) => node.lifecycle !== undefined)).toBe(true)
      expect(result.data?.workflowNodes?.every((node) => node.category !== undefined)).toBe(true)
      expect(result.data?.workflowNodes?.every((node) => !('state' in node))).toBe(true)
      expect(result.data?.workflowNodes?.every((node) => !('nodeDef' in node))).toBe(true)
      expect(result.data).not.toHaveProperty('describe')
      expect(result.data).not.toHaveProperty('applyTimeStr')
      if (id === mockDetailScenarioIds[5]) {
        expect(result.data).not.toHaveProperty('servicePartLabel')
      } else {
        expect(result.data?.servicePartLabel).toBe('屋面')
      }
    }

    expect(request).not.toHaveBeenCalled()
  })

  it('keeps real and synthetic detail ids on identical semantic mapping', async () => {
    const syntheticRaw = mockWorkOrderDetailResponses[mockWorkOrderIds[0]]
    const realRaw = {
      data: {
        serviceAppointment: {
          ...syntheticRaw.data.serviceAppointment,
          _id: 'real-work-order-001',
          workflowRunId: 'real-workflow-run-001',
        },
        workflow: { _id: 'real-workflow-run-001' },
        workflowNode: syntheticRaw.data.workflowNode,
      },
    }
    const transport: ApiReadTransport = {
      execute: vi.fn(async (request) => {
        if (request.path === 'code/query') return mockStatusOptionsResponse
        if (request.path === 'i/code/selectMultistageCode.do') return mockRepairPartsCascadeResponse
        return request.path.endsWith(mockWorkOrderIds[0]) ? syntheticRaw : realRaw
      }),
    }
    const api = createTechnicianApiReadAdapter(transport, mockAdapterOptions)

    const synthetic = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockWorkOrderIds[0]))
    const real = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('real-work-order-001'))

    expect(synthetic.state).toBe('succeeded')
    expect(real.state).toBe('succeeded')
    expect(real.data).toEqual({
      ...synthetic.data,
      id: 'real-work-order-001',
      workflowRunId: 'real-workflow-run-001',
      quotationCatalogContext: {
        ...synthetic.data?.quotationCatalogContext,
        workOrderId: 'real-work-order-001',
      },
    })
  })

  it('keeps unknown workflow semantics separate from status and optional appointment fields', async () => {
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

    const result = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(mockDetailScenarioIds[5]))

    expect(result.data).toEqual({
      id: mockDetailScenarioIds[5],
      displayNumber: '19006',
      workflowRunId: 'mock-workflow-run-006',
      quotationCatalogContext: {
        workOrderId: mockDetailScenarioIds[5],
        serviceType: mockQuotationCatalogServiceType,
        sourceType: mockQuotationCatalogSourceType,
      },
      taskLabel: '待下单',
      serviceDistrict: '朝阳区',
      customerName: '赵女士',
      serviceAddress: '朝阳区青年路',
      distanceText: '6.8 km',
      contact: { normalizedPhone: '13800000005', displayMask: '138****0005' },
      workflowNodes: [
        {
          id: 'mock-workflow-node-006-current',
          displayName: '待核验',
          category: 'unsupported',
          sourceNodeType: 'unverified-node-type',
          nodeTypeEvidence: 'runtime_node_def',
          lifecycle: 'unknown',
          visibility: { evidenceState: 'missing' },
        },
      ],
    })
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
      mockAdapterOptions,
    )

    for (const term of ['04009', '陈女士', '东坝北路']) {
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
      mockAdapterOptions,
    )

    const full = await api.listWorkOrders({ page: 1, pageSize: 20, searchText: '   ' })
    const none = await api.listWorkOrders({ page: 1, pageSize: 20, searchText: 'not-in-demo-fixtures' })

    expect(full.data?.items).toHaveLength(mockListScenarioIds.length)
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
      mockAdapterOptions,
    )

    const list = await api.listWorkOrders({ page: 1, pageSize: 20 })
    expect(list.state).toBe('succeeded')
    expect(list.data?.items).toHaveLength(mockListScenarioIds.length)
    expect(list.data?.items.map((item) => String(item.id))).toEqual([...mockListScenarioIds])
    for (const item of list.data?.items ?? []) {
      expect(item).not.toHaveProperty('status')
      expect(item).not.toHaveProperty('state')
      expect(item).not.toHaveProperty('serviceType')
      expect(item).not.toHaveProperty('nodeDef')
      expect(item).not.toHaveProperty('_id')
    }

    for (const item of list.data?.items ?? []) {
      const detail = await createTechnicianApiReadAdapter(transport, mockAdapterOptions).getWorkOrderDetail(item.id)
      expect(detail.state).toBe('succeeded')
      expect(detail.data).toMatchObject({
        id: item.id,
        ...(item.displayNumber ? { displayNumber: item.displayNumber } : {}),
        ...(item.customerName ? { customerName: item.customerName } : {}),
        ...(item.serviceAddress ? { serviceAddress: item.serviceAddress } : {}),
      })
    }

    for (const id of mockStatusSampleIds) {
      const detail = await createTechnicianApiReadAdapter(transport, mockAdapterOptions).getWorkOrderDetail(
        asOpaqueId<'WorkOrderId'>(id),
      )
      expect(detail.data?.activities).toHaveLength(2)
      expect(detail.data?.workflowNodes).toEqual([])
    }

    expect(request).not.toHaveBeenCalled()
  })

  it('keeps fixtures raw and free of UI-only aliases', () => {
    const rawNode = mockSanodeListResponse.data[0]
    expect(rawNode).toHaveProperty('_id', 'mock-workflow-node-001')
    expect(rawNode).toHaveProperty('data._id', mockWorkOrderIds[0])
    expect(rawNode).toHaveProperty('data.name')
    expect(rawNode.data).toHaveProperty('exts.leakagesite_copy', [['repair-part-code-001']])
    expect(rawNode.data).toHaveProperty('exts.distance', 2.6)
    expect(rawNode.data).toHaveProperty('exts.communityOrdersTotal', 2)
    expect(rawNode.data).not.toHaveProperty('part')
    expect(rawNode.data).not.toHaveProperty('distance')
    expect(rawNode.data).not.toHaveProperty('nearbyCustomers')
    expect(rawNode.data).toHaveProperty('status', '206')
    expect(rawNode.data).toHaveProperty('phone', '13800000000')
    expect(rawNode.data).not.toHaveProperty('displayNumber')
    expect(rawNode.data).not.toHaveProperty('customerName')
    expect(rawNode.data).not.toHaveProperty('serviceAddress')
    expect(mockWorkOrderDetailResponse.data.serviceAppointment).not.toHaveProperty('displayNumber')
    expect(mockWorkOrderDetailResponse.data.serviceAppointment).not.toHaveProperty('customerName')
    expect(mockWorkOrderDetailResponse.data.serviceAppointment).not.toHaveProperty('serviceAddress')
  })

  it('resolves task and service-part labels only from adapter-owned code reads', async () => {
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

    const api = createTechnicianApiReadAdapter(transport, mockAdapterOptions)
    const result = await api.listWorkOrders({ page: 1, pageSize: 20 })

    expect(result.data?.items[0].taskLabel).toBe(mockStatusOptionsResponse.data[0].codelabel)
    expect(result.data?.items[0].servicePartLabel).toBe('屋面')
    expect(requests.find((request) => request.path === 'code/query')).toEqual({
      method: 'POST',
      path: 'code/query',
      body: { valueOption: 'STATUS' },
    })
    expect(requests.at(-1)).toEqual({
      method: 'POST',
      path: 'i/code/selectMultistageCode.do',
      body: { types: 'repairParts', tenantId: 'synthetic-tenant' },
    })
  })

  it('keeps visual-only status samples synthetic across raw data, lookup, and Adapter output', async () => {
    setBusinessMockEnabled(true)
    const raw = await tryMockRead(
      'basic/serviceAppointment/querySAWorkflowNode',
      { page: 1, rows: 20 },
      { latencyMs: 0 },
    )
    expect(raw).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({ status: mockSyntheticStatusCodes.appointmentPending }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({ status: mockSyntheticStatusCodes.onsite }),
        }),
      ]),
    })
    const rawStatusValues = (raw as { data: Array<{ data: { status: string } }> }).data.map(
      (item) => item.data.status,
    )
    expect(rawStatusValues).toEqual(expect.arrayContaining(Object.values(mockSyntheticStatusCodes)))

    expect(mockStatusOptionsResponse.data).toEqual(
      expect.arrayContaining([
        { value: mockSyntheticStatusCodes.appointmentPending, codelabel: '待预约' },
        { value: mockSyntheticStatusCodes.onsite, codelabel: '现场服务' },
        { value: mockSyntheticStatusCodes.visit, codelabel: '上门服务' },
        { value: mockSyntheticStatusCodes.deferred, codelabel: '暂不上门' },
        { value: mockSyntheticStatusCodes.order, codelabel: '待下单' },
        { value: mockSyntheticStatusCodes.proposal, codelabel: '跟进方案' },
        { value: mockSyntheticStatusCodes.rating, codelabel: '待评价' },
      ]),
    )
    expect(mockStatusOptionsResponse.data.map((option) => option.value)).not.toEqual(
      expect.arrayContaining(['104', '200', '201', '202', '203', '205', '402']),
    )

    const request = vi.fn<UniApiRequestExecutor>()
    const api = createRoleScopedTechnicianApiReadAdapter(
      createUniApiReadTransport({
        apiBaseUrl: 'https://example.invalid',
        getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session-ref'),
        request,
        mockLatencyMs: 0,
      }),
      () => asOpaqueId<'RoleId'>('synthetic-role'),
      mockAdapterOptions,
    )
    const result = await api.listWorkOrders({ page: 1, pageSize: 20 })
    expect(result.data?.items.find((item) => item.id === mockStatusSampleIds[0])?.taskLabel).toBe('现场服务')
    expect(result.data?.items.find((item) => item.id === mockStatusSampleIds[1])?.taskLabel).toBe('上门服务')
    expect(request).not.toHaveBeenCalled()
  })

  it('omits an unknown status instead of fabricating a task label', async () => {
    const transport: ApiReadTransport = {
      execute: vi.fn(async (request) => {
        if (request.path === 'code/query') return { data: [], page: 1, rows: 20, total: 0 }
        return {
          data: [{ _id: 'work-order-unknown-status', status: 'unverified-status' }],
          page: 1,
          rows: 20,
          total: 1,
        }
      }),
    }
    const result = await createTechnicianApiReadAdapter(transport).listWorkOrders({
      page: 1,
      pageSize: 20,
    })

    expect(result.data?.items).toEqual([{ id: 'work-order-unknown-status' }])
  })

  it('uses the returned cascade label instead of an adapter hardcoded mapping', async () => {
    const transport: ApiReadTransport = {
      execute: vi.fn(async (request) => {
        if (request.path === 'code/query') return mockStatusOptionsResponse
        if (request.path === 'i/code/selectMultistageCode.do') {
          return [
            {
              type: 'repairParts',
              children: [{ value: 'repair-part-code-001', name: '屋面专用' }],
            },
          ]
        }
        return mockWorkOrderDetailResponses[mockWorkOrderIds[0]]
      }),
    }

    const result = await createTechnicianApiReadAdapter(transport, mockAdapterOptions).getWorkOrderDetail(
      asOpaqueId<'WorkOrderId'>(mockWorkOrderIds[0]),
    )

    expect(result.data?.servicePartLabel).toBe('屋面专用')
  })

  it('keeps status labels separate from the Runtime current-task projection', async () => {
    const transport: ApiReadTransport = {
      execute: vi.fn(async (request) => {
        if (request.path === 'code/query') return { data: [], page: 1, rows: 20, total: 0 }
        const id = request.path.split('/').at(-1) ?? ''
        return { data: { serviceAppointment: { _id: id, status: '206' } } }
      }),
    }
    const api = createTechnicianApiReadAdapter(transport)

    const result = await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('status-206'))
    expect(result.data?.taskLabel).toBeUndefined()
    expect(result.data).not.toHaveProperty('currentTask')
  })

  it('keeps representative mock fixtures sanitized with synthetic contact values only', () => {
    const serialized = JSON.stringify({
      mockSanodeListResponse,
      mockOrdinaryListResponse,
      mockWorkOrderDetailResponses,
      mockWorkOrderActivityResponses,
    })

    expect(serialized).toContain('09077')
    expect(serialized).toContain('张先生')
    expect(serialized).not.toMatch(/186\d{8}/)
    expect(serialized).not.toMatch(/18600372156|JSESSIONID|token/i)
  })

  it('contains no data-source controls in commercial Home, but keeps the controls in DEV QA', () => {
    const homePage = readFileSync(new URL('../../src/pages/index/index.vue', import.meta.url), 'utf8')
    const homeTemplate = homePage.slice(
      homePage.indexOf('<view v-else-if="showHome"'),
      homePage.indexOf('<view v-else class="login-page">'),
    )
    expect(homeTemplate).not.toContain('mockControlVisible')
    expect(homeTemplate).not.toContain('Mock 数据')
    expect(homeTemplate).not.toContain('businessDataSourceLabel')
    expect(homePage).not.toContain('handleHomeBrandTap')
    const qaPage = readFileSync(new URL('../../src/pages/dev/qa-console.vue', import.meta.url), 'utf8')
    expect(qaPage).toContain('isBusinessMockDeveloperModeAvailable')
    expect(qaPage).toContain('{{ businessDataSourceLabel }}')
    expect(qaPage).toContain('dev-review-tools')
  })
})
