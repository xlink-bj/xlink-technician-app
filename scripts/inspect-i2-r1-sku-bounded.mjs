import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer, loadEnv } from 'vite'

import { isAllowedOrderExtFieldTarget } from './lib/g4f-order-extfield-shape.mjs'
import {
  buildI2ReadPlan, buildI2CodeRequest, inspectI2Fields, reduceI2SkuEvidence,
} from './lib/i2-r1-sku-evidence.mjs'

const NETWORK_AUTHORIZATION_FLAG = '--authorize-bounded-prod-read'
const PREFLIGHT_FLAG = '--preflight-only'
const MAX_RESPONSE_BYTES = 1_000_000
const REQUEST_TIMEOUT_MS = 20_000
const rawArgs = process.argv.slice(2)
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs

function output(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
  process.exitCode = exitCode
}

async function readBoundedJson(response) {
  if (!response.body) return { ok: false, reason: 'EMPTY_RESPONSE_BODY' }
  const reader = response.body.getReader()
  const chunks = []
  let byteCount = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteCount += value.byteLength
      if (byteCount > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        return { ok: false, reason: 'RESPONSE_TOO_LARGE' }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(byteCount)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) }
  } catch {
    return { ok: false, reason: 'INVALID_JSON' }
  }
}

function profileDirectory() {
  return resolve(process.env.XLINK_SCHEMA_PROD_PROFILE_DIR || resolve(process.cwd(), '../xlink-technician-app'))
}

async function createLocalRuntime() {
  const root = process.cwd()
  const envDir = profileDirectory()
  const vite = await createServer({
    configFile: false,
    root,
    envDir,
    mode: 'prod',
    resolve: {
      alias: {
        '@': resolve(root, 'src'),
        '@app': resolve(root, 'src/app'),
        '@shared': resolve(root, 'src/shared'),
        '@adapters': resolve(root, 'src/adapters'),
        '@runtimes': resolve(root, 'src/runtimes'),
        '@features': resolve(root, 'src/features'),
      },
    },
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    const [runtimeModule, quickLoginModule, authModule, authBackendModule, storageModule, safetyModule, mockModule] = await Promise.all([
      vite.ssrLoadModule('/src/app/runtime-config.ts'),
      vite.ssrLoadModule('/src/features/session/quick-login.ts'),
      vite.ssrLoadModule('/src/adapters/auth/auth-session-adapter.ts'),
      vite.ssrLoadModule('/src/adapters/auth/uni-auth-backend.ts'),
      vite.ssrLoadModule('/src/adapters/storage/storage-adapter.ts'),
      vite.ssrLoadModule('/src/shared/config/production-read-only.ts'),
      vite.ssrLoadModule('/src/adapters/api/mock/config.ts'),
    ])

    const env = loadEnv('prod', envDir, 'VITE_')
    const runtime = runtimeModule.loadApplicationRuntimeConfig()
    const quickLogin = quickLoginModule.resolveQuickLoginInput()
    const profileFilePresent = existsSync(resolve(envDir, '.env.prod.local'))
    const productionTargetAllowed = runtime.ok
      && safetyModule.isProductionReadOnlyTarget('prod', runtime.value.environment.apiBaseUrl)
      && isAllowedOrderExtFieldTarget(runtime.value.environment.apiBaseUrl)
    const preflight = {
      profileFilePresent,
      productionEnvironment: env.VITE_XLINK_ENVIRONMENT === 'prod',
      productionTargetAllowed,
      quickLoginConfigured: Boolean(quickLogin),
      authTenantConfigured: Boolean(runtime.ok && runtime.value.authWireConfig.tenant),
      authMethodConfigured: Boolean(runtime.ok && runtime.value.authWireConfig.phoneLoginMethod),
      mockOff: mockModule.isBusinessMockMode() === 'off' && env.VITE_XLINK_MOCK === 'false',
      realWritesDisabled: env.VITE_XLINK_ENABLE_REAL_WRITES === 'false',
      skuIdentityConfigured: buildI2ReadPlan(process.env.XLINK_I2_APPROVED_SPU_ID).ok,
      boundedRoutesOnly: true,
      allRecordsFlagOmitted: true,
      persistentLocalStorage: false,
    }

    return {
      vite,
      envDir,
      preflight,
      runtime,
      quickLogin,
      authModule,
      authBackendModule,
      storageModule,
    }
  } catch (error) {
    await vite.close()
    throw error
  }
}

function createSingleLoginRequest(apiBaseUrl, expectedLogin, counters) {
  const base = new URL(apiBaseUrl)

  return (options) => {
    let url
    try {
      url = new URL(String(options.url))
    } catch {
      counters.unexpectedRequests += 1
      options.fail?.(new Error('Unapproved Production request blocked'))
      return { abort() {} }
    }

    const expectedUrl = new URL('index/phoneLogin.do', `${apiBaseUrl.replace(/\/+$/, '')}/`)
    const requestData = options.data
    const data = requestData && typeof requestData === 'object' && !Array.isArray(requestData) ? requestData : {}
    const keys = Object.keys(data).sort()
    const headers = Object.fromEntries(Object.entries(options.header ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]))
    const valid = counters.loginRequests === 0
      && url.origin === base.origin
      && url.href === expectedUrl.href
      && options.method === 'POST'
      && keys.join(',') === 'code,method,phone,tenantId'
      && data.code === expectedLogin.verificationCode
      && data.phone === expectedLogin.phoneNumber
      && typeof data.method === 'string'
      && typeof data.tenantId === 'string'
      && headers['content-type']?.startsWith('application/x-www-form-urlencoded') === true
      && headers.cookie === undefined

    if (!valid) {
      counters.unexpectedRequests += 1
      options.fail?.(new Error('Unapproved Production request blocked'))
      return { abort() {} }
    }

    counters.loginRequests += 1
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const body = new URLSearchParams(Object.entries(data).map(([key, value]) => [key, String(value)]))
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': headers['content-type'] },
      body,
      redirect: 'error',
      signal: controller.signal,
    }).then(async (response) => {
      const parsed = await readBoundedJson(response)
      options.success?.({
        statusCode: response.status,
        data: parsed.ok ? parsed.value : null,
      })
    }).catch(() => {
      options.fail?.(new Error('Production login transport failed'))
    }).finally(() => clearTimeout(timer))

    return { abort: () => controller.abort() }
  }
}


