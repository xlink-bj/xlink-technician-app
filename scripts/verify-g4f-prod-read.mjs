import { currentFormDefPageDiagnostics, currentFormDefRequestBody, isAllowedCurrentFormDefRead, verifyCurrentFormDefPage } from './lib/r1-current-formdef-read.mjs'
import { createR1BoundedConfigEvidence } from './lib/r1-bounded-config-evidence.mjs'
import { createServer, loadEnv } from 'vite'
import { resolve } from 'node:path'
import { isAllowedWorkOrderListRequest } from './r1-order-contract-read-guard.mjs'
import {
  isAllowedR1SelectableCatalogPageRequest,
  isAllowedR1SelectableCatalogSkuPageRequest,
  isAllowedR1SelectablePackageSkuPageRequest,
} from './r1-selectable-catalog-read-guard.mjs'
import {
  createRoleVisibleCatalogContextSelector,
  parseCatalogContextAuditArgs,
} from './g4f-prod-read-context-scope.mjs'
import { workOrderOrderLineageReadState } from './g4f-prod-read-summary.mjs'
import { inspectDirectMaterialOrderPage } from './g4f-direct-material-order-discovery.mjs'
import {
  hasRequestedDirectProviderLines,
  inspectDirectProviderOrderPage,
} from './g4f-direct-provider-order-discovery.mjs'
import { summarizeDirectMaterialPriceSnapshots } from './g4f-order-material-price-comparison.mjs'
import { summarizePackagePriceSnapshots } from './g4f-order-package-price-comparison.mjs'
import { summarizeDirectProviderPriceSnapshots } from './g4f-order-provider-price-comparison.mjs'
import {
  buildOrderExtFieldRequestBody,
  effectiveOrderExtFieldProviderPlan,
  isAllowedEffectiveOrderCascadeProviderRequest,
  isAllowedEffectiveOrderCodeProviderRequest,
  isAllowedEffectiveOrderExtFieldRequest,
  sanitizeOrderCascadeProviderResponse,
  sanitizeOrderCodeProviderResponse,
  summarizeEffectiveOrderExtFieldPage,
} from './lib/g4f-order-extfield-shape.mjs'

const MAX_WORK_ORDER_PAGES = 1000
const MAX_CATALOG_PAGES = 50
const MAX_PACKAGE_DETAIL_READS = 200
const MAX_SELECTABLE_SKU_SPUS = 500
const MAX_SELECTABLE_SKU_REQUESTS = 1000
const MAX_ORDER_SEARCH_WORK_ORDERS = 121
const MAX_ORDER_SEARCH_PAGES = Math.ceil(MAX_ORDER_SEARCH_WORK_ORDERS / 3)
const MAX_QUOTATION_LIST_READS = MAX_ORDER_SEARCH_WORK_ORDERS
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
  orderExtFields: 0,
  orderCodeOptions: 0,
  orderCascadeOptions: 0,
  catalogFilterCodeOptions: 0,
  materialCodeOptions: 0,
  materialSkuList: 0,
}
const boundedEvidence = createR1BoundedConfigEvidence()
let loginRequests = 0
let blockedUnexpectedNetworkRequests = 0
const blockedUnexpectedRoutes = Object.create(null)
const blockedUnexpectedStages = Object.create(null)
let stage = 'vite_start'
const listedWorkOrderIds = new Set()
const workOrderAuthorityById = new Map()
const listedPackageIds = new Set()
const packageDetailLookupIds = new Set()
const listedCatalogSpuIds = new Set()
const directMaterialSpuIds = new Set()
const packageMaterialSpuIdsByPackage = new Map()
const catalogSkuNextPageBySpu = new Map()
const catalogPageByPath = new Map()
const listedMaterialSalesCodeIds = new Set()
const attemptedSkuSpuIds = new Set()
const completedSkuSpuIds = new Set()
const activeSkuRows = []
const orderLineageByWorkOrder = new Map()
const orderReadStatesByWorkOrder = new Map()
let materialSalesNextPage = 1
let selectedCatalogContext = null
let selectedCatalogWorkOrderId = null
let selectedCatalogContextOrdinal = null
let currentFormDefOnlyRequested = false
let authorizedCurrentFormDefId = null
let currentFormDefReads = 0
let activeOrderFieldsOnlyRequested = false
let selectedOrderMaterialPriceComparisonRequested = false
let selectedOrderPackagePriceComparisonRequested = false
let selectedOrderProcedureMeasurePriceComparisonRequested = false
let directMaterialOrderDiscoveryRequested = false
let directProviderOrderDiscoveryRequested = false
let directMeasureOrderDiscoveryRequested = false
let activeOrderCodeProviderIds = []
let activeOrderCascadeProviderIds = []
let expectedOrderCascadeTenantId = null
let orderIdentitySearchState = 'NOT_RUN'
let orderIdentityCandidateWorkOrderId = null
let selectedWorkOrderIsCurrent = () => false
let selectedWorkOrderOrderPage = null
let selectedWorkOrderOrderReadState = 'NOT_RUN'
const selectedContextDirectMaterialRows = []
const selectedOrderDirectMaterialSpuIds = new Set()
const selectedOrderPackageIds = new Set()
const selectedOrderCatalogPackageRows = []
const selectedOrderCatalogProcedureRows = []
const selectedOrderCatalogMeasureRows = []
const selectedOrderPackageDetails = []
let selectedOrderDirectMaterialSpusInCatalog = 0
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
  effectiveOrderExtFields: { state: 'NOT_RUN', summary: null },
  effectiveOrderOptionProviders: {
    code: { state: 'NOT_RUN', providers: 0, missingProviders: 0, options: 0, emptyProviders: 0 },
    cascade: { state: 'NOT_RUN', providers: 0, missingProviders: 0, nodes: 0, leaves: 0, maxDepth: 0, terminalNodesWithEmptyChildren: 0 },
  },
  catalogFilterOptions: {
    state: 'NOT_RUN',
    packageParts: 0, packageTypes: 0, packageAgeLimits: 0,
    procedures: 0, materials: 0, packageMaterialLayers: 0,
  },
  selectableSkuCatalog: {
    uniqueSpus: 0, attemptedSpus: 0, succeededSpus: 0, failedSpus: 0,
    activeSkuRows: 0, emptySpus: 0, pagesRead: 0, complete: false,
    reason: 'NOT_RUN',
  },
  catalogContextVerified: false,
  catalogContextDiscovery: {
    requestedOrdinal: 1,
    distinctPlaceOrderContextsSeen: 0,
    selectedOrdinal: null,
  },
  workOrderScopedTypeOneQuoteRows: 0,
  quotesMatchingSampledWorkOrders: 0,
  quotesWithSkuOrSpuIdentity: 0,
  quotesWithGroupedContent: 0,
  recognizedQuotationGroups: 0,
  recognizedQuotationLines: 0,
  unsupportedQuotationGroups: 0,
  quotesWithPdfField: 0,
  sampledWorkOrderOrderLineage: {
    state: 'NOT_RUN',
    workOrdersRead: 0,
    workOrdersWithOrders: 0,
    workOrdersWithSkuAndSpuLine: 0,
    orderRows: 0,
    distinctMaterialSpus: 0,
    distinctSkuIds: 0,
    distinctMaterialSpuCodes: 0,
    distinctMaterialSkuCodes: 0,
    materialLinesWithBothIds: 0,
    materialLinesWithBothCodes: 0,
    materialLinesWithSpuIdAndSkuCode: 0,
    sameLineSpuIdSkuCodePairs: 0,
    selectedCatalogSpuMatches: 0,
    selectedCatalogCompletedSkuSpuReads: 0,
    currentSkuRowsForOrderSpus: 0,
    persistedSkuIdsFoundInCurrentRows: 0,
  },
  sampledOrderMaterialLineage: {
    state: 'NOT_RUN',
    orderRows: 0,
    distinctMaterialSpus: 0,
    distinctSkuIds: 0,
    distinctMaterialSpuCodes: 0,
    distinctMaterialSkuCodes: 0,
    materialLinesWithBothIds: 0,
    materialLinesWithBothCodes: 0,
    materialLinesWithSpuIdAndSkuCode: 0,
    sameLineSpuIdSkuCodePairs: 0,
    catalogSpuMatches: 0,
    attemptedSkuSpuReads: 0,
    completedSkuSpuReads: 0,
    currentSkuRowsForOrderSpus: 0,
    persistedSkuIdsFoundInCurrentRows: 0,
  },
  orderIdentityDiscovery: {
    state: 'NOT_RUN',
    workOrdersSearched: 0,
    orderListPagesRead: 0,
    orderRowsRead: 0,
    workOrdersWithOrders: 0,
    workOrdersWithSkuAndSpuLine: 0,
    pairedMaterialSpus: 0,
    pairedSkuIds: 0,
    pairedMaterialSpuCodes: 0,
    pairedMaterialSkuCodes: 0,
    materialLinesWithBothCodes: 0,
    materialLinesWithSpuIdAndSkuCode: 0,
    uniqueSpuIdsWithSkuCodes: 0,
    uniqueSkuCodesWithSpuIds: 0,
    sameLineSpuIdSkuCodePairs: 0,
    spuIdsWithSkuCodesInSelectedCatalog: 0,
    spuIdsWithSkuCodesWithCompletedSkuRead: 0,
    currentSkuRowsForSpuIdSkuCodePairs: 0,
    materialSkuCodesFoundInCurrentRows: 0,
    pairedSpusInSelectedCatalog: 0,
    pairedSpusWithCompletedSkuRead: 0,
    currentSkuRowsForPairedSpus: 0,
    pairedSkuIdsFoundInCurrentRows: 0,
    workOrderPagesReadForSearch: 0,
    orderListsTruncatedAtThree: 0,
    matchedOrderIsCurrentPlaceOrder: false,
  },
  directMaterialOrderDiscovery: {
    state: 'NOT_RUN',
    roleVisibleWorkOrdersInspected: 0,
    roleVisibleCatalogContextsQueried: 0,
    distinctRoleVisibleCatalogContextsSeen: 0,
    workOrdersWithoutCatalogContext: 0,
    orderListsRead: 0,
    orderRowsRead: 0,
    orderListsTruncatedAtThree: 0,
    directMaterialCandidates: 0,
    workOrderLimit: MAX_ORDER_SEARCH_WORK_ORDERS,
  },
  directProviderOrderDiscovery: {
    state: 'NOT_RUN',
    requestedKind: 'NOT_REQUESTED',
    roleVisibleWorkOrdersInspected: 0,
    roleVisibleCatalogContextsQueried: 0,
    distinctRoleVisibleCatalogContextsSeen: 0,
    workOrdersWithoutCatalogContext: 0,
    orderListsRead: 0,
    orderRowsRead: 0,
    orderListsTruncatedAtThree: 0,
    directProcedureCandidates: 0,
    directMeasureCandidates: 0,
    workOrderLimit: MAX_ORDER_SEARCH_WORK_ORDERS,
  },
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
    && body.get('rows') === '3'
    && body.get('sortField') === 'createTime'
    && body.get('sortOrder') === 'desc'
    && body.get('is:type|integer#and') === '1'
    && workOrderId !== null
    && listedWorkOrderIds.has(workOrderId)
}

