import { createServer, loadEnv } from 'vite'
import { resolve } from 'node:path'
import {
  isAllowedLoginRequest,
  isAllowedRoleTreeRequest,
  isAllowedTypeOneOrderRequest,
  isAllowedWorkOrderListRequest,
} from './r1-order-contract-read-guard.mjs'
import {
  isAllowedR1MaterialCodeOptionsRequest,
  isAllowedR1MaterialSalesFieldsRequest,
  isAllowedR1SingleSpuMaterialSkuRequest,
  r1MaterialCodeOptionsRequestBody,
  r1MaterialSalesFieldsRequestBody,
  r1MaterialSkuRequestBody,
} from './r1-sku-read-guard.mjs'
import {
  firstOrderMaterialSkuIdentity,
  parseCodeDictionaries,
  parseSalesFieldDefinitions,
  rowsFromEnvelope,
  summarizeSkuRead,
} from './r1-sku-read-evidence.mjs'

const MAX_WORK_ORDER_PAGES = 1000
const counters = {
  login: 0,
  roleTree: 0,
  roleTreeCacheHits: 0,
  workOrderPages: 0,
  typeOneOrderQueries: 0,
  materialSalesFields: 0,
  materialCodeOptions: 0,
  singleSpuSkuList: 0,
  blockedUnexpectedAttempts: 0,
}
const listedWorkOrderIds = new Set()
const typeOneOrderLookupIds = new Set()
let currentPageWorkOrderIds = new Set()
let currentRoleId = null
let selectedWorkOrderId = null
let selectedSkuId = null
let selectedSpuId = null
let expectedCodeValueOptionIds = null
let cachedRoleTree
let hasCachedRoleTree = false
let stage = 'startup'

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)
}

function bodyValue(body, key) {
  if (typeof body === 'string') return new URLSearchParams(body).get(key)
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const value = body[key]
    return value === undefined || value === null ? null : String(value)
  }
  return null
}

function operationSucceeded(value) {
  return value?.state === 'succeeded'
}