/** At most three uniquely allowlisted read calls after one bounded login.
 * Never log payloads, request parameters, token, codes, prices or response
 * bodies. If any read fails or the page is unbounded, stop without retry.
 */
async function performBoundedReads(baseUrl, sessionRef, spuId, counters) {
  const plan = buildI2ReadPlan(spuId)
  if (!plan.ok || !/^[A-Za-z0-9._~-]{1,512}$/.test(String(sessionRef))) {
    return { ok: false, reason: 'READ_PREFLIGHT_DENIED' }
  }
  const allowed = new Set(['biz/extField/query', 'i/code/selectCode.do', 'basic/material/query'])
  async function one(step) {
    if (counters.queryRequests >= 3 || !allowed.has(step.route)
      || !['fields', 'codes', 'sku'].includes(step.name)
      || !isAllowedOrderExtFieldTarget(baseUrl)) {
      counters.unexpectedRequests++
      return { ok: false, reason: 'UNAPPROVED_ROUTE_OR_QUERY' }
    }
    const base = baseUrl.replace(/\/+$/, '') + '/'
    const endpoint = new URL(step.route, base)
    const expected = new URL(step.route, base)
    if (endpoint.href !== expected.href || endpoint.origin !== new URL(base).origin) {
      counters.unexpectedRequests++
      return { ok: false, reason: 'UNAPPROVED_TARGET' }
    }
    counters.queryRequests++
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Cookie: 'JSESSIONID=' + String(sessionRef),
          Accept: 'application/json',
        },
        body: new URLSearchParams(Object.entries(step.body).map(([key, val]) => [key, String(val)])),
      })
      if (!response.ok) return { ok: false, reason: 'HTTP_NON_2XX' }
      const parsed = await readBoundedJson(response)
      return parsed.ok ? { ok: true, data: parsed.value }
        : { ok: false, reason: parsed.reason }
    } catch {
      return { ok: false, reason: 'UNKNOWN_OUTCOME_NO_RETRY' }
    } finally {
      clearTimeout(timer)
    }
  }
  const fields = await one(plan.steps[0])
  if (!fields.ok) return fields
  const fieldShape = inspectI2Fields(fields.data)
  if (!fieldShape.ok) return { ok: false, reason: fieldShape.reason }
  if (!fieldShape.fields.length || fieldShape.incomplete) {
    return { ok: false, reason: 'MATERIAL_FIELDS_EMPTY_OR_PARTIAL' }
  }
  const codeRequest = buildI2CodeRequest(fieldShape.fields)
  if (!codeRequest.ok) return { ok: false, reason: codeRequest.reason }
  const codes = await one(codeRequest.step)
  if (!codes.ok) return codes
  const sku = await one(plan.steps[1])
  if (!sku.ok) return sku
  return { ok: true, evidence: reduceI2SkuEvidence({
    spuId, fieldsRaw: fields.data, codesRaw: codes.data, skuRaw: sku.data,
  }) }
}

const invalidArgs = args.some(a => ![NETWORK_AUTHORIZATION_FLAG, PREFLIGHT_FLAG].includes(a))
  || args.includes('--')
  || args.filter(a => a === NETWORK_AUTHORIZATION_FLAG).length > 1
  || args.filter(a => a === PREFLIGHT_FLAG).length > 1
  || args.includes(NETWORK_AUTHORIZATION_FLAG) && args.includes(PREFLIGHT_FLAG)
