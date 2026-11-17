import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadApplicationRuntimeConfig } from '@app/runtime-config'
import { createUniAuthBackendDriver } from '@adapters/auth/uni-auth-backend'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock'
import { asOpaqueId } from '@shared/types'

const prodLoginHost = 'https://xlink.fsgo365.cn'
const businessApi = 'https://example.invalid'

const validConfig = {
  DEV: true,
  VITE_XLINK_ENVIRONMENT: 'dev',
  VITE_XLINK_PLATFORM: 'mp-weixin',
  VITE_XLINK_API_BASE_URL: businessApi,
  VITE_XLINK_AUTH_API_BASE_URL: prodLoginHost,
  VITE_XLINK_AUTH_TENANT: 'synthetic-tenant',
  VITE_XLINK_AUTH_METHOD: 'phone',
} as const

describe('G4-F Production authentication + isolated DEV business Mock', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
    vi.stubEnv('VITE_XLINK_MOCK', 'true')
    vi.stubGlobal('uni', {
      getStorageSync: vi.fn(() => undefined),
      setStorageSync: vi.fn(),
    })
    resetBusinessMockCache()
    setBusinessMockMode('data')
  })

  it('separates the Production login address from business APIs only in local DEV', () => {
    const config = loadApplicationRuntimeConfig(validConfig)
    expect(config.ok).toBe(true)
    if (!config.ok) return
    expect(config.value.authApiBaseUrl).toBe(prodLoginHost)
    expect(config.value.environment.apiBaseUrl).toBe(businessApi)
    expect(config.value.authOnlyMockBusiness).toBe(true)

    for (const unsafe of [
      { ...validConfig, DEV: false },
      { ...validConfig, VITE_XLINK_ENVIRONMENT: 'prod' },
      { ...validConfig, VITE_XLINK_AUTH_API_BASE_URL: 'http://xlink.fsgo365.cn' },
      { ...validConfig, VITE_XLINK_AUTH_API_BASE_URL: 'https://example.invalid' },
    ]) {
      expect(loadApplicationRuntimeConfig(unsafe).ok).toBe(false)
    }
    const normal = loadApplicationRuntimeConfig({
      ...validConfig, VITE_XLINK_AUTH_API_BASE_URL: undefined,
    })
    expect(normal.ok).toBe(true)
    if (!normal.ok) return
    expect(normal.value.authOnlyMockBusiness).toBe(false)
    expect(normal.value.authApiBaseUrl).toBe(businessApi)
  })

  it('sends only source-verified phone login to the separate Production host', async () => {
    const request = vi.fn((options: UniNamespace.RequestOptions) => {
      options.success?.({
        statusCode: 200,
        data: { success: true },
        header: {},
        cookies: [],
      })
    })
    const driver = createUniAuthBackendDriver({ apiBaseUrl: prodLoginHost, request })
    await expect(driver.login({
      path: 'index/phoneLogin.do',
      body: { method: 'phone', phone: '00000000000', code: '999999', tenant: 'synthetic-tenant' },
    })).resolves.toEqual({ success: true })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]?.[0]?.url).toBe(prodLoginHost + '/index/phoneLogin.do')
  })

  it('allows Mock business reads but blocks all unmatched real business reads and Mock OFF fallback', async () => {
    const request = vi.fn()
    const transport = createUniApiReadTransport({
      apiBaseUrl: businessApi,
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'),
      mockLatencyMs: 0,
      blockRealRequests: true,
      request,
    })
    const result = await transport.execute({
      method: 'POST', path: 'basic/serviceAppointment/querySAWorkflowNode',
      body: { page: 1, rows: 20 },
    })
    expect(result).toHaveProperty('data')
    await expect(transport.execute({
      method: 'POST', path: 'basic/unsupported-business-read',
      body: { page: 1, rows: 20 },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    setBusinessMockMode('off')
    await expect(transport.execute({
      method: 'POST', path: 'basic/serviceAppointment/querySAWorkflowNode',
      body: { page: 1, rows: 20 },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it('never forwards an unmatched business command or media upload, even with writes enabled', async () => {
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    const request = vi.fn()
    const transport = createUniApiCommandTransport({
      apiBaseUrl: businessApi,
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'),
      blockRealRequests: true,
      request,
    })
    for (const path of ['basic/order/upsert', 'workflow/process', 'biz/media/upload']) {
      await expect(transport.execute({
        method: 'POST', path,
        body: { order: '{"serviceAppointmentId":"not-a-mock"}' },
      })).rejects.toMatchObject({ category: 'unsupported_capability' })
    }
    setBusinessMockMode('off')
    await expect(transport.execute({
      method: 'POST', path: 'basic/order/upsert',
      body: { order: '{"serviceAppointmentId":"not-a-mock"}' },
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })
})
