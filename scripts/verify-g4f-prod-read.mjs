import { createServer, loadEnv } from 'vite'
import { resolve } from 'node:path'
import { isAllowedWorkOrderListRequest } from './r1-order-contract-read-guard.mjs'
import {
  isAllowedR1SelectableCatalogPageRequest,
  isAllowedR1SelectableCatalogSkuPageRequest,
  isAllowedR1SelectablePackageSkuPageRequest,
} from './r1-selectable-catalog-read-guard.mjs'

const MAX_WORK_ORDER_PAGES = 1000
const MAX_CATALOG_PAGES = 50
const MAX_PACKAGE_DETAIL_READS = 200
const MAX_SELECTABLE_SKU_SPUS = 500
const MAX_SELECTABLE_SKU_REQUESTS = 1000
const CATALOG_PAGE_ROWS = 20
const MATERIAL_SALES_PAGE_ROWS = 50

const routeCounts = {
  roleTree: 0,
  workOrderList: 0,
  workOrderDetail: 0,
  quotationList: 0,
  packageList: 0,
  procedureList: 0,
  materialList: 0,
  measureList: 0,
  packageDetail: 0,
  materialSalesFields: 0,
  materialCodeOptions: 0,
  materialSkuList: 0,
}
let loginRequests = 0
let blockedUnexpectedNetworkRequests = 0
const blockedUnexpectedRoutes = Object.create(null)
const blockedUnexpectedStages = Object.create(null)
let stage = 'vite_start'
const listedWorkOrderIds = new Set()
const listedPackageIds = new Set()
const packageDetailLookupIds = new Set()
const listedCatalogSpuIds = new Set()
const directMaterialSpuIds = new Set()
const packageMaterialSpuIdsByPackage = new Map()
const catalogSkuNextPageBySpu = new Map()
const catalogPageByPath = new Map()
const listedMaterialSalesCodeIds = new Set()
let materialSalesNextPage = 1
let selectedCatalogContext = null
let selectedCatalogWorkOrderId = null
let selectedWorkOrderIsCurrent = () => false
let catalogSkuRequestCount = 0
const responseCounts = {
  workOrderListRows: 0,
  workOrderPagesRead: 0,
  workOrderDetailsSucceeded: 0,
  workOrderDetailsFailed: 0,
  activePlaceOrderNodes: 0,
  currentActionPlaceOrder: 0,
  detailsWithCatalogContext: 0,
  catalogItemsByKind: {
    package: { items: 0, pages: 0, totalCount: null, complete: false, reason: 'NOT_RUN' },
    procedure: { items: 0, pages: 0, totalCount: null, complete: false, reason: 'NOT_RUN' },
    material: { items: 0, pages: 0, totalCount: null, complete: false, reason: 'NOT_RUN' },
    measure: { items: 0, pages: 0, totalCount: null, complete: false, reason: 'NOT_RUN' },
  },
  packageDetails: {
    attempted: 0, succeeded: 0, failed: 0, complete: false,
    components: { procedure: 0, material: 0, measure: 0 },
    referencedMaterialSpus: 0,
  },
  materialSalesAttributes: { state: 'NOT_RUN', fields: 0 },
  selectableSkuCatalog: {
    uniqueSpus: 0, attemptedSpus: 0, succeededSpus: 0, failedSpus: 0,
    activeSkuRows: 0, emptySpus: 0, pagesRead: 0, complete: false,
    reason: 'NOT_RUN',
  },
  catalogContextVerified: false,
  workOrderScopedTypeOneQuoteRows: 0,
  quotesMatchingSampledWorkOrders: 0,
  quotesWithSkuOrSpuIdentity: 0,
  quotesWithGroupedContent: 0,
  recognizedQuotationGroups: 0,
  recognizedQuotationLines: 0,
  unsupportedQuotationGroups: 0,
  quotesWithPdfField: 0,
}

function isApprovedWorkOrderQuoteQuery(request) {
  if (typeof request.data !== 'string') return false
  const body = new URLSearchParams(request.data)
  const expectedKeys = [
    'page',
    'rows',
    'sortField',
    'sortOrder',
    'is:serviceAppointmentId|string#and',
    'is:type|integer#and',
  ].sort()
  const keys = [...body.keys()].sort()
  const workOrderId = body.get('is:serviceAppointmentId|string#and')
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && body.get('page') === '1'
    && body.get('rows') === '1'
    && body.get('sortField') === 'createTime'
    && body.get('sortOrder') === 'desc'
    && body.get('is:type|integer#and') === '1'
    && workOrderId !== null
    && listedWorkOrderIds.has(workOrderId)
}