function createRequest(apiBaseUrl) {
  const base = new URL(apiBaseUrl)
  const basePath = base.pathname.replace(/\/+$/, '')
  return options => {
    let url
    try { url = new URL(String(options.url)) } catch {
      counters.blockedUnexpectedAttempts += 1
      options.fail?.(new Error('blocked'))
      return { abort() {} }
    }
    const method = String(options.method ?? '')
    if (url.origin !== base.origin || !url.pathname.startsWith(`${basePath}/`) || method !== 'POST') {
      counters.blockedUnexpectedAttempts += 1
      options.fail?.(new Error('blocked'))
      return { abort() {} }
    }
    const path = url.pathname.slice(basePath.length).replace(/^\/+/, '')
    let safeKind = null
    if (path === 'index/phoneLogin.do' && counters.login === 0
      && isAllowedLoginRequest(method, url.searchParams, options.data)) {
      counters.login += 1
      safeKind = 'login'
    } else if (path === 'function/queryTreeByRoleId'
      && isAllowedRoleTreeRequest(method, url.searchParams, options.data, currentRoleId)) {
      if (counters.roleTree === 0) {
        counters.roleTree += 1
        safeKind = 'role_tree'
      } else if (hasCachedRoleTree) {
        counters.roleTreeCacheHits += 1
        options.success?.({ statusCode: 200, data: cachedRoleTree })
        return { abort() {} }
      }
    } else if (isAllowedWorkOrderListRequest(
      path, method, url.searchParams, options.data, counters.workOrderPages + 1,
    )) {
      counters.workOrderPages += 1
      currentPageWorkOrderIds = new Set()
      safeKind = 'role_work_order_page'
    } else if (path === 'basic/order/query' && currentPageWorkOrderIds.has(
      String(bodyValue(options.data, 'is:serviceAppointmentId|string#and') ?? ''),
    )) {
      const workOrderId = bodyValue(options.data, 'is:serviceAppointmentId|string#and')
      if (workOrderId && !typeOneOrderLookupIds.has(workOrderId)
        && isAllowedTypeOneOrderRequest(options.data, workOrderId)) {
        typeOneOrderLookupIds.add(workOrderId)
        counters.typeOneOrderQueries += 1
        safeKind = 'read'
      }
    } else if (isAllowedR1MaterialSalesFieldsRequest({
      path, method, search: url.searchParams, body: options.data, requestCount: counters.materialSalesFields,
    }) && selectedSpuId) {
      counters.materialSalesFields += 1
      safeKind = 'sku_sales_fields'
    } else if (isAllowedR1MaterialCodeOptionsRequest({
      path, method, search: url.searchParams, body: options.data,
      requestCount: counters.materialCodeOptions,
      expectedValueOptionIds: expectedCodeValueOptionIds,
    }) && selectedSpuId && counters.materialSalesFields === 1) {
      counters.materialCodeOptions += 1
      safeKind = 'sku_code_options'
    } else if (isAllowedR1SingleSpuMaterialSkuRequest({
      path, method, search: url.searchParams, body: options.data,
      requestCount: counters.singleSpuSkuList, selectedSpuId,
    }) && selectedSpuId && counters.materialSalesFields === 1
      && (expectedCodeValueOptionIds?.length === 0 || counters.materialCodeOptions === 1)) {
      counters.singleSpuSkuList += 1
      safeKind = 'sku_variants'
    }
    if (!safeKind) {
      counters.blockedUnexpectedAttempts += 1
      options.fail?.(new Error('blocked'))
      return { abort() {} }
    }

    const headers = Object.fromEntries(Object.entries(options.header ?? {}).map(([key, value]) => [key, String(value)]))
    const body = options.data === undefined ? undefined
      : typeof options.data === 'string' ? options.data
        : new URLSearchParams(Object.entries(options.data).map(([key, value]) => [key, String(value)])).toString()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    void fetch(url, { method, headers, ...(body === undefined ? {} : { body }), redirect: 'error', signal: controller.signal })
      .then(async response => {
        const text = await response.text()
        if (Buffer.byteLength(text, 'utf8') > 1_000_000) throw new Error('response_too_large')
        let data
        try { data = JSON.parse(text) } catch { data = text }
        if (safeKind === 'role_tree') {
          cachedRoleTree = data
          hasCachedRoleTree = true
        }
        if (safeKind === 'role_work_order_page') {
          const rows = rowsFromEnvelope(data)
          if (rows) {
            for (const row of rows) {
              const id = typeof row?._id === 'string' ? row._id : typeof row?.id === 'string' ? row.id : undefined
              if (validId(id)) currentPageWorkOrderIds.add(id)
            }
          }
        }
        options.success?.({ statusCode: response.status, data })
      }).catch(() => options.fail?.(new Error('read_failed')))
      .finally(() => clearTimeout(timer))
    return { abort: () => controller.abort() }
  }
}

function requestResponse(request, options) {
  return new Promise((resolvePromise, reject) => {
    try { request({ ...options, success: resolvePromise, fail: reject }) }
    catch { reject(new Error('request_failed')) }
  })
}

