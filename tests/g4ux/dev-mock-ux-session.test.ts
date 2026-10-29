import { describe, expect, it, vi } from 'vitest'
import { loadApplicationRuntimeConfig } from '@app/runtime-config'
import { createDevMockUxSessionPort } from '@adapters/auth/dev-mock-ux-session'
import { createDefaultAuthSessionPort } from '@app/composition'

const safe = {
  DEV: true,
  VITE_XLINK_H5_MOCK_E2E: 'true',
  VITE_XLINK_ENVIRONMENT: 'dev',
  VITE_XLINK_PLATFORM: 'mp-weixin',
  VITE_XLINK_API_BASE_URL: 'https://example.invalid',
  VITE_XLINK_AUTH_TENANT: 'qa-fixture-tenant',
  VITE_XLINK_AUTH_METHOD: 'phone',
  VITE_XLINK_MOCK: 'true',
  VITE_XLINK_ENABLE_REAL_WRITES: 'false',
} as const

describe('real main App / no-login Mock UX QA isolation', () => {
  it('enables the fixture only for exact local DEV/inert business/no-production-auth combination', () => {
    const yes = loadApplicationRuntimeConfig(safe)
    expect(yes.ok).toBe(true)
    if (!yes.ok) return
    expect(yes.value.devMockUxSession).toBe(true)
    expect(yes.value.authOnlyMockBusiness).toBe(true)
    expect(yes.value.authApiBaseUrl).toBe('https://example.invalid')

    for (const invalid of [
      { ...safe, DEV: false },
      { ...safe, VITE_XLINK_ENVIRONMENT: 'test' },
      { ...safe, VITE_XLINK_ENVIRONMENT: 'prod' },
      { ...safe, VITE_XLINK_API_BASE_URL: 'https://xlink.fsgo365.cn' },
      { ...safe, VITE_XLINK_API_BASE_URL: 'https://beta.example.invalid' },
      { ...safe, VITE_XLINK_AUTH_API_BASE_URL: 'https://xlink.fsgo365.cn' },
      { ...safe, VITE_XLINK_MOCK: 'false' },
      { ...safe, VITE_XLINK_ENABLE_REAL_WRITES: 'true' },
    ]) {
      expect(loadApplicationRuntimeConfig(invalid).ok).toBe(false)
    }

    const normal = loadApplicationRuntimeConfig({ ...safe, VITE_XLINK_H5_MOCK_E2E: undefined })
    expect(normal.ok).toBe(true)
    if (!normal.ok) return
    expect(normal.value.devMockUxSession).toBe(false)
    expect(normal.value.authOnlyMockBusiness).toBe(false)
  })

  it('restores a synthetic role in the normal Session port without network/login/storage', async () => {
    const session = createDevMockUxSessionPort()
    expect(session.getCurrentSession()?.sessionRef).toBe('local-mock-only-session')
    const restored = await session.restoreSession()
    expect(restored.state).toBe('succeeded')
    expect(restored.data?.user.id).toBe('synthetic-user')
    expect(restored.data?.user.displayName).toBe('王师傅')
    expect(restored.data?.currentRole?.id).toBe('synthetic-role')
    expect(restored.data?.currentRole?.name).toBe('现场服务工程师')
    expect((await session.startSession({ phoneNumber: 'fake', verificationCode: 'fake' })).state)
      .toBe('failed_terminal')
    expect((await session.endSession()).state).toBe('succeeded')
    expect(session.getCurrentSession()).toBeNull()
  })

  it('in the DEV-only switch selects the real composition port with no login executor', async () => {
    vi.stubEnv('DEV', true)
    for (const [key, value] of Object.entries(safe)) {
      if (key !== 'DEV') vi.stubEnv(key, String(value))
    }
    const port = createDefaultAuthSessionPort()
    const result = await port.restoreSession()
    expect(result.state).toBe('succeeded')
    expect(result.data?.currentRole?.id).toBe('synthetic-role')
    vi.unstubAllEnvs()
  })
})
