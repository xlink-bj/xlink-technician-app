import { afterEach, describe, expect, it, vi } from 'vitest'

import { createUniApiCommandTransport, type UniApiCommandRequestExecutor } from '@adapters/api/uni-api-command-transport'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
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
    const execute = vi.fn(async () => {
      throw new Error('synthetic stop after request capture')
    })
    const api = createTechnicianApiReadAdapter({ execute })

    await api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>('synthetic-work-order'))

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({
      method: 'POST',
      path: 'basic/serviceAppointment/queryById/synthetic-work-order',
      body: {},
    })
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