function r1CatalogFilterCodeIds(serviceType) {
  const packageParts = serviceType === '11' || serviceType === '12'
    ? 'partsOne' : serviceType === '40' ? 'refreshParts' : 'constructionParts'
  const materials = serviceType === '40' ? 'type2' : 'type1'
  return ['packageType', materials, packageParts, 'repairProcedure', 'agelimitFilter', 'maintenanceLayer']
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
    if (routeCounts.quotationList >= MAX_QUOTATION_LIST_READS || !isApprovedWorkOrderQuoteQuery(request)) return null
    if (!(directMaterialOrderDiscoveryRequested || directProviderOrderDiscoveryRequested)
      && (selectedOrderMaterialPriceComparisonRequested || selectedOrderPackagePriceComparisonRequested
        || selectedOrderProcedureMeasurePriceComparisonRequested)
      && (routeCounts.quotationList !== 0
        || new URLSearchParams(request.data).get('is:serviceAppointmentId|string#and') !== selectedCatalogWorkOrderId)) return null
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
    if (currentFormDefOnlyRequested) {
      if (!authorizedCurrentFormDefId || authIdentityChanged() || currentFormDefReads !== 0 || !isAllowedCurrentFormDefRead(request.data, authorizedCurrentFormDefId)) return null
      currentFormDefReads += 1
      return 'read'
    }
    const body = typeof request.data === 'string' ? new URLSearchParams(request.data) : new URLSearchParams()
    if (body.get('colName') === 'order') {
      if (!activeOrderFieldsOnlyRequested
        || !selectedCatalogContext || !selectedWorkOrderIsCurrent() || authIdentityChanged()
        || routeCounts.orderExtFields !== 0
        || !isAllowedEffectiveOrderExtFieldRequest({
          path: relativePath,
          method: request.method,
          search: url.search,
          body,
          currentWorkOrder: true,
        })) return null
      routeCounts.orderExtFields += 1
      return 'read'
    }
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
    if (activeOrderFieldsOnlyRequested && activeOrderCodeProviderIds.length > 0) {
      if (!selectedCatalogContext || !selectedWorkOrderIsCurrent() || authIdentityChanged()
        || routeCounts.orderCodeOptions !== 0
        || !isAllowedEffectiveOrderCodeProviderRequest({
          path: relativePath, method: request.method, search: url.search,
          body, currentWorkOrder: true, expectedIds: activeOrderCodeProviderIds,
        })) return null
      routeCounts.orderCodeOptions += 1
      return 'read'
    }
    if (!selectedCatalogContext || !selectedWorkOrderIsCurrent()
      || [...body.keys()].sort().join(',') !== 'jsonPara,tenantId'
      || body.get('tenantId') !== '1340835581184723420') return null
    let providers
    try { providers = JSON.parse(body.get('jsonPara') ?? '') } catch { return null }
    if (!Array.isArray(providers) || providers.length < 1 || providers.length > 30) return null
    const ids = []
    for (const provider of providers) {
      if (!provider || typeof provider !== 'object' || Array.isArray(provider)
        || Object.keys(provider).sort().join(',') !== 'codeId,eleid'
        || typeof provider.codeId !== 'string' || provider.codeId !== provider.eleid
        || ids.includes(provider.codeId)) return null
      ids.push(provider.codeId)
    }
    const expectedCatalogIds = r1CatalogFilterCodeIds(selectedCatalogContext.serviceType)
    const isR1CatalogFilterRead = ids.length === expectedCatalogIds.length
      && ids.every((id, index) => id === expectedCatalogIds[index])
    if (isR1CatalogFilterRead && routeCounts.catalogFilterCodeOptions === 0) {
      routeCounts.catalogFilterCodeOptions += 1
      return 'read'
    }
    const isVerifiedMaterialSalesRead = ids.every(id => listedMaterialSalesCodeIds.has(id))
    if (isVerifiedMaterialSalesRead && routeCounts.materialCodeOptions === 0) {
      routeCounts.materialCodeOptions += 1
      return 'read'
    }
    return null
  }
  if (relativePath === 'i/code/selectMultistageCode.do') {
    const body = typeof request.data === 'string' ? new URLSearchParams(request.data) : new URLSearchParams()
    if (!activeOrderFieldsOnlyRequested || activeOrderCascadeProviderIds.length === 0
      || !selectedCatalogContext || !selectedWorkOrderIsCurrent() || authIdentityChanged()
      || routeCounts.orderCascadeOptions !== 0
      || !expectedOrderCascadeTenantId
      || !isAllowedEffectiveOrderCascadeProviderRequest({
        path: relativePath, method: request.method, search: url.search,
        body, currentWorkOrder: true, expectedTypes: activeOrderCascadeProviderIds,
        tenantId: expectedOrderCascadeTenantId,
      })) return null
    routeCounts.orderCascadeOptions += 1
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
      if (url.pathname.endsWith('/biz/extField/query')) {
        const requestBody = typeof options.data === 'string' ? new URLSearchParams(options.data) : new URLSearchParams()
        if (requestBody.get('colName') === 'order') {
          if (activeOrderFieldsOnlyRequested) boundedEvidence.fieldPage(data, { serviceType: selectedCatalogContext?.serviceType ?? '' })
          const summary = summarizeEffectiveOrderExtFieldPage(data, {
            serviceType: selectedCatalogContext?.serviceType ?? '',
          })
          responseCounts.effectiveOrderExtFields = {
            state: summary.ok ? summary.truncated ? 'TRUNCATED' : 'SUCCEEDED' : 'INVALID_RESPONSE',
            summary: summary.ok ? summary : { reason: summary.reason },
          }
          const providers = effectiveOrderExtFieldProviderPlan(data, {
            serviceType: selectedCatalogContext?.serviceType ?? '',
          })
          if (providers.ok) {
            activeOrderCodeProviderIds = [...providers.codeIds]
            activeOrderCascadeProviderIds = [...providers.cascadeIds]
          } else {
            responseCounts.effectiveOrderOptionProviders.code = {
              state: 'BLOCKED_PROVIDER_PLAN', providers: 0, missingProviders: 0, options: 0, emptyProviders: 0,
            }
            responseCounts.effectiveOrderOptionProviders.cascade = {
              state: 'BLOCKED_PROVIDER_PLAN', providers: 0, missingProviders: 0, nodes: 0, leaves: 0, maxDepth: 0, terminalNodesWithEmptyChildren: 0,
            }
          }
        } else {
          rememberVerifiedMaterialSalesCodeIds(data)
        }
      }
      if (activeOrderFieldsOnlyRequested && url.pathname.endsWith('/i/code/selectCode.do')) boundedEvidence.code(data, activeOrderCodeProviderIds)
      if (activeOrderFieldsOnlyRequested && url.pathname.endsWith('/i/code/selectMultistageCode.do')) boundedEvidence.cascade(data, activeOrderCascadeProviderIds)
      options.success?.({ statusCode: response.status, data })
    }).catch(() => {
      options.fail?.(new Error('Read-only smoke network request failed'))
    }).finally(() => clearTimeout(timer))
    return { abort: () => controller.abort() }
  }
}

function requestReadOnce(request, apiBaseUrl, sessionRef, path, body) {
  const endpoint = new URL(path, `${apiBaseUrl.replace(/\/+$/, '')}/`)
  const encoded = new URLSearchParams(Object.entries(body)).toString()
  return new Promise((resolveResponse) => {
    request({
      url: endpoint.href,
      method: 'POST',
      data: encoded,
      header: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: `JSESSIONID=${sessionRef}`,
        Accept: 'application/json',
      },
      success: resolveResponse,
      fail: () => resolveResponse(null),
    })
  })
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
    query.ids.forEach(id => {
      attemptedSpuIds.add(id)
      attemptedSkuSpuIds.add(id)
    })
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
        activeSkuRows.push({ skuId: row.id, spuId: row.spuId, ...(row.code ? { code: row.code } : {}) })
      }
    }
    query.ids.forEach(id => succeededSpuIds.add(id))
    query.ids.forEach(id => completedSkuSpuIds.add(id))
    summary.succeededSpus = succeededSpuIds.size
  }
  summary.failedSpus = failedSpuIds.size
  summary.emptySpus = [...succeededSpuIds].filter(id => !foundSpuIds.has(id)).length
  summary.complete = true
  summary.reason = 'ALL_ROLE_LISTED_MATERIAL_AND_PACKAGE_SPUS_READ'
}

function orderMaterialLineage(lines, target) {
  for (const line of lines) {
    if (line.kind === 'material') {
      if (line.identity.spuId) target.spuIds.add(line.identity.spuId)
      if (line.identity.skuId) target.skuIds.add(line.identity.skuId)
      if (line.identity.spuId && line.identity.skuId) {
        target.linesWithBothIds += 1
        target.pairedSpuIds.add(line.identity.spuId)
        target.pairedSkuIds.add(line.identity.skuId)
      }
      if (line.identity.spuCode) target.spuCodes.add(line.identity.spuCode)
      if (line.identity.skuCode) target.skuCodes.add(line.identity.skuCode)
      if (line.identity.spuCode && line.identity.skuCode) {
        target.linesWithBothCodes += 1
        target.pairedSpuCodes.add(line.identity.spuCode)
        target.pairedSkuCodes.add(line.identity.skuCode)
      }
      if (line.identity.spuId && line.identity.skuCode) {
        target.linesWithSpuIdAndSkuCode += 1
        target.spuIdsWithSkuCodes.add(line.identity.spuId)
        target.skuCodesWithSpuIds.add(line.identity.skuCode)
        target.spuIdSkuCodePairs.add(JSON.stringify([line.identity.spuId, line.identity.skuCode]))
      }
    }
    orderMaterialLineage(line.children, target)
  }
}

function recordWorkOrderOrderLineage(workOrderId, page) {
  const existing = orderLineageByWorkOrder.get(workOrderId) ?? {
    orderRows: 0,
    orderIds: new Set(),
    totalCount: undefined,
    duplicateOrderIds: false,
    inconsistentTotalCount: false,
    spuIds: new Set(),
    skuIds: new Set(),
    pairedSpuIds: new Set(),
    pairedSkuIds: new Set(),
    spuCodes: new Set(),
    skuCodes: new Set(),
    pairedSpuCodes: new Set(),
    pairedSkuCodes: new Set(),
    linesWithBothIds: 0,
    linesWithBothCodes: 0,
    spuIdsWithSkuCodes: new Set(),
    skuCodesWithSpuIds: new Set(),
    spuIdSkuCodePairs: new Set(),
    linesWithSpuIdAndSkuCode: 0,
    truncated: false,
  }
  if (page.totalCount !== undefined) {
    if (existing.totalCount !== undefined && existing.totalCount !== page.totalCount) {
      existing.inconsistentTotalCount = true
    }
    existing.totalCount = page.totalCount
  }
  for (const quote of page.items) {
    if (quote.serviceAppointmentId !== workOrderId) continue
    if (existing.orderIds.has(quote.id)) {
      existing.duplicateOrderIds = true
      continue
    }
    existing.orderIds.add(quote.id)
    existing.orderRows += 1
    for (const group of quote.groups) orderMaterialLineage(group.lines, existing)
  }
  existing.truncated = existing.totalCount !== undefined
    ? existing.totalCount > existing.orderIds.size
    : page.items.length >= 3
  orderLineageByWorkOrder.set(workOrderId, existing)
  return existing
}

function recordWorkOrderOrderRead(workOrderId, result) {
  if (result.state === 'succeeded' && result.data) {
    const lineage = recordWorkOrderOrderLineage(workOrderId, result.data)
    orderReadStatesByWorkOrder.set(workOrderId,
      lineage.duplicateOrderIds || lineage.inconsistentTotalCount ? 'FAILED_TERMINAL' : operationState(result))
  } else {
    orderReadStatesByWorkOrder.set(workOrderId, operationState(result))
  }
}

function projectOrderIdentityDiscovery() {
  const identityDiscovery = responseCounts.orderIdentityDiscovery
  const pairedSpuIds = new Set()
  const pairedSkuIds = new Set()
  const pairedSpuCodes = new Set()
  const pairedSkuCodes = new Set()
  const spuIdsWithSkuCodes = new Set()
  const skuCodesWithSpuIds = new Set()
  const spuIdSkuCodePairs = new Set()
  let orderRows = 0
  let workOrdersWithOrders = 0
  let workOrdersWithSkuAndSpuLine = 0
  let materialLinesWithBothCodes = 0
  let materialLinesWithSpuIdAndSkuCode = 0
  let truncatedOrderLists = 0
  let orderListPagesRead = 0
  for (const lineageItem of orderLineageByWorkOrder.values()) {
    orderListPagesRead += 1
    orderRows += lineageItem.orderRows
    if (lineageItem.orderRows > 0) workOrdersWithOrders += 1
    if (lineageItem.linesWithBothIds > 0) workOrdersWithSkuAndSpuLine += 1
    materialLinesWithBothCodes += lineageItem.linesWithBothCodes
    materialLinesWithSpuIdAndSkuCode += lineageItem.linesWithSpuIdAndSkuCode
    if (lineageItem.truncated) truncatedOrderLists += 1
    lineageItem.pairedSpuIds.forEach(id => pairedSpuIds.add(id))
    lineageItem.pairedSkuIds.forEach(id => pairedSkuIds.add(id))
    lineageItem.pairedSpuCodes.forEach(code => pairedSpuCodes.add(code))
    lineageItem.pairedSkuCodes.forEach(code => pairedSkuCodes.add(code))
    lineageItem.spuIdsWithSkuCodes.forEach(id => spuIdsWithSkuCodes.add(id))
    lineageItem.skuCodesWithSpuIds.forEach(code => skuCodesWithSpuIds.add(code))
    lineageItem.spuIdSkuCodePairs.forEach(pair => spuIdSkuCodePairs.add(pair))
  }
  identityDiscovery.state = orderIdentitySearchState
  identityDiscovery.workOrdersSearched = orderReadStatesByWorkOrder.size
  identityDiscovery.orderListPagesRead = orderListPagesRead
  identityDiscovery.orderRowsRead = orderRows
  identityDiscovery.workOrdersWithOrders = workOrdersWithOrders
  identityDiscovery.workOrdersWithSkuAndSpuLine = workOrdersWithSkuAndSpuLine
  identityDiscovery.pairedMaterialSpus = pairedSpuIds.size
  identityDiscovery.pairedSkuIds = pairedSkuIds.size
  identityDiscovery.pairedMaterialSpuCodes = pairedSpuCodes.size
  identityDiscovery.pairedMaterialSkuCodes = pairedSkuCodes.size
  identityDiscovery.materialLinesWithBothCodes = materialLinesWithBothCodes
  identityDiscovery.materialLinesWithSpuIdAndSkuCode = materialLinesWithSpuIdAndSkuCode
  identityDiscovery.uniqueSpuIdsWithSkuCodes = spuIdsWithSkuCodes.size
  identityDiscovery.uniqueSkuCodesWithSpuIds = skuCodesWithSpuIds.size
  identityDiscovery.sameLineSpuIdSkuCodePairs = spuIdSkuCodePairs.size
  identityDiscovery.orderListsTruncatedAtThree = truncatedOrderLists
  identityDiscovery.matchedOrderIsCurrentPlaceOrder = Boolean(orderIdentityCandidateWorkOrderId
    && orderIdentityCandidateWorkOrderId === selectedCatalogWorkOrderId)
  const candidate = orderIdentityCandidateWorkOrderId
    ? orderLineageByWorkOrder.get(orderIdentityCandidateWorkOrderId)
    : undefined
  if (candidate) {
    identityDiscovery.pairedSpusInSelectedCatalog = [...candidate.pairedSpuIds].filter(id => listedCatalogSpuIds.has(id)).length
    identityDiscovery.pairedSpusWithCompletedSkuRead = [...candidate.pairedSpuIds].filter(id => completedSkuSpuIds.has(id)).length
    identityDiscovery.currentSkuRowsForPairedSpus = activeSkuRows.filter(row => candidate.pairedSpuIds.has(row.spuId)).length
    identityDiscovery.pairedSkuIdsFoundInCurrentRows = activeSkuRows.filter(row => candidate.pairedSkuIds.has(row.skuId)).length
  }
  identityDiscovery.spuIdsWithSkuCodesInSelectedCatalog = [...spuIdsWithSkuCodes].filter(id => listedCatalogSpuIds.has(id)).length
  identityDiscovery.spuIdsWithSkuCodesWithCompletedSkuRead = [...spuIdsWithSkuCodes].filter(id => completedSkuSpuIds.has(id)).length
  identityDiscovery.currentSkuRowsForSpuIdSkuCodePairs = activeSkuRows.filter(row => spuIdsWithSkuCodes.has(row.spuId)).length
  identityDiscovery.materialSkuCodesFoundInCurrentRows = [...pairedSkuCodes].filter(code =>
    activeSkuRows.some(row => row.code === code)).length
}

