import { describe, expect, it, vi } from 'vitest'

import {
  assertAllowedBetaReadPath,
  assertBetaApiBaseUrl,
  betaDefaults,
  betaLocalDefaults,
  createBetaReadClient,
  loginBeta,
  normalizeBetaLoginMethod,
} from '../../scripts/beta-api-client.mjs'
import { runBetaInspectionContractCli } from '../../scripts/inspect-inspection-contract-beta.mjs'
import { assertSurveyFieldRows } from '../../scripts/capture-survey-contract-beta.mjs'

describe('G4-E local Beta API development client', () => {
  it('requires raw ExtField rows to prove Survey identity before capture', () => {
    expect(assertSurveyFieldRows([{ colName: 'survey', name: 'field' }])).toHaveLength(1)
    expect(() => assertSurveyFieldRows([{ colName: 'other', name: 'field' }])).toThrow(/colName=survey/)
    expect(() => assertSurveyFieldRows([{ name: 'field' }])).toThrow(/colName=survey/)
    expect(() => assertSurveyFieldRows([
      { colName: 'survey', name: 'first' },
      { colName: 'appointment', name: 'second' },
    ])).toThrow(/colName=survey/)
  })

  it('requires every captured ExtField row to prove the same Survey identity', () => {
    expect(() => assertSurveyFieldRows([
      { colName: 'survey', name: 'first' },
      { colName: 'custom-form', name: 'second' },
    ])).toThrow(/colName=survey/)
  })

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

  it('allows every current discovery route and rejects mutations before network access', async () => {
    const allowedRoutes = [
      'basic/serviceAppointment/querySAWorkflowNode',
      'basic/serviceAppointment/queryById/safe-work-order',
      'workflow/queryNode/safe-workflow-run',
      'workflowDef/queryById/safe-workflow-definition',
      'basic/order/clearOrderFieldQuery',
      'basic/order/queryById',
      'biz/extField/query',
      'biz/extForm/query/safe-form',
      'i/code/selectCode.do',
      'i/code/selectMultistageCode.do',
      'biz/projPackage/queryWithRank',
      'biz/projPackage/findById/safe-package',
      'biz/procedure/queryWithRank',
      'basic/material/queryWithRank',
      'basic/material/query',
      'biz/measure/queryWithRank',
      'biz/extForm/queryByColName/inspectionSOP',
    ]
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
    const client = createBetaReadClient({
      apiBaseUrl: 'https://xlinkbeta.fsgo365.cn/fsgo/wm',
      sessionRef: 'beta-session',
      timeoutMs: 1_000,
      fetchImpl,
    })

    for (const path of allowedRoutes) {
      expect(assertAllowedBetaReadPath(path)).toBe(path)
      await expect(client.read(path)).resolves.toEqual({ data: [] })
    }
    await expect(client.read('workflow/process')).rejects.toMatchObject({ code: 'route_not_allowed' })
    await expect(client.read('basic/order/upsert')).rejects.toMatchObject({ code: 'route_not_allowed' })
    await expect(client.read('basic/order/creatQuotation')).rejects.toMatchObject({ code: 'route_not_allowed' })
    await expect(client.read('basic/order/sendMessage')).rejects.toMatchObject({ code: 'route_not_allowed' })
    await expect(client.read('i/bjd/quotation.do')).rejects.toMatchObject({ code: 'route_not_allowed' })
    await expect(client.read('biz/extForm/upsert/safe-form')).rejects.toMatchObject({ code: 'route_not_allowed' })
    await expect(client.read('biz/extForm/remove/safe-form')).rejects.toMatchObject({ code: 'route_not_allowed' })
    await expect(client.read('upload/token')).rejects.toMatchObject({ code: 'route_not_allowed' })
    await expect(client.read('unknown/read')).rejects.toMatchObject({ code: 'route_not_allowed' })
    await expect(client.read('basic/serviceAppointment/queryById/../workflow/process')).rejects.toMatchObject({ code: 'route_not_allowed' })
    expect(fetchImpl).toHaveBeenCalledTimes(allowedRoutes.length)
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

  it('does not accept phone, password or verification code through CLI arguments', async () => {
    for (const argument of ['phone', 'password', 'code']) {
      await expect(runBetaInspectionContractCli([`--${argument}`, 'sensitive-cli-value']))
        .rejects.toMatchObject({ code: 'credential_cli_forbidden' })
    }
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
