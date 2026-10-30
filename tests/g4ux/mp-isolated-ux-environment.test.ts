import { describe, expect, it } from 'vitest'
import { isolatedMpUxEnvironment } from '../../tools/review/dev/dev-mp-isolated-ux.mjs'
import { loadApplicationRuntimeConfig } from '@app/runtime-config'

describe('WeChat native commercial QA environment', () => {
  it('pins a DEV-only offline Mock with no real business or auth host, even if the parent shell is unsafe', () => {
    const env = isolatedMpUxEnvironment({
      VITE_XLINK_ENVIRONMENT: 'prod',
      VITE_XLINK_PLATFORM: 'h5',
      VITE_XLINK_API_BASE_URL: 'https://real.example.com',
      VITE_XLINK_AUTH_API_BASE_URL: 'https://auth.example.com',
      VITE_XLINK_MOCK: 'false',
      VITE_XLINK_ENABLE_REAL_WRITES: 'true',
      VITE_XLINK_H5_MOCK_E2E: 'false',
      VITE_XLINK_QUICK_LOGIN_PHONE: 'do-not-use',
      VITE_XLINK_QUICK_LOGIN_CODE: 'do-not-use',
    })
    expect(env).toMatchObject({
      CI: 'true',
      VITE_XLINK_ENVIRONMENT: 'dev',
      VITE_XLINK_PLATFORM: 'mp-weixin',
      VITE_XLINK_API_BASE_URL: 'https://example.invalid',
      VITE_XLINK_AUTH_API_BASE_URL: '',
      VITE_XLINK_MOCK: 'true',
      VITE_XLINK_ENABLE_REAL_WRITES: 'false',
      VITE_XLINK_H5_MOCK_E2E: 'true',
      VITE_XLINK_QUICK_LOGIN_PHONE: '',
      VITE_XLINK_QUICK_LOGIN_CODE: '',
    })
    const runtime = loadApplicationRuntimeConfig({ ...env, DEV: true })
    expect(runtime.ok).toBe(true)
    if (runtime.ok) {
      expect(runtime.value.devMockUxSession).toBe(true)
      expect(runtime.value.authOnlyMockBusiness).toBe(true)
      expect(runtime.value.environment.apiBaseUrl).toBe('https://example.invalid')
    }
  })

  it('leaves unrelated process variables untouched without mutating the caller', () => {
    const parent = { PATH: '/synthetic/bin', VITE_XLINK_ENVIRONMENT: 'prod' }
    const env = isolatedMpUxEnvironment(parent)
    expect(env.PATH).toBe('/synthetic/bin')
    expect(parent.VITE_XLINK_ENVIRONMENT).toBe('prod')
  })
})