const safeCounts = counters => ({
  login: counters?.loginRequests ?? 0,
  boundedReads: counters?.queryRequests ?? 0,
  unexpected: counters?.unexpectedRequests ?? 0,
  mutations: 0,
})
if (invalidArgs) {
  output({ status: 'BLOCKED_INVALID_ARGUMENTS', requests: safeCounts() }, 2)
} else if (!args.includes(NETWORK_AUTHORIZATION_FLAG) && !args.includes(PREFLIGHT_FLAG)) {
  output({ status: 'NO_NETWORK_DEFAULT', requests: safeCounts(),
    hint: 'Use --preflight-only first. A single authenticated login and up to three readonly requests require the explicit --authorize-bounded-prod-read flag.' })
} else {
  let ctx
  try {
    ctx = await createLocalRuntime()
    const keys = ['profileFilePresent', 'productionEnvironment', 'productionTargetAllowed',
      'quickLoginConfigured', 'authTenantConfigured', 'authMethodConfigured',
      'mockOff', 'realWritesDisabled', 'skuIdentityConfigured',
      'boundedRoutesOnly', 'allRecordsFlagOmitted']
    const valid = keys.every(key => ctx.preflight[key] === true)
    if (args.includes(PREFLIGHT_FLAG)) {
      output({ status: valid ? 'PREFLIGHT_PASS' : 'BLOCKED_ENV',
        preflight: ctx.preflight, requests: safeCounts(), persistentLocalStorage: false }, valid ? 0 : 1)
    } else if (!valid || !ctx.runtime.ok || !ctx.quickLogin) {
      output({ status: 'BLOCKED_PREFLIGHT', preflight: ctx.preflight,
        requests: safeCounts(), persistentLocalStorage: false }, 1)
    } else {
      const counters = { loginRequests: 0, queryRequests: 0, unexpectedRequests: 0 }
      const ephemeral = new Map()
      const storage = ctx.storageModule.createSemanticStorageAdapter({
        get: async key => ephemeral.get(key) ?? null,
        set: async (key, value) => { ephemeral.set(key, value) },
        remove: async key => { ephemeral.delete(key) },
        listKeys: async () => [...ephemeral.keys()],
      })
      const req = createSingleLoginRequest(ctx.runtime.value.environment.apiBaseUrl,
        ctx.quickLogin, counters)
      const backend = ctx.authBackendModule.createUniAuthBackendDriver({
        apiBaseUrl: ctx.runtime.value.environment.apiBaseUrl,
        request: req, timeoutMs: REQUEST_TIMEOUT_MS,
      })
      const auth = ctx.authModule.createAuthSessionAdapter(backend, storage,
        ctx.runtime.value.authWireConfig)
      const login = await auth.startSession(ctx.quickLogin)
      if (login.state !== 'succeeded' || !login.data || counters.loginRequests !== 1) {
        output({ status: 'LOGIN_FAILED_NO_READ', requests: safeCounts(counters),
          errorCategory: login.error?.category ?? 'UNKNOWN' }, 1)
      } else {
        const current = auth.getCurrentSession()
        const good = current?.sessionRef === login.data.sessionRef
          && String(current?.user?.id) === String(login.data.user.id)
          && Boolean(current?.currentRole?.id)
          && String(current?.currentRole?.id) === String(login.data.currentRole?.id)
          && counters.unexpectedRequests === 0
        if (!good) {
          output({ status: 'SESSION_SCOPE_BLOCKED', requests: safeCounts(counters) }, 1)
        } else {
          const result = await performBoundedReads(ctx.runtime.value.environment.apiBaseUrl,
            login.data.sessionRef, process.env.XLINK_I2_APPROVED_SPU_ID, counters)
          // Immutable input session + no role switching in the bounded process.
          const same = auth.getCurrentSession()
          const scopeCurrent = same?.sessionRef === login.data.sessionRef
            && String(same?.currentRole?.id) === String(login.data.currentRole?.id)
          if (!result.ok || !scopeCurrent || counters.unexpectedRequests > 0) {
            output({ status: 'R1_READ_NOT_PROVEN', reason: !scopeCurrent ? 'ROLE_CHANGED'
              : result.reason ?? 'UNAPPROVED_REQUEST',
              requests: safeCounts(counters), persistentLocalStorage: false }, 1)
          } else {
            output({ status: result.evidence.status, shape: result.evidence,
              requests: safeCounts(counters), persistentLocalStorage: false,
              r1UiRuntimeGate: 'NOT_CLOSED_BY_SCHEMA_READ' },
              result.evidence.status === 'RAW_R1_SHAPE_MATCHABLE_NOT_UI_PARITY' ? 0 : 1)
          }
        }
      }
    }
  } catch {
    output({ status: 'BLOCKED_LOCAL_RUNTIME_OR_PREFLIGHT',
      requests: safeCounts(), persistentLocalStorage: false }, 1)
  } finally {
    if (ctx?.vite) await ctx.vite.close()
  }
}
