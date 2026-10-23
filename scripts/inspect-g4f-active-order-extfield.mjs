import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer, loadEnv } from 'vite'

import {
  buildOrderExtFieldRequestBody,
  isAllowedOrderExtFieldTarget,
  ORDER_EXTFIELD_ROUTE,
  sanitizeOrderExtFieldPage,
} from './lib/g4f-order-extfield-shape.mjs'

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
      requestRouteFixed: ORDER_EXTFIELD_ROUTE === 'biz/extField/query',
      pageLimit: 50,
      allRecordsFlagOmitted: !Object.hasOwn(buildOrderExtFieldRequestBody(), '_all'),
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

async function performSingleSchemaRead(apiBaseUrl, sessionRef, counters) {
  const endpoint = new URL(ORDER_EXTFIELD_ROUTE, `${apiBaseUrl.replace(/\/+$/, '')}/`)
  const expectedEndpoint = new URL('biz/extField/query', `${apiBaseUrl.replace(/\/+$/, '')}/`)
  const bodyRecord = buildOrderExtFieldRequestBody()
  const body = new URLSearchParams(bodyRecord)
  const valid = counters.loginRequests === 1
    && counters.schemaRequests === 0
    && endpoint.href === expectedEndpoint.href
    && isAllowedOrderExtFieldTarget(apiBaseUrl)
    && /^[A-Za-z0-9._~-]{1,512}$/.test(String(sessionRef))
    && Object.keys(bodyRecord).length === 8
    && !Object.hasOwn(bodyRecord, '_all')

  if (!valid) return { ok: false, category: 'SCHEMA_READ_PRECONDITION_FAILED' }

  counters.schemaRequests += 1
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: `JSESSIONID=${sessionRef}`,
        Accept: 'application/json',
      },
      body,
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, category: `HTTP_${response.status}` }
    const parsed = await readBoundedJson(response)
    if (!parsed.ok) return { ok: false, category: parsed.reason }
    const summary = sanitizeOrderExtFieldPage(parsed.value)
    if (!summary.ok) return { ok: false, category: summary.reason }
    return { ok: true, summary }
  } catch {
    return { ok: false, category: 'OUTCOME_UNKNOWN_NO_RETRY' }
  } finally {
    clearTimeout(timer)
  }
}

const hasInvalidArgs = args.some((arg) => ![NETWORK_AUTHORIZATION_FLAG, PREFLIGHT_FLAG].includes(arg))
  || args.includes('--')
  || args.filter((arg) => arg === NETWORK_AUTHORIZATION_FLAG).length > 1
  || args.filter((arg) => arg === PREFLIGHT_FLAG).length > 1
  || args.includes(NETWORK_AUTHORIZATION_FLAG) && args.includes(PREFLIGHT_FLAG)

