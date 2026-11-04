import { createServer, loadEnv } from 'vite'
import { resolve } from 'node:path'
import {
  isAllowedLoginRequest,
  isAllowedRoleTreeRequest,
  isAllowedR1ContractRequest,
  isAllowedTypeOneOrderRequest,
  isAllowedWorkOrderListRequest,
  r1ContractQueryBody,
} from './r1-order-contract-read-guard.mjs'

const counters = {
  login: 0, roleTree: 0, roleTreeCacheHits: 0, workOrderList: 0,
  typeOneOrderList: 0, contractList: 0, blockedAttempts: 0,
}
const listedWorkOrderIds = new Set()
const selectedOrderIds = new Set()
const orderLookupWorkOrderIds = new Set()
let currentRoleId = null
let selectedWorkOrderId = null
let cachedRoleTree
let hasCachedRoleTree = false
let stage = 'startup'

function safeParseBody(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function operationState(result) {
  return result?.state === 'succeeded' ? 'SUCCEEDED'
    : result?.state === 'failed_retryable' ? 'FAILED_RETRYABLE' : 'FAILED_TERMINAL'
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)
}

function sameIdentity(record, keys) {
  const values = keys.map(key => record?.[key]).filter(value => value !== undefined && value !== null && value !== '')
  if (values.some(value => typeof value !== 'string' || !validId(value))) return { ok: false }
  const unique = [...new Set(values)]
  return { ok: unique.length <= 1, value: unique[0] }
}

function rowsFromEnvelope(raw) {
  const envelope = safeParseBody(raw)
  if (Array.isArray(envelope)) return envelope
  if (!envelope || typeof envelope !== 'object') return null
  const data = safeParseBody(envelope.data)
  const candidates = [
    envelope.data, envelope.items, envelope.records,
    data?.items, data?.records, data?.data,
  ]
  return candidates.find(Array.isArray) ?? null
}

function numberValue(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : undefined
  if (typeof value === 'string' && /^-?\d{1,3}$/.test(value.trim())) return Number(value)
  return undefined
}

function lineCounts(groups) {
  const counts = { total: 0, supported: 0, unsupported: 0, withCapturedPrice: 0, withSkuSpuIdentity: 0 }
  const visit = (lines) => {
    for (const line of lines) {
      counts.total += 1
      if (line.contentSupported) counts.supported += 1
      else counts.unsupported += 1
      if (typeof line.unitPrice === 'number' && typeof line.lineTotal === 'number') counts.withCapturedPrice += 1
      if (line.identity?.skuId || line.identity?.spuId) counts.withSkuSpuIdentity += 1
      visit(line.children ?? [])
    }
  }
  for (const group of groups) visit(group.lines ?? [])
  return counts
}