function projectSelectedWorkOrderOrderLineage() {
  projectOrderIdentityDiscovery()
  const sampled = responseCounts.sampledWorkOrderOrderLineage
  const sampledSpuIds = new Set()
  const sampledSkuIds = new Set()
  let sampledOrderRows = 0
  let workOrdersWithOrders = 0
  let workOrdersWithSkuAndSpuLine = 0
  let materialLinesWithBothIds = 0
  const sampledSpuCodes = new Set()
  const sampledSkuCodes = new Set()
  let materialLinesWithBothCodes = 0
  const sampledSpuIdsWithSkuCodes = new Set()
  const sampledSkuCodesWithSpuIds = new Set()
  const sampledSpuIdSkuCodePairs = new Set()
  let materialLinesWithSpuIdAndSkuCode = 0
  for (const [workOrderId, readState] of orderReadStatesByWorkOrder) {
    if (readState !== 'SUCCEEDED') continue
    const lineage = orderLineageByWorkOrder.get(workOrderId)
    if (!lineage) continue
    sampledOrderRows += lineage.orderRows
    if (lineage.orderRows > 0) workOrdersWithOrders += 1
    if (lineage.linesWithBothIds > 0) workOrdersWithSkuAndSpuLine += 1
    materialLinesWithBothIds += lineage.linesWithBothIds
    lineage.spuIds.forEach(id => sampledSpuIds.add(id))
    lineage.skuIds.forEach(id => sampledSkuIds.add(id))
    lineage.spuCodes.forEach(code => sampledSpuCodes.add(code))
    lineage.skuCodes.forEach(code => sampledSkuCodes.add(code))
    materialLinesWithBothCodes += lineage.linesWithBothCodes
    materialLinesWithSpuIdAndSkuCode += lineage.linesWithSpuIdAndSkuCode
    lineage.spuIdsWithSkuCodes.forEach(id => sampledSpuIdsWithSkuCodes.add(id))
    lineage.skuCodesWithSpuIds.forEach(code => sampledSkuCodesWithSpuIds.add(code))
    lineage.spuIdSkuCodePairs.forEach(pair => sampledSpuIdSkuCodePairs.add(pair))
  }
  sampled.state = workOrderOrderLineageReadState(orderReadStatesByWorkOrder.values())
  sampled.workOrdersRead = orderReadStatesByWorkOrder.size
  sampled.workOrdersWithOrders = workOrdersWithOrders
  sampled.workOrdersWithSkuAndSpuLine = workOrdersWithSkuAndSpuLine
  sampled.orderRows = sampledOrderRows
  sampled.distinctMaterialSpus = sampledSpuIds.size
  sampled.distinctSkuIds = sampledSkuIds.size
  sampled.distinctMaterialSpuCodes = sampledSpuCodes.size
  sampled.distinctMaterialSkuCodes = sampledSkuCodes.size
  sampled.materialLinesWithBothIds = materialLinesWithBothIds
  sampled.materialLinesWithBothCodes = materialLinesWithBothCodes
  sampled.materialLinesWithSpuIdAndSkuCode = materialLinesWithSpuIdAndSkuCode
  sampled.sameLineSpuIdSkuCodePairs = sampledSpuIdSkuCodePairs.size
  sampled.selectedCatalogSpuMatches = [...sampledSpuIds].filter(id => listedCatalogSpuIds.has(id)).length
  sampled.selectedCatalogCompletedSkuSpuReads = [...sampledSpuIds].filter(id => completedSkuSpuIds.has(id)).length
  sampled.currentSkuRowsForOrderSpus = activeSkuRows.filter(row => sampledSpuIds.has(row.spuId)).length
  sampled.persistedSkuIdsFoundInCurrentRows = activeSkuRows.filter(row => sampledSkuIds.has(row.skuId)).length

  const report = responseCounts.sampledOrderMaterialLineage
  if (!selectedCatalogWorkOrderId) return
  const readState = orderReadStatesByWorkOrder.get(selectedCatalogWorkOrderId)
  if (readState !== 'SUCCEEDED') {
    if (readState) report.state = readState
    return
  }
  const lineage = orderLineageByWorkOrder.get(selectedCatalogWorkOrderId)
  if (!lineage) {
    report.state = 'SUCCEEDED_EMPTY'
    return
  }
  report.state = lineage.orderRows > 0 ? 'SUCCEEDED_WITH_ORDER' : 'SUCCEEDED_EMPTY'
  report.orderRows = lineage.orderRows
  report.distinctMaterialSpus = lineage.spuIds.size
  report.distinctSkuIds = lineage.skuIds.size
  report.distinctMaterialSpuCodes = lineage.spuCodes.size
  report.distinctMaterialSkuCodes = lineage.skuCodes.size
  report.materialLinesWithBothIds = lineage.linesWithBothIds
  report.materialLinesWithBothCodes = lineage.linesWithBothCodes
  report.materialLinesWithSpuIdAndSkuCode = lineage.linesWithSpuIdAndSkuCode
  report.sameLineSpuIdSkuCodePairs = lineage.spuIdSkuCodePairs.size
  report.catalogSpuMatches = [...lineage.spuIds].filter(id => listedCatalogSpuIds.has(id)).length
  report.attemptedSkuSpuReads = [...lineage.spuIds].filter(id => attemptedSkuSpuIds.has(id)).length
  report.completedSkuSpuReads = [...lineage.spuIds].filter(id => completedSkuSpuIds.has(id)).length
  report.currentSkuRowsForOrderSpus = activeSkuRows.filter(row => lineage.spuIds.has(row.spuId)).length
  report.persistedSkuIdsFoundInCurrentRows = activeSkuRows.filter(row => lineage.skuIds.has(row.skuId)).length
  if (lineage.orderRows === 0) report.state = 'SUCCEEDED_EMPTY'
}

let getCurrentAuthIdentity = () => null
function authIdentityChanged() {
  const identity = getCurrentAuthIdentity()
  return !identity || identity !== expectedAuthIdentity
}
let expectedAuthIdentity = null