function recordSafeRequest(url, request, apiBaseUrl) {
  const base = new URL(apiBaseUrl)
  if (url.origin !== base.origin || request.method !== 'POST') return null
  const relativePath = url.pathname.slice(base.pathname.replace(/\/$/, '').length).replace(/^\/+/, '')
  if (relativePath === 'index/phoneLogin.do') {
    if (loginRequests !== 0 || url.search) return null
    loginRequests += 1
    return 'login'
  }
  if (relativePath === 'function/queryTreeByRoleId') {
    if (Object.keys(Object.fromEntries(url.searchParams)).length !== 1 || !url.searchParams.has('roleId')) return null
    routeCounts.roleTree += 1
    return 'read'
  }
  if (url.search) return null
  if (relativePath === 'basic/serviceAppointment/query' || relativePath === 'basic/serviceAppointment/querySAWorkflowNode') {
    if (routeCounts.workOrderList >= MAX_WORK_ORDER_PAGES
      || !isAllowedWorkOrderListRequest(
        relativePath, request.method, url.searchParams, request.data, routeCounts.workOrderList + 1,
      )) return null
    routeCounts.workOrderList += 1
    return 'read'
  }
  const workOrderDetailPrefix = 'basic/serviceAppointment/queryById/'
  if (relativePath.startsWith(workOrderDetailPrefix)) {
    const id = decodeURIComponent(relativePath.slice(workOrderDetailPrefix.length))
    if (!listedWorkOrderIds.has(id) || url.search || (request.data !== undefined && request.data !== '')) return null
    routeCounts.workOrderDetail += 1
    return 'read'
  }
  if (relativePath === 'basic/order/query') {
    if (!isApprovedWorkOrderQuoteQuery(request)) return null
    routeCounts.quotationList += 1
    return 'read'
  }
  const catalogRoutes = {
    'biz/projPackage/queryWithRank': ['packageList', 'package'],
    'biz/procedure/queryWithRank': ['procedureList', 'procedure'],
    'basic/material/queryWithRank': ['materialList', 'material'],
    'biz/measure/queryWithRank': ['measureList', 'measure'],
  }
  const catalogRoute = catalogRoutes[relativePath]
  if (catalogRoute) {
    const requestCount = routeCounts.packageList + routeCounts.procedureList
      + routeCounts.materialList + routeCounts.measureList
    const expectedPage = (catalogPageByPath.get(relativePath) ?? 0) + 1
    if (!selectedCatalogContext || !isAllowedR1SelectableCatalogPageRequest({
      path: relativePath,
      method: request.method,
      search: url.searchParams,
      body: request.data,
      context: selectedCatalogContext,
      expectedPage,
      requestCount,
      maxRequestCount: 200,
    })) return null
    catalogPageByPath.set(relativePath, expectedPage)
    routeCounts[catalogRoute[0]] += 1
    return 'read'
  }
  if (relativePath === 'biz/extField/query') {
    const body = typeof request.data === 'string' ? new URLSearchParams(request.data) : new URLSearchParams()
    const expectedKeys = ['page', 'rows', 'sortField', 'sortOrder', 'colName', 'is:state|integer#and'].sort()
    const keys = [...body.keys()].sort()
    const page = Number(body.get('page'))
    if (!selectedCatalogContext || !selectedWorkOrderIsCurrent()
      || routeCounts.materialSalesFields >= 4
      || keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])
      || page !== materialSalesNextPage || !Number.isInteger(page) || page < 1 || page > 4
      || body.get('rows') !== String(MATERIAL_SALES_PAGE_ROWS)
      || body.get('sortField') !== 'order' || body.get('sortOrder') !== 'asc'
      || body.get('colName') !== 'material' || body.get('is:state|integer#and') !== '1') return null
    materialSalesNextPage += 1
    routeCounts.materialSalesFields += 1
    return 'read'
  }
  if (relativePath === 'i/code/selectCode.do') {
    const body = typeof request.data === 'string' ? new URLSearchParams(request.data) : new URLSearchParams()
    if (!selectedCatalogContext || !selectedWorkOrderIsCurrent()
      || routeCounts.materialCodeOptions >= 1 || [...body.keys()].sort().join(',') !== 'jsonPara,tenantId'
      || body.get('tenantId') !== '1340835581184723420') return null
    let providers
    try { providers = JSON.parse(body.get('jsonPara') ?? '') } catch { return null }
    if (!Array.isArray(providers) || providers.length < 1 || providers.length > 30) return null
    const ids = []
    for (const provider of providers) {
      if (!provider || typeof provider !== 'object' || Array.isArray(provider)
        || Object.keys(provider).sort().join(',') !== 'codeId,eleid'
        || typeof provider.codeId !== 'string' || provider.codeId !== provider.eleid
        || !listedMaterialSalesCodeIds.has(provider.codeId) || ids.includes(provider.codeId)) return null
      ids.push(provider.codeId)
    }
    routeCounts.materialCodeOptions += 1
    return 'read'
  }
  const packageDetailPrefix = 'biz/projPackage/findById/'
  if (relativePath.startsWith(packageDetailPrefix)) {
    const id = decodeURIComponent(relativePath.slice(packageDetailPrefix.length))
    if (!listedPackageIds.has(id) || packageDetailLookupIds.has(id)
      || routeCounts.packageDetail >= MAX_PACKAGE_DETAIL_READS
      || (request.data !== undefined && request.data !== '')) return null
    packageDetailLookupIds.add(id)
    routeCounts.packageDetail += 1
    return 'read'
  }
  if (relativePath === 'basic/material/query') {
    const body = typeof request.data === 'string' ? new URLSearchParams(request.data) : new URLSearchParams()
    const directSpuId = body.get('spuid')
    const packageSpuIds = body.get('in:spuid|array#and')?.split(',')
    const selectedSpuIds = directSpuId ? [directSpuId] : packageSpuIds
    const routeKey = `${directSpuId ? 'direct' : 'package'}:${selectedSpuIds?.join(',') ?? ''}`
    const currentPage = Number(body.get('page'))
    const expectedPage = directSpuId
      ? catalogSkuNextPageBySpu.get(routeKey) ?? 1
      : currentPage === 1 ? 1 : catalogSkuNextPageBySpu.get(routeKey) ?? 0
    const requestShape = directSpuId
      ? isAllowedR1SelectableCatalogSkuPageRequest({
          path: relativePath, method: request.method, search: url.searchParams, body: request.data,
          selectedSpuId: directSpuId, listedSpuIds: listedCatalogSpuIds, expectedPage,
          requestCount: catalogSkuRequestCount, maxRequestCount: MAX_SELECTABLE_SKU_REQUESTS,
        })
      : isAllowedR1SelectablePackageSkuPageRequest({
          path: relativePath, method: request.method, search: url.searchParams, body: request.data,
          selectedSpuIds, listedSpuIds: listedCatalogSpuIds, expectedPage,
          requestCount: catalogSkuRequestCount, maxRequestCount: MAX_SELECTABLE_SKU_REQUESTS,
        })
    if (!selectedSpuIds?.length || !selectedWorkOrderIsCurrent() || !requestShape) return null
    catalogSkuNextPageBySpu.set(routeKey, expectedPage + 1)
    catalogSkuRequestCount += 1
    routeCounts.materialSkuList += 1
    return 'read'
  }
  return null
}