function verifyAndSummarizeContracts(raw, orders) {
  const rows = rowsFromEnvelope(raw)
  if (!rows || rows.length > 3) return { ok: false, reason: 'contract_response_shape_or_limit_invalid' }
  const seenIds = new Set()
  const normalized = []
  for (const value of rows) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, reason: 'contract_row_invalid' }
    }
    const row = value
    const contractIdentity = sameIdentity(row, ['_id', 'id'])
    const workOrderIdentity = sameIdentity(row, ['serviceAppointmentId'])
    const orderIdentity = sameIdentity(row, ['orderId'])
    if (!contractIdentity.ok || !contractIdentity.value || !workOrderIdentity.ok
      || workOrderIdentity.value !== selectedWorkOrderId || !orderIdentity.ok || !orderIdentity.value
      || seenIds.has(contractIdentity.value)) {
      return { ok: false, reason: 'contract_identity_or_work_order_mismatch' }
    }
    seenIds.add(contractIdentity.value)
    const exts = row.exts && typeof row.exts === 'object' && !Array.isArray(row.exts) ? row.exts : {}
    const rawContractStatus = exts.contractStatus
    const contractStatus = typeof rawContractStatus === 'number' && Number.isInteger(rawContractStatus)
      ? String(rawContractStatus)
      : typeof rawContractStatus === 'string' && /^-?\d{1,3}$/.test(rawContractStatus.trim())
        ? rawContractStatus.trim() : undefined
    const state = numberValue(row.state)
    if (row.state !== undefined && rawContractStatus !== undefined
      && state !== 1 && contractStatus !== '-2') {
      return { ok: false, reason: 'contract_status_conflicts_with_r1_filter' }
    }
    const orderPosition = orders.findIndex(order => order.id === orderIdentity.value)
    const order = orderPosition >= 0 ? orders[orderPosition] : undefined
    const orderContractId = order?.contractId
    normalized.push({
      id: contractIdentity.value,
      orderPosition: orderPosition < 0 ? null : orderPosition + 1,
      state,
      contractStatus,
      signedDatePresent: typeof row.signedDate === 'string' && row.signedDate.trim().length > 0,
      orderContractIdPresent: Boolean(orderContractId),
      orderContractIdMatches: orderContractId ? orderContractId === contractIdentity.value : null,
    })
  }

  const byOrderPosition = orders.map((order, index) => {
    const matched = normalized.filter(contract => contract.orderPosition === index + 1)
    const exactContractIdRows = matched.filter(contract => contract.orderContractIdMatches === true)
    const contradictoryContractIdRows = matched.filter(contract => contract.orderContractIdMatches === false)
    return {
      orderPosition: index + 1,
      orderContractIdPresent: Boolean(order.contractId),
      contractRowsMatchedByOrderId: matched.length,
      exactOrderContractIdMatches: exactContractIdRows.length,
      contradictoryOrderContractIds: contradictoryContractIdRows.length,
      association: order.contractId
        ? exactContractIdRows.length === 1 && contradictoryContractIdRows.length === 0
          ? 'EXACT_ORDERID_AND_CONTRACTID_MATCH'
          : contradictoryContractIdRows.length > 0 ? 'CONFLICTING_CONTRACTID' : 'NO_EXACT_CONTRACTID_IN_BOUNDED_PAGE'
        : matched.length === 1 ? 'ORDERID_MATCH_BOUNDED_UNIQUENESS_UNKNOWN'
          : matched.length > 1 ? 'MULTIPLE_ORDERID_MATCHES_IN_BOUNDED_PAGE'
            : 'NO_ORDERID_MATCH_IN_BOUNDED_PAGE',
    }
  })

  return {
    ok: true,
    value: {
      boundedRowsReturned: normalized.length,
      pageCompleteness: 'BOUNDED_UNVERIFIED',
      workOrderIdentityMatches: normalized.length,
      orderAssociations: byOrderPosition,
      statuses: normalized.map((contract, index) => ({
        contractPosition: index + 1,
        linkedOrderPosition: contract.orderPosition,
        ...(contract.state === undefined ? {} : { state: contract.state }),
        ...(contract.contractStatus === undefined ? {} : { contractStatus: contract.contractStatus }),
        signedDatePresent: contract.signedDatePresent,
      })),
    },
  }
}

