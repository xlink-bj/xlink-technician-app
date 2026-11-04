import { createServer, loadEnv } from 'vite'
import { resolve } from 'node:path'
import { isAllowedWorkOrderListRequest } from './r1-order-contract-read-guard.mjs'
import {
  isAllowedR1SelectableCatalogPageRequest,
  isAllowedR1SelectableCatalogSkuPageRequest,
  r1BoundedSelectableSkuRequestBody,
} from './r1-selectable-catalog-read-guard.mjs'
import { inspectActiveSkuCatalogPage, rowsFromEnvelope, totalFromEnvelope } from './r1-sku-read-evidence.mjs'

const MAX_WORK_ORDER_PAGES = 1000
const MAX_CATALOG_PAGES = 50
const MAX_PACKAGE_DETAIL_READS = 200
const MAX_SELECTABLE_SKU_SPUS = 500
const MAX_SELECTABLE_SKU_REQUESTS = 1000
const CATALOG_PAGE_ROWS = 20
const SKU_PAGE_ROWS = 30

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
  materialSkuList: 0,
}
let loginRequests = 0
let blockedUnexpectedNetworkRequests = 0
let stage = 'vite_start'
const listedWorkOrderIds = new Set()
const listedPackageIds = new Set()
const packageDetailLookupIds = new Set()
const listedCatalogSpuIds = new Set()
const catalogSkuNextPageBySpu = new Map()
const catalogPageByPath = new Map()
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
    const selectedSpuId = body.get('spuid')
    const expectedPage = selectedSpuId ? (catalogSkuNextPageBySpu.get(selectedSpuId) ?? 1) : 0
    if (!selectedSpuId || !isAllowedR1SelectableCatalogSkuPageRequest({
      path: relativePath,
      method: request.method,
      search: url.searchParams,
      body: request.data,
      selectedSpuId,
      listedSpuIds: listedCatalogSpuIds,
      expectedPage,
      requestCount: catalogSkuRequestCount,
      maxRequestCount: MAX_SELECTABLE_SKU_REQUESTS,
    })) return null
    catalogSkuNextPageBySpu.set(selectedSpuId, expectedPage + 1)
    catalogSkuRequestCount += 1
    routeCounts.materialSkuList += 1
    return 'read'
  }
  return null
}

