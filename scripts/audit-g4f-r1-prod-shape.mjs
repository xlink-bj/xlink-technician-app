import { createServer, loadEnv } from 'vite'
import { resolve } from 'node:path'

const counts = {
  login: 0,
  roleTree: 0,
  workOrderList: 0,
  workOrderDetail: 0,
  orderList: 0,
  packageList: 0,
  procedureList: 0,
  materialList: 0,
  measureList: 0,
  packageDetail: 0,
  blockedNetwork: 0,
}
const listedWorkOrderIds = new Set()
const listedPackageIds = new Set()

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function pathValue(object, path) {
  let value = object
  for (const key of path.split('.')) value = record(value)?.[key]
  return value
}

function valueType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function fieldShape(rows, fields) {
  const result = {}
  for (const field of fields) {
    const types = {}
    let present = 0
    for (const row of rows) {
      const value = pathValue(row, field)
      if (value !== undefined) {
        present += 1
        const type = valueType(value)
        types[type] = (types[type] ?? 0) + 1
      }
    }
    result[field] = { present, absent: rows.length - present, types }
  }
  return result
}

const catalogFields = {
  package: ['id', 'name', 'unit', 'specification', 'type', 'code', 'ageLimit', 'price', 'minimumPrice', 'pricingMethod', 'repairPart', 'serviceTypes', 'sourceTypeList'],
  procedure: ['id', 'name', 'unit', 'guideUnitPrice', 'minimumGuideTotalPrice', 'serviceTypes', 'sourceTypeList'],
  material: ['id', 'name', 'unit', 'specification', 'code', 'type', 'spuId', 'materialUnit', 'specUnit', 'price', 'servicePrice', 'serviceCostPrice', 'storeCostPrice', 'cost', 'serviceTypes', 'sourceTypeList'],
  measure: ['id', 'name', 'unit', 'guideUnitPrice', 'minimumGuideTotalPrice', 'cost', 'serviceTypes', 'sourceTypeList'],
}

function summarizePackageDetail(result) {
  if (result.state !== 'succeeded' || !result.data) return { state: result.state }
  const detail = result.data
  const components = [...detail.procedures, ...detail.materials, ...detail.measures]
  return {
    state: result.state,
    packageFields: fieldShape([detail.package], catalogFields.package),
    childCounts: {
      procedures: detail.procedures.length,
      materials: detail.materials.length,
      measures: detail.measures.length,
    },
    childFields: fieldShape(components, ['kind', 'referenceId', 'number', 'coefficient', 'coefficientUnit', 'unit', 'order', 'layer', 'price', 'item']),
    embeddedMaterialFields: fieldShape(detail.materials.flatMap((row) => row.item ? [row.item] : []), catalogFields.material),
  }
}

function summarizeOrder(result) {
  if (result.state !== 'succeeded' || !result.data) return { state: result.state, rows: 0 }
  const orders = result.data.items
  const groups = orders.flatMap((order) => order.groups)
  const lines = groups.flatMap((group) => group.lines)
  return {
    state: result.state,
    rows: orders.length,
    orderFields: fieldShape(orders, ['id', 'type', 'serviceAppointmentId', 'originPrice', 'totalPrice', 'groups']),
    groupCount: groups.length,
    groupFields: fieldShape(groups, ['repairParts', 'partDescription', 'maintainAreaNum', 'totalAmount', 'lines']),
    lineCountsByKind: Object.fromEntries(['package', 'procedure', 'material', 'measure'].map((kind) => [kind, lines.filter((line) => line.kind === kind).length])),
    lineIdentityFields: fieldShape(lines.map((line) => line.identity), ['providerRowId', 'providerReferenceId', 'spuId', 'skuId', 'spuCode', 'skuCode']),
  }
}

function exactCatalogBody(body, expectedContext) {
  if (!body || body._all !== '1' || body['is:state|integer#and'] !== 1
    || body['in:serviceType|array#and'] !== expectedContext.serviceType
    || body.sortField !== 'order,_id' || body.sortOrder !== 'asc') return false
  const allowed = ['_all', 'is:state|integer#and', 'in:serviceType|array#and', 'sourceType', 'sortField', 'sortOrder']
  return Object.keys(body).every((key) => allowed.includes(key))
    && (expectedContext.sourceType === undefined
      ? !Object.hasOwn(body, 'sourceType')
      : body.sourceType === expectedContext.sourceType)
}