function createRequest(apiBaseUrl) {
  const base = new URL(apiBaseUrl)
  const basePath = base.pathname.replace(/\/+$/, '')
  return options => {
    let url
    try { url = new URL(String(options.url)) } catch {
      counters.blockedAttempts += 1
      options.fail?.(new Error('blocked'))
      return { abort() {} }
    }
    const method = String(options.method ?? '')
    if (url.origin !== base.origin || !url.pathname.startsWith(`${basePath}/`) || method !== 'POST') {
      counters.blockedAttempts += 1
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
      path, method, url.searchParams, options.data, counters.workOrderList + 1,
    )) {
      counters.workOrderList += 1
      safeKind = 'read'
    } else if (path === 'basic/order/query' && listedWorkOrderIds.has(selectedWorkOrderId)
      && !orderLookupWorkOrderIds.has(selectedWorkOrderId)
      && isAllowedTypeOneOrderRequest(options.data, selectedWorkOrderId)) {
      counters.typeOneOrderList += 1
      orderLookupWorkOrderIds.add(selectedWorkOrderId)
      safeKind = 'read'
    } else if (isAllowedR1ContractRequest({
      path, method, search: url.searchParams, body: options.data,
      selectedWorkOrderId, selectedOrderIds, requestCount: counters.contractList,
    })) {
      counters.contractList += 1
      safeKind = 'read'
    }
    if (!safeKind) {
      counters.blockedAttempts += 1
      options.fail?.(new Error('blocked'))
      return { abort() {} }
    }

    const headers = Object.fromEntries(Object.entries(options.header ?? {}).map(([key, value]) => [key, String(value)]))
    const body = options.data === undefined ? undefined
      : typeof options.data === 'string' ? options.data
        : new URLSearchParams(Object.entries(options.data).map(([key, value]) => [key, String(value)])).toString()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    void fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: 'error',
      signal: controller.signal,
    }).then(async response => {
      const text = await response.text()
      let data
      try { data = JSON.parse(text) } catch { data = text }
      if (safeKind === 'role_tree') {
        cachedRoleTree = data
        hasCachedRoleTree = true
      }
      options.success?.({ statusCode: response.status, data })
    }).catch(() => {
      options.fail?.(new Error('read_failed'))
    }).finally(() => clearTimeout(timer))
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
      { createSemanticStorageAdapter }, { createUniApiReadTransport },
      { createRoleScopedTechnicianApiReadAdapter }, { createQuotationOrderReadAdapter },
      { isProductionReadOnlyTarget }, { isBusinessMockMode },
      { sessionAuthorizationFingerprint },
    ] = await Promise.all([
      vite.ssrLoadModule('/src/app/runtime-config.ts'),
      vite.ssrLoadModule('/src/features/session/quick-login.ts'),
      vite.ssrLoadModule('/src/adapters/auth/auth-session-adapter.ts'),
      vite.ssrLoadModule('/src/adapters/auth/uni-auth-backend.ts'),
      vite.ssrLoadModule('/src/adapters/storage/storage-adapter.ts'),
      vite.ssrLoadModule('/src/adapters/api/uni-api-read-transport.ts'),
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
      console.log(JSON.stringify({ status: 'BLOCKED_PREFLIGHT', preflight, networkRequests: 0 }))
      process.exitCode = 1
      return
    }
    if (!process.argv.includes('--execute')) {
      console.log(JSON.stringify({ status: 'READY_NO_NETWORK', preflight, networkRequests: 0 }))
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
    if (login.state !== 'succeeded' || !login.data) {
      console.log(JSON.stringify({
        status: 'LOGIN_FAILED', loginState: operationState(login),
        requestCounts: { ...counters }, businessMutationRequests: 0,
      }))
      process.exitCode = 1
      return
    }
    const session = login.data
    currentRoleId = session.currentRole?.id ?? null
    const roleVersion = session.roleVersion
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
        roleVersionPresent: Boolean(roleVersion?.trim()),
        requestCounts: { ...counters }, businessMutationRequests: 0,
      }))
      process.exitCode = 1
      return
    }
    let technicianApi
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
      {
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
    const orderApi = createQuotationOrderReadAdapter(
      apiTransport,
      id => listedWorkOrderIds.has(id) && technicianApi.isWorkOrderListedForCurrentSession?.(id) === true,
      identityForCurrentSession,
    )

    let selectedWorkOrderPage = 0
    let selectedWorkOrderOrdinal = 0
    let workOrderPagesRead = 0
    let workOrdersChecked = 0
    let orders = null
    let scanFailure = null
    let reachedEnd = false
    const seenWorkOrderIds = new Set()

    for (let page = 1; ; page += 1) {
      stage = `role_visible_work_order_page_${page}`
      // A fresh adapter keeps only the current page's three WorkOrder IDs in
      // its in-memory order-read authorization set. The role-tree response is
      // reused from this run's memory cache; no repeated network lookup.
      technicianApi = createTechnicianApi()
      const workOrderResult = await technicianApi.listWorkOrders({ page, pageSize: 3 })
      workOrderPagesRead += 1
      if (counters.blockedAttempts !== 0) {
        scanFailure = 'STOPPED_ON_BLOCKED_UNEXPECTED_REQUEST'
        break
      }
      if (identityForCurrentSession() !== identityAtStart
        || workOrderResult.state !== 'succeeded' || !workOrderResult.data) {
        scanFailure = 'WORK_ORDER_LIST_NOT_VERIFIED'
        break
      }
      const pageItems = workOrderResult.data.items
      if (pageItems.length > 3) {
        scanFailure = 'BLOCKED_WORK_ORDER_PAGE_EXCEEDED_LIMIT'
        break
      }
      if (pageItems.length === 0) {
        reachedEnd = true
        break
      }

      for (const item of pageItems) {
        const id = String(item.id)
        if (!validId(id)) {
          scanFailure = 'BLOCKED_INVALID_WORK_ORDER_ID'
          break
        }
        if (seenWorkOrderIds.has(id)) {
          scanFailure = 'BLOCKED_UNSTABLE_WORK_ORDER_PAGINATION'
          break
        }
        seenWorkOrderIds.add(id)
        listedWorkOrderIds.add(id)
      }
      if (scanFailure) break

      for (let ordinal = 0; ordinal < pageItems.length; ordinal += 1) {
        const item = pageItems[ordinal]
        selectedWorkOrderId = String(item.id)
        workOrdersChecked += 1
        stage = `type_one_order_page_for_candidate_${workOrdersChecked}`
        const ordersResult = await orderApi.listTypeOneOrdersForWorkOrder(selectedWorkOrderId, 3)
        if (counters.blockedAttempts !== 0) {
          scanFailure = 'STOPPED_ON_BLOCKED_UNEXPECTED_REQUEST'
          break
        }
        if (identityForCurrentSession() !== identityAtStart
          || !technicianApi.isWorkOrderListedForCurrentSession?.(selectedWorkOrderId)) {
          scanFailure = 'BLOCKED_SESSION_OR_WORK_ORDER_SCOPE_CHANGED'
          break
        }
        if (ordersResult.state !== 'succeeded' || !ordersResult.data) {
          scanFailure = 'ORDER_LIST_NOT_VERIFIED'
          break
        }
        const candidateOrders = ordersResult.data.items
        if (candidateOrders.length > 3
          || candidateOrders.some(order => order.type !== 1 || order.serviceAppointmentId !== selectedWorkOrderId)
          || new Set(candidateOrders.map(order => order.id)).size !== candidateOrders.length) {
          scanFailure = 'BLOCKED_ORDER_IDENTITY_OR_LIMIT_MISMATCH'
          break
        }
        if (candidateOrders.length > 0) {
          orders = candidateOrders
          selectedWorkOrderPage = page
          selectedWorkOrderOrdinal = ordinal + 1
          for (const order of orders) selectedOrderIds.add(order.id)
          break
        }
      }
      if (scanFailure || orders) break

      const totalCount = workOrderResult.data.totalCount
      if (totalCount !== undefined && page * 3 >= totalCount) {
        reachedEnd = true
        break
      }
      if (totalCount === undefined && pageItems.length < 3) {
        reachedEnd = true
        break
      }
    }

    if (scanFailure) {
      console.log(JSON.stringify({
        status: scanFailure, workOrderPagesRead, workOrdersChecked,
        requestCounts: { ...counters }, businessMutationRequests: 0,
      }))
      process.exitCode = 1
      return
    }
    if (!orders || !selectedWorkOrderId) {
      console.log(JSON.stringify({
        status: reachedEnd ? 'NO_FORMAL_ORDER_IN_ROLE_VISIBLE_WORK_ORDER_SCAN' : 'WORK_ORDER_SCAN_INCOMPLETE',
        workOrderPagesRead, workOrdersChecked, contractQuery: 'NOT_RUN_NO_ORDER_ID',
        requestCounts: { ...counters }, businessMutationRequests: 0,
      }))
      return
    }
    const pricedLines = lineCounts(orders.flatMap(order => order.groups))

    stage = 'bounded_r1_contract_status_read'
    const contractBody = r1ContractQueryBody(selectedWorkOrderId)
    const contractGuard = isAllowedR1ContractRequest({
      path: 'basic/contract/query.do', method: 'POST', search: new URLSearchParams(),
      body: contractBody, selectedWorkOrderId, selectedOrderIds, requestCount: counters.contractList,
    })
    if (!contractGuard || identityForCurrentSession() !== identityAtStart
      || !technicianApi.isWorkOrderListedForCurrentSession?.(selectedWorkOrderId)) {
      console.log(JSON.stringify({ status: 'BLOCKED_CONTRACT_SCOPE_CHECK', requestCounts: { ...counters } }))
      process.exitCode = 1
      return
    }
    const endpoint = `${runtime.value.environment.apiBaseUrl.replace(/\/+$/, '')}/basic/contract/query.do`
    const contractResponse = await requestResponse(request, {
      url: endpoint,
      method: 'POST',
      data: new URLSearchParams(Object.entries(contractBody).map(([key, value]) => [key, String(value)])).toString(),
      header: {
        Cookie: `JSESSIONID=${auth.getCurrentSession()?.sessionRef ?? ''}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      dataType: 'json',
      timeout: 20000,
    })
    if (identityForCurrentSession() !== identityAtStart || !technicianApi.isWorkOrderListedForCurrentSession?.(selectedWorkOrderId)) {
      console.log(JSON.stringify({ status: 'BLOCKED_SESSION_OR_WORK_ORDER_SCOPE_CHANGED_AFTER_CONTRACT', requestCounts: { ...counters } }))
      process.exitCode = 1
      return
    }
    if (contractResponse.statusCode < 200 || contractResponse.statusCode >= 300) {
      console.log(JSON.stringify({
        status: 'CONTRACT_QUERY_FAILED', httpStatusClass: Math.floor(contractResponse.statusCode / 100),
        requestCounts: { ...counters }, businessMutationRequests: 0,
      }))
      process.exitCode = 1
      return
    }
    const contractSummary = verifyAndSummarizeContracts(contractResponse.data, orders)
    if (!contractSummary.ok) {
      console.log(JSON.stringify({
        status: 'CONTRACT_RESPONSE_NOT_VERIFIED', reason: contractSummary.reason,
        requestCounts: { ...counters }, businessMutationRequests: 0,
      }))
      process.exitCode = 1
      return
    }
    if (counters.login !== 1 || counters.roleTree !== 1
      || counters.roleTreeCacheHits !== workOrderPagesRead - 1
      || counters.workOrderList !== workOrderPagesRead
      || counters.typeOneOrderList !== workOrdersChecked
      || counters.contractList !== 1 || counters.blockedAttempts !== 0) {
      console.log(JSON.stringify({
        status: 'REQUEST_COUNT_INVARIANT_FAILED', requestCounts: { ...counters },
        businessMutationRequests: 0,
      }))
      process.exitCode = 1
      return
    }
    console.log(JSON.stringify({
      status: 'R1_BOUNDED_READ_COMPLETED',
      technicianRolePresent: true,
      roleVersionPresent: Boolean(roleVersion?.trim()),
      loginRequests: counters.login,
      roleTreeReads: counters.roleTree,
      cachedRoleTreeReuses: counters.roleTreeCacheHits,
      workOrderScan: {
        pagesRead: workOrderPagesRead,
        candidatesChecked: workOrdersChecked,
        selectedPage: selectedWorkOrderPage,
        selectedOrdinal: selectedWorkOrderOrdinal,
        pageSize: 3,
      },
      typeOneOrders: { page: 1, limit: 3, returned: orders.length, workOrderIdentityMatches: orders.length },
      priceProjection: pricedLines,
      contractQuery: { page: 1, limit: 3, sourceFilter: 'R1_SERVICE_APPOINTMENT_STATE_OR_STATUS', ...contractSummary.value },
      quoteTypeZero: 'NOT_READ',
      requestCounts: { ...counters },
      blockedUnexpectedAttempts: counters.blockedAttempts,
      businessMutationRequests: 0,
      persistentLocalStorage: 'NOT_USED',
      rawPayloadsOrIdentitiesPersisted: false,
    }))
  } finally {
    await vite.close()
  }
}

run().catch(() => {
  console.log(JSON.stringify({
    status: 'BLOCKED_OR_FAILED_WITH_SANITIZED_ERROR', stage,
    requestCounts: { ...counters }, blockedUnexpectedAttempts: counters.blockedAttempts,
    businessMutationRequests: 0, persistentLocalStorage: 'NOT_USED',
  }))
  process.exitCode = 1
})