function rememberVerifiedMaterialSalesCodeIds(raw) {
  const payload = raw && typeof raw === 'object' ? raw.data : undefined
  const rows = Array.isArray(payload) ? payload
    : Array.isArray(payload?.items?.records) ? payload.items.records
      : Array.isArray(payload?.records) ? payload.records : []
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || row.colName !== 'material' || (row.state !== 1 && row.state !== '1')) continue
    let config = row.frontEndConfig
    if (typeof config === 'string') {
      try { config = JSON.parse(config) } catch { continue }
    }
    if (config?.salesAttribute === true && typeof row.valueOption === 'string'
      && /^[A-Za-z0-9_-]{1,100}$/.test(row.valueOption)) {
      listedMaterialSalesCodeIds.add(row.valueOption)
    }
  }
}

function createRequest(apiBaseUrl) {
  return (options) => {
    const url = new URL(String(options.url))
    const safeKind = recordSafeRequest(url, options, apiBaseUrl)
    if (!safeKind) {
      blockedUnexpectedNetworkRequests += 1
      const basePath = new URL(apiBaseUrl).pathname.replace(/\/$/, '')
      const relativePath = url.pathname.slice(basePath.length).replace(/^\/+/, '')
      const safePath = relativePath.startsWith('basic/serviceAppointment/queryById/')
        ? 'basic/serviceAppointment/queryById/:id'
        : relativePath.startsWith('biz/projPackage/findById/')
          ? 'biz/projPackage/findById/:id' : relativePath
      blockedUnexpectedRoutes[safePath] = (blockedUnexpectedRoutes[safePath] ?? 0) + 1
      blockedUnexpectedStages[stage] = (blockedUnexpectedStages[stage] ?? 0) + 1
      options.fail?.(new Error('Read-only smoke blocked an unapproved network request'))
      return { abort() {} }
    }

    const headers = Object.fromEntries(Object.entries(options.header ?? {}).map(([key, value]) => [key, String(value)]))
    const body = options.data === undefined
      ? undefined
      : typeof options.data === 'string'
        ? options.data
        : new URLSearchParams(Object.entries(options.data).map(([key, value]) => [key, String(value)])).toString()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    void fetch(url, {
      method: options.method,
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: 'error',
      signal: controller.signal,
    }).then(async (response) => {
      const text = await response.text()
      if (Buffer.byteLength(text, 'utf8') > 1_000_000) throw new Error('response_too_large')
      let data
      try { data = JSON.parse(text) } catch { data = text }
      if (url.pathname.endsWith('/biz/extField/query')) rememberVerifiedMaterialSalesCodeIds(data)
      options.success?.({ statusCode: response.status, data })
    }).catch(() => {
      options.fail?.(new Error('Read-only smoke network request failed'))
    }).finally(() => clearTimeout(timer))
    return { abort: () => controller.abort() }
  }
}

function operationState(result) {
  return result?.state === 'succeeded' ? 'SUCCEEDED' : result?.state === 'failed_retryable' ? 'FAILED_RETRYABLE' : 'FAILED_TERMINAL'
}

function sanitizedErrorKind(error) {
  if (!(error instanceof Error)) return 'NON_ERROR_THROWN'
  const propertyRead = error.message.match(/cannot read (?:properties|property) of (?:undefined|null) \(reading '([a-zA-Z_$][\w$]*)'\)/i)
  if (propertyRead) return `${error.name}:PROPERTY_READ:${propertyRead[1]}`
  const undefinedIdentifier = error.message.match(/^([a-zA-Z_$][\w$]*) is not defined$/)
  return undefinedIdentifier ? `${error.name}:UNDEFINED_IDENTIFIER:${undefinedIdentifier[1]}` : error.name
}

