import { afterEach, describe, expect, it, vi } from 'vitest'

import { createUniApiCommandTransport, type UniApiCommandRequestExecutor } from '@adapters/api/uni-api-command-transport'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
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

  it('blocks production phone login before dispatch because the backend persists account permission context', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn()
    const auth = createUniAuthBackendDriver({ apiBaseUrl: 'https://production.invalid', request })

    await expect(auth.login({
      path: 'index/phoneLogin.do',
      body: { method: '1', phone: 'synthetic-phone', code: 'synthetic-code', tenant: 'synthetic-tenant' },
    })).rejects.toThrow(/Production login is disabled/)
    expect(request).not.toHaveBeenCalled()
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
