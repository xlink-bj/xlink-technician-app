import { describe, expect, it, vi } from 'vitest'

import {
  assertBetaApiBaseUrl,
  betaDefaults,
  betaLocalDefaults,
  createBetaReadClient,
  loginBeta,
  normalizeBetaLoginMethod,
} from '../../scripts/beta-api-client.mjs'

describe('G4-E local Beta API development client', () => {
  it('uses the R1 phoneLogin wire shape and returns the session only in memory', async () => {
    const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      })
      expect(init?.headers).not.toHaveProperty('Cookie')
      expect(new URLSearchParams(String(init?.body))).toEqual(new URLSearchParams({
        method: '1',
        phone: 'test-phone',
        code: '999999',
        tenantId: 'test-tenant',
      }))
      return new Response(JSON.stringify({
        success: true,
        data: { token: 'beta-session-held-in-memory' },
      }), { status: 200 })
    })

    const result = await loginBeta({
      apiBaseUrl: 'https://xlinkbeta.fsgo365.cn/fsgo/wm',
      tenantId: 'test-tenant',
      phone: 'test-phone',
      method: 'code',
      credential: '999999',
      timeoutMs: 1_000,
      fetchImpl,
    })

    expect(result).toEqual({ sessionRef: 'beta-session-held-in-memory' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('supports password mode through the same R1 code field', async () => {
    const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(new URLSearchParams(String(init?.body)).get('method')).toBe('2')
      expect(new URLSearchParams(String(init?.body)).get('code')).toBe('password-only-in-test')
      return new Response(JSON.stringify({ success: '1', data: { token: 'password-session' } }), { status: 200 })
    })

    await expect(loginBeta({
      apiBaseUrl: 'https://xlinkbeta.fsgo365.cn/fsgo/wm',
      tenantId: 'test-tenant',
      phone: 'test-phone',
      method: 'password',
      credential: 'password-only-in-test',
      timeoutMs: 1_000,
      fetchImpl,
    })).resolves.toEqual({ sessionRef: 'password-session' })
  })

  it('carries the in-memory session as JSESSIONID for read-only API calls', async () => {
    const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Cookie: 'JSESSIONID=beta-session' })
      expect(new URLSearchParams(String(init?.body)).get('extId')).toBe('safe-form')
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    })
    const client = createBetaReadClient({
      apiBaseUrl: 'https://xlinkbeta.fsgo365.cn/fsgo/wm',
      sessionRef: 'beta-session',
      timeoutMs: 1_000,
      fetchImpl,
    })

    await expect(client.read('biz/extField/query', { extId: 'safe-form' })).resolves.toEqual({ data: [] })
  })

  it('rejects non-Beta hosts and keeps login method parsing explicit', () => {
    expect(() => assertBetaApiBaseUrl('https://xlink.fsgo365.cn/fsgo/wm')).toThrow(/Beta API host/)
    expect(normalizeBetaLoginMethod('1')).toBe('1')
    expect(normalizeBetaLoginMethod('password')).toBe('2')
    expect(() => normalizeBetaLoginMethod('quick-login')).toThrow(/code or password/)
  })

  it('matches App quick-login configuration and defaults to the R1 test code', () => {
    expect(betaDefaults({
      VITE_XLINK_QUICK_LOGIN_PHONE: '  local-account  ',
      VITE_XLINK_AUTH_TENANT: 'local-tenant',
      VITE_XLINK_AUTH_METHOD: '1',
    })).toMatchObject({
      phone: 'local-account',
      tenantId: 'local-tenant',
      method: '1',
      code: '999999',
    })
  })

  it('uses the App verification-code override while ignoring temporary Beta code injection', () => {
    expect(betaLocalDefaults({
      VITE_XLINK_ENVIRONMENT: 'beta',
      VITE_XLINK_QUICK_LOGIN_PHONE: 'local-account',
      VITE_XLINK_QUICK_LOGIN_CODE: '654321',
      XLINK_BETA_PHONE: 'temporary-phone-injection',
      XLINK_BETA_CODE: 'temporary-code-injection',
    })).toMatchObject({
      phone: 'local-account',
      code: '654321',
    })
  })

  it('requires the App environment to be explicitly non-production', () => {
    expect(() => betaLocalDefaults({
      VITE_XLINK_ENVIRONMENT: 'prod',
      VITE_XLINK_QUICK_LOGIN_PHONE: 'local-account',
    })).toThrow(/non-production/)
    expect(betaLocalDefaults({
      VITE_XLINK_ENVIRONMENT: 'beta',
      VITE_XLINK_QUICK_LOGIN_PHONE: 'local-account',
      VITE_XLINK_AUTH_TENANT: 'local-tenant',
      VITE_XLINK_AUTH_METHOD: '1',
      XLINK_BETA_PHONE: 'temporary-phone-injection',
      XLINK_BETA_CODE: 'temporary-code-injection',
    })).toMatchObject({
      phone: 'local-account',
      tenantId: 'local-tenant',
      method: '1',
      code: '999999',
    })
  })
})