async function readEntireCatalog(kind, context, readPage, onRow = () => {}) {
  const state = {
    items: 0,
    pages: 0,
    totalCount: null,
    complete: false,
    reason: 'PAGE_LIMIT_REACHED',
  }
  const seenIds = new Set()
  let expectedTotal

  for (let pageNumber = 1; pageNumber <= MAX_CATALOG_PAGES; pageNumber += 1) {
    stage = `${kind}_catalog_page_${pageNumber}`
    if (authIdentityChanged() || !selectedCatalogWorkOrderId || !selectedWorkOrderIsCurrent()) {
      state.reason = 'WORK_ORDER_OR_SESSION_CONTEXT_CHANGED'
      break
    }
    const result = await readPage(context, pageNumber)
    if (result.state !== 'succeeded' || !result.data) {
      state.reason = result.error?.category === 'authorization_denied' ? 'AUTHORIZATION_DENIED' : operationState(result)
      break
    }
    if (authIdentityChanged() || !selectedWorkOrderIsCurrent()) {
      state.reason = 'WORK_ORDER_OR_SESSION_CONTEXT_CHANGED'
      break
    }
    const page = result.data
    if ((page.page !== undefined && page.page !== pageNumber)
      || (page.pageSize !== undefined && page.pageSize !== CATALOG_PAGE_ROWS)
      || page.items.length > CATALOG_PAGE_ROWS) {
      state.reason = 'PAGE_METADATA_MISMATCH'
      break
    }
    state.pages += 1
    if (page.totalCount !== undefined) {
      if (expectedTotal !== undefined && expectedTotal !== page.totalCount) {
        state.reason = 'TOTAL_COUNT_CHANGED'
        break
      }
      expectedTotal = page.totalCount
      state.totalCount = expectedTotal
    }
    for (const item of page.items) {
      if (seenIds.has(item.id)) {
        state.reason = 'DUPLICATE_ID_ACROSS_PAGES'
        break
      }
      seenIds.add(item.id)
      onRow(item)
    }
    if (state.reason === 'DUPLICATE_ID_ACROSS_PAGES') break
    state.items += page.items.length

    if (expectedTotal !== undefined) {
      if (state.items > expectedTotal) {
        state.reason = 'ITEMS_EXCEED_TOTAL'
        break
      }
      if (state.items === expectedTotal) {
        state.complete = true
        state.reason = 'TOTAL_COUNT_REACHED'
        break
      }
      if (page.items.length === 0 || pageNumber * CATALOG_PAGE_ROWS >= expectedTotal) {
        state.reason = 'TOTAL_COUNT_NOT_REACHED'
        break
      }
    } else if (page.items.length < CATALOG_PAGE_ROWS) {
      state.complete = true
      state.reason = 'SHORT_PAGE_CONFIRMED_END'
      break
    }
  }
  responseCounts.catalogItemsByKind[kind] = state
  return state
}

function addCatalogSpuIdentity(value) {
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)) {
    listedCatalogSpuIds.add(value)
  }
}

async function readSelectableSkuCatalog(catalogApi, context, directMaterialSpuIds, packageSpuIdsByPackage, saleFieldNames) {
  const summary = responseCounts.selectableSkuCatalog
  const spuIds = [...new Set([
    ...directMaterialSpuIds,
    ...[...packageSpuIdsByPackage.values()].flat(),
  ])]
  summary.uniqueSpus = spuIds.length
  if (spuIds.length > MAX_SELECTABLE_SKU_SPUS) {
    summary.reason = 'SPU_READ_LIMIT_REACHED'
    return
  }
  const requests = [
    ...directMaterialSpuIds.map(id => ({ route: 'direct_material', ids: [id] })),
    ...[...packageSpuIdsByPackage.values()]
      .map(ids => [...new Set(ids)])
      .filter(ids => ids.length > 0)
      .map(ids => ({ route: 'package_materials', ids })),
  ]
  const seenSkuIds = new Map()
  const attemptedSpuIds = new Set()
  const succeededSpuIds = new Set()
  const failedSpuIds = new Set()
  const foundSpuIds = new Set()
  for (const [index, query] of requests.entries()) {
    stage = `selectable_material_sku_query_${index + 1}`
    if (authIdentityChanged() || !selectedCatalogWorkOrderId || !selectedWorkOrderIsCurrent()) {
      summary.reason = 'WORK_ORDER_OR_SESSION_CONTEXT_CHANGED'
      query.ids.forEach(id => failedSpuIds.add(id))
      return
    }
    if (catalogSkuRequestCount >= MAX_SELECTABLE_SKU_REQUESTS) {
      summary.reason = 'SKU_REQUEST_LIMIT_REACHED'
      query.ids.forEach(id => failedSpuIds.add(id))
      return
    }
    query.ids.forEach(id => attemptedSpuIds.add(id))
    summary.attemptedSpus = attemptedSpuIds.size
    const pagesBefore = routeCounts.materialSkuList
    const result = await catalogApi.listMaterialSkuVariants(context, query.route, query.ids, saleFieldNames)
    summary.pagesRead += routeCounts.materialSkuList - pagesBefore
    if (result.state !== 'succeeded' || !result.data || authIdentityChanged()) {
      summary.lastFailureCategory = result.error?.category ?? (authIdentityChanged() ? 'authorization_denied' : 'unknown')
      summary.reason = result.error?.category === 'authorization_denied'
        ? 'AUTHORIZATION_DENIED' : 'SKU_READ_FAILED_OR_INCOMPLETE'
      query.ids.forEach(id => failedSpuIds.add(id))
      summary.failedSpus = failedSpuIds.size
      return
    }
    for (const row of result.data.items) {
      foundSpuIds.add(row.spuId)
      const previousSpuId = seenSkuIds.get(row.id)
      if (previousSpuId && previousSpuId !== row.spuId) {
        summary.reason = 'SKU_IDENTITY_ASSOCIATION_CONFLICT'
        query.ids.forEach(id => failedSpuIds.add(id))
        summary.failedSpus = failedSpuIds.size
        return
      }
      if (!previousSpuId) {
        seenSkuIds.set(row.id, row.spuId)
        summary.activeSkuRows += 1
      }
    }
    query.ids.forEach(id => succeededSpuIds.add(id))
    summary.succeededSpus = succeededSpuIds.size
  }
  summary.failedSpus = failedSpuIds.size
  summary.emptySpus = [...succeededSpuIds].filter(id => !foundSpuIds.has(id)).length
  summary.complete = true
  summary.reason = 'ALL_ROLE_LISTED_MATERIAL_AND_PACKAGE_SPUS_READ'
}

let getCurrentAuthIdentity = () => null
function authIdentityChanged() {
  const identity = getCurrentAuthIdentity()
  return !identity || identity !== expectedAuthIdentity
}
let expectedAuthIdentity = null

