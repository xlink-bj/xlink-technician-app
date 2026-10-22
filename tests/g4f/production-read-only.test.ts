import { afterEach, describe, expect, it, vi } from 'vitest'

import { createUniApiCommandTransport, type UniApiCommandRequestExecutor } from '@adapters/api/uni-api-command-transport'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import {
  createRoleScopedTechnicianApiReadAdapter,
  createTechnicianApiReadAdapter,
} from '@adapters/api/technician-api'
import { createSurveyLeakageCauseProvider } from '@adapters/api/survey-leakage-cause'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock'
import { createUniAuthBackendDriver } from '@adapters/auth/uni-auth-backend'
import { loadApplicationRuntimeConfig } from '@app/runtime-config'
import { createUniUploadPort } from '@adapters/upload/uni-upload-port'
import { asOpaqueId } from '@shared/types'

describe('Production read-only profile', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetBusinessMockCache()
  })

  it('allows the source-verified read-only Leakage Cause API route in Production', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({ statusCode: 200, data: { data: [{ part: 'roof', leakageCause: 'cause-a', label: 'synthetic cause' }] } } as never)
    })
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'production-session' as never,
      request,
    })
    const provider = createSurveyLeakageCauseProvider(transport)

    await expect(provider.query()).resolves.toMatchObject({
      state: 'succeeded',
      data: [{ part: 'roof', id: 'cause-a', label: 'synthetic cause' }],
    })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('allows the source-verified role tree read and bounded Work Order list reads', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({ statusCode: 200, data: { success: true, data: { functionList: [] } } } as never)
    })
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'production-session' as never,
      request,
    })

    await expect(transport.execute({
      method: 'POST',
      path: 'function/queryTreeByRoleId',
      query: { roleId: 'synthetic-role-id' },
    })).resolves.toMatchObject({ success: true })

    for (const path of ['basic/serviceAppointment/query', 'basic/serviceAppointment/querySAWorkflowNode']) {
      await expect(transport.execute({
        method: 'POST',
        path,
        body: {
          page: 1,
          rows: 20,
          sortField: 'updateTime',
          sortOrder: 'desc',
          'is:state|integer#and': 1,
          orderState: 'todo',
          'in:status|array#and': 'active',
          'regex:name|string#or': 'synthetic search',
        },
      })).resolves.toMatchObject({ success: true })
    }

    expect(request).toHaveBeenCalledTimes(3)
  })

  it('allows only bounded type=1 quotation queries scoped to a role-listed Work Order', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({ statusCode: 200, data: { data: [] } } as never)
    })
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'production-session' as never,
      isOrderWorkOrderListedForCurrentSession: id => id === 'synthetic-listed-work-order',
      getOrderReadAuthorizationIdentity: () => 'synthetic-session:user:role:v1',
      request,
    })

    await expect(transport.execute({
      method: 'POST',
      path: 'basic/order/query',
      body: {
        page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
        'is:serviceAppointmentId|string#and': 'synthetic-listed-work-order',
        'is:type|integer#and': 1,
      },
    })).resolves.toMatchObject({ data: [] })
    await expect(transport.execute({
      method: 'POST',
      path: 'basic/order/query',
      body: {
        page: 1, rows: 4, sortField: 'createTime', sortOrder: 'desc',
        'is:serviceAppointmentId|string#and': 'synthetic-listed-work-order',
        'is:type|integer#and': 1,
      },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    await expect(transport.execute({
      method: 'POST',
      path: 'basic/order/query',
      body: {
        page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
        'is:serviceAppointmentId|string#and': 'synthetic-listed-work-order',
      },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    await expect(transport.execute({
      method: 'POST',
      path: 'basic/order/query',
      body: {
        page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
        'is:serviceAppointmentId|string#and': 'arbitrary-work-order',
        'is:type|integer#and': 0,
      },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    // Never allow _all even when rows is 1 or 3: FlipPageInfo expands
    // the backend result limit whenever this flag is present.
    for (const rows of [1, 3]) {
      await expect(transport.execute({
        method: 'POST',
        path: 'basic/order/query',
        body: {
          _all: '1', page: 1, rows, sortField: 'createTime', sortOrder: 'desc',
          'is:serviceAppointmentId|string#and': 'synthetic-listed-work-order',
          'is:type|integer#and': 1,
        },
      })).rejects.toMatchObject({ category: 'unsupported_capability' })
    }
    // Unexpected filters, pagination escape, missing WorkOrder ID and
    // tenant-scope bypass hints still fail before any uni.request.
    const forbiddenExtras: readonly Readonly<Record<string, string>>[] = [
      { notFilterOrgId: '1' },
      { 'is:orgId|string#and': 'unverified-org' },
      { _all: '0' },
    ]
    for (const extra of forbiddenExtras) {
      await expect(transport.execute({
        method: 'POST',
        path: 'basic/order/query',
        body: {
          page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
          'is:serviceAppointmentId|string#and': 'synthetic-listed-work-order',
          'is:type|integer#and': 1,
          ...extra,
        },
      })).rejects.toMatchObject({ category: 'unsupported_capability' })
    }
    await expect(transport.execute({
      method: 'POST',
      path: 'basic/order/query',
      body: {
        page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
        'is:serviceAppointmentId|string#and': '../unlisted',
        'is:type|integer#and': 1,
      },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    await expect(transport.execute({
      method: 'POST',
      path: 'basic/order/queryById',
      body: { id: 'arbitrary-order' },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('blocks Production child Workflow reads without proven detail ownership and rechecks scope after request', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    let identity = 'synthetic-session:user:role:v1'
    let listed = false
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({ statusCode: 200, data: { data: [] } } as never)
    })
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'synthetic-session' as never,
      getChildWorkflowReadAuthorizationIdentity: () => identity,
      isChildWorkflowParentListedForCurrentSession: id => listed && id === 'synthetic-detail-subflows',
      request,
    })
    const childRead = { method: 'POST' as const, path: 'workflow/queryByParentWorkflowNodeId/synthetic-detail-subflows' }

    await expect(transport.execute(childRead)).rejects.toMatchObject({ category: 'authorization_denied' })
    await expect(transport.execute({ ...childRead, path: 'workflow/queryByParentWorkflowNodeId/arbitrary-node' }))
      .rejects.toMatchObject({ category: 'authorization_denied' })
    expect(request).not.toHaveBeenCalled()

    listed = true
    await expect(transport.execute(childRead)).resolves.toMatchObject({ data: [] })
    expect(request).toHaveBeenCalledTimes(1)

    for (const invalid of [
      { ...childRead, body: { type: 'query' } },
      { ...childRead, path: `${childRead.path}/another` },
      { ...childRead, path: `${childRead.path}?roleId=other` },
      { ...childRead, path: `/${childRead.path}` },
      { ...childRead, method: 'GET' as const },
    ]) {
      await expect(transport.execute(invalid)).rejects.toMatchObject({ category: 'unsupported_capability' })
    }
    expect(request).toHaveBeenCalledTimes(1)

    const changeRoleDuringRequest = vi.fn((options: UniNamespace.RequestOptions) => {
      identity = 'synthetic-session:user:other-role:v2'
      options.success?.({ statusCode: 200, data: { data: [{ sensitive: 'must-not-leak' }] } } as never)
    })
    const transportWithRace = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'synthetic-session' as never,
      getChildWorkflowReadAuthorizationIdentity: () => identity,
      isChildWorkflowParentListedForCurrentSession: id => id === 'synthetic-detail-subflows',
      request: changeRoleDuringRequest,
    })
    identity = 'synthetic-session:user:role:v1'
    await expect(transportWithRace.execute(childRead)).rejects.toMatchObject({ category: 'authorization_denied' })
    expect(changeRoleDuringRequest).toHaveBeenCalledTimes(1)
  })

  it('derives child Workflow parent authority only from a role-listed Work Order detail, never a raw ID', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    let authScope = {
      sessionRef: 'synthetic-session', userId: 'synthetic-user',
      roleId: 'synthetic-role', roleVersion: 'v1',
    }
    const execute = vi.fn(async (input: { path: string }) => {
      if (input.path === 'function/queryTreeByRoleId') {
        return { data: { functionList: [{ action: '/pages/serviceAppointment/serviceAppointments', exts: { tabDisplay: '1' } }] } }
      }
      if (input.path === 'basic/serviceAppointment/query') {
        return { data: [{ _id: 'synthetic-listed-work-order' }] }
      }
      if (input.path === 'basic/serviceAppointment/queryById/synthetic-listed-work-order') {
        return { data: {
          _id: 'synthetic-listed-work-order',
          workflow: { _id: 'synthetic-root-run' },
          workflowNode: [
            { _id: 'synthetic-detail-subflows', workflowId: 'synthetic-root-run', nodeDef: { nodeType: 'subflows' } },
            { _id: 'synthetic-ordinary-node', workflowId: 'synthetic-root-run', nodeDef: { nodeType: 'forms' } },
          ],
        } }
      }
      if (input.path === 'workflow/queryByParentWorkflowNodeId/synthetic-detail-subflows') {
        return { data: [{
          _id: 'synthetic-child-run', parentFlowNodeId: 'synthetic-detail-subflows',
          workflowNodeList: [{ _id: 'synthetic-child-node', workflowId: 'synthetic-child-run', nodeDef: { nodeType: 'repeat' } }],
        }] }
      }
      throw new Error('Unexpected synthetic route')
    })
    const api = createRoleScopedTechnicianApiReadAdapter(
      { execute },
      () => asOpaqueId<'RoleId'>(authScope.roleId),
      { getReadAuthorizationScope: () => authScope },
    )
    const parentId = asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-detail-subflows')
    expect(api.isChildWorkflowParentListedForCurrentSession?.(parentId)).toBe(false)
    expect((await api.getChildWorkflowNodes(parentId)).state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
    expect((await api.listWorkOrders({ page: 1, pageSize: 20 })).state).toBe('succeeded')
    expect(api.isChildWorkflowParentListedForCurrentSession?.(parentId)).toBe(false)
    expect((await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('synthetic-listed-work-order'))).state).toBe('succeeded')
    expect(api.isChildWorkflowParentListedForCurrentSession?.(parentId)).toBe(true)
    expect(api.isChildWorkflowParentListedForCurrentSession?.('synthetic-ordinary-node')).toBe(false)
    const childRead = await api.getChildWorkflowNodes(parentId)
    expect(childRead.state).toBe('succeeded')
    expect(childRead.data?.map(node => String(node.id))).toEqual(['synthetic-child-node'])

    authScope = { ...authScope, roleVersion: 'v2' }
    expect(api.isChildWorkflowParentListedForCurrentSession?.(parentId)).toBe(false)
    expect((await api.getChildWorkflowNodes(parentId)).state).toBe('failed_terminal')
    expect(execute).toHaveBeenCalledTimes(4)
  })

  it('allows only bounded Production repeat lists for an already-proven definition/run pair', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    let authorized = true
    let identity = 'synthetic-session:user:role:v1'
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({ statusCode: 200, data: { data: [] } } as never)
    })
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'synthetic-session' as never,
      getRepeatFormReadAuthorizationIdentity: () => identity,
      isRepeatFormContextAuthorizedForCurrentSession: (definition, run) =>
        authorized && definition === 'synthetic-definition' && run === 'synthetic-run',
      request,
    })
    const safe = {
      method: 'POST' as const, path: 'biz/extForm/query/synthetic-definition',
      body: {
        sortField: 'createTime', sortOrder: 'desc',
        'is:workflowId|string#and': 'synthetic-run',
        'ne:state|integer#and': -1, page: 1, rows: 20,
      },
    }
    authorized = false
    await expect(transport.execute(safe)).rejects.toMatchObject({ category: 'authorization_denied' })
    authorized = true
    await expect(transport.execute(safe)).resolves.toMatchObject({ data: [] })
    expect(request).toHaveBeenCalledTimes(1)

    for (const invalid of [
      { ...safe, path: 'biz/extForm/query/arbitrary-definition' },
      { ...safe, body: { ...safe.body, 'is:workflowId|string#and': 'arbitrary-run' } },
    ]) await expect(transport.execute(invalid)).rejects.toMatchObject({ category: 'authorization_denied' })
    for (const invalid of [
      { ...safe, body: { ...safe.body, page: 2 } },
      { ...safe, body: { ...safe.body, rows: 21 } },
      { ...safe, body: { ...safe.body, _all: '1' } },
      { ...safe, body: { ...safe.body, 'is:_id|string#and': 'arbitrary-data' } },
      { ...safe, body: { ...safe.body, notFilterBelongTo: '1' } },
      { ...safe, path: `${safe.path}?extra=1` },
      { ...safe, method: 'GET' as const },
    ]) await expect(transport.execute(invalid)).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).toHaveBeenCalledTimes(1)

    const raceRequest = vi.fn((options: UniNamespace.RequestOptions) => {
      identity = 'synthetic-session:user:other-role:v2'
      options.success?.({ statusCode: 200, data: { data: [{ secret: 'must-not-leak' }] } } as never)
    })
    const race = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'synthetic-session' as never,
      getRepeatFormReadAuthorizationIdentity: () => identity,
      isRepeatFormContextAuthorizedForCurrentSession: () => true,
      request: raceRequest,
    })
    identity = 'synthetic-session:user:role:v1'
    await expect(race.execute(safe)).rejects.toMatchObject({ category: 'authorization_denied' })
    expect(raceRequest).toHaveBeenCalledTimes(1)
  })

  it('authorizes repeat list context only from source-proven detail or child node for the same role', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    let roleVersion = 'v1'
    let repeatRows: ReadonlyArray<Record<string, unknown>> = [
      { _id: 'synthetic-record', formTitle: '合成记录', state: 1 },
    ]
    const execute = vi.fn(async (input: { path: string }) => {
      if (input.path === 'function/queryTreeByRoleId') return {
        data: { functionList: [{ action: '/pages/serviceAppointment/serviceAppointments', exts: { tabDisplay: '1' } }] },
      }
      if (input.path === 'basic/serviceAppointment/query') return { data: [{ _id: 'synthetic-listed' }] }
      if (input.path === 'basic/serviceAppointment/queryById/synthetic-listed') return { data: {
        _id: 'synthetic-listed', workflow: { _id: 'synthetic-main-run' },
        workflowNode: [{ _id: 'synthetic-parent', workflowId: 'synthetic-main-run', nodeDef: { nodeType: 'subflows' } }],
      } }
      if (input.path === 'workflow/queryByParentWorkflowNodeId/synthetic-parent') return { data: [{
        _id: 'synthetic-child-run', parentFlowNodeId: 'synthetic-parent',
        workflowNodeList: [{ _id: 'synthetic-repeat-node', workflowId: 'synthetic-child-run',
          nodeDef: { nodeType: 'repeat', formDefId: 'synthetic-def' } }],
      }] }
      if (input.path === 'biz/extForm/query/synthetic-def') return {
        data: repeatRows, totalCount: repeatRows.length,
      }
      throw new Error('Unexpected route')
    })
    const api = createRoleScopedTechnicianApiReadAdapter(
      { execute }, () => asOpaqueId<'RoleId'>('synthetic-role'),
      { getReadAuthorizationScope: () => ({
        sessionRef: 'synthetic-session', userId: 'synthetic-user', roleId: 'synthetic-role', roleVersion,
      }) },
    )
    const repeat = {
      definitionId: asOpaqueId<'FormDefinitionId'>('synthetic-def'),
      workflowRunId: asOpaqueId<'WorkflowRunId'>('synthetic-child-run'),
      page: 1, pageSize: 20,
    }
    expect((await api.listRepeatFormReferences!(repeat)).state).toBe('failed_terminal')
    await api.listWorkOrders({ page: 1, pageSize: 20 })
    await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('synthetic-listed'))
    expect(api.isRepeatFormContextAuthorizedForCurrentSession?.('synthetic-def', 'synthetic-child-run')).toBe(false)
    expect((await api.listRepeatFormReferences!(repeat)).state).toBe('failed_terminal')
    await api.getChildWorkflowNodes(asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-parent'))
    expect(api.isRepeatFormContextAuthorizedForCurrentSession?.('synthetic-def', 'synthetic-child-run')).toBe(true)
    expect((await api.listRepeatFormReferences!(repeat)).state).toBe('succeeded')
    repeatRows = [{ _id: 'synthetic-record', workflowId: 'other-run', state: 1 }]
    expect((await api.listRepeatFormReferences!(repeat)).state).toBe('failed_terminal')
    repeatRows = [{ _id: 'synthetic-record', formDefId: 'other-def', state: 1 }]
    expect((await api.listRepeatFormReferences!(repeat)).state).toBe('failed_terminal')
    repeatRows = Array.from({ length: 21 }, (_, index) => ({ _id: `synthetic-record-${index}`, state: 1 }))
    expect((await api.listRepeatFormReferences!(repeat)).state).toBe('failed_terminal')
    expect((await api.listRepeatFormReferences!({ ...repeat, page: 2 })).state).toBe('failed_terminal')
    roleVersion = 'v2'
    expect(api.isRepeatFormContextAuthorizedForCurrentSession?.('synthetic-def', 'synthetic-child-run')).toBe(false)
    expect((await api.listRepeatFormReferences!(repeat)).state).toBe('failed_terminal')
  })


  it('passes the actual bounded official-Order adapter request through the Production transport without _all', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    const actualCalls: UniNamespace.RequestOptions[] = []
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      actualCalls.push(options)
      options.success?.({ statusCode: 200, data: { data: [], page: 1, rows: 3 } } as never)
    })
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'synthetic-authorized-session' as never,
      isOrderWorkOrderListedForCurrentSession: id => id === 'synthetic-listed-work-order',
      getOrderReadAuthorizationIdentity: () => 'synthetic-session:user:role:v1',
      request,
    })
    const port = createQuotationOrderReadAdapter(
      transport,
      (id) => id === 'synthetic-listed-work-order',
    )

    const listed = await port.listTypeOneOrdersForWorkOrder('synthetic-listed-work-order')
    expect(listed.state).toBe('succeeded')
    expect(request).toHaveBeenCalledTimes(1)
    const wire = actualCalls[0]!
    expect(new URL(String(wire.url)).pathname).toBe('/basic/order/query')
    expect(wire.method).toBe('POST')
    const body = new URLSearchParams(String(wire.data))
    expect(body.has('_all')).toBe(false)
    expect(body.get('page')).toBe('1')
    expect(body.get('rows')).toBe('3')
    expect(body.get('is:serviceAppointmentId|string#and')).toBe('synthetic-listed-work-order')
    expect(body.get('is:type|integer#and')).toBe('1')
    expect([...body.keys()].sort()).toEqual([
      'is:serviceAppointmentId|string#and', 'is:type|integer#and',
      'page', 'rows', 'sortField', 'sortOrder',
    ].sort())

    const denied = await port.listTypeOneOrdersForWorkOrder('unlisted-work-order')
    expect(denied.state).toBe('failed_terminal')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('uses the read-only role tree route for Production Work Order list scope', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const requests: UniNamespace.RequestOptions[] = []
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      requests.push(options)
      const url = String(options.url)
      const data = url.includes('function/queryTreeByRoleId')
        ? {
            data: {
              functionList: [{
                order: 1,
                exts: { tabDisplay: '1' },
                action: '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=ready',
              }],
            },
          }
        : { data: [], page: 1, rows: 20, total: 0 }
      options.success?.({ statusCode: 200, data } as never)
    })
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'production-session' as never,
      request,
    })
    const api = createRoleScopedTechnicianApiReadAdapter(transport, () => asOpaqueId<'RoleId'>('synthetic-role'))

    await expect(api.listWorkOrders({ page: 1, pageSize: 20 })).resolves.toMatchObject({ state: 'succeeded' })

    expect(requests.map((item) => new URL(String(item.url)).pathname)).toEqual([
      '/function/queryTreeByRoleId',
      '/basic/serviceAppointment/querySAWorkflowNode',
    ])
    expect(String(requests[0]?.url)).toContain('roleId=synthetic-role')
    expect(String(requests[1]?.data)).toContain('orderState=ready')
  })

  it('allows a bounded Work Order detail read only without the legacy permission-bypass flag', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({ statusCode: 200, data: { success: true } } as never)
    })
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'production-session' as never,
      request,
    })

    await expect(transport.execute({
      method: 'POST',
      path: 'basic/serviceAppointment/queryById/synthetic-work-order',
      body: {},
    })).resolves.toMatchObject({ success: true })
    await expect(transport.execute({
      method: 'POST',
      path: 'basic/serviceAppointment/queryById/synthetic-work-order',
      body: { type: 'query' },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('omits the permission-bypass flag from Production detail requests created by the adapter', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const execute = vi.fn(async (request) => {
      if (request.path === 'basic/serviceAppointment/query') {
        return { data: [{ _id: 'synthetic-work-order' }] }
      }
      throw new Error('synthetic stop after request capture')
    })
    const api = createTechnicianApiReadAdapter({ execute }, {
      getReadAuthorizationScope: () => ({
        sessionRef: 'synthetic-session',
        userId: 'synthetic-user',
        roleId: 'synthetic-role',
        roleVersion: 'synthetic-role-version',
      }),
    })

    await api.listWorkOrders({ page: 1, pageSize: 20 })
    await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('synthetic-work-order'))

    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenCalledWith({
      method: 'POST',
      path: 'basic/serviceAppointment/queryById/synthetic-work-order',
      body: {},
    })
  })

  it('scopes quotation Work Order authorization to successful list results in the active session', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    let identity = {
      sessionRef: 'synthetic-session-a',
      userId: 'synthetic-user-a',
      roleId: 'synthetic-role-a',
      roleVersion: 'synthetic-role-version-a',
    }
    const execute = vi.fn(async (request: { path: string }) => request.path === 'function/queryTreeByRoleId'
      ? { data: { functionList: [{ action: '/pages/serviceAppointment/serviceAppointments', exts: { tabDisplay: '1' } }] } }
      : { data: [{ _id: 'listed-work-order-synthetic' }] })
    const api = createRoleScopedTechnicianApiReadAdapter(
      { execute },
      () => asOpaqueId<'RoleId'>(identity.roleId),
      { getReadAuthorizationScope: () => identity },
    )

    expect(api.isWorkOrderListedForCurrentSession?.('listed-work-order-synthetic')).toBe(false)
    const list = await api.listWorkOrders({ page: 1, pageSize: 20 })
    expect(list.state).toBe('succeeded')
    expect(api.isWorkOrderListedForCurrentSession?.('listed-work-order-synthetic')).toBe(true)
    expect(api.isWorkOrderListedForCurrentSession?.('arbitrary-work-order-synthetic')).toBe(false)

    identity = { ...identity, sessionRef: 'synthetic-session-b' }
    expect(api.isWorkOrderListedForCurrentSession?.('listed-work-order-synthetic')).toBe(false)
  })

  it.each([
    ['user', { userId: 'synthetic-user-b' }],
    ['role', { roleId: 'synthetic-role-b' }],
    ['role version', { roleVersion: 'synthetic-role-version-b' }],
  ] as const)('invalidates listed Work Order authorization when the same-session %s changes', async (_label, change) => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    let identity = {
      sessionRef: 'synthetic-session-stable',
      userId: 'synthetic-user-a',
      roleId: 'synthetic-role-a',
      roleVersion: 'synthetic-role-version-a',
    }
    const execute = vi.fn(async (request: { path: string }) => request.path === 'function/queryTreeByRoleId'
      ? { data: { functionList: [{ action: '/pages/serviceAppointment/serviceAppointments', exts: { tabDisplay: '1' } }] } }
      : { data: [{ _id: 'listed-work-order-synthetic' }] })
    const api = createRoleScopedTechnicianApiReadAdapter(
      { execute },
      () => asOpaqueId<'RoleId'>(identity.roleId),
      { getReadAuthorizationScope: () => identity },
    )

    expect((await api.listWorkOrders({ page: 1, pageSize: 20 })).state).toBe('succeeded')
    expect(api.isWorkOrderListedForCurrentSession?.('listed-work-order-synthetic')).toBe(true)
    identity = { ...identity, ...change }
    expect(identity.sessionRef).toBe('synthetic-session-stable')
    expect(api.isWorkOrderListedForCurrentSession?.('listed-work-order-synthetic')).toBe(false)
  })

  it('rejects oversized/unscoped Production Work Order list reads and malformed detail identities', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'production-session' as never,
      request,
    })
    const body = {
      page: 1,
      rows: 1000,
      sortField: 'updateTime',
      sortOrder: 'desc',
      'is:state|integer#and': 1,
      notFilterOrgId: '1',
    }

    await expect(transport.execute({ method: 'POST', path: 'basic/serviceAppointment/querySAWorkflowNode', body }))
      .rejects.toMatchObject({ category: 'unsupported_capability' })
    await expect(transport.execute({
      method: 'POST',
      path: 'basic/serviceAppointment/queryById/../account',
      body: {},
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    'biz/extForm/queryByColName/leakageCause',
    'basic/serviceAppointment/selfExamination',
    'workflow/process',
    'biz/extForm/upsert/definition-id',
    'basic/order/upsert',
    'back/super/file/upToken.do',
    'unknown/command',
  ])('blocks %s in Production even when the legacy real-write flag is enabled', async (path) => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    const request = vi.fn<UniApiCommandRequestExecutor>()
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'production-session' as never,
      request,
    })

    await expect(transport.execute({ method: 'POST', path, body: {} }))
      .rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it('blocks extra tenant/query parameters on the otherwise verified Production read route', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'production-session' as never,
      request,
    })

    await expect(transport.execute({
      method: 'POST',
      path: 'biz/extForm/queryByColName/leakageCause',
      body: { _all: '1', sortField: 'partOrder,leakageCauseOrder', sortOrder: 'asc', tenantId: 'other-tenant' },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it('blocks query parameters smuggled through the Production read path', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'production-session' as never,
      request,
    })

    await expect(transport.execute({
      method: 'POST',
      path: 'biz/extForm/queryByColName/leakageCause?tenantId=other-tenant',
      body: { _all: '1', sortField: 'partOrder,leakageCauseOrder', sortOrder: 'asc' },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    'function/changeRole',
    'function/query',
    'basic/serviceAppointment/query',
    'basic/order/queryById',
  ])('blocks unverified Production API read route %s before dispatch', async (path) => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn()
    const transport = createUniApiReadTransport({
      apiBaseUrl: 'https://production.invalid',
      getSessionRef: () => 'production-session' as never,
      request,
    })

    await expect(transport.execute({
      method: 'POST',
      path,
      body: {},
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it('blocks media token and provider upload in Production regardless of write flag', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    setBusinessMockMode('off')
    const execute = vi.fn(async () => ({ token: 'must-not-be-requested' }))
    const providerUpload = vi.fn()
    const upload = createUniUploadPort({ execute }, providerUpload)

    const result = await upload.upload({
      ref: asOpaqueId<'LocalMediaRef'>('production-read-only-photo'),
      localPath: '/tmp/production-read-only-photo.jpg',
      mimeType: 'image/jpeg',
      source: 'library',
    })

    expect(result).toMatchObject({
      state: 'failed_terminal',
      error: { category: 'unsupported_capability' },
    })
    expect(execute).not.toHaveBeenCalled()
    expect(providerUpload).not.toHaveBeenCalled()
  })

  it('allows the explicitly authorized Production phone login but no business command', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({ statusCode: 200, data: { success: true, data: { token: 'synthetic-session' } } } as never)
    })
    const auth = createUniAuthBackendDriver({ apiBaseUrl: 'https://production.invalid', request })

    await expect(auth.login({
      path: 'index/phoneLogin.do',
      body: { method: '1', phone: 'synthetic-phone', code: 'synthetic-code', tenant: 'synthetic-tenant' },
    })).resolves.toMatchObject({ success: true })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://production.invalid/index/phoneLogin.do',
      method: 'POST',
      data: {
        method: '1',
        phone: 'synthetic-phone',
        code: 'synthetic-code',
        tenantId: 'synthetic-tenant',
      },
    })
  })

  it('treats the canonical Production API host as read-only even when the environment is mislabeled', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    const request = vi.fn<UniApiCommandRequestExecutor>()
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://xlink.fsgo365.cn/fsgo/wm',
      getSessionRef: () => 'production-session' as never,
      request,
    })

    await expect(transport.execute({ method: 'POST', path: 'basic/order/upsert', body: {} }))
      .rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects a Production API host mislabeled as a non-production runtime configuration', () => {
    expect(loadApplicationRuntimeConfig({
      VITE_XLINK_ENVIRONMENT: 'test',
      VITE_XLINK_PLATFORM: 'mp-weixin',
      VITE_XLINK_API_BASE_URL: 'https://xlink.fsgo365.cn/fsgo/wm',
      VITE_XLINK_AUTH_TENANT: 'synthetic-tenant',
      VITE_XLINK_AUTH_METHOD: '1',
    })).toMatchObject({ ok: false })
  })
})