function createRequest(apiBaseUrl) {
  return (options) => {
    const url = new URL(String(options.url))
    const safeKind = recordSafeRequest(url, options, apiBaseUrl)
    if (!safeKind) {
      blockedUnexpectedNetworkRequests += 1
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

function inspectBoundedSelectableSkuPage(raw, selectedSpuId) {
  const inspected = inspectActiveSkuCatalogPage(raw, selectedSpuId, SKU_PAGE_ROWS)
  if (!inspected.verified) return { verified: false, reason: inspected.reason }
  return {
    verified: true,
    count: inspected.summary.activeSkuRowsReturned,
    totalCount: inspected.summary.totalSkuRows,
  }
}

async function readSelectableSkuCatalog(request, apiBaseUrl, sessionRef) {
  const summary = responseCounts.selectableSkuCatalog
  const spuIds = [...listedCatalogSpuIds]
  summary.uniqueSpus = spuIds.length
  const boundedSpus = spuIds.slice(0, MAX_SELECTABLE_SKU_SPUS)
  const seenSkuIds = new Set()

  for (const spuId of boundedSpus) {
    summary.attemptedSpus += 1
    let totalCount
    let rowsForSpu = 0
    let pagesCompleted = false
    for (let page = 1; page <= MAX_CATALOG_PAGES; page += 1) {
      stage = `selectable_material_sku_page_${page}`
      if (authIdentityChanged() || !selectedCatalogContext || !selectedCatalogWorkOrderId
        || !selectedWorkOrderIsCurrent()) {
        summary.reason = 'WORK_ORDER_OR_SESSION_CONTEXT_CHANGED'
        summary.failedSpus += 1
        return
      }
      if (catalogSkuRequestCount >= MAX_SELECTABLE_SKU_REQUESTS) {
        summary.reason = 'SKU_REQUEST_LIMIT_REACHED'
        summary.failedSpus += 1
        return
      }
      const body = r1BoundedSelectableSkuRequestBody(spuId, page)
      const response = await requestPromise(request, {
        url: `${apiBaseUrl.replace(/\/+$/, '')}/basic/material/query`,
        method: 'POST',
        data: new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])).toString(),
        header: {
          Cookie: `JSESSIONID=${sessionRef}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        dataType: 'json',
        timeout: 20000,
      })
      if (response.statusCode < 200 || response.statusCode >= 300 || authIdentityChanged()) {
        summary.reason = 'SKU_READ_FAILED_OR_SESSION_CHANGED'
        summary.failedSpus += 1
        return
      }
      summary.pagesRead += 1
      const result = inspectBoundedSelectableSkuPage(response.data, spuId)
      if (!result.verified) {
        summary.reason = 'SKU_PAGE_IDENTITY_OR_SHAPE_INVALID'
        summary.failedSpus += 1
        return
      }
      if (result.totalCount !== undefined) {
        if (totalCount !== undefined && totalCount !== result.totalCount) {
          summary.reason = 'SKU_TOTAL_COUNT_CHANGED'
          summary.failedSpus += 1
          return
        }
        totalCount = result.totalCount
      }
      const rows = rowsFromEnvelope(response.data)
      if (!rows) {
        summary.reason = 'SKU_PAGE_SHAPE_INVALID'
        summary.failedSpus += 1
        return
      }
      for (const row of rows) {
        if (seenSkuIds.has(row._id)) {
          summary.reason = 'DUPLICATE_SKU_ID'
          summary.failedSpus += 1
          return
        }
        seenSkuIds.add(row._id)
      }
      rowsForSpu += result.count
      summary.activeSkuRows += result.count
      const rawTotal = totalFromEnvelope(response.data)
      if (rawTotal !== undefined && rowsForSpu === rawTotal) {
        pagesCompleted = true
        break
      }
      if (rawTotal !== undefined && rowsForSpu > rawTotal) {
        summary.reason = 'SKU_ITEMS_EXCEED_TOTAL'
        summary.failedSpus += 1
        return
      }
      if (rawTotal === undefined && result.count < SKU_PAGE_ROWS) {
        pagesCompleted = true
        break
      }
      if (page === MAX_CATALOG_PAGES) {
        summary.reason = 'SKU_PAGE_LIMIT_REACHED'
        summary.failedSpus += 1
        return
      }
    }
    if (!pagesCompleted) {
      summary.reason = 'SKU_PAGE_SET_INCOMPLETE'
      summary.failedSpus += 1
      return
    }
    summary.succeededSpus += 1
    if (rowsForSpu === 0) summary.emptySpus += 1
  }

  if (spuIds.length > boundedSpus.length) {
    summary.reason = 'SPU_READ_LIMIT_REACHED'
    return
  }
  summary.complete = true
  summary.reason = 'ALL_LISTED_SPUS_READ'
}

let getCurrentAuthIdentity = () => null
function authIdentityChanged() {
  const identity = getCurrentAuthIdentity()
  return !identity || identity !== expectedAuthIdentity
}
let expectedAuthIdentity = null

function requestPromise(request, options) {
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
    const apiTransport = createUniApiReadTransport({
      apiBaseUrl: runtime.value.environment.apiBaseUrl,
      getSessionRef: () => auth.getCurrentSession()?.sessionRef ?? null,
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
    const catalogApi = createQuotationCatalogReadAdapter(
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
        ['material', catalogApi.listMaterials.bind(catalogApi), (item) => addCatalogSpuIdentity(item.spuId ?? item.id)],
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
        for (const material of packageDetail.data.materials) {
          addCatalogSpuIdentity(material.referenceId ?? material.item?.id)
        }
      }
      responseCounts.packageDetails.referencedMaterialSpus = listedCatalogSpuIds.size
      if (responseCounts.packageDetails.succeeded !== responseCounts.packageDetails.attempted) {
        responseCounts.packageDetails.complete = false
      }
      if (catalogResults.package.items > MAX_PACKAGE_DETAIL_READS) responseCounts.packageDetails.complete = false

      stage = 'bounded_selectable_material_sku_pages'
      await readSelectableSkuCatalog(request, runtime.value.environment.apiBaseUrl, session.sessionRef)
    }

    console.log(JSON.stringify({
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
      productionBusinessMutationNetworkRequests: 0,
      quoteWriteWorkflowUploadCustomerInteractionRequests: 0,
    }))
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
    productionBusinessMutationNetworkRequests: 0,
  }))
  process.exitCode = 1
}).then(() => process.exit(process.exitCode ?? 0))