async function run() {
  const root = process.cwd()
  const vite = await createServer({
    configFile: false,
    root,
    mode: 'prod',
    envDir: root,
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
    stage = 'load_application_adapters'
    const [{ loadApplicationRuntimeConfig }, { resolveQuickLoginInput }, { createAuthSessionAdapter }, { createUniAuthBackendDriver }, { createSemanticStorageAdapter }, { createUniApiReadTransport }, { createRoleScopedTechnicianApiReadAdapter }, { createQuotationCatalogReadAdapter }, { createQuotationOrderReadAdapter }, { detailWorkflowProjectionFor }, { isProductionReadOnlyTarget }, { isBusinessMockMode }] = await Promise.all([
      vite.ssrLoadModule('/src/app/runtime-config.ts'),
      vite.ssrLoadModule('/src/features/session/quick-login.ts'),
      vite.ssrLoadModule('/src/adapters/auth/auth-session-adapter.ts'),
      vite.ssrLoadModule('/src/adapters/auth/uni-auth-backend.ts'),
      vite.ssrLoadModule('/src/adapters/storage/storage-adapter.ts'),
      vite.ssrLoadModule('/src/adapters/api/uni-api-read-transport.ts'),
      vite.ssrLoadModule('/src/adapters/api/technician-api.ts'),
      vite.ssrLoadModule('/src/adapters/api/quotation-catalog-api.ts'),
      vite.ssrLoadModule('/src/adapters/api/quotation-order-api.ts'),
      vite.ssrLoadModule('/src/features/work-orders/detail-workflow.ts'),
      vite.ssrLoadModule('/src/shared/config/production-read-only.ts'),
      vite.ssrLoadModule('/src/adapters/api/mock/config.ts'),
    ])

    stage = 'production_preflight'
    const runtime = loadApplicationRuntimeConfig()
    const quickLogin = resolveQuickLoginInput()
    const localEnvironment = loadEnv('prod', process.cwd(), 'VITE_')
    const preflight = {
      runtimeConfig: runtime.ok,
      productionEnvironment: localEnvironment.VITE_XLINK_ENVIRONMENT === 'prod',
      productionTarget: runtime.ok && isProductionReadOnlyTarget('prod', runtime.value.environment.apiBaseUrl),
      quickLoginConfigured: Boolean(quickLogin),
      mockOff: isBusinessMockMode() === 'off',
      realWritesDisabled: localEnvironment.VITE_XLINK_ENABLE_REAL_WRITES === 'false',
    }
    if (Object.values(preflight).some((passed) => !passed)) {
      console.log(JSON.stringify({ status: 'BLOCKED_PREFLIGHT', preflight, networkRequests: 0 }))
      process.exitCode = 1
      return
    }
    if (process.argv.includes('--preflight-only')) {
      console.log(JSON.stringify({
        productionTarget: 'CONFIRMED',
        quickLoginConfigured: true,
        mockMode: 'OFF',
        realWrites: 'DISABLED',
        persistentLocalStorage: 'NOT_USED',
        networkRequests: 0,
      }))
      return
    }

    stage = 'authenticated_login'
    const values = new Map()
    const storage = createSemanticStorageAdapter({
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => { values.set(key, value) },
      remove: async (key) => { values.delete(key) },
      listKeys: async () => [...values.keys()],
    })
    const request = createRequest(runtime.value.environment.apiBaseUrl)
    const authBackend = createUniAuthBackendDriver({ apiBaseUrl: runtime.value.environment.apiBaseUrl, request, timeoutMs: 20000 })
    const auth = createAuthSessionAdapter(authBackend, storage, runtime.value.authWireConfig)
    const login = await auth.startSession(quickLogin)
    if (login.state !== 'succeeded' || !login.data) {
      console.log(JSON.stringify({
        login: operationState(login),
        category: login.error?.category ?? 'UNKNOWN',
        loginRequests,
        productionBusinessMutationNetworkRequests: 0,
        blockedUnexpectedNetworkRequests,
      }))
      process.exitCode = 1
      return
    }

    const session = login.data
    const currentIdentity = () => {
      const current = auth.getCurrentSession()
      if (!current?.sessionRef || !current.user.id || !current.currentRole?.id) return null
      return [current.sessionRef, current.user.id, current.currentRole.id, current.roleVersion ?? ''].join('|')
    }
    getCurrentAuthIdentity = currentIdentity
    expectedAuthIdentity = currentIdentity()
    if (!expectedAuthIdentity) throw new Error('authenticated_role_identity_missing')
    stage = 'create_read_adapters'
    let technicianApi
    let catalogApi
    const apiTransport = createUniApiReadTransport({
      apiBaseUrl: runtime.value.environment.apiBaseUrl,
      getSessionRef: () => auth.getCurrentSession()?.sessionRef ?? null,
      isProductionQuotationCatalogReadAuthorized: readRequest =>
        catalogApi?.isProductionReadRequestAuthorized(readRequest) === true,
      getMockActor: () => ({ userId: session.user.id, ...(session.currentRole ? { roleId: session.currentRole.id } : {}) }),
      isOrderWorkOrderListedForCurrentSession: (workOrderId) =>
        listedWorkOrderIds.has(workOrderId)
          && technicianApi?.isWorkOrderListedForCurrentSession?.(workOrderId) === true,
      getOrderReadAuthorizationIdentity: () => getCurrentAuthIdentity(),
      request,
      timeoutMs: 20000,
    })
    technicianApi = createRoleScopedTechnicianApiReadAdapter(
      apiTransport,
      () => auth.getCurrentSession()?.currentRole?.id ?? null,
      {
        cascadeTenantId: runtime.value.authWireConfig.tenant,
        codeTenantId: runtime.value.authWireConfig.tenant,
        getReadAuthorizationScope: () => {
          const current = auth.getCurrentSession()
          return current ? {
            sessionRef: current.sessionRef,
            userId: current.user.id,
            roleId: current.currentRole?.id ?? null,
            roleVersion: current.roleVersion ?? null,
          } : null
        },
      },
    )
    catalogApi = createQuotationCatalogReadAdapter(
      apiTransport,
      () => {
        const current = auth.getCurrentSession()
        return current ? {
          sessionRef: current.sessionRef,
          userId: current.user.id,
          roleId: current.currentRole?.id ?? null,
          roleVersion: current.roleVersion ?? null,
        } : null
      },
      runtime.value.authWireConfig.tenant,
      (workOrderId) => listedWorkOrderIds.has(workOrderId)
        && technicianApi?.isWorkOrderListedForCurrentSession?.(workOrderId) === true,
    )
    const orderApi = createQuotationOrderReadAdapter(
      apiTransport,
      (workOrderId) => listedWorkOrderIds.has(workOrderId)
        && technicianApi.isWorkOrderListedForCurrentSession?.(workOrderId) === true,
    )

    stage = 'work_order_list_read'
    const workOrders = await technicianApi.listWorkOrders({ page: 1, pageSize: 3 })
    responseCounts.workOrderListRows = workOrders.state === 'succeeded' && workOrders.data ? workOrders.data.items.length : 0
    responseCounts.workOrderPagesRead = workOrders.state === 'succeeded' && workOrders.data ? 1 : 0
    const firstPageBounded = Boolean(workOrders.data && workOrders.data.items.length <= 3)
    if (firstPageBounded) {
      for (const workOrder of workOrders.data?.items ?? []) listedWorkOrderIds.add(String(workOrder.id))
    }

    const details = []
    const pageOneWorkOrders = firstPageBounded ? workOrders.data?.items ?? [] : []
    const selectedWorkOrderIds = new Set()
    const workOrderPageIds = new Set()
    let discoveryState = workOrders.state === 'succeeded' && workOrders.data ? 'SEARCHING' : operationState(workOrders)
    const considerCatalogContext = (workOrder, detail) => {
      if (detail.state !== 'succeeded' || !detail.data) return false
      const projection = detailWorkflowProjectionFor(detail.data, session)
      const canPlaceOrder = projection.currentTask?.actionIntent === 'place_order'
        && projection.currentTask.execution === 'enabled'
      const context = detail.data.quotationCatalogContext
      const completeContext = context?.workOrderId === String(workOrder.id)
        && typeof context.serviceType === 'string' && Boolean(context.serviceType.trim())
        && typeof context.sourceType === 'string' && Boolean(context.sourceType.trim())
      if (!canPlaceOrder || !completeContext) return false
      selectedCatalogContext = context
      selectedCatalogWorkOrderId = String(workOrder.id)
      selectedWorkOrderIsCurrent = () => technicianApi.isWorkOrderListedForCurrentSession?.(selectedCatalogWorkOrderId) === true
      return true
    }

    for (const workOrder of pageOneWorkOrders) {
      const id = String(workOrder.id)
      selectedWorkOrderIds.add(id)
      workOrderPageIds.add(id)
    }
    for (const [index, workOrder] of pageOneWorkOrders.entries()) {
      stage = `work_order_detail_read_${index + 1}`
      const detail = await technicianApi.getWorkOrderDetail(workOrder.id)
      if (detail.state !== 'succeeded' || !detail.data) {
        responseCounts.workOrderDetailsFailed += 1
        details.push({ state: operationState(detail), activePlaceOrder: false, catalogContext: false })
        continue
      }
      responseCounts.workOrderDetailsSucceeded += 1
      const activePlaceOrderNodes = (detail.data.workflowNodes ?? []).filter((node) => node.category === 'placeOrder' && node.lifecycle === 'active')
      responseCounts.activePlaceOrderNodes += activePlaceOrderNodes.length
      stage = `workflow_projection_${index + 1}`
      const projection = detailWorkflowProjectionFor(detail.data, session)
      const currentActionIsPlaceOrder = projection.currentTask?.actionIntent === 'place_order' && projection.currentTask.execution === 'enabled'
      if (currentActionIsPlaceOrder) responseCounts.currentActionPlaceOrder += 1
      const hasCatalogContext = Boolean(detail.data.quotationCatalogContext?.serviceType)
      if (hasCatalogContext) responseCounts.detailsWithCatalogContext += 1
      details.push({
        state: 'SUCCEEDED',
        activePlaceOrder: activePlaceOrderNodes.length > 0,
        currentActionPlaceOrder: currentActionIsPlaceOrder,
        catalogContext: hasCatalogContext,
      })
      if (!selectedCatalogContext && considerCatalogContext(workOrder, detail)) break
    }

    const hasCatalogIdentity = (lines) => lines.some((line) => Boolean(line.identity.skuId || line.identity.spuId) || hasCatalogIdentity(line.children))
    const countLines = (lines) => lines.reduce((count, line) => count + 1 + countLines(line.children), 0)
    for (const [index, workOrder] of pageOneWorkOrders.entries()) {
      stage = `work_order_scoped_quotation_read_${index + 1}`
      const quotes = await orderApi.listTypeOneOrdersForWorkOrder(String(workOrder.id), 1)
      if (quotes.state === 'succeeded' && quotes.data) {
        responseCounts.workOrderScopedTypeOneQuoteRows += quotes.data.items.length
        responseCounts.quotesMatchingSampledWorkOrders += quotes.data.items.filter((quote) => quote.serviceAppointmentId === String(workOrder.id)).length
        responseCounts.quotesWithSkuOrSpuIdentity += quotes.data.items.filter((quote) => quote.groups.some((group) => hasCatalogIdentity(group.lines))).length
        responseCounts.quotesWithGroupedContent += quotes.data.items.filter((quote) => quote.groups.length > 0).length
        responseCounts.recognizedQuotationGroups += quotes.data.items.reduce((count, quote) => count + quote.groups.filter((group) => group.contentSupported).length, 0)
        responseCounts.unsupportedQuotationGroups += quotes.data.items.reduce((count, quote) => count + quote.groups.filter((group) => !group.contentSupported).length, 0)
        responseCounts.recognizedQuotationLines += quotes.data.items.reduce((count, quote) => count + quote.groups.reduce((groupCount, group) => groupCount + countLines(group.lines), 0), 0)
        responseCounts.quotesWithPdfField += quotes.data.items.filter((quote) => quote.pdfState === 'present_no_access').length
      }
    }

    const firstPageExhausted = Boolean(workOrders.data && (
      workOrders.data.items.length === 0
        || workOrders.data.items.length > 0 && workOrders.data.items.length < 3 && workOrders.data.totalCount === undefined
        || workOrders.data.totalCount !== undefined && workOrders.data.totalCount <= 3
    ))
    if (workOrders.state === 'succeeded' && workOrders.data?.items.length > 3) {
      discoveryState = 'WORK_ORDER_PAGE_EXCEEDED_BOUND'
    } else if (workOrders.state === 'succeeded' && firstPageExhausted) {
      discoveryState = 'ROLE_VISIBLE_WORK_ORDERS_EXHAUSTED'
    }
    for (let page = 2; !selectedCatalogContext && workOrders.state === 'succeeded'
      && workOrders.data && !firstPageExhausted && workOrders.data.items.length <= 3
      && page <= MAX_WORK_ORDER_PAGES; page += 1) {
      stage = `role_scoped_work_order_page_${page}`
      technicianApi = createRoleScopedTechnicianApiReadAdapter(
        apiTransport,
        () => auth.getCurrentSession()?.currentRole?.id ?? null,
        {
          cascadeTenantId: runtime.value.authWireConfig.tenant,
          codeTenantId: runtime.value.authWireConfig.tenant,
          getReadAuthorizationScope: () => {
            const current = auth.getCurrentSession()
            return current ? {
              sessionRef: current.sessionRef,
              userId: current.user.id,
              roleId: current.currentRole?.id ?? null,
              roleVersion: current.roleVersion ?? null,
            } : null
          },
        },
      )
      const pageResult = await technicianApi.listWorkOrders({ page, pageSize: 3 })
      if (pageResult.state !== 'succeeded' || !pageResult.data || authIdentityChanged()) {
        discoveryState = pageResult.state === 'failed_terminal' ? 'WORK_ORDER_READ_FAILED' : 'WORK_ORDER_READ_UNVERIFIED'
        break
      }
      responseCounts.workOrderPagesRead += 1
      responseCounts.workOrderListRows += pageResult.data.items.length
      if (pageResult.data.items.length > 3) {
        discoveryState = 'WORK_ORDER_PAGE_EXCEEDED_BOUND'
        break
      }
      const pageIds = pageResult.data.items.map((item) => String(item.id))
      if (pageIds.some((id) => workOrderPageIds.has(id) || selectedWorkOrderIds.has(id))) {
        discoveryState = 'WORK_ORDER_PAGINATION_DUPLICATE'
        break
      }
      for (const id of pageIds) {
        listedWorkOrderIds.add(id)
        selectedWorkOrderIds.add(id)
      }
      if (pageResult.data.items.length === 0) {
        discoveryState = 'ROLE_VISIBLE_WORK_ORDERS_EXHAUSTED'
        break
      }
      let detailReadFailed = false
      for (const [index, workOrder] of pageResult.data.items.entries()) {
        stage = `role_scoped_work_order_detail_${page}_${index + 1}`
        const detail = await technicianApi.getWorkOrderDetail(workOrder.id)
        if (detail.state !== 'succeeded' || !detail.data) {
          responseCounts.workOrderDetailsFailed += 1
          detailReadFailed = true
          continue
        }
        responseCounts.workOrderDetailsSucceeded += 1
        const activePlaceOrderNodes = (detail.data.workflowNodes ?? []).filter((node) => node.category === 'placeOrder' && node.lifecycle === 'active')
        responseCounts.activePlaceOrderNodes += activePlaceOrderNodes.length
        const projection = detailWorkflowProjectionFor(detail.data, session)
        const canPlaceOrder = projection.currentTask?.actionIntent === 'place_order'
          && projection.currentTask.execution === 'enabled'
        if (canPlaceOrder) responseCounts.currentActionPlaceOrder += 1
        if (detail.data.quotationCatalogContext?.serviceType) responseCounts.detailsWithCatalogContext += 1
        if (considerCatalogContext(workOrder, detail, details.length + page * 3 + index)) {
          discoveryState = 'PLACE_ORDER_CONTEXT_FOUND'
          break
        }
      }
      if (selectedCatalogContext) break
      if (detailReadFailed) {
        discoveryState = 'WORK_ORDER_DETAIL_READ_INCOMPLETE'
        break
      }
      const totalCount = pageResult.data.totalCount
      if ((totalCount !== undefined && page * 3 >= totalCount)
        || (totalCount === undefined && pageResult.data.items.length < 3)) {
        discoveryState = 'ROLE_VISIBLE_WORK_ORDERS_EXHAUSTED'
        break
      }
      if (page === MAX_WORK_ORDER_PAGES) discoveryState = 'WORK_ORDER_PAGE_LIMIT_REACHED'
    }

    if (selectedCatalogContext) {
      responseCounts.catalogContextVerified = Boolean(
        selectedCatalogContext.workOrderId === selectedCatalogWorkOrderId
          && selectedCatalogContext.serviceType && selectedCatalogContext.sourceType
          && selectedWorkOrderIsCurrent() && authIdentityChanged() === false,
      )
      discoveryState = 'PLACE_ORDER_CONTEXT_FOUND'
      stage = 'all_selectable_catalog_pages'
      const catalogs = [
        ['package', catalogApi.listPackages.bind(catalogApi), (item) => listedPackageIds.add(item.id)],
        ['procedure', catalogApi.listProcedures.bind(catalogApi), () => {}],
        ['material', catalogApi.listMaterials.bind(catalogApi), (item) => {
          directMaterialSpuIds.add(item.id)
          addCatalogSpuIdentity(item.id)
        }],
        ['measure', catalogApi.listMeasures.bind(catalogApi), () => {}],
      ]
      const catalogResults = {}
      for (const [kind, readPage, onRow] of catalogs) {
        catalogResults[kind] = await readEntireCatalog(kind, selectedCatalogContext, readPage, onRow)
      }

      const packageListComplete = catalogResults.package.complete
      const packageTargets = [...listedPackageIds].slice(0, MAX_PACKAGE_DETAIL_READS)
      responseCounts.packageDetails.attempted = packageTargets.length
      responseCounts.packageDetails.complete = packageListComplete
        && packageTargets.length === catalogResults.package.items
      for (const [index, packageId] of packageTargets.entries()) {
        stage = `listed_package_detail_${index + 1}`
        const packageDetail = await catalogApi.getPackageDetail(packageId)
        if (packageDetail.state !== 'succeeded' || !packageDetail.data) {
          responseCounts.packageDetails.failed += 1
          responseCounts.packageDetails.complete = false
          continue
        }
        responseCounts.packageDetails.succeeded += 1
        responseCounts.packageDetails.components.procedure += packageDetail.data.procedures.length
        responseCounts.packageDetails.components.material += packageDetail.data.materials.length
        responseCounts.packageDetails.components.measure += packageDetail.data.measures.length
        const packageMaterialSpuIds = packageDetail.data.materials
          .map(material => material.referenceId)
          .filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id))
        packageMaterialSpuIdsByPackage.set(packageId, packageMaterialSpuIds)
        for (const material of packageDetail.data.materials) {
          addCatalogSpuIdentity(material.referenceId)
        }
      }
      responseCounts.packageDetails.referencedMaterialSpus = listedCatalogSpuIds.size
      if (responseCounts.packageDetails.succeeded !== responseCounts.packageDetails.attempted) {
        responseCounts.packageDetails.complete = false
      }
      if (catalogResults.package.items > MAX_PACKAGE_DETAIL_READS) responseCounts.packageDetails.complete = false

      stage = 'material_sales_attribute_and_code_read'
      const saleFields = await catalogApi.listMaterialSalesFields(selectedCatalogContext)
      responseCounts.materialSalesAttributes = {
        state: operationState(saleFields),
        fields: saleFields.state === 'succeeded' && saleFields.data ? saleFields.data.items.length : 0,
        options: saleFields.state === 'succeeded' && saleFields.data
          ? saleFields.data.items.reduce((count, field) => count + field.options.length, 0) : 0,
      }
      if (saleFields.state === 'succeeded' && saleFields.data) {
        stage = 'bounded_selectable_material_sku_pages'
        await readSelectableSkuCatalog(
          catalogApi,
          selectedCatalogContext,
          [...directMaterialSpuIds],
          packageMaterialSpuIdsByPackage,
          saleFields.data.items.map(field => field.name),
        )
      } else {
        responseCounts.selectableSkuCatalog.reason = 'MATERIAL_SALES_FIELDS_READ_FAILED'
      }
    }

    const auditComplete = responseCounts.catalogContextVerified
      && Object.values(responseCounts.catalogItemsByKind).every(result => result.complete)
      && responseCounts.packageDetails.complete
      && responseCounts.materialSalesAttributes.state === 'SUCCEEDED'
      && responseCounts.selectableSkuCatalog.complete
      && blockedUnexpectedNetworkRequests === 0
    console.log(JSON.stringify({
      status: auditComplete ? 'PROD_READ_ONLY_CHAIN_COMPLETE' : 'PROD_READ_ONLY_CHAIN_INCOMPLETE',
      login: 'SUCCEEDED',
      loginRequests,
      sessionStorage: 'MEMORY_ONLY',
      currentRoleAvailable: Boolean(session.currentRole),
      workOrderListState: operationState(workOrders),
      workOrderContextDiscovery: discoveryState,
      selectedWorkOrderContext: responseCounts.catalogContextVerified ? {
        verified: true,
        currentAction: 'place_order',
        serviceTypePresent: true,
        sourceTypePresent: true,
        roleVersionPresent: Boolean(session.roleVersion),
      } : { verified: false },
      workOrderDetails: details,
      routeCounts,
      responseCounts,
      blockedUnexpectedNetworkRequests,
      blockedUnexpectedRoutes,
      blockedUnexpectedStages,
      productionBusinessMutationNetworkRequests: 0,
      quoteWriteWorkflowUploadCustomerInteractionRequests: 0,
    }))
    if (!auditComplete) process.exitCode = 1
  } finally {
    void vite.close()
  }
}

run().catch((error) => {
  console.log(JSON.stringify({
    status: 'BLOCKED_OR_FAILED_WITH_SANITIZED_ERROR',
    stage,
    errorKind: sanitizedErrorKind(error),
    loginRequests,
    routeCounts,
    responseCounts,
    blockedUnexpectedNetworkRequests,
    blockedUnexpectedRoutes,
    blockedUnexpectedStages,
    productionBusinessMutationNetworkRequests: 0,
  }))
  process.exitCode = 1
}).then(() => process.exit(process.exitCode ?? 0))