if (hasInvalidArgs) {
  output({ status: 'BLOCKED_INVALID_ARGUMENTS', requests: { login: 0, schemaRead: 0, unexpected: 0 } }, 2)
} else if (!args.includes(PREFLIGHT_FLAG) && !args.includes(NETWORK_AUTHORIZATION_FLAG)) {
  output({
    status: 'NO_NETWORK_DEFAULT',
    requests: { login: 0, schemaRead: 0, unexpected: 0 },
    hint: 'Use --preflight-only for zero-network checks; explicit authorization is required for one Production login and one bounded schema read.',
  })
} else {
  let context
  try {
    context = await createLocalRuntime()
    const passed = [
      'profileFilePresent',
      'productionEnvironment',
      'productionTargetAllowed',
      'quickLoginConfigured',
      'authTenantConfigured',
      'authMethodConfigured',
      'mockOff',
      'realWritesDisabled',
      'requestRouteFixed',
      'allRecordsFlagOmitted',
    ].every((key) => context.preflight[key] === true)
    if (args.includes(PREFLIGHT_FLAG)) {
      output({
        status: passed ? 'PREFLIGHT_PASS' : 'BLOCKED_ENV',
        preflight: context.preflight,
        requests: { login: 0, schemaRead: 0, unexpected: 0 },
      }, passed ? 0 : 1)
    } else if (!passed || !context.runtime.ok || !context.quickLogin) {
      output({
        status: 'BLOCKED_PREFLIGHT',
        preflight: context.preflight,
        requests: { login: 0, schemaRead: 0, unexpected: 0 },
        businessMutations: 0,
      }, 1)
    } else {
      const counters = { loginRequests: 0, schemaRequests: 0, unexpectedRequests: 0 }
      const memory = new Map()
      const storage = context.storageModule.createSemanticStorageAdapter({
        get: async (key) => memory.get(key) ?? null,
        set: async (key, value) => { memory.set(key, value) },
        remove: async (key) => { memory.delete(key) },
        listKeys: async () => [...memory.keys()],
      })
      const request = createSingleLoginRequest(
        context.runtime.value.environment.apiBaseUrl,
        context.quickLogin,
        counters,
      )
      const backend = context.authBackendModule.createUniAuthBackendDriver({
        apiBaseUrl: context.runtime.value.environment.apiBaseUrl,
        request,
        timeoutMs: REQUEST_TIMEOUT_MS,
      })
      const auth = context.authModule.createAuthSessionAdapter(
        backend,
        storage,
        context.runtime.value.authWireConfig,
      )

      const login = await auth.startSession(context.quickLogin)
      if (login.state !== 'succeeded' || !login.data) {
        output({
          status: login.state === 'failed_retryable' ? 'LOGIN_OUTCOME_UNKNOWN_NO_RETRY' : 'LOGIN_FAILED_NO_QUERY',
          login: login.state === 'succeeded' ? 'SUCCEEDED' : 'FAILED',
          loginFailureCategory: login.error?.category ?? 'UNKNOWN',
          requests: { login: counters.loginRequests, schemaRead: 0, unexpected: counters.unexpectedRequests },
          businessMutations: 0,
          persistentLocalStorage: false,
        }, 1)
      } else {
        const session = login.data
        const currentSession = auth.getCurrentSession()
        const sessionVerified = currentSession?.sessionRef === session.sessionRef
          && currentSession.user.id === session.user.id
          && /^[A-Za-z0-9._~-]{1,512}$/.test(String(session.sessionRef))
          && Boolean(session.currentRole?.id)

        if (!sessionVerified || counters.loginRequests !== 1 || counters.unexpectedRequests !== 0) {
          output({
            status: 'SESSION_OR_REQUEST_GUARD_FAILED_NO_QUERY',
            login: 'SUCCEEDED',
            sessionVerified,
            currentRolePresent: Boolean(session.currentRole?.id),
            requests: { login: counters.loginRequests, schemaRead: 0, unexpected: counters.unexpectedRequests },
            businessMutations: 0,
            persistentLocalStorage: false,
          }, 1)
        } else {
          const result = await performSingleSchemaRead(
            context.runtime.value.environment.apiBaseUrl,
            session.sessionRef,
            counters,
          )
          if (!result.ok) {
            output({
              status: result.category === 'OUTCOME_UNKNOWN_NO_RETRY' ? result.category : 'SCHEMA_READ_FAILED',
              login: 'SUCCEEDED',
              sessionVerified: true,
              currentRolePresent: true,
              requests: { login: counters.loginRequests, schemaRead: counters.schemaRequests, unexpected: counters.unexpectedRequests },
              category: result.category,
              businessMutations: 0,
              persistentLocalStorage: false,
            }, 1)
          } else {
            output({
              status: result.summary.truncated ? 'SHAPE_READ_TRUNCATED_ONE_PAGE' : 'SHAPE_READ_COMPLETE',
              login: 'SUCCEEDED',
              sessionVerified: true,
              currentRolePresent: true,
              roleSwitch: 'NOT_CALLED',
              requests: { login: counters.loginRequests, schemaRead: counters.schemaRequests, unexpected: counters.unexpectedRequests },
              businessMutations: 0,
              persistentLocalStorage: false,
              schema: result.summary,
            })
          }
        }
      }
    }
  } catch {
    output({
      status: 'BLOCKED_PREFLIGHT_OR_LOCAL_RUNTIME',
      requests: { login: 0, schemaRead: 0, unexpected: 0 },
      businessMutations: 0,
    }, 1)
  } finally {
    if (context?.vite) await context.vite.close()
  }
}