function exactOrderBody(body) {
  if (!body || body._all !== '1' || body.page !== 1 || body.rows !== 1
    || body.sortField !== 'createTime' || body.sortOrder !== 'desc'
    || body['is:type|integer#and'] !== 1) return false
  const workOrderId = body['is:serviceAppointmentId|string#and']
  return typeof workOrderId === 'string' && listedWorkOrderIds.has(workOrderId)
    && Object.keys(body).length === 7
}

async function run() {
  const root = process.cwd()
  const vite = await createServer({
    configFile: false,
    root,
    mode: 'prod',
    envDir: root,
    resolve: { alias: {
      '@': resolve(root, 'src'),
      '@app': resolve(root, 'src/app'),
      '@shared': resolve(root, 'src/shared'),
      '@adapters': resolve(root, 'src/adapters'),
      '@runtimes': resolve(root, 'src/runtimes'),
      '@features': resolve(root, 'src/features'),
    } },
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  try {
    const [runtimeConfig, quickLoginModule, authModule, authDriverModule, storageModule, transportModule, technicianModule, catalogModule, orderModule, safetyModule, mockModule] = await Promise.all([
      vite.ssrLoadModule('/src/app/runtime-config.ts'),
      vite.ssrLoadModule('/src/features/session/quick-login.ts'),
      vite.ssrLoadModule('/src/adapters/auth/auth-session-adapter.ts'),
      vite.ssrLoadModule('/src/adapters/auth/uni-auth-backend.ts'),
      vite.ssrLoadModule('/src/adapters/storage/storage-adapter.ts'),
      vite.ssrLoadModule('/src/adapters/api/uni-api-read-transport.ts'),
      vite.ssrLoadModule('/src/adapters/api/technician-api.ts'),
      vite.ssrLoadModule('/src/adapters/api/quotation-catalog-api.ts'),
      vite.ssrLoadModule('/src/adapters/api/quotation-order-api.ts'),
      vite.ssrLoadModule('/src/shared/config/production-read-only.ts'),
      vite.ssrLoadModule('/src/adapters/api/mock/config.ts'),
    ])
    const runtime = runtimeConfig.loadApplicationRuntimeConfig()
    const quickLogin = quickLoginModule.resolveQuickLoginInput()
    const env = loadEnv('prod', root, 'VITE_')
    const preflight = {
      productionTarget: runtime.ok && safetyModule.isProductionReadOnlyTarget('prod', runtime.value.environment.apiBaseUrl),
      quickLoginConfigured: Boolean(quickLogin),
      mockOff: mockModule.isBusinessMockMode() === 'off',
      realWritesDisabled: env.VITE_XLINK_ENABLE_REAL_WRITES === 'false',
    }
    if (Object.values(preflight).some((value) => !value)) {
      console.log(JSON.stringify({ status: 'BLOCKED_PREFLIGHT', preflight, requests: 0 }))
      process.exitCode = 1
      return
    }
    if (process.argv.includes('--preflight-only')) {
      console.log(JSON.stringify({ status: 'PREFLIGHT_PASS', preflight, requests: 0 }))
      return
    }

    const inMemory = new Map()
    const storage = storageModule.createSemanticStorageAdapter({
      get: async (key) => inMemory.get(key) ?? null,
      set: async (key, value) => { inMemory.set(key, value) },
      remove: async (key) => { inMemory.delete(key) },
      listKeys: async () => [...inMemory.keys()],
    })
    const base = new URL(runtime.value.environment.apiBaseUrl)
    const request = (options) => {
      const url = new URL(String(options.url))
      const route = url.pathname.slice(base.pathname.replace(/\/$/, '').length).replace(/^\/+/, '')
      const query = Object.fromEntries(url.searchParams.entries())
      const parsedBody = options.data && typeof options.data === 'object' && !Array.isArray(options.data)
        ? options.data
        : typeof options.data === 'string' ? Object.fromEntries(new URLSearchParams(options.data)) : undefined
      const body = parsedBody ? { ...parsedBody } : undefined
      if (body) {
        for (const key of ['page', 'rows', 'is:state|integer#and', 'is:type|integer#and']) {
          if (typeof body[key] === 'string' && /^\d+$/.test(body[key])) body[key] = Number(body[key])
        }
      }
      let allowed = url.origin === base.origin && options.method === 'POST' && !url.hash

      if (route === 'index/phoneLogin.do') {
        allowed = allowed && counts.login === 0 && Object.keys(query).length === 0
        if (allowed) counts.login += 1
      } else if (route === 'function/queryTreeByRoleId') {
        allowed = allowed && counts.roleTree === 0 && (!body || Object.keys(body).length === 0)
          && Object.keys(query).length === 1 && Boolean(query.roleId)
        if (allowed) counts.roleTree += 1
      } else if (route === 'basic/serviceAppointment/query' || route === 'basic/serviceAppointment/querySAWorkflowNode') {
        allowed = allowed && counts.workOrderList === 0 && Object.keys(query).length === 0
        if (allowed) counts.workOrderList += 1
      } else if (route.startsWith('basic/serviceAppointment/queryById/')) {
        const id = decodeURIComponent(route.slice('basic/serviceAppointment/queryById/'.length))
        allowed = allowed && Object.keys(query).length === 0 && listedWorkOrderIds.has(id)
        if (allowed) counts.workOrderDetail += 1
      } else if (route === 'basic/order/query') {
        allowed = allowed && counts.orderList === 0 && Object.keys(query).length === 0 && exactOrderBody(body)
        if (allowed) counts.orderList += 1
      } else if (['biz/projPackage/queryWithRank', 'biz/procedure/queryWithRank', 'basic/material/queryWithRank', 'biz/measure/queryWithRank'].includes(route)) {
        allowed = allowed && Object.keys(query).length === 0 && expectedContext !== undefined && exactCatalogBody(body, expectedContext)
        if (allowed) counts[{ 'biz/projPackage/queryWithRank': 'packageList', 'biz/procedure/queryWithRank': 'procedureList', 'basic/material/queryWithRank': 'materialList', 'biz/measure/queryWithRank': 'measureList' }[route]] += 1
      } else if (route.startsWith('biz/projPackage/findById/')) {
        const id = decodeURIComponent(route.slice('biz/projPackage/findById/'.length))
        allowed = allowed && counts.packageDetail === 0 && Object.keys(query).length === 0 && listedPackageIds.has(id)
        if (allowed) counts.packageDetail += 1
      } else {
        allowed = false
      }

      if (allowed && route !== 'index/phoneLogin.do') {
        allowed = safetyModule.isProductionReadOnlyReadAllowed({
          path: route,
          method: options.method,
          body: body && Object.keys(body).length > 0 ? body : undefined,
          query,
        })
      }

      if (!allowed) {
        counts.blockedNetwork += 1
        options.fail?.(new Error('audit network guard blocked request'))
        return { abort() {} }
      }
      const headers = Object.fromEntries(Object.entries(options.header ?? {}).map(([key, value]) => [key, String(value)]))
      const payload = body === undefined || Object.keys(body).length === 0 ? undefined : new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])).toString()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20000)
      void fetch(url, { method: 'POST', headers, ...(payload === undefined ? {} : { body: payload }), redirect: 'error', signal: controller.signal })
        .then(async (response) => {
          const text = await response.text()
          let data
          try { data = JSON.parse(text) } catch { data = text }
          options.success?.({ statusCode: response.status, data })
        })
        .catch(() => options.fail?.(new Error('read request failed')))
        .finally(() => clearTimeout(timer))
      return { abort: () => controller.abort() }
    }

    const authBackend = authDriverModule.createUniAuthBackendDriver({ apiBaseUrl: runtime.value.environment.apiBaseUrl, request, timeoutMs: 20000 })
    const auth = authModule.createAuthSessionAdapter(authBackend, storage, runtime.value.authWireConfig)
    const login = await auth.startSession(quickLogin)
    if (login.state !== 'succeeded' || !login.data) {
      console.log(JSON.stringify({ status: 'LOGIN_BLOCKED', loginState: login.state, requests: counts }))
      process.exitCode = 1
      return
    }
    const session = login.data
    const apiTransport = transportModule.createUniApiReadTransport({
      apiBaseUrl: runtime.value.environment.apiBaseUrl,
      getSessionRef: () => auth.getCurrentSession()?.sessionRef ?? null,
      getMockActor: () => ({ userId: session.user.id, ...(session.currentRole ? { roleId: session.currentRole.id } : {}) }),
      request,
      timeoutMs: 20000,
    })
    const technicianApi = technicianModule.createRoleScopedTechnicianApiReadAdapter(
      apiTransport,
      () => auth.getCurrentSession()?.currentRole?.id ?? null,
      {
        cascadeTenantId: runtime.value.authWireConfig.tenant,
        codeTenantId: runtime.value.authWireConfig.tenant,
        getReadAuthorizationScope: () => {
          const current = auth.getCurrentSession()
          return current ? { sessionRef: current.sessionRef, userId: current.user.id, roleId: current.currentRole?.id ?? null, roleVersion: current.roleVersion ?? null } : null
        },
      },
    )
    const catalogApi = catalogModule.createQuotationCatalogReadAdapter(apiTransport, () => auth.getCurrentSession()?.sessionRef ?? null)
    const orderApi = orderModule.createQuotationOrderReadAdapter(apiTransport, (workOrderId) =>
      listedWorkOrderIds.has(workOrderId) && technicianApi.isWorkOrderListedForCurrentSession?.(workOrderId) === true)

    const workOrders = await technicianApi.listWorkOrders({ page: 1, pageSize: 3 })
    if (workOrders.state !== 'succeeded' || !workOrders.data) {
      console.log(JSON.stringify({ status: 'WORK_ORDER_LIST_BLOCKED', listState: workOrders.state, requests: counts }))
      process.exitCode = 1
      return
    }
    for (const item of workOrders.data.items) listedWorkOrderIds.add(String(item.id))

    let selectedWorkOrderId
    let context
    let detailReads = 0
    for (const item of workOrders.data.items.slice(0, 3)) {
      detailReads += 1
      const detail = await technicianApi.getWorkOrderDetail(item.id)
      if (detail.state === 'succeeded' && detail.data?.quotationCatalogContext?.serviceType) {
        selectedWorkOrderId = String(item.id)
        context = detail.data.quotationCatalogContext
        break
      }
    }
    if (!selectedWorkOrderId || !context) {
      console.log(JSON.stringify({ status: 'NO_SCOPED_CATALOG_CONTEXT', workOrderRows: workOrders.data.items.length, detailReads, requests: counts }))
      process.exitCode = 1
      return
    }
    expectedContext = context

    const [orders, packages, procedures, materials, measures] = await Promise.all([
      orderApi.listTypeOneOrdersForWorkOrder(selectedWorkOrderId, 1),
      catalogApi.listPackages(context),
      catalogApi.listProcedures(context),
      catalogApi.listMaterials(context),
      catalogApi.listMeasures(context),
    ])
    const catalogs = { package: packages, procedure: procedures, material: materials, measure: measures }
    const catalogEvidence = {}
    for (const [kind, result] of Object.entries(catalogs)) {
      if (result.state !== 'succeeded' || !result.data) {
        catalogEvidence[kind] = { state: result.state, rows: 0 }
        continue
      }
      catalogEvidence[kind] = {
        state: result.state,
        rows: result.data.items.length,
        fields: fieldShape(result.data.items, catalogFields[kind]),
      }
    }

    const packageIds = packages.state === 'succeeded' && packages.data ? packages.data.items.map((item) => item.id) : []
    for (const id of packageIds.slice(0, 200)) listedPackageIds.add(id)
    let packageDetail
    if (packageIds[0]) packageDetail = summarizePackageDetail(await catalogApi.getPackageDetail(packageIds[0]))

    console.log(JSON.stringify({
      status: 'PROD_READ_ONLY_SCOPED',
      requests: counts,
      selectedWorkOrder: 'LIST_DERIVED_IN_MEMORY_ONLY',
      catalogContext: 'DERIVED_FROM_LIST_DERIVED_WORK_ORDER_DETAIL_IN_MEMORY_ONLY',
      order: summarizeOrder(orders),
      catalogs: catalogEvidence,
      packageDetail: packageDetail ?? { state: 'NOT_RUN' },
      productionBusinessMutationRequests: 0,
      rawPayloadsOrIdentifiersPersisted: false,
    }))
  } finally {
    void vite.close()
  }
}

let expectedContext
run().catch((error) => {
  console.log(JSON.stringify({ status: 'BLOCKED_OR_FAILED', errorKind: error instanceof Error ? error.name : 'UNKNOWN', requests: counts, productionBusinessMutationRequests: 0 }))
  process.exitCode = 1
}).then(() => process.exit(process.exitCode ?? 0))
