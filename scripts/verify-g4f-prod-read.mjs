import { createServer, loadEnv } from 'vite'
import { resolve } from 'node:path'

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
}
let loginRequests = 0
let blockedUnexpectedNetworkRequests = 0
let stage = 'vite_start'
const listedWorkOrderIds = new Set()
const listedPackageIds = new Set()
const responseCounts = {
  workOrderListRows: 0,
  workOrderDetailsSucceeded: 0,
  activePlaceOrderNodes: 0,
  currentActionPlaceOrder: 0,
  detailsWithCatalogContext: 0,
  catalogItemsByKind: { package: 0, procedure: 0, material: 0, measure: 0 },
  packageDetailState: 'NOT_RUN',
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
    '_all',
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
    && body.get('_all') === '1'
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
    routeCounts.workOrderList += 1
    return 'read'
  }
  const workOrderDetailPrefix = 'basic/serviceAppointment/queryById/'
  if (relativePath.startsWith(workOrderDetailPrefix)) {
    const id = decodeURIComponent(relativePath.slice(workOrderDetailPrefix.length))
    if (!listedWorkOrderIds.has(id)) return null
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
    routeCounts[catalogRoute[0]] += 1
    return 'read'
  }
  const packageDetailPrefix = 'biz/projPackage/findById/'
  if (relativePath.startsWith(packageDetailPrefix)) {
    const id = decodeURIComponent(relativePath.slice(packageDetailPrefix.length))
    if (!listedPackageIds.has(id)) return null
    routeCounts.packageDetail += 1
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
    stage = 'create_read_adapters'
    const apiTransport = createUniApiReadTransport({
      apiBaseUrl: runtime.value.environment.apiBaseUrl,
      getSessionRef: () => auth.getCurrentSession()?.sessionRef ?? null,
      getMockActor: () => ({ userId: session.user.id, ...(session.currentRole ? { roleId: session.currentRole.id } : {}) }),
      request,
      timeoutMs: 20000,
    })
    const technicianApi = createRoleScopedTechnicianApiReadAdapter(
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
    const catalogApi = createQuotationCatalogReadAdapter(apiTransport, () => {
      const current = auth.getCurrentSession()
      return current ? {
        sessionRef: current.sessionRef,
        userId: current.user.id,
        roleId: current.currentRole?.id ?? null,
        roleVersion: current.roleVersion ?? null,
      } : null
    })
    const orderApi = createQuotationOrderReadAdapter(
      apiTransport,
      (workOrderId) => listedWorkOrderIds.has(workOrderId)
        && technicianApi.isWorkOrderListedForCurrentSession?.(workOrderId) === true,
    )

    stage = 'work_order_list_read'
    const workOrders = await technicianApi.listWorkOrders({ page: 1, pageSize: 3 })
    responseCounts.workOrderListRows = workOrders.state === 'succeeded' && workOrders.data ? workOrders.data.items.length : 0
    for (const workOrder of workOrders.data?.items ?? []) listedWorkOrderIds.add(String(workOrder.id))

    const details = []
    const detailResults = []
    for (const [index, workOrder] of (workOrders.data?.items ?? []).slice(0, 3).entries()) {
      stage = `work_order_detail_read_${index + 1}`
      const detail = await technicianApi.getWorkOrderDetail(workOrder.id)
      detailResults.push(detail)
      if (detail.state !== 'succeeded' || !detail.data) {
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
    }

    const hasCatalogIdentity = (lines) => lines.some((line) => Boolean(line.identity.skuId || line.identity.spuId) || hasCatalogIdentity(line.children))
    const countLines = (lines) => lines.reduce((count, line) => count + 1 + countLines(line.children), 0)
    for (const [index, workOrder] of (workOrders.data?.items ?? []).slice(0, 3).entries()) {
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

    const selectedDetailId = details.findIndex((detail) => detail.catalogContext)
    if (selectedDetailId >= 0) {
      stage = 'catalog_list_reads'
      const detail = detailResults[selectedDetailId]
      const context = detail?.state === 'succeeded' ? detail.data?.quotationCatalogContext : undefined
      if (context?.serviceType) {
        const [packages, procedures, materials, measures] = await Promise.all([
          catalogApi.listPackages(context),
          catalogApi.listProcedures(context),
          catalogApi.listMaterials(context),
          catalogApi.listMeasures(context),
        ])
        for (const [kind, result] of [['package', packages], ['procedure', procedures], ['material', materials], ['measure', measures]]) {
          responseCounts.catalogItemsByKind[kind] = result.state === 'succeeded' && result.data ? result.data.items.length : 0
        }
        for (const item of packages.data?.items ?? []) listedPackageIds.add(item.id)
        const selectedPackage = packages.data?.items[0]
        if (selectedPackage) {
          stage = 'package_detail_read'
          const packageDetail = await catalogApi.getPackageDetail(selectedPackage.id)
          responseCounts.packageDetailState = operationState(packageDetail)
        } else {
          responseCounts.packageDetailState = 'NO_PACKAGE_RETURNED'
        }
      }
    }

    console.log(JSON.stringify({
      login: 'SUCCEEDED',
      loginRequests,
      sessionStorage: 'MEMORY_ONLY',
      currentRoleAvailable: Boolean(session.currentRole),
      workOrderListState: operationState(workOrders),
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