async function run() {
  const argumentsWithoutSeparator = process.argv.slice(2).filter(argument => argument !== '--')
  currentFormDefOnlyRequested = argumentsWithoutSeparator.includes('--current-node-formdef-only')
  const catalogAuditOptions = parseCatalogContextAuditArgs(argumentsWithoutSeparator.filter(arg => arg !== '--current-node-formdef-only'))
  if (currentFormDefOnlyRequested && argumentsWithoutSeparator.some(arg => !['--current-node-formdef-only','--preflight-only','--authorize-bounded-prod-read'].includes(arg))) throw new Error('INCOMPATIBLE_FORMDEF_AUDIT_FLAGS')
  activeOrderFieldsOnlyRequested = catalogAuditOptions.activeOrderFieldsOnly
  selectedOrderMaterialPriceComparisonRequested = catalogAuditOptions.compareSelectedOrderMaterialPrices
  selectedOrderPackagePriceComparisonRequested = catalogAuditOptions.compareSelectedOrderPackagePrices
  selectedOrderProcedureMeasurePriceComparisonRequested = catalogAuditOptions.compareSelectedOrderProcedureMeasurePrices
  directMaterialOrderDiscoveryRequested = catalogAuditOptions.discoverDirectMaterialOrder
  directMeasureOrderDiscoveryRequested = catalogAuditOptions.discoverDirectMeasureOrder
  directProviderOrderDiscoveryRequested = catalogAuditOptions.discoverDirectProviderOrder
    || directMeasureOrderDiscoveryRequested
  if (directMaterialOrderDiscoveryRequested || directProviderOrderDiscoveryRequested) {
    responseCounts.catalogContextDiscovery.requestedOrdinal = null
    if (directMaterialOrderDiscoveryRequested) responseCounts.directMaterialOrderDiscovery.state = 'SEARCHING_ROLE_VISIBLE_ORDER_SCOPE'
    if (directProviderOrderDiscoveryRequested) responseCounts.directProviderOrderDiscovery.state = directMeasureOrderDiscoveryRequested
      ? 'SEARCHING_ROLE_VISIBLE_MEASURE_ORDER_SCOPE' : 'SEARCHING_ROLE_VISIBLE_PROVIDER_ORDER_SCOPE'
  if (directProviderOrderDiscoveryRequested) responseCounts.directProviderOrderDiscovery.requestedKind = directMeasureOrderDiscoveryRequested
    ? 'measure' : 'procedure_or_measure'
  }
  const authorizedRead = argumentsWithoutSeparator.includes('--authorize-bounded-prod-read')
  const preflightOnly = argumentsWithoutSeparator.includes('--preflight-only')
  if (!authorizedRead && !preflightOnly) {
    console.log(JSON.stringify({
      status: 'NO_NETWORK_DEFAULT',
      hint: 'Use --preflight-only for zero-network checks; explicit --authorize-bounded-prod-read is required for authenticated Production reads.',
      loginRequests: 0,
      blockedUnexpectedNetworkRequests: 0,
      productionBusinessMutationNetworkRequests: 0,
    }))
    return
  }
  const contextSelector = createRoleVisibleCatalogContextSelector(catalogAuditOptions.catalogContextOrdinal)
  responseCounts.catalogContextDiscovery.requestedOrdinal = directMaterialOrderDiscoveryRequested || directProviderOrderDiscoveryRequested
    ? null : catalogAuditOptions.catalogContextOrdinal
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
    expectedOrderCascadeTenantId = runtime.ok
      && typeof runtime.value.authWireConfig.tenant === 'string'
      && /^[A-Za-z0-9_-]{1,100}$/.test(runtime.value.authWireConfig.tenant)
      ? runtime.value.authWireConfig.tenant : null
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
          && workOrderAuthorityById.get(workOrderId)?.isWorkOrderListedForCurrentSession?.(workOrderId) === true,
      getOrderReadAuthorizationIdentity: () => getCurrentAuthIdentity(),
      request,
      timeoutMs: 20000,
    })
    const createTechnicianApi = () => createRoleScopedTechnicianApiReadAdapter(
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
    technicianApi = createTechnicianApi()
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
        && workOrderAuthorityById.get(workOrderId)?.isWorkOrderListedForCurrentSession?.(workOrderId) === true
        && !authIdentityChanged(),
    )
    const hasCatalogIdentity = (lines) => lines.some((line) => Boolean(line.identity.skuId || line.identity.spuId) || hasCatalogIdentity(line.children))
    const countLines = (lines) => lines.reduce((count, line) => count + 1 + countLines(line.children), 0)
    const recordQuotationRead = (workOrderId, quotes) => {
      recordWorkOrderOrderRead(workOrderId, quotes)
      if ((selectedOrderMaterialPriceComparisonRequested || selectedOrderPackagePriceComparisonRequested
        || selectedOrderProcedureMeasurePriceComparisonRequested)
        && workOrderId === selectedCatalogWorkOrderId) {
        selectedWorkOrderOrderReadState = operationState(quotes)
        selectedWorkOrderOrderPage = quotes.state === 'succeeded' && quotes.data ? quotes.data : null
        for (const order of selectedWorkOrderOrderPage?.items ?? []) {
          for (const group of order.groups) {
            for (const line of group.lines) {
              const spuId = line.kind === 'material' ? line.identity.spuId : undefined
              if (typeof spuId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(spuId)) {
                selectedOrderDirectMaterialSpuIds.add(spuId)
              }
              const packageId = line.kind === 'package' ? line.identity.providerRowId : undefined
              if (typeof packageId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(packageId)) {
                selectedOrderPackageIds.add(packageId)
              }
            }
          }
        }
      }
      if (quotes.state !== 'succeeded' || !quotes.data) return
      responseCounts.workOrderScopedTypeOneQuoteRows += quotes.data.items.length
      responseCounts.quotesMatchingSampledWorkOrders += quotes.data.items.filter((quote) => quote.serviceAppointmentId === workOrderId).length
      responseCounts.quotesWithSkuOrSpuIdentity += quotes.data.items.filter((quote) => quote.groups.some((group) => hasCatalogIdentity(group.lines))).length
      responseCounts.quotesWithGroupedContent += quotes.data.items.filter((quote) => quote.groups.length > 0).length
      responseCounts.recognizedQuotationGroups += quotes.data.items.reduce((count, quote) => count + quote.groups.filter((group) => group.contentSupported).length, 0)
      responseCounts.unsupportedQuotationGroups += quotes.data.items.reduce((count, quote) => count + quote.groups.filter((group) => !group.contentSupported).length, 0)
      responseCounts.recognizedQuotationLines += quotes.data.items.reduce((count, quote) => count + quote.groups.reduce((groupCount, group) => groupCount + countLines(group.lines), 0), 0)
      responseCounts.quotesWithPdfField += quotes.data.items.filter((quote) => quote.pdfState === 'present_no_access').length
    }

    if (currentFormDefOnlyRequested) {
      let inspected = 0, state = 'NO_CURRENT_FORMDEF_FOUND', pageNumber = 0, result = null, diagnostics = null
      const seen = new Set()
      discovery: for (let page = 1; page <= MAX_WORK_ORDER_PAGES; page++) {
        pageNumber = page
        const list = await technicianApi.listWorkOrders({ page, pageSize: 3 })
        if (authIdentityChanged() || list.state !== 'succeeded' || !list.data || list.data.items.length > 3) { state = 'LIST_READ_STOPPED'; break }
        for (const workOrder of list.data.items) {
          const id = String(workOrder.id)
          if (seen.has(id)) { state = 'DUPLICATE_WORK_ORDER_STOPPED'; break discovery }
          seen.add(id); listedWorkOrderIds.add(id); workOrderAuthorityById.set(id, technicianApi)
          const detail = await technicianApi.getWorkOrderDetail(workOrder.id)
          inspected++
          if (authIdentityChanged() || detail.state !== 'succeeded' || !detail.data || String(detail.data.id) !== id) { state = 'DETAIL_READ_STOPPED'; break discovery }
          const projection = detailWorkflowProjectionFor(detail.data, session)
          boundedEvidence.observeWorkflow(detail.data, projection)
          const matches = (detail.data.workflowNodes ?? []).filter(node => String(node.id) === String(projection.currentTask?.nodeId)
            && node.lifecycle === 'active' && node.formDefinitionId && node.runId && String(node.runId) === String(detail.data.workflowRunId))
          if (matches.length > 1) { state = 'AMBIGUOUS_NODE_STOPPED'; break discovery }
          if (matches.length === 1) {
            authorizedCurrentFormDefId = String(matches[0].formDefinitionId)
            const response = await requestReadOnce(request, runtime.value.environment.apiBaseUrl, session.sessionRef,
              'biz/extField/query', currentFormDefRequestBody(authorizedCurrentFormDefId))
            diagnostics = currentFormDefPageDiagnostics(response?.data, response?.statusCode)
            if (authIdentityChanged() || !response || response.statusCode < 200 || response.statusCode >= 300) { state = 'FIELD_READ_STOPPED'; break discovery }
            const verified = verifyCurrentFormDefPage(response.data, authorizedCurrentFormDefId)
            if (!verified.ok) { state = verified.reason; break discovery }
            boundedEvidence.fieldPage(response.data, { serviceType: '' })
            const snapshot = boundedEvidence.snapshot()
            result = { nodeType: ['forms','repeat','form'].includes(matches[0].sourceNodeType) ? matches[0].sourceNodeType : 'UNKNOWN', formPurpose: ['survey','inspection','appointment'].includes(matches[0].formPurpose) ? matches[0].formPurpose : 'UNKNOWN',
              fields: snapshot.fields, workflows: snapshot.workflows,
              providerReads: 'NOT_AUTHORIZED_BY_THIS_FIELD_ONLY_CAPTURE', customerValuesRead: false }
            state = 'CURRENT_FORMDEF_BOUNDED_FIELDS_COMPLETE'; break discovery
          }
        }
        if (list.data.items.length < 3 || page * 3 >= list.data.totalCount) break
      }
      console.log(JSON.stringify({ status: state, loginRequests, routeCounts, inspected, pageNumber, currentFormDefReads, diagnostics,
        blockedUnexpectedNetworkRequests, productionBusinessMutationNetworkRequests: 0, evidence: result }))
      if (state !== 'CURRENT_FORMDEF_BOUNDED_FIELDS_COMPLETE') process.exitCode = 1
      return
    }

    stage = 'work_order_list_read'
    const workOrders = await technicianApi.listWorkOrders({ page: 1, pageSize: 3 })
    responseCounts.workOrderListRows = workOrders.state === 'succeeded' && workOrders.data ? workOrders.data.items.length : 0
    responseCounts.workOrderPagesRead = workOrders.state === 'succeeded' && workOrders.data ? 1 : 0
    let lastWorkOrderPageRead = workOrders.state === 'succeeded' && workOrders.data ? 1 : 0
    const firstPageBounded = Boolean(workOrders.data && workOrders.data.items.length <= 3)
    if (firstPageBounded) {
      for (const workOrder of workOrders.data?.items ?? []) {
        const id = String(workOrder.id)
        listedWorkOrderIds.add(id)
        workOrderAuthorityById.set(id, technicianApi)
      }
    }

    const details = []
    const pageOneWorkOrders = firstPageBounded ? workOrders.data?.items ?? [] : []
    const selectedWorkOrderIds = new Set()
    const workOrderPageIds = new Set()
    let discoveryState = workOrders.state === 'succeeded' && workOrders.data ? 'SEARCHING' : operationState(workOrders)
    let catalogContextDiscoveryIncomplete = false
    let roleVisibleWorkOrdersInspected = 0
    const quotationCatalogContextFor = (workOrder, detail) => {
      if (detail.state !== 'succeeded' || !detail.data) return null
      const context = detail.data.quotationCatalogContext
      const completeContext = context?.workOrderId === String(workOrder.id)
        && typeof context.serviceType === 'string' && Boolean(context.serviceType.trim())
        && typeof context.sourceType === 'string' && Boolean(context.sourceType.trim())
      if (!completeContext) return null
      return context
    }
    const placeOrderContextFor = (workOrder, detail) => {
      if (detail.state !== 'succeeded' || !detail.data) return null
      const projection = detailWorkflowProjectionFor(detail.data, session)
      if (activeOrderFieldsOnlyRequested) boundedEvidence.observeWorkflow(detail.data, projection)
      const canPlaceOrder = projection.currentTask?.actionIntent === 'place_order'
        && projection.currentTask.execution === 'enabled'
      return canPlaceOrder ? quotationCatalogContextFor(workOrder, detail) : null
    }
    const selectCatalogContext = (workOrder, context, selection, authorizationApi) => {
      if (activeOrderFieldsOnlyRequested) boundedEvidence.selected(context)
      selectedCatalogContext = context
      selectedCatalogWorkOrderId = String(workOrder.id)
      selectedCatalogContextOrdinal = selection.ordinal
      responseCounts.catalogContextDiscovery.selectedOrdinal = selection.ordinal
      selectedWorkOrderIsCurrent = () => authorizationApi.isWorkOrderListedForCurrentSession?.(selectedCatalogWorkOrderId) === true
    }
    const considerCatalogContext = (workOrder, detail) => {
      const context = placeOrderContextFor(workOrder, detail)
      if (!context) return false
      const selection = contextSelector.consider(context, String(workOrder.id))
      responseCounts.catalogContextDiscovery.distinctPlaceOrderContextsSeen = contextSelector.distinctCount
      if (!selection.selected) return false
      selectCatalogContext(workOrder, context, selection, technicianApi)
      return true
    }
    const inspectDirectMaterialContextOrder = async (workOrder, detail, authorizationApi) => {
      const context = quotationCatalogContextFor(workOrder, detail)
      const workOrderId = String(workOrder.id)
      const selection = context ? contextSelector.consider(context, workOrderId) : null
      if (context) {
        responseCounts.directMaterialOrderDiscovery.distinctRoleVisibleCatalogContextsSeen = contextSelector.distinctCount
        responseCounts.directMaterialOrderDiscovery.roleVisibleCatalogContextsQueried += 1
      } else {
        responseCounts.directMaterialOrderDiscovery.workOrdersWithoutCatalogContext += 1
      }
      if (authIdentityChanged() || !listedWorkOrderIds.has(workOrderId)
        || authorizationApi.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) {
        responseCounts.directMaterialOrderDiscovery.state = 'AUTHORIZATION_SCOPE_UNAVAILABLE'
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'ROLE_LIST_AUTHORIZATION_UNAVAILABLE'
        return 'stop'
      }
      stage = `role_visible_direct_material_discovery_${responseCounts.directMaterialOrderDiscovery.orderListsRead + 1}`
      const quotes = await orderApi.listTypeOneOrdersForWorkOrder(workOrderId, 3)
      responseCounts.directMaterialOrderDiscovery.orderListsRead += 1
      if (quotes.state !== 'succeeded' || !quotes.data) {
        responseCounts.directMaterialOrderDiscovery.state = 'ORDER_READ_INCOMPLETE'
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'ORDER_READ_INCOMPLETE'
        return 'stop'
      }
      const inspection = inspectDirectMaterialOrderPage(workOrderId, quotes.data)
      responseCounts.directMaterialOrderDiscovery.orderRowsRead += inspection.orders
      const orderListTruncated = quotes.data.totalCount !== undefined
        ? quotes.data.totalCount > quotes.data.items.length
        : quotes.data.items.length >= 3
      if (orderListTruncated) responseCounts.directMaterialOrderDiscovery.orderListsTruncatedAtThree += 1
      if (inspection.state === 'ORDER_ASSOCIATION_CONFLICT') {
        responseCounts.directMaterialOrderDiscovery.state = 'ORDER_ASSOCIATION_CONFLICT'
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'ORDER_ASSOCIATION_CONFLICT'
        return 'stop'
      }
      if (inspection.state === 'UNKNOWN_INVALID_INPUT') {
        responseCounts.directMaterialOrderDiscovery.state = 'INVALID_ORDER_PAGE'
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'ORDER_PAGE_INVALID'
        return 'stop'
      }
      if (inspection.directMaterialLines === 0) {
        recordQuotationRead(workOrderId, quotes)
        return 'continue'
      }

      responseCounts.directMaterialOrderDiscovery.directMaterialCandidates += 1
      if (!context || !selection) {
        responseCounts.directMaterialOrderDiscovery.state = 'DIRECT_MATERIAL_FOUND_CONTEXT_UNKNOWN'
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'DIRECT_MATERIAL_FOUND_CONTEXT_UNKNOWN'
        return 'stop'
      }
      responseCounts.directMaterialOrderDiscovery.state = 'DIRECT_MATERIAL_ORDER_FOUND'
      selectCatalogContext(workOrder, context, selection, authorizationApi)
      discoveryState = 'DIRECT_MATERIAL_ORDER_FOUND'
      recordQuotationRead(workOrderId, quotes)
      return 'found'
    }
    const inspectDirectProviderContextOrder = async (workOrder, detail, authorizationApi) => {
      const context = quotationCatalogContextFor(workOrder, detail)
      const workOrderId = String(workOrder.id)
      const selection = context ? contextSelector.consider(context, workOrderId) : null
      if (context) {
        responseCounts.directProviderOrderDiscovery.distinctRoleVisibleCatalogContextsSeen = contextSelector.distinctCount
        responseCounts.directProviderOrderDiscovery.roleVisibleCatalogContextsQueried += 1
      } else {
        responseCounts.directProviderOrderDiscovery.workOrdersWithoutCatalogContext += 1
      }
      if (authIdentityChanged() || !listedWorkOrderIds.has(workOrderId)
        || authorizationApi.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) {
        responseCounts.directProviderOrderDiscovery.state = 'AUTHORIZATION_SCOPE_UNAVAILABLE'
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'ROLE_LIST_AUTHORIZATION_UNAVAILABLE'
        return 'stop'
      }
      stage = `role_visible_direct_provider_discovery_${responseCounts.directProviderOrderDiscovery.orderListsRead + 1}`
      const quotes = await orderApi.listTypeOneOrdersForWorkOrder(workOrderId, 3)
      responseCounts.directProviderOrderDiscovery.orderListsRead += 1
      if (quotes.state !== 'succeeded' || !quotes.data) {
        responseCounts.directProviderOrderDiscovery.state = 'ORDER_READ_INCOMPLETE'
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'ORDER_READ_INCOMPLETE'
        return 'stop'
      }
      const inspection = inspectDirectProviderOrderPage(workOrderId, quotes.data)
      responseCounts.directProviderOrderDiscovery.orderRowsRead += inspection.orders
      const orderListTruncated = quotes.data.totalCount !== undefined
        ? quotes.data.totalCount > quotes.data.items.length
        : quotes.data.items.length >= 3
      if (orderListTruncated) responseCounts.directProviderOrderDiscovery.orderListsTruncatedAtThree += 1
      if (inspection.state === 'ORDER_ASSOCIATION_CONFLICT') {
        responseCounts.directProviderOrderDiscovery.state = 'ORDER_ASSOCIATION_CONFLICT'
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'ORDER_ASSOCIATION_CONFLICT'
        return 'stop'
      }
      if (inspection.state === 'UNKNOWN_INVALID_INPUT') {
        responseCounts.directProviderOrderDiscovery.state = 'INVALID_ORDER_PAGE'
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'ORDER_PAGE_INVALID'
        return 'stop'
      }
      responseCounts.directProviderOrderDiscovery.directProcedureCandidates += inspection.directProcedureLines
      responseCounts.directProviderOrderDiscovery.directMeasureCandidates += inspection.directMeasureLines
      if (!hasRequestedDirectProviderLines(inspection,
        directMeasureOrderDiscoveryRequested ? 'measure' : 'procedure_or_measure')) {
        recordQuotationRead(workOrderId, quotes)
        return 'continue'
      }
      if (!context || !selection) {
        responseCounts.directProviderOrderDiscovery.state = 'DIRECT_PROVIDER_FOUND_CONTEXT_UNKNOWN'
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'DIRECT_PROVIDER_FOUND_CONTEXT_UNKNOWN'
        return 'stop'
      }
      responseCounts.directProviderOrderDiscovery.state = 'DIRECT_PROVIDER_ORDER_FOUND'
      selectCatalogContext(workOrder, context, selection, authorizationApi)
      discoveryState = 'DIRECT_PROVIDER_ORDER_FOUND'
      recordQuotationRead(workOrderId, quotes)
      return 'found'
    }

    for (const workOrder of pageOneWorkOrders) {
      const id = String(workOrder.id)
      selectedWorkOrderIds.add(id)
      workOrderPageIds.add(id)
    }
    for (const [index, workOrder] of pageOneWorkOrders.entries()) {
      roleVisibleWorkOrdersInspected += 1
      if (directMaterialOrderDiscoveryRequested) {
        responseCounts.directMaterialOrderDiscovery.roleVisibleWorkOrdersInspected = roleVisibleWorkOrdersInspected
      } else if (directProviderOrderDiscoveryRequested) {
        responseCounts.directProviderOrderDiscovery.roleVisibleWorkOrdersInspected = roleVisibleWorkOrdersInspected
      }
      stage = `work_order_detail_read_${index + 1}`
      const detail = await technicianApi.getWorkOrderDetail(workOrder.id)
      if (detail.state !== 'succeeded' || !detail.data) {
        responseCounts.workOrderDetailsFailed += 1
        if (!directMaterialOrderDiscoveryRequested && !directProviderOrderDiscoveryRequested) {
          details.push({ state: operationState(detail), activePlaceOrder: false, catalogContext: false })
        }
        catalogContextDiscoveryIncomplete = true
        discoveryState = 'WORK_ORDER_DETAIL_READ_INCOMPLETE'
        break
      }
      responseCounts.workOrderDetailsSucceeded += 1
      const activePlaceOrderNodes = (detail.data.workflowNodes ?? []).filter((node) => node.category === 'placeOrder' && node.lifecycle === 'active')
      responseCounts.activePlaceOrderNodes += activePlaceOrderNodes.length
      stage = `workflow_projection_${index + 1}`
      const projection = detailWorkflowProjectionFor(detail.data, session)
      if (activeOrderFieldsOnlyRequested) boundedEvidence.observeWorkflow(detail.data, projection)
      const currentActionIsPlaceOrder = projection.currentTask?.actionIntent === 'place_order' && projection.currentTask.execution === 'enabled'
      if (currentActionIsPlaceOrder) responseCounts.currentActionPlaceOrder += 1
      const hasCatalogContext = Boolean(detail.data.quotationCatalogContext?.serviceType)
      if (hasCatalogContext) responseCounts.detailsWithCatalogContext += 1
      if (!directMaterialOrderDiscoveryRequested && !directProviderOrderDiscoveryRequested) {
        details.push({
          state: 'SUCCEEDED',
          activePlaceOrder: activePlaceOrderNodes.length > 0,
          currentActionPlaceOrder: currentActionIsPlaceOrder,
          catalogContext: hasCatalogContext,
        })
      }
      if (!selectedCatalogContext && directMaterialOrderDiscoveryRequested) {
        const discovery = await inspectDirectMaterialContextOrder(workOrder, detail, technicianApi)
        if (discovery === 'found' || discovery === 'stop') break
      } else if (!selectedCatalogContext && directProviderOrderDiscoveryRequested) {
        const discovery = await inspectDirectProviderContextOrder(workOrder, detail, technicianApi)
        if (discovery === 'found' || discovery === 'stop') break
      } else if (!selectedCatalogContext && considerCatalogContext(workOrder, detail)) break
    }

    const pairedSkuAndSpuLine = (workOrderId) => {
      const lineage = orderLineageByWorkOrder.get(workOrderId)
      return Boolean(lineage && lineage.linesWithBothIds > 0)
    }
    if (!catalogAuditOptions.catalogContextOnly && !catalogAuditOptions.activeOrderFieldsOnly) for (const [index, workOrder] of pageOneWorkOrders.entries()) {
      stage = `work_order_scoped_quotation_read_${index + 1}`
      const workOrderId = String(workOrder.id)
      const quotes = await orderApi.listTypeOneOrdersForWorkOrder(workOrderId, 3)
      recordQuotationRead(workOrderId, quotes)
    }

    const firstPageExhausted = Boolean(workOrders.data && (
      workOrders.data.items.length === 0
        || workOrders.data.items.length > 0 && workOrders.data.items.length < 3 && workOrders.data.totalCount === undefined
        || workOrders.data.totalCount !== undefined && workOrders.data.totalCount <= 3
    ))
    let roleVisibleWorkOrdersExhausted = firstPageExhausted
    if (workOrders.state === 'succeeded' && workOrders.data?.items.length > 3) {
      discoveryState = 'WORK_ORDER_PAGE_EXCEEDED_BOUND'
    } else if (workOrders.state === 'succeeded' && firstPageExhausted) {
      if (!catalogContextDiscoveryIncomplete) discoveryState = 'ROLE_VISIBLE_WORK_ORDERS_EXHAUSTED'
    }
    const directOrderDiscoveryRequested = directMaterialOrderDiscoveryRequested || directProviderOrderDiscoveryRequested
    const maxWorkOrderPages = directOrderDiscoveryRequested
      ? MAX_ORDER_SEARCH_PAGES
      : MAX_WORK_ORDER_PAGES
    for (let page = 2; !selectedCatalogContext && !catalogContextDiscoveryIncomplete && workOrders.state === 'succeeded'
      && workOrders.data && !firstPageExhausted && workOrders.data.items.length <= 3
      && page <= maxWorkOrderPages; page += 1) {
      stage = directMaterialOrderDiscoveryRequested
        ? `role_scoped_direct_material_work_order_page_${page}`
        : directProviderOrderDiscoveryRequested
          ? `role_scoped_direct_provider_work_order_page_${page}`
        : `role_scoped_work_order_page_${page}`
      technicianApi = createTechnicianApi()
      const pageResult = await technicianApi.listWorkOrders({ page, pageSize: 3 })
      if (pageResult.state !== 'succeeded' || !pageResult.data || authIdentityChanged()) {
        discoveryState = pageResult.state === 'failed_terminal' ? 'WORK_ORDER_READ_FAILED' : 'WORK_ORDER_READ_UNVERIFIED'
        catalogContextDiscoveryIncomplete = true
        break
      }
      responseCounts.workOrderPagesRead += 1
      responseCounts.workOrderListRows += pageResult.data.items.length
      lastWorkOrderPageRead = page
      if ((catalogAuditOptions.catalogContextOnly || catalogAuditOptions.activeOrderFieldsOnly) && page % 10 === 0) {
        console.error(JSON.stringify({
          progress: directMaterialOrderDiscoveryRequested
            ? 'ROLE_VISIBLE_DIRECT_MATERIAL_ORDER_SCAN'
            : directProviderOrderDiscoveryRequested
              ? directMeasureOrderDiscoveryRequested
                ? 'ROLE_VISIBLE_DIRECT_MEASURE_ORDER_SCAN'
                : 'ROLE_VISIBLE_DIRECT_PROVIDER_ORDER_SCAN'
              : 'ROLE_VISIBLE_PLACE_ORDER_CONTEXT_SCAN',
          workOrderPagesRead: responseCounts.workOrderPagesRead,
          workOrderDetailsRead: responseCounts.workOrderDetailsSucceeded,
          distinctContextsSeen: contextSelector.distinctCount,
          requestedOrdinal: directOrderDiscoveryRequested
            ? null : catalogAuditOptions.catalogContextOrdinal,
        }))
      }
      if (pageResult.data.items.length > 3) {
        discoveryState = 'WORK_ORDER_PAGE_EXCEEDED_BOUND'
        catalogContextDiscoveryIncomplete = true
        break
      }
      const pageIds = pageResult.data.items.map((item) => String(item.id))
      if (pageIds.some((id) => workOrderPageIds.has(id) || selectedWorkOrderIds.has(id))) {
        discoveryState = 'WORK_ORDER_PAGINATION_DUPLICATE'
        catalogContextDiscoveryIncomplete = true
        break
      }
      for (const id of pageIds) {
        listedWorkOrderIds.add(id)
        selectedWorkOrderIds.add(id)
        workOrderAuthorityById.set(id, technicianApi)
      }
      if (pageResult.data.items.length === 0) {
        discoveryState = 'ROLE_VISIBLE_WORK_ORDERS_EXHAUSTED'
        roleVisibleWorkOrdersExhausted = true
        break
      }
      let detailReadFailed = false
      for (const [index, workOrder] of pageResult.data.items.entries()) {
        if (directOrderDiscoveryRequested
          && roleVisibleWorkOrdersInspected >= MAX_ORDER_SEARCH_WORK_ORDERS) {
          const knownTotalWithinBound = pageResult.data.totalCount !== undefined
            && pageResult.data.totalCount <= roleVisibleWorkOrdersInspected
          const shortFinalPage = pageResult.data.totalCount === undefined
            && pageResult.data.items.length < 3 && index >= pageResult.data.items.length
          if (knownTotalWithinBound || shortFinalPage) {
            discoveryState = 'ROLE_VISIBLE_WORK_ORDERS_EXHAUSTED'
            roleVisibleWorkOrdersExhausted = true
          } else {
            discoveryState = directMaterialOrderDiscoveryRequested
              ? 'DIRECT_MATERIAL_SEARCH_WORK_ORDER_LIMIT_REACHED'
              : directMeasureOrderDiscoveryRequested
                ? 'DIRECT_MEASURE_SEARCH_WORK_ORDER_LIMIT_REACHED'
                : 'DIRECT_PROVIDER_SEARCH_WORK_ORDER_LIMIT_REACHED'
            if (directMaterialOrderDiscoveryRequested) responseCounts.directMaterialOrderDiscovery.state = 'WORK_ORDER_LIMIT_REACHED'
            if (directProviderOrderDiscoveryRequested) responseCounts.directProviderOrderDiscovery.state = 'WORK_ORDER_LIMIT_REACHED'
            catalogContextDiscoveryIncomplete = true
          }
          detailReadFailed = true
          break
        }
        roleVisibleWorkOrdersInspected += 1
        if (directMaterialOrderDiscoveryRequested) {
          responseCounts.directMaterialOrderDiscovery.roleVisibleWorkOrdersInspected = roleVisibleWorkOrdersInspected
        } else if (directProviderOrderDiscoveryRequested) {
          responseCounts.directProviderOrderDiscovery.roleVisibleWorkOrdersInspected = roleVisibleWorkOrdersInspected
        }
        stage = `role_scoped_work_order_detail_${page}_${index + 1}`
        const detail = await technicianApi.getWorkOrderDetail(workOrder.id)
        if (detail.state !== 'succeeded' || !detail.data) {
          responseCounts.workOrderDetailsFailed += 1
          detailReadFailed = true
          catalogContextDiscoveryIncomplete = true
          discoveryState = 'WORK_ORDER_DETAIL_READ_INCOMPLETE'
          break
        }
        responseCounts.workOrderDetailsSucceeded += 1
        const activePlaceOrderNodes = (detail.data.workflowNodes ?? []).filter((node) => node.category === 'placeOrder' && node.lifecycle === 'active')
        responseCounts.activePlaceOrderNodes += activePlaceOrderNodes.length
        const projection = detailWorkflowProjectionFor(detail.data, session)
      if (activeOrderFieldsOnlyRequested) boundedEvidence.observeWorkflow(detail.data, projection)
        const canPlaceOrder = projection.currentTask?.actionIntent === 'place_order'
          && projection.currentTask.execution === 'enabled'
        if (canPlaceOrder) responseCounts.currentActionPlaceOrder += 1
        if (detail.data.quotationCatalogContext?.serviceType) responseCounts.detailsWithCatalogContext += 1
        if (directMaterialOrderDiscoveryRequested) {
          const result = await inspectDirectMaterialContextOrder(workOrder, detail, technicianApi)
          if (result === 'found' || result === 'stop') break
        } else if (directProviderOrderDiscoveryRequested) {
          const result = await inspectDirectProviderContextOrder(workOrder, detail, technicianApi)
          if (result === 'found' || result === 'stop') break
        } else if (considerCatalogContext(workOrder, detail, details.length + page * 3 + index)) {
          discoveryState = 'PLACE_ORDER_CONTEXT_FOUND'
          break
        }
      }
      if (selectedCatalogContext) break
      if (catalogContextDiscoveryIncomplete) break
      if (detailReadFailed) {
        break
      }
      const totalCount = pageResult.data.totalCount
      if ((totalCount !== undefined && page * 3 >= totalCount)
        || (totalCount === undefined && pageResult.data.items.length < 3)) {
        discoveryState = 'ROLE_VISIBLE_WORK_ORDERS_EXHAUSTED'
        roleVisibleWorkOrdersExhausted = true
        break
      }
      if (page === maxWorkOrderPages && !selectedCatalogContext && !roleVisibleWorkOrdersExhausted) {
        discoveryState = directMaterialOrderDiscoveryRequested
          ? 'DIRECT_MATERIAL_SEARCH_WORK_ORDER_LIMIT_REACHED'
          : directProviderOrderDiscoveryRequested
            ? directMeasureOrderDiscoveryRequested
              ? 'DIRECT_MEASURE_SEARCH_WORK_ORDER_LIMIT_REACHED'
              : 'DIRECT_PROVIDER_SEARCH_WORK_ORDER_LIMIT_REACHED'
            : 'WORK_ORDER_PAGE_LIMIT_REACHED'
        if (directMaterialOrderDiscoveryRequested) {
          responseCounts.directMaterialOrderDiscovery.state = 'WORK_ORDER_LIMIT_REACHED'
          catalogContextDiscoveryIncomplete = true
        } else if (directProviderOrderDiscoveryRequested) {
          responseCounts.directProviderOrderDiscovery.state = 'WORK_ORDER_LIMIT_REACHED'
          catalogContextDiscoveryIncomplete = true
        }
      }
    }

    if (directMaterialOrderDiscoveryRequested && !selectedCatalogContext
      && roleVisibleWorkOrdersExhausted && !catalogContextDiscoveryIncomplete
      && !authIdentityChanged() && blockedUnexpectedNetworkRequests === 0) {
      if (responseCounts.directMaterialOrderDiscovery.orderListsTruncatedAtThree === 0) {
        discoveryState = 'NO_DIRECT_MATERIAL_ORDER_IN_ROLE_VISIBLE_SCOPE'
        responseCounts.directMaterialOrderDiscovery.state = 'NO_MATCH_IN_COMPLETE_ROLE_VISIBLE_SCOPE'
      } else {
        discoveryState = 'DIRECT_MATERIAL_SEARCH_ORDER_LISTS_TRUNCATED'
        responseCounts.directMaterialOrderDiscovery.state = 'NO_MATCH_WITH_TRUNCATED_ORDER_PAGES'
      }
    }
    if (directProviderOrderDiscoveryRequested && !selectedCatalogContext
      && roleVisibleWorkOrdersExhausted && !catalogContextDiscoveryIncomplete
      && !authIdentityChanged() && blockedUnexpectedNetworkRequests === 0) {
      if (responseCounts.directProviderOrderDiscovery.orderListsTruncatedAtThree === 0) {
        discoveryState = directMeasureOrderDiscoveryRequested
          ? 'NO_DIRECT_MEASURE_ORDER_IN_ROLE_VISIBLE_SCOPE' : 'NO_DIRECT_PROVIDER_ORDER_IN_ROLE_VISIBLE_SCOPE'
        responseCounts.directProviderOrderDiscovery.state = directMeasureOrderDiscoveryRequested
          ? 'NO_DIRECT_MEASURE_IN_COMPLETE_ROLE_VISIBLE_SCOPE' : 'NO_MATCH_IN_COMPLETE_ROLE_VISIBLE_SCOPE'
      } else {
        discoveryState = 'DIRECT_PROVIDER_SEARCH_ORDER_LIST_TRUNCATED'
        responseCounts.directProviderOrderDiscovery.state = 'ORDER_LISTS_TRUNCATED_AT_THREE'
        catalogContextDiscoveryIncomplete = true
      }
    }
    if (directMaterialOrderDiscoveryRequested && !selectedCatalogContext
      && responseCounts.directMaterialOrderDiscovery.state === 'SEARCHING_ROLE_VISIBLE_ORDER_SCOPE') {
      responseCounts.directMaterialOrderDiscovery.state = 'SEARCH_INCOMPLETE'
    }

    if (!selectedCatalogContext && catalogAuditOptions.catalogContextOnly
      && discoveryState === 'ROLE_VISIBLE_WORK_ORDERS_EXHAUSTED') {
      responseCounts.catalogContextDiscovery.distinctPlaceOrderContextsSeen = contextSelector.distinctCount
    }

    if ((!catalogAuditOptions.catalogContextOnly && !catalogAuditOptions.activeOrderFieldsOnly)
      || selectedOrderMaterialPriceComparisonRequested || selectedOrderPackagePriceComparisonRequested
      || selectedOrderProcedureMeasurePriceComparisonRequested) {
      if (!selectedCatalogWorkOrderId || orderReadStatesByWorkOrder.has(selectedCatalogWorkOrderId)) {
        // The selected current WorkOrder was already read during the initial page pass,
        // or no eligible current place_order WorkOrder was found.
      } else {
        stage = 'current_place_order_workorder_quotation_read'
        if (authIdentityChanged() || !selectedWorkOrderIsCurrent()) {
          orderReadStatesByWorkOrder.set(selectedCatalogWorkOrderId, 'FAILED_TERMINAL')
          if (selectedOrderMaterialPriceComparisonRequested || selectedOrderPackagePriceComparisonRequested
            || selectedOrderProcedureMeasurePriceComparisonRequested) {
            selectedWorkOrderOrderReadState = 'FAILED_TERMINAL'
          }
        } else {
          const quotes = await orderApi.listTypeOneOrdersForWorkOrder(selectedCatalogWorkOrderId, 3)
          recordQuotationRead(selectedCatalogWorkOrderId, quotes)
        }
      }
    }

    if (selectedCatalogContext) {
      responseCounts.catalogContextVerified = Boolean(
        selectedCatalogContext.workOrderId === selectedCatalogWorkOrderId
          && selectedCatalogContext.serviceType && selectedCatalogContext.sourceType
          && selectedWorkOrderIsCurrent() && authIdentityChanged() === false,
      )
      discoveryState = directMaterialOrderDiscoveryRequested
        ? 'DIRECT_MATERIAL_ORDER_FOUND'
        : 'PLACE_ORDER_CONTEXT_FOUND'
      if (catalogAuditOptions.activeOrderFieldsOnly) {
        stage = 'effective_order_extfield_read'
        let response = null
        if (responseCounts.catalogContextVerified && !authIdentityChanged() && selectedWorkOrderIsCurrent()) {
          response = await requestReadOnce(
            request, runtime.value.environment.apiBaseUrl, session.sessionRef,
            'biz/extField/query', buildOrderExtFieldRequestBody(),
          )
        }
        if (!response || response.statusCode < 200 || response.statusCode >= 300) {
          responseCounts.effectiveOrderExtFields = { state: 'FAILED_NO_RETRY', summary: null }
        } else if (authIdentityChanged() || !selectedWorkOrderIsCurrent()) {
          responseCounts.effectiveOrderExtFields = { state: 'AUTHORIZATION_SCOPE_CHANGED', summary: null }
        }
        if (responseCounts.effectiveOrderExtFields.state === 'SUCCEEDED') {
          const providerScopeCurrent = () => !authIdentityChanged() && selectedWorkOrderIsCurrent()
          if (responseCounts.effectiveOrderOptionProviders.code.state === 'BLOCKED_PROVIDER_PLAN') {
            // Keep the provider plan failure explicit; do not broaden the query.
          } else if (activeOrderCodeProviderIds.length === 0) {
            responseCounts.effectiveOrderOptionProviders.code = {
              state: 'NOT_REQUIRED', providers: 0, missingProviders: 0, options: 0, emptyProviders: 0,
            }
          } else if (runtime.value.authWireConfig.tenant !== '1340835581184723420') {
            responseCounts.effectiveOrderOptionProviders.code = {
              state: 'BLOCKED_R1_CODE_TENANT_MISMATCH', providers: 0, missingProviders: activeOrderCodeProviderIds.length, options: 0, emptyProviders: 0,
            }
          } else if (!providerScopeCurrent()) {
            responseCounts.effectiveOrderOptionProviders.code = {
              state: 'AUTHORIZATION_SCOPE_CHANGED', providers: 0, missingProviders: activeOrderCodeProviderIds.length, options: 0, emptyProviders: 0,
            }
          } else {
            stage = 'effective_order_code_options_read'
            const codeOptions = await requestReadOnce(request, runtime.value.environment.apiBaseUrl,
              session.sessionRef, 'i/code/selectCode.do', {
                jsonPara: JSON.stringify(activeOrderCodeProviderIds.map(id => ({ codeId: id, eleid: id }))),
                tenantId: '1340835581184723420',
              })
            if (!codeOptions || codeOptions.statusCode < 200 || codeOptions.statusCode >= 300) {
              responseCounts.effectiveOrderOptionProviders.code = {
                state: 'FAILED_NO_RETRY', providers: 0, missingProviders: activeOrderCodeProviderIds.length, options: 0, emptyProviders: 0,
              }
            } else if (!providerScopeCurrent()) {
              responseCounts.effectiveOrderOptionProviders.code = {
                state: 'AUTHORIZATION_SCOPE_CHANGED', providers: 0, missingProviders: activeOrderCodeProviderIds.length, options: 0, emptyProviders: 0,
              }
            } else {
              const summary = sanitizeOrderCodeProviderResponse(codeOptions.data, activeOrderCodeProviderIds)
              responseCounts.effectiveOrderOptionProviders.code = summary.ok
                ? { state: summary.missingProviders === 0 ? 'SUCCEEDED' : 'INCOMPLETE', ...summary }
                : { state: 'INVALID_RESPONSE', reason: summary.reason, providers: 0, missingProviders: activeOrderCodeProviderIds.length, options: 0, emptyProviders: 0 }
            }
          }

          if (responseCounts.effectiveOrderOptionProviders.cascade.state === 'BLOCKED_PROVIDER_PLAN') {
            // Keep the provider plan failure explicit; do not broaden the query.
          } else if (activeOrderCascadeProviderIds.length === 0) {
            responseCounts.effectiveOrderOptionProviders.cascade = {
              state: 'NOT_REQUIRED', providers: 0, missingProviders: 0, nodes: 0, leaves: 0, maxDepth: 0, terminalNodesWithEmptyChildren: 0,
            }
          } else if (!expectedOrderCascadeTenantId) {
            responseCounts.effectiveOrderOptionProviders.cascade = {
              state: 'BLOCKED_TENANT_CONTEXT', providers: 0, missingProviders: activeOrderCascadeProviderIds.length, nodes: 0, leaves: 0, maxDepth: 0, terminalNodesWithEmptyChildren: 0,
            }
          } else if (!providerScopeCurrent()) {
            responseCounts.effectiveOrderOptionProviders.cascade = {
              state: 'AUTHORIZATION_SCOPE_CHANGED', providers: 0, missingProviders: activeOrderCascadeProviderIds.length, nodes: 0, leaves: 0, maxDepth: 0, terminalNodesWithEmptyChildren: 0,
            }
          } else {
            stage = 'effective_order_cascade_options_read'
            const cascadeOptions = await requestReadOnce(request, runtime.value.environment.apiBaseUrl,
              session.sessionRef, 'i/code/selectMultistageCode.do', {
                types: activeOrderCascadeProviderIds.join(','),
                tenantId: expectedOrderCascadeTenantId,
              })
            if (!cascadeOptions || cascadeOptions.statusCode < 200 || cascadeOptions.statusCode >= 300) {
              responseCounts.effectiveOrderOptionProviders.cascade = {
                state: 'FAILED_NO_RETRY', providers: 0, missingProviders: activeOrderCascadeProviderIds.length, nodes: 0, leaves: 0, maxDepth: 0, terminalNodesWithEmptyChildren: 0,
              }
            } else if (!providerScopeCurrent()) {
              responseCounts.effectiveOrderOptionProviders.cascade = {
                state: 'AUTHORIZATION_SCOPE_CHANGED', providers: 0, missingProviders: activeOrderCascadeProviderIds.length, nodes: 0, leaves: 0, maxDepth: 0, terminalNodesWithEmptyChildren: 0,
              }
            } else {
              const summary = sanitizeOrderCascadeProviderResponse(cascadeOptions.data, activeOrderCascadeProviderIds)
              responseCounts.effectiveOrderOptionProviders.cascade = summary.ok
                ? { state: summary.missingProviders === 0 ? 'SUCCEEDED' : 'INCOMPLETE', ...summary }
                : { state: 'INVALID_RESPONSE', reason: summary.reason, providers: 0, missingProviders: activeOrderCascadeProviderIds.length, nodes: 0, leaves: 0, maxDepth: 0, terminalNodesWithEmptyChildren: 0 }
            }
          }
        }
      } else if (selectedOrderMaterialPriceComparisonRequested) {
        // Read only the current direct-Material selector and exact SPUs found
        // in this WorkOrder's bounded type-1 Order page.
        stage = 'selected_order_direct_material_catalog_pages'
        const materialCatalog = await readEntireCatalog(
          'material', selectedCatalogContext, catalogApi.listMaterials.bind(catalogApi), (item) => {
            directMaterialSpuIds.add(item.id)
            addCatalogSpuIdentity(item.id)
            selectedContextDirectMaterialRows.push(item)
          },
        )
        const selectedDirectMaterialSpus = [...selectedOrderDirectMaterialSpuIds]
          .filter((id) => directMaterialSpuIds.has(id))
        selectedOrderDirectMaterialSpusInCatalog = selectedDirectMaterialSpus.length
        if (materialCatalog.complete && selectedDirectMaterialSpus.length > 0) {
          stage = 'selected_order_direct_material_sales_field_read'
          const saleFields = await catalogApi.listMaterialSalesFields(selectedCatalogContext)
          responseCounts.materialSalesAttributes = {
            state: operationState(saleFields),
            fields: saleFields.state === 'succeeded' && saleFields.data ? saleFields.data.items.length : 0,
            options: saleFields.state === 'succeeded' && saleFields.data
              ? saleFields.data.items.reduce((count, field) => count + field.options.length, 0) : 0,
          }
          if (saleFields.state === 'succeeded' && saleFields.data) {
            stage = 'selected_order_direct_material_sku_pages'
            await readSelectableSkuCatalog(
              catalogApi,
              selectedCatalogContext,
              selectedDirectMaterialSpus,
              new Map(),
              saleFields.data.items.map(field => field.name),
            )
          } else {
            responseCounts.selectableSkuCatalog.reason = 'MATERIAL_SALES_FIELDS_READ_FAILED'
          }
        } else {
          responseCounts.materialSalesAttributes.state = materialCatalog.complete ? 'NOT_REQUIRED' : 'NOT_RUN'
          responseCounts.selectableSkuCatalog.complete = materialCatalog.complete
          responseCounts.selectableSkuCatalog.reason = materialCatalog.complete
            ? 'NO_ORDER_DIRECT_MATERIAL_SPUS_IN_CURRENT_CATALOG'
            : 'DIRECT_MATERIAL_CATALOG_INCOMPLETE'
        }
      } else if (selectedOrderPackagePriceComparisonRequested) {
        if (selectedOrderPackageIds.size === 0) {
          responseCounts.catalogItemsByKind.package = {
            items: 0, pages: 0, totalCount: null, complete: true, reason: 'NO_PACKAGE_LINES_IN_ORDER_PAGE',
          }
          responseCounts.packageDetails.complete = true
        } else {
          stage = 'selected_order_package_catalog_pages'
          const packageCatalog = await readEntireCatalog(
            'package', selectedCatalogContext, catalogApi.listPackages.bind(catalogApi), (item) => {
              listedPackageIds.add(item.id)
              selectedOrderCatalogPackageRows.push(item)
            },
          )
          responseCounts.packageDetails.attempted = [...selectedOrderPackageIds]
            .filter(id => listedPackageIds.has(id)).length
          responseCounts.packageDetails.complete = packageCatalog.complete
          const matchedPackageIds = [...selectedOrderPackageIds].filter(id => listedPackageIds.has(id))
          for (const [index, packageId] of matchedPackageIds.entries()) {
            if (authIdentityChanged() || !selectedWorkOrderIsCurrent()) {
              responseCounts.packageDetails.complete = false
              responseCounts.packageDetails.failed += matchedPackageIds.length - index
              break
            }
            stage = `selected_order_package_detail_${index + 1}`
            const packageDetail = await catalogApi.getPackageDetail(packageId)
            if (packageDetail.state !== 'succeeded' || !packageDetail.data
              || authIdentityChanged() || !selectedWorkOrderIsCurrent()) {
              responseCounts.packageDetails.failed += 1
              responseCounts.packageDetails.complete = false
              continue
            }
            responseCounts.packageDetails.succeeded += 1
            responseCounts.packageDetails.components.procedure += packageDetail.data.procedures.length
            responseCounts.packageDetails.components.material += packageDetail.data.materials.length
            responseCounts.packageDetails.components.measure += packageDetail.data.measures.length
            selectedOrderPackageDetails.push(packageDetail.data)
          }
          if (responseCounts.packageDetails.failed > 0) responseCounts.packageDetails.complete = false
          if (!packageCatalog.complete || authIdentityChanged() || !selectedWorkOrderIsCurrent()) {
            responseCounts.packageDetails.complete = false
          }
          responseCounts.packageDetails.referencedMaterialSpus = packageCatalog.items
        }
      } else if (selectedOrderProcedureMeasurePriceComparisonRequested) {
        const directRows = kind => (selectedWorkOrderOrderPage?.items ?? []).flatMap(order =>
          (order.groups ?? []).flatMap(group => (group.lines ?? []).filter(line => line.kind === kind)))
        const procedureRows = directRows('procedure')
        const measureRows = directRows('measure')
        if (procedureRows.length > 0) {
          stage = 'selected_order_direct_procedure_catalog_pages'
          await readEntireCatalog('procedure', selectedCatalogContext,
            catalogApi.listProcedures.bind(catalogApi), item => selectedOrderCatalogProcedureRows.push(item))
        } else {
          responseCounts.catalogItemsByKind.procedure = {
            items: 0, pages: 0, totalCount: null, complete: true, reason: 'NO_DIRECT_PROCEDURE_LINES_IN_ORDER_PAGE',
          }
        }
        if (measureRows.length > 0) {
          stage = 'selected_order_direct_measure_catalog_pages'
          await readEntireCatalog('measure', selectedCatalogContext,
            catalogApi.listMeasures.bind(catalogApi), item => selectedOrderCatalogMeasureRows.push(item))
        } else {
          responseCounts.catalogItemsByKind.measure = {
            items: 0, pages: 0, totalCount: null, complete: true, reason: 'NO_DIRECT_MEASURE_LINES_IN_ORDER_PAGE',
          }
        }
      } else {
      stage = 'r1_catalog_filter_code_options'
      const filterOptions = await catalogApi.listCatalogFilterOptions(selectedCatalogContext)
      responseCounts.catalogFilterOptions = {
        state: operationState(filterOptions),
        packageParts: filterOptions.state === 'succeeded' && filterOptions.data ? filterOptions.data.packageParts.options.length : 0,
        packageTypes: filterOptions.state === 'succeeded' && filterOptions.data ? filterOptions.data.packageTypes.options.length : 0,
        packageAgeLimits: filterOptions.state === 'succeeded' && filterOptions.data ? filterOptions.data.packageAgeLimits.options.length : 0,
        procedures: filterOptions.state === 'succeeded' && filterOptions.data ? filterOptions.data.procedures.options.length : 0,
        materials: filterOptions.state === 'succeeded' && filterOptions.data ? filterOptions.data.materials.options.length : 0,
        packageMaterialLayers: filterOptions.state === 'succeeded' && filterOptions.data ? filterOptions.data.packageMaterialLayers.options.length : 0,
      }
      stage = 'all_selectable_catalog_pages'
      const catalogs = [
        ['package', catalogApi.listPackages.bind(catalogApi), (item) => listedPackageIds.add(item.id)],
        ['procedure', catalogApi.listProcedures.bind(catalogApi), () => {}],
        ['material', catalogApi.listMaterials.bind(catalogApi), (item) => {
          directMaterialSpuIds.add(item.id)
          addCatalogSpuIdentity(item.id)
          selectedContextDirectMaterialRows.push(item)
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
    }

    if (catalogAuditOptions.catalogContextOnly || catalogAuditOptions.activeOrderFieldsOnly) {
      orderIdentitySearchState = 'SKIPPED_CONTEXT_ONLY_MODE'
    } else if (!selectedCatalogContext) {
      orderIdentitySearchState = 'NO_SELECTED_PLACE_ORDER_CONTEXT'
    } else {
      orderIdentitySearchState = 'SEARCHING_ROLE_VISIBLE_WORK_ORDERS'
      for (const [workOrderId, readState] of orderReadStatesByWorkOrder) {
        if (readState === 'SUCCEEDED' && pairedSkuAndSpuLine(workOrderId)) {
          orderIdentityCandidateWorkOrderId = workOrderId
          orderIdentitySearchState = 'MATCH_FOUND'
          break
        }
      }

      let searchStopState = null
      const readWorkOrderOrders = async (workOrderId) => {
        if (authIdentityChanged()) {
          searchStopState = 'AUTHORIZATION_IDENTITY_CHANGED'
          return
        }
        if (!listedWorkOrderIds.has(workOrderId)
          || workOrderAuthorityById.get(workOrderId)?.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) {
          searchStopState = 'ROLE_LIST_AUTHORIZATION_UNAVAILABLE'
          return
        }
        if (orderReadStatesByWorkOrder.size >= MAX_ORDER_SEARCH_WORK_ORDERS) {
          searchStopState = 'WORK_ORDER_CAP_REACHED'
          return
        }
        stage = `role_scoped_type_one_order_search_${orderReadStatesByWorkOrder.size + 1}`
        const result = await orderApi.listTypeOneOrdersForWorkOrder(workOrderId, 3)
        recordQuotationRead(workOrderId, result)
        if (authIdentityChanged()) {
          searchStopState = 'AUTHORIZATION_IDENTITY_CHANGED'
          return
        }
        if (result.state === 'succeeded' && result.data && pairedSkuAndSpuLine(workOrderId)) {
          orderIdentityCandidateWorkOrderId = workOrderId
          orderIdentitySearchState = 'MATCH_FOUND'
        }
      }

      if (!orderIdentityCandidateWorkOrderId) {
        for (const workOrderId of selectedWorkOrderIds) {
          if (orderIdentityCandidateWorkOrderId || searchStopState) break
          if (orderReadStatesByWorkOrder.has(workOrderId)) continue
          await readWorkOrderOrders(workOrderId)
        }
      }

      let searchTechnicianApi = null
      for (let page = lastWorkOrderPageRead + 1; !orderIdentityCandidateWorkOrderId
        && !searchStopState && !roleVisibleWorkOrdersExhausted
        && orderReadStatesByWorkOrder.size < MAX_ORDER_SEARCH_WORK_ORDERS
        && page <= MAX_ORDER_SEARCH_PAGES; page += 1) {
        if (authIdentityChanged()) {
          searchStopState = 'AUTHORIZATION_IDENTITY_CHANGED'
          break
        }
        if (!searchTechnicianApi) searchTechnicianApi = createTechnicianApi()
        stage = `role_scoped_work_order_identity_page_${page}`
        const pageResult = await searchTechnicianApi.listWorkOrders({ page, pageSize: 3 })
        if (pageResult.state !== 'succeeded' || !pageResult.data || authIdentityChanged()) {
          searchStopState = pageResult.state === 'failed_terminal'
            ? 'WORK_ORDER_LIST_READ_FAILED' : 'WORK_ORDER_LIST_READ_UNVERIFIED'
          break
        }
        responseCounts.workOrderPagesRead += 1
        responseCounts.workOrderListRows += pageResult.data.items.length
        responseCounts.orderIdentityDiscovery.workOrderPagesReadForSearch += 1
        lastWorkOrderPageRead = page
        if ((pageResult.data.page !== undefined && pageResult.data.page !== page)
          || (pageResult.data.pageSize !== undefined && pageResult.data.pageSize > 3)
          || pageResult.data.items.length > 3) {
          searchStopState = 'WORK_ORDER_PAGE_RESPONSE_MISMATCH'
          break
        }
        const pageIds = pageResult.data.items.map(item => String(item.id))
        if (pageIds.some((id, index) => pageIds.indexOf(id) !== index
          || selectedWorkOrderIds.has(id) || workOrderPageIds.has(id))) {
          searchStopState = 'WORK_ORDER_PAGINATION_DUPLICATE'
          break
        }
        for (const id of pageIds) {
          listedWorkOrderIds.add(id)
          selectedWorkOrderIds.add(id)
          workOrderAuthorityById.set(id, searchTechnicianApi)
        }
        if (pageIds.length === 0) {
          roleVisibleWorkOrdersExhausted = true
          break
        }
        for (const workOrderId of pageIds) {
          if (orderIdentityCandidateWorkOrderId || searchStopState
            || orderReadStatesByWorkOrder.size >= MAX_ORDER_SEARCH_WORK_ORDERS) break
          await readWorkOrderOrders(workOrderId)
        }
        if (orderIdentityCandidateWorkOrderId || searchStopState) break
        const totalCount = pageResult.data.totalCount
        if ((totalCount !== undefined && page * 3 >= totalCount)
          || (totalCount === undefined && pageResult.data.items.length < 3)) {
          roleVisibleWorkOrdersExhausted = true
          break
        }
      }

      if (orderIdentityCandidateWorkOrderId) {
        orderIdentitySearchState = 'MATCH_FOUND'
      } else if (searchStopState) {
        orderIdentitySearchState = searchStopState
      } else if ([...orderReadStatesByWorkOrder.values()].some(state => state !== 'SUCCEEDED')) {
        orderIdentitySearchState = 'ORDER_READ_INCOMPLETE'
      } else if ([...orderLineageByWorkOrder.values()].some(lineage => lineage.truncated)) {
        orderIdentitySearchState = 'ORDER_LIST_PAGE_LIMIT_REACHED'
      } else if (roleVisibleWorkOrdersExhausted) {
        orderIdentitySearchState = 'NO_SKU_AND_SPU_ORDER_IN_ROLE_VISIBLE_SCOPE'
      } else if (orderReadStatesByWorkOrder.size >= MAX_ORDER_SEARCH_WORK_ORDERS) {
        orderIdentitySearchState = 'WORK_ORDER_CAP_REACHED'
      } else {
        orderIdentitySearchState = 'WORK_ORDER_PAGE_CAP_REACHED'
      }
    }

    const selectedPriceComparisonCatalogReadComplete = responseCounts.catalogContextVerified
      && responseCounts.catalogItemsByKind.material.complete
      && (selectedOrderDirectMaterialSpusInCatalog === 0
        || responseCounts.materialSalesAttributes.state === 'SUCCEEDED'
          && responseCounts.selectableSkuCatalog.complete)
      && blockedUnexpectedNetworkRequests === 0
      && !authIdentityChanged()
      && selectedWorkOrderIsCurrent()

    const selectedPackagePriceComparisonCatalogReadComplete = responseCounts.catalogContextVerified
      && (selectedOrderPackageIds.size === 0
        || responseCounts.catalogItemsByKind.package.complete && responseCounts.packageDetails.complete)
      && blockedUnexpectedNetworkRequests === 0
      && !authIdentityChanged()
      && selectedWorkOrderIsCurrent()

    const selectedProviderPriceComparisonCatalogReadComplete = responseCounts.catalogContextVerified
      && responseCounts.catalogItemsByKind.procedure.complete
      && responseCounts.catalogItemsByKind.measure.complete
      && blockedUnexpectedNetworkRequests === 0
      && !authIdentityChanged()
      && selectedWorkOrderIsCurrent()

    let selectedWorkOrderOrderPriceComparison = { state: 'NOT_REQUESTED' }
    if (selectedOrderMaterialPriceComparisonRequested) {
      if (!selectedCatalogWorkOrderId) {
        selectedWorkOrderOrderPriceComparison = { state: 'NO_SELECTED_PLACE_ORDER_WORK_ORDER' }
      } else if (selectedWorkOrderOrderReadState !== 'SUCCEEDED' || !selectedWorkOrderOrderPage
        || !selectedPriceComparisonCatalogReadComplete
        || authIdentityChanged() || !selectedWorkOrderIsCurrent()) {
        selectedWorkOrderOrderPriceComparison = {
          state: 'INCOMPLETE_INPUTS',
          orderReadState: selectedWorkOrderOrderReadState,
          materialCatalogComplete: responseCounts.catalogItemsByKind.material.complete,
        }
      } else {
        const orderListTruncated = selectedWorkOrderOrderPage.totalCount !== undefined
          ? selectedWorkOrderOrderPage.totalCount > selectedWorkOrderOrderPage.items.length
          : selectedWorkOrderOrderPage.items.length >= 3
        selectedWorkOrderOrderPriceComparison = summarizeDirectMaterialPriceSnapshots({
          expectedWorkOrderId: selectedCatalogWorkOrderId,
          orders: selectedWorkOrderOrderPage.items,
          catalogMaterials: selectedContextDirectMaterialRows,
          activeSkuRows,
          orderListTruncated,
        })
      }
    }

    let selectedWorkOrderOrderPackagePriceComparison = { state: 'NOT_REQUESTED' }
    if (selectedOrderPackagePriceComparisonRequested) {
      if (!selectedCatalogWorkOrderId) {
        selectedWorkOrderOrderPackagePriceComparison = { state: 'NO_SELECTED_PLACE_ORDER_WORK_ORDER' }
      } else if (selectedWorkOrderOrderReadState !== 'SUCCEEDED' || !selectedWorkOrderOrderPage
        || !selectedPackagePriceComparisonCatalogReadComplete
        || authIdentityChanged() || !selectedWorkOrderIsCurrent()) {
        selectedWorkOrderOrderPackagePriceComparison = {
          state: 'INCOMPLETE_INPUTS',
          orderReadState: selectedWorkOrderOrderReadState,
          packageCatalogComplete: responseCounts.catalogItemsByKind.package.complete,
          packageDetailsComplete: responseCounts.packageDetails.complete,
        }
      } else {
        const orderListTruncated = selectedWorkOrderOrderPage.totalCount !== undefined
          ? selectedWorkOrderOrderPage.totalCount > selectedWorkOrderOrderPage.items.length
          : selectedWorkOrderOrderPage.items.length >= 3
        selectedWorkOrderOrderPackagePriceComparison = summarizePackagePriceSnapshots({
          expectedWorkOrderId: selectedCatalogWorkOrderId,
          orders: selectedWorkOrderOrderPage.items,
          catalogPackages: selectedOrderCatalogPackageRows,
          packageDetails: selectedOrderPackageDetails,
          packageCatalogComplete: responseCounts.catalogItemsByKind.package.complete,
          packageDetailsComplete: responseCounts.packageDetails.complete,
          orderListTruncated,
        })
      }
    }

    let selectedWorkOrderOrderProviderPriceComparison = { state: 'NOT_REQUESTED' }
    if (selectedOrderProcedureMeasurePriceComparisonRequested) {
      if (!selectedCatalogWorkOrderId) {
        selectedWorkOrderOrderProviderPriceComparison = { state: 'NO_SELECTED_PLACE_ORDER_WORK_ORDER' }
      } else if (selectedWorkOrderOrderReadState !== 'SUCCEEDED' || !selectedWorkOrderOrderPage
        || !selectedProviderPriceComparisonCatalogReadComplete
        || authIdentityChanged() || !selectedWorkOrderIsCurrent()) {
        selectedWorkOrderOrderProviderPriceComparison = {
          state: 'INCOMPLETE_INPUTS',
          orderReadState: selectedWorkOrderOrderReadState,
          procedureCatalogComplete: responseCounts.catalogItemsByKind.procedure.complete,
          measureCatalogComplete: responseCounts.catalogItemsByKind.measure.complete,
        }
      } else {
        const orderListTruncated = selectedWorkOrderOrderPage.totalCount !== undefined
          ? selectedWorkOrderOrderPage.totalCount > selectedWorkOrderOrderPage.items.length
          : selectedWorkOrderOrderPage.items.length >= 3
        selectedWorkOrderOrderProviderPriceComparison = summarizeDirectProviderPriceSnapshots({
          expectedWorkOrderId: selectedCatalogWorkOrderId,
          orders: selectedWorkOrderOrderPage.items,
          catalogProcedures: selectedOrderCatalogProcedureRows,
          catalogMeasures: selectedOrderCatalogMeasureRows,
          procedureCatalogComplete: responseCounts.catalogItemsByKind.procedure.complete,
          measureCatalogComplete: responseCounts.catalogItemsByKind.measure.complete,
          orderListTruncated,
        })
      }
    }

    projectSelectedWorkOrderOrderLineage()

    const fullCatalogReadComplete = responseCounts.catalogContextVerified
      && Object.values(responseCounts.catalogItemsByKind).every(result => result.complete)
      && responseCounts.packageDetails.complete
      && responseCounts.catalogFilterOptions.state === 'SUCCEEDED'
      && responseCounts.materialSalesAttributes.state === 'SUCCEEDED'
      && responseCounts.selectableSkuCatalog.complete
      && blockedUnexpectedNetworkRequests === 0
    const catalogReadComplete = selectedOrderMaterialPriceComparisonRequested
      ? selectedPriceComparisonCatalogReadComplete
      : selectedOrderPackagePriceComparisonRequested
        ? selectedPackagePriceComparisonCatalogReadComplete
        : selectedOrderProcedureMeasurePriceComparisonRequested
          ? selectedProviderPriceComparisonCatalogReadComplete
        : fullCatalogReadComplete
    const contextSearchExhaustedWithoutMatch = !selectedCatalogContext
      && catalogAuditOptions.catalogContextOnly
      && discoveryState === 'ROLE_VISIBLE_WORK_ORDERS_EXHAUSTED'
      && !catalogContextDiscoveryIncomplete
      && roleVisibleWorkOrdersExhausted
      && !authIdentityChanged()
      && blockedUnexpectedNetworkRequests === 0
    const directMaterialSearchExhaustedWithoutMatch = directMaterialOrderDiscoveryRequested
      && !selectedCatalogContext
      && discoveryState === 'NO_DIRECT_MATERIAL_ORDER_IN_ROLE_VISIBLE_SCOPE'
      && roleVisibleWorkOrdersExhausted
      && !catalogContextDiscoveryIncomplete
      && responseCounts.directMaterialOrderDiscovery.orderListsTruncatedAtThree === 0
      && !authIdentityChanged()
      && blockedUnexpectedNetworkRequests === 0
    const directProviderSearchExhaustedWithoutMatch = directProviderOrderDiscoveryRequested
      && !selectedCatalogContext
      && discoveryState === (directMeasureOrderDiscoveryRequested
        ? 'NO_DIRECT_MEASURE_ORDER_IN_ROLE_VISIBLE_SCOPE' : 'NO_DIRECT_PROVIDER_ORDER_IN_ROLE_VISIBLE_SCOPE')
      && roleVisibleWorkOrdersExhausted
      && !catalogContextDiscoveryIncomplete
      && responseCounts.directProviderOrderDiscovery.orderListsTruncatedAtThree === 0
      && !authIdentityChanged()
      && blockedUnexpectedNetworkRequests === 0
    const effectiveOrderProvidersComplete = ['SUCCEEDED', 'NOT_REQUIRED'].includes(responseCounts.effectiveOrderOptionProviders.code.state)
      && ['SUCCEEDED', 'NOT_REQUIRED'].includes(responseCounts.effectiveOrderOptionProviders.cascade.state)
      && routeCounts.orderCodeOptions === (activeOrderCodeProviderIds.length > 0 ? 1 : 0)
      && routeCounts.orderCascadeOptions === (activeOrderCascadeProviderIds.length > 0 ? 1 : 0)
    const activeOrderFieldsComplete = catalogAuditOptions.activeOrderFieldsOnly
      && responseCounts.catalogContextVerified
      && routeCounts.orderExtFields === 1
      && responseCounts.effectiveOrderExtFields.state === 'SUCCEEDED'
      && responseCounts.effectiveOrderExtFields.summary?.truncated === false
      && effectiveOrderProvidersComplete
      && blockedUnexpectedNetworkRequests === 0
      && !authIdentityChanged()
    const auditComplete = catalogAuditOptions.activeOrderFieldsOnly
      ? activeOrderFieldsComplete
      : catalogAuditOptions.catalogContextOnly
      ? Boolean((catalogReadComplete || contextSearchExhaustedWithoutMatch || directMaterialSearchExhaustedWithoutMatch
        || directProviderSearchExhaustedWithoutMatch)
        && (directMaterialOrderDiscoveryRequested && directMaterialSearchExhaustedWithoutMatch
          || directProviderOrderDiscoveryRequested && directProviderSearchExhaustedWithoutMatch
          || !(selectedOrderMaterialPriceComparisonRequested || selectedOrderPackagePriceComparisonRequested
            || selectedOrderProcedureMeasurePriceComparisonRequested)
          || selectedWorkOrderOrderReadState === 'SUCCEEDED' && selectedWorkOrderOrderPage !== null))
      : catalogReadComplete
      && ['SUCCEEDED_WITH_ORDER', 'SUCCEEDED_EMPTY'].includes(responseCounts.sampledOrderMaterialLineage.state)
      && ['MATCH_FOUND', 'NO_SKU_AND_SPU_ORDER_IN_ROLE_VISIBLE_SCOPE'].includes(orderIdentitySearchState)
    const status = catalogAuditOptions.activeOrderFieldsOnly
      ? activeOrderFieldsComplete
        ? 'PROD_READ_ONLY_EFFECTIVE_ORDER_EXTFIELDS_COMPLETE'
        : 'PROD_READ_ONLY_EFFECTIVE_ORDER_EXTFIELDS_INCOMPLETE'
      : catalogAuditOptions.catalogContextOnly
      ? directProviderOrderDiscoveryRequested
        ? directProviderSearchExhaustedWithoutMatch
          ? directMeasureOrderDiscoveryRequested
            ? 'PROD_READ_ONLY_DIRECT_MEASURE_SEARCH_COMPLETE_NO_MATCH'
            : 'PROD_READ_ONLY_DIRECT_PROVIDER_SEARCH_COMPLETE_NO_MATCH'
          : selectedCatalogContext && catalogReadComplete
            ? selectedWorkOrderOrderProviderPriceComparison.state === 'COMPARED'
              ? 'PROD_READ_ONLY_DIRECT_PROVIDER_ORDER_PRICE_COMPARED'
              : 'PROD_READ_ONLY_DIRECT_PROVIDER_ORDER_PRICE_UNKNOWN'
            : 'PROD_READ_ONLY_DIRECT_PROVIDER_SEARCH_INCOMPLETE'
        : directMaterialOrderDiscoveryRequested
        ? directMaterialSearchExhaustedWithoutMatch
          ? 'PROD_READ_ONLY_DIRECT_MATERIAL_SEARCH_COMPLETE_NO_MATCH'
          : selectedCatalogContext && catalogReadComplete
            ? selectedWorkOrderOrderPriceComparison.state === 'COMPARED'
              ? 'PROD_READ_ONLY_DIRECT_MATERIAL_ORDER_PRICE_COMPARED'
              : 'PROD_READ_ONLY_DIRECT_MATERIAL_ORDER_FOUND_PRICE_UNKNOWN'
            : 'PROD_READ_ONLY_DIRECT_MATERIAL_SEARCH_INCOMPLETE'
        : selectedOrderProcedureMeasurePriceComparisonRequested
          ? selectedCatalogContext && catalogReadComplete
            ? selectedWorkOrderOrderProviderPriceComparison.state === 'COMPARED'
              ? 'PROD_READ_ONLY_DIRECT_PROVIDER_ORDER_PRICE_COMPARED'
              : 'PROD_READ_ONLY_DIRECT_PROVIDER_ORDER_PRICE_UNKNOWN'
            : 'PROD_READ_ONLY_DIRECT_PROVIDER_ORDER_PRICE_INCOMPLETE'
        : catalogReadComplete
          ? 'PROD_READ_ONLY_CATALOG_CONTEXT_COMPLETE'
          : contextSearchExhaustedWithoutMatch
            ? 'NO_ADDITIONAL_PLACE_ORDER_CONTEXT'
            : 'PROD_READ_ONLY_CATALOG_CONTEXT_SEARCH_INCOMPLETE'
      : auditComplete ? 'PROD_READ_ONLY_CHAIN_COMPLETE' : 'PROD_READ_ONLY_CHAIN_INCOMPLETE'
    console.log(JSON.stringify({
      status,
      login: 'SUCCEEDED',
      loginRequests,
      sessionStorage: 'MEMORY_ONLY',
      currentRoleAvailable: Boolean(session.currentRole),
      workOrderListState: operationState(workOrders),
      workOrderContextDiscovery: discoveryState,
      selectedWorkOrderContext: responseCounts.catalogContextVerified ? {
        verified: true,
        distinctContextOrdinal: selectedCatalogContextOrdinal,
        ...(directMaterialOrderDiscoveryRequested
          ? { scope: 'role_visible_work_order' }
          : directProviderOrderDiscoveryRequested
            ? { scope: 'role_visible_work_order' }
          : { currentAction: 'place_order' }),
        serviceTypePresent: true,
        sourceTypePresent: true,
        roleVersionPresent: Boolean(session.roleVersion),
      } : { verified: false },
      ...(activeOrderFieldsOnlyRequested ? { boundedConfigEvidence: boundedEvidence.snapshot() } : {}),
      workOrderDetails: details,
      routeCounts,
      responseCounts,
      selectedWorkOrderOrderPriceComparison,
      selectedWorkOrderOrderPackagePriceComparison,
      selectedWorkOrderOrderProviderPriceComparison,
      directProviderOrderDiscovery: responseCounts.directProviderOrderDiscovery,
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