async function run() {
  const root = process.cwd()
  const vite = await createServer({
    configFile: false,
    root,
    mode: 'prod',
    envDir: root,
    resolve: { alias: {
      '@': resolve(root, 'src'), '@app': resolve(root, 'src/app'),
      '@shared': resolve(root, 'src/shared'), '@adapters': resolve(root, 'src/adapters'),
      '@runtimes': resolve(root, 'src/runtimes'), '@features': resolve(root, 'src/features'),
    } },
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  try {
    stage = 'preflight'
    const [
      { loadApplicationRuntimeConfig }, { resolveQuickLoginInput },
      { createAuthSessionAdapter }, { createUniAuthBackendDriver },
      { createSemanticStorageAdapter }, { createRoleScopedTechnicianApiReadAdapter },
      { createQuotationOrderReadAdapter }, { isProductionReadOnlyTarget },
      { isBusinessMockMode }, { sessionAuthorizationFingerprint },
    ] = await Promise.all([
      vite.ssrLoadModule('/src/app/runtime-config.ts'),
      vite.ssrLoadModule('/src/features/session/quick-login.ts'),
      vite.ssrLoadModule('/src/adapters/auth/auth-session-adapter.ts'),
      vite.ssrLoadModule('/src/adapters/auth/uni-auth-backend.ts'),
      vite.ssrLoadModule('/src/adapters/storage/storage-adapter.ts'),
      vite.ssrLoadModule('/src/adapters/api/technician-api.ts'),
      vite.ssrLoadModule('/src/adapters/api/quotation-order-api.ts'),
      vite.ssrLoadModule('/src/shared/config/production-read-only.ts'),
      vite.ssrLoadModule('/src/adapters/api/mock/config.ts'),
      vite.ssrLoadModule('/src/shared/session-authorization.ts'),
    ])
    const runtime = loadApplicationRuntimeConfig()
    const quickLogin = resolveQuickLoginInput()
    const local = loadEnv('prod', root, 'VITE_')
    const preflight = {
      runtimeConfig: runtime.ok,
      productionEnvironment: local.VITE_XLINK_ENVIRONMENT === 'prod',
      productionTarget: runtime.ok && isProductionReadOnlyTarget('prod', runtime.value.environment.apiBaseUrl),
      technicianLoginConfigured: Boolean(quickLogin),
      mockOff: isBusinessMockMode() === 'off',
      realWritesDisabled: local.VITE_XLINK_ENABLE_REAL_WRITES === 'false',
    }
    if (Object.values(preflight).some(value => !value)) {
      const preflightOnly = process.argv.includes('--preflight-only')
      console.log(JSON.stringify({
        status: preflightOnly ? 'PREFLIGHT_INCOMPLETE_NO_NETWORK' : 'BLOCKED_PREFLIGHT',
        preflight, networkRequests: 0,
      }))
      if (!preflightOnly) process.exitCode = 1
      return
    }
    if (process.argv.includes('--preflight-only')) {
      console.log(JSON.stringify({ status: 'READY_NO_NETWORK', preflight, networkRequests: 0 }))
      return
    }
    const executeAuthorizedRead = process.argv.includes('--authorize-bounded-prod-read')
    if (!executeAuthorizedRead) {
      console.log(JSON.stringify({
        status: process.argv.includes('--execute') ? 'AUTHORIZATION_FLAG_REQUIRED_NO_NETWORK' : 'READY_NO_NETWORK',
        preflight, networkRequests: 0,
      }))
      return
    }

    const memory = new Map()
    const storage = createSemanticStorageAdapter({
      get: async key => memory.get(key) ?? null,
      set: async (key, value) => { memory.set(key, value) },
      remove: async key => { memory.delete(key) },
      listKeys: async () => [...memory.keys()],
    })
    const request = createRequest(runtime.value.environment.apiBaseUrl)
    const authBackend = createUniAuthBackendDriver({
      apiBaseUrl: runtime.value.environment.apiBaseUrl, request, timeoutMs: 20000,
    })
    const auth = createAuthSessionAdapter(authBackend, storage, runtime.value.authWireConfig)
    stage = 'technician_login'
    const login = await auth.startSession(quickLogin)
    if (!operationSucceeded(login) || !login.data) {
      console.log(JSON.stringify({ status: 'LOGIN_FAILED', login: 'FAILED', requestCounts: { ...counters }, businessMutationRequests: 0 }))
      process.exitCode = 1
      return
    }
    currentRoleId = login.data.currentRole?.id ?? null
    const roleVersion = login.data.roleVersion
    const identityForCurrentSession = () => {
      const current = auth.getCurrentSession()
      return sessionAuthorizationFingerprint(current ? {
        sessionRef: current.sessionRef,
        userId: current.user.id,
        roleId: current.currentRole?.id,
        roleVersion: current.roleVersion,
      } : null)
    }
    const identityAtStart = identityForCurrentSession()
    if (!currentRoleId || !identityAtStart) {
      console.log(JSON.stringify({
        status: 'BLOCKED_INCOMPLETE_TECHNICIAN_IDENTITY', login: 'SUCCEEDED',
        roleAvailable: Boolean(currentRoleId), sessionUserRoleIdentityAvailable: Boolean(identityAtStart),
        roleVersionPresent: Boolean(roleVersion?.trim()), requestCounts: { ...counters }, businessMutationRequests: 0,
      }))
      process.exitCode = 1
      return
    }

    let technicianApi
    const readTransport = {
      execute: async descriptor => {
        if (!descriptor || descriptor.method !== 'POST' || !['biz/extField/query', 'i/code/selectCode.do', 'basic/material/query'].includes(descriptor.path)) {
          throw new Error('blocked')
        }
        const endpoint = `${runtime.value.environment.apiBaseUrl.replace(/\/+$/, '')}/${descriptor.path}`
        const response = await requestResponse(request, {
          url: endpoint,
          method: 'POST',
          data: new URLSearchParams(Object.entries(descriptor.body ?? {}).map(([key, value]) => [key, String(value)])).toString(),
          header: {
            Cookie: `JSESSIONID=${auth.getCurrentSession()?.sessionRef ?? ''}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          dataType: 'json',
          timeout: 20000,
        })
        if (identityForCurrentSession() !== identityAtStart
          || (selectedWorkOrderId && !technicianApi?.isWorkOrderListedForCurrentSession?.(selectedWorkOrderId))
          || response.statusCode < 200 || response.statusCode >= 300) {
          throw new Error('read_not_verified')
        }
        return response.data
      },
    }
    const { createUniApiReadTransport } = await vite.ssrLoadModule('/src/adapters/api/uni-api-read-transport.ts')
    const apiTransport = createUniApiReadTransport({
      apiBaseUrl: runtime.value.environment.apiBaseUrl,
      getSessionRef: () => auth.getCurrentSession()?.sessionRef ?? null,
      request,
      timeoutMs: 20000,
      isOrderWorkOrderListedForCurrentSession: id => technicianApi?.isWorkOrderListedForCurrentSession?.(id) === true,
      getOrderReadAuthorizationIdentity: identityForCurrentSession,
    })
    const createTechnicianApi = () => createRoleScopedTechnicianApiReadAdapter(
      apiTransport,
      () => auth.getCurrentSession()?.currentRole?.id ?? null,
      { getReadAuthorizationScope: () => {
        const current = auth.getCurrentSession()
        return current ? {
          sessionRef: current.sessionRef, userId: current.user.id,
          roleId: current.currentRole?.id ?? null, roleVersion: current.roleVersion ?? null,
        } : null
      } },
    )
    technicianApi = createTechnicianApi()
    const orderApi = createQuotationOrderReadAdapter(
      apiTransport,
      id => listedWorkOrderIds.has(id) && technicianApi.isWorkOrderListedForCurrentSession?.(id) === true,
      identityForCurrentSession,
    )

    let seenWorkOrderIds = new Set()
    let selectedIdentity
    let reachedEnd = false
    for (let page = 1; page <= MAX_WORK_ORDER_PAGES; page += 1) {
      stage = `role_visible_work_order_page_${page}`
      currentPageWorkOrderIds = new Set()
      const currentApi = createTechnicianApi()
      technicianApi = currentApi
      const workOrders = await technicianApi.listWorkOrders({ page, pageSize: 3 })
      if (counters.blockedUnexpectedAttempts || identityForCurrentSession() !== identityAtStart
        || !operationSucceeded(workOrders) || !workOrders.data) {
        stage = 'work_order_list_not_verified'
        break
      }
      const items = workOrders.data.items
      if (items.length > 3 || items.length === 0) {
        reachedEnd = items.length === 0
        break
      }
      const pageIds = items.map(item => String(item.id))
      if (pageIds.some(id => !validId(id) || seenWorkOrderIds.has(id))) {
        stage = 'unstable_or_invalid_work_order_pagination'
        break
      }
      currentPageWorkOrderIds = new Set(pageIds)
      for (const id of pageIds) {
        seenWorkOrderIds.add(id)
        listedWorkOrderIds.add(id)
      }
      for (const workOrderId of pageIds) {
        stage = 'role_visible_type_one_order_read'
        const ordersResult = await orderApi.listTypeOneOrdersForWorkOrder(workOrderId, 3)
        if (counters.blockedUnexpectedAttempts || identityForCurrentSession() !== identityAtStart
          || !technicianApi.isWorkOrderListedForCurrentSession?.(workOrderId)
          || !operationSucceeded(ordersResult) || !ordersResult.data || ordersResult.data.items.length > 3
          || ordersResult.data.items.some(order => order.type !== 1 || order.serviceAppointmentId !== workOrderId)) {
          stage = 'type_one_order_read_not_verified'
          break
        }
        const line = firstOrderMaterialSkuIdentity(ordersResult.data.items)
        if (line) {
          selectedWorkOrderId = workOrderId
          selectedSkuId = line.skuId
          selectedSpuId = line.spuId
          selectedIdentity = line
          break
        }
      }
      if (selectedIdentity || stage.endsWith('_not_verified') || stage.startsWith('unstable_')) break
      const totalCount = workOrders.data.totalCount
      if (totalCount !== undefined && page * 3 >= totalCount) {
        reachedEnd = true
        break
      }
      if (totalCount === undefined && items.length < 3) {
        reachedEnd = true
        break
      }
    }

    if (!selectedIdentity) {
      const scanFailed = stage === 'work_order_list_not_verified'
        || stage === 'type_one_order_read_not_verified'
        || stage === 'unstable_or_invalid_work_order_pagination'
      const status = scanFailed ? 'BLOCKED_READ_SCOPE_OR_IDENTITY'
        : reachedEnd ? 'BLOCKED_NO_ROLE_VISIBLE_SKU_ORDER_LINE' : 'BLOCKED_SCAN_LIMIT_REACHED'
      console.log(JSON.stringify({
        status,
        technicianRolePresent: true,
        roleVersionPresent: Boolean(roleVersion?.trim()),
        workOrderPagesRead: counters.workOrderPages,
        currentRoleWorkOrdersChecked: counters.typeOneOrderQueries,
        requestCounts: { ...counters },
        blockedUnexpectedAttempts: counters.blockedUnexpectedAttempts,
        skuCatalogRequests: 0,
        businessMutationRequests: 0,
        persistentLocalStorage: 'NOT_USED',
        rawPayloadsOrIdentitiesPersisted: false,
      }))
      process.exitCode = 1
      return
    }

    if (!technicianApi.isWorkOrderListedForCurrentSession?.(selectedWorkOrderId)
      || identityForCurrentSession() !== identityAtStart) {
      console.log(JSON.stringify({ status: 'BLOCKED_SELECTED_ORDER_SCOPE_CHANGED', requestCounts: { ...counters }, businessMutationRequests: 0 }))
      process.exitCode = 1
      return
    }

    stage = 'bounded_material_sales_extfield_read'
    const salesFieldsResponse = await readTransport.execute({
      method: 'POST', path: 'biz/extField/query', body: r1MaterialSalesFieldsRequestBody(),
    })
    const salesFieldDefinitions = parseSalesFieldDefinitions(salesFieldsResponse)
    if (!salesFieldDefinitions.complete) {
      console.log(JSON.stringify({
        status: 'BLOCKED_SALES_FIELD_DEFINITIONS_INCOMPLETE', reason: salesFieldDefinitions.reason,
        selectedWorkOrderProvenance: true,
        workOrderPagesRead: counters.workOrderPages,
        requestCounts: { ...counters },
        blockedUnexpectedAttempts: counters.blockedUnexpectedAttempts,
        businessMutationRequests: 0,
        persistentLocalStorage: 'NOT_USED', rawPayloadsOrIdentitiesPersisted: false,
      }))
      return
    }
    expectedCodeValueOptionIds = salesFieldDefinitions.valueOptionIds

    let codeDictionaries = { complete: true, dictionaries: new Map() }
    if (salesFieldDefinitions.fields.length > 0) {
      stage = 'bounded_material_code_options_read'
      const codeResponse = await readTransport.execute({
        method: 'POST', path: 'i/code/selectCode.do',
        body: r1MaterialCodeOptionsRequestBody(expectedCodeValueOptionIds),
      })
      codeDictionaries = parseCodeDictionaries(codeResponse, salesFieldDefinitions.fields)
      if (!codeDictionaries.complete) {
        console.log(JSON.stringify({
          status: 'BLOCKED_CODE_DICTIONARIES_INCOMPLETE', reason: codeDictionaries.reason,
          salesAttributesReturned: salesFieldDefinitions.fields.length,
          requestCounts: { ...counters },
          blockedUnexpectedAttempts: counters.blockedUnexpectedAttempts,
          businessMutationRequests: 0, persistentLocalStorage: 'NOT_USED', rawPayloadsOrIdentitiesPersisted: false,
        }))
        return
      }
    }

    stage = 'bounded_single_spu_active_sku_read'
    const skuResponse = await readTransport.execute({
      method: 'POST', path: 'basic/material/query', body: r1MaterialSkuRequestBody(selectedSpuId),
    })
    const skuSummary = summarizeSkuRead(
      skuResponse,
      salesFieldDefinitions.fields,
      codeDictionaries.dictionaries,
      selectedIdentity,
    )
    if (!skuSummary.verified) {
      console.log(JSON.stringify({
        status: 'SKU_RESPONSE_NOT_VERIFIED', reason: skuSummary.reason,
        salesAttributesReturned: salesFieldDefinitions.fields.length,
        codeDictionariesReturned: codeDictionaries.dictionaries.size,
        requestCounts: { ...counters }, blockedUnexpectedAttempts: counters.blockedUnexpectedAttempts,
        businessMutationRequests: 0, persistentLocalStorage: 'NOT_USED', rawPayloadsOrIdentitiesPersisted: false,
      }))
      process.exitCode = 1
      return
    }
    const completeRun = counters.login === 1 && counters.roleTree === 1
      && counters.materialSalesFields === 1
      && counters.materialCodeOptions === (salesFieldDefinitions.fields.length > 0 ? 1 : 0)
      && counters.singleSpuSkuList === 1 && counters.blockedUnexpectedAttempts === 0
    console.log(JSON.stringify({
      status: completeRun ? 'R1_BOUNDED_SKU_READ_COMPLETED' : 'R1_SKU_READ_PARTIAL',
      technicianRolePresent: true,
      roleVersionPresent: Boolean(roleVersion?.trim()),
      workOrderProvenance: 'CURRENT_ROLE_VISIBLE_WORK_ORDER_AND_TYPE_ONE_ORDER',
      workOrderPagesRead: counters.workOrderPages,
      roleVisibleWorkOrdersChecked: counters.typeOneOrderQueries,
      sourceReads: {
        materialSalesFields: { page: 1, limit: 50, complete: true, salesAttributeCount: salesFieldDefinitions.fields.length },
        materialCodeOptions: {
          requestCount: counters.materialCodeOptions,
          expectedDictionaries: salesFieldDefinitions.fields.length,
          returnedDictionaries: codeDictionaries.dictionaries.size,
          complete: codeDictionaries.complete,
        },
        materialSkus: skuSummary,
      },
      r1UiRuntime: 'NOT_RUN',
      requestCounts: { ...counters },
      blockedUnexpectedAttempts: counters.blockedUnexpectedAttempts,
      businessMutationRequests: 0,
      persistentLocalStorage: 'NOT_USED',
      rawPayloadsOrIdentitiesPersisted: false,
    }))
    if (!completeRun) process.exitCode = 1
  } finally {
    await vite.close()
  }
}

run().catch(() => {
  console.log(JSON.stringify({
    status: 'BLOCKED_OR_FAILED_WITH_SANITIZED_ERROR', stage,
    requestCounts: { ...counters },
    blockedUnexpectedAttempts: counters.blockedUnexpectedAttempts,
    businessMutationRequests: 0,
    persistentLocalStorage: 'NOT_USED',
    rawPayloadsOrIdentitiesPersisted: false,
  }))
  process.exitCode = 1
})
