const productionApiHosts = new Set(['xlink.fsgo365.cn'])
const workOrderSearchFields = ['title', 'name', 'phone', 'address', 'describe', 'orderNum'] as const
const quotationCatalogListRoutes = new Set([
  'biz/projPackage/queryWithRank',
  'biz/procedure/queryWithRank',
  'basic/material/queryWithRank',
  'biz/measure/queryWithRank',
])

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

export function apiHostForSafetyCheck(apiBaseUrl: unknown): string | undefined {
  if (typeof apiBaseUrl !== 'string') return undefined
  const match = /^https?:\/\/([^/:?#]+)(?::\d+)?(?:[/?#]|$)/i.exec(apiBaseUrl.trim())
  return match?.[1]?.toLowerCase()
}

export function isProductionApiHost(apiBaseUrl: unknown): boolean {
  const host = apiHostForSafetyCheck(apiBaseUrl)
  return host !== undefined && productionApiHosts.has(host)
}

/** Production is always read-only; recognizing the canonical host also fails closed on mislabeled builds. */
export function isProductionReadOnlyTarget(environment: unknown, apiBaseUrl: unknown): boolean {
  return environment === 'prod' || isProductionApiHost(apiBaseUrl)
}

export function isProductionReadOnlyRuntime(): boolean {
  return isProductionReadOnlyTarget(
    import.meta.env.VITE_XLINK_ENVIRONMENT,
    import.meta.env.VITE_XLINK_API_BASE_URL,
  )
}

export function normalizedApiRoute(path: string): string {
  return path.replace(/^\/+/, '').split('?')[0]
}

/** Only exact source-verified read requests belong in the Production allowlist. */
export function isProductionReadOnlyReadAllowed(input: {
  readonly path: string
  readonly method: string
  readonly body?: Readonly<Record<string, unknown>>
  readonly query?: Readonly<Record<string, string>>
}): boolean {
  const path = input.path.replace(/^\/+/, '')
  if (path.includes('?') || path.includes('#') || input.method !== 'POST') return false

  const query = input.query ?? {}
  const queryKeys = Object.keys(query)
  if (path === 'function/queryTreeByRoleId') {
    return input.body === undefined
      && queryKeys.length === 1
      && queryKeys[0] === 'roleId'
      && /^[A-Za-z0-9_-]{1,100}$/.test(query.roleId)
  }

  if (path === 'basic/serviceAppointment/query' || path === 'basic/serviceAppointment/querySAWorkflowNode') {
    return queryKeys.length === 0 && isBoundedWorkOrderListBody(input.body)
  }

  const detailPrefix = 'basic/serviceAppointment/queryById/'
  if (path.startsWith(detailPrefix)) {
    const encodedId = path.slice(detailPrefix.length)
    let id: string
    try {
      id = decodeURIComponent(encodedId)
    } catch {
      return false
    }
    return /^[A-Za-z0-9_-]{1,100}$/.test(id)
      && queryKeys.length === 0
      && (input.body === undefined || Object.keys(input.body).length === 0)
  }

  // Contract-verified POST read. The transport *also* requires the parent ID
  // to have appeared in a role-listed Work Order's authorized detail and
  // rechecks session/role before exposing any response.
  const childWorkflowPrefix = 'workflow/queryByParentWorkflowNodeId/'
  if (path.startsWith(childWorkflowPrefix)) {
    const parentNodeId = path.slice(childWorkflowPrefix.length)
    return input.path === path
      && /^[A-Za-z0-9_-]{1,100}$/.test(parentNodeId)
      && queryKeys.length === 0
      && (input.body === undefined || Object.keys(input.body).length === 0)
  }

  // Repeat list, never arbitrary FormData detail. Runtime transport separately
  // proves the exact (form definition, workflow run) pair from a role-listed
  // Work Order's verified main/child node; syntax alone grants no authority.
  const repeatFormPrefix = 'biz/extForm/query/'
  if (path.startsWith(repeatFormPrefix)) {
    const definitionId = decodePathIdentity(path.slice(repeatFormPrefix.length))
    return input.path === path && definitionId !== null
      && queryKeys.length === 0 && isBoundedRepeatFormListBody(input.body)
  }

  if (quotationCatalogListRoutes.has(path)) {
    return queryKeys.length === 0 && isBoundedQuotationCatalogListBody(input.body)
  }

  const packageDetailPrefix = 'biz/projPackage/findById/'
  if (path.startsWith(packageDetailPrefix)) {
    const id = decodePathIdentity(path.slice(packageDetailPrefix.length))
    return id !== null
      && queryKeys.length === 0
      && (input.body === undefined || Object.keys(input.body).length === 0)
  }

  // Order browse must stay scoped to a Work Order already selected from the
  // authenticated role-scoped list. Never enumerate a tenant-wide Order page;
  // basic/order/queryById also has no tenant guard and remains blocked.
  if (path === 'basic/order/query') {
    return queryKeys.length === 0 && isBoundedWorkOrderQuotationListBody(input.body)
  }

  if (path !== 'biz/extForm/queryByColName/leakageCause' || queryKeys.length > 0) return false
  const body = input.body
  if (!body) return false
  const keys = Object.keys(body).sort()
  return keys.length === 3
    && keys[0] === '_all'
    && keys[1] === 'sortField'
    && keys[2] === 'sortOrder'
    && body._all === '1'
    && body.sortField === 'partOrder,leakageCauseOrder'
    && body.sortOrder === 'asc'
}

function decodePathIdentity(encoded: string): string | null {
  let id: string
  try {
    id = decodeURIComponent(encoded)
  } catch {
    return null
  }
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : null
}

function isBoundedRepeatFormListBody(body: Readonly<Record<string, unknown>> | undefined): boolean {
  if (!body) return false
  const required = [
    'sortField', 'sortOrder', 'is:workflowId|string#and',
    'ne:state|integer#and', 'page', 'rows',
  ]
  const keys = Object.keys(body)
  const runId = body['is:workflowId|string#and']
  return keys.length === required.length && required.every((key) => hasOwn(body, key))
    && body.sortField === 'createTime' && body.sortOrder === 'desc'
    && typeof runId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(runId)
    && body['ne:state|integer#and'] === -1
    && body.page === 1 && Number.isInteger(body.rows)
    && typeof body.rows === 'number' && body.rows >= 1 && body.rows <= 20
}

function isBoundedQuotationCatalogListBody(body: Readonly<Record<string, unknown>> | undefined): boolean {
  if (!body) return false
  const required = ['_all', 'is:state|integer#and', 'in:serviceType|array#and', 'sortField', 'sortOrder']
  const keys = Object.keys(body)
  if (required.some((key) => !hasOwn(body, key))) return false
  if (keys.some((key) => !required.includes(key) && key !== 'sourceType')) return false
  if (body._all !== '1' || body['is:state|integer#and'] !== 1) return false
  if (body.sortField !== 'order,_id' || body.sortOrder !== 'asc') return false
  const serviceType = body['in:serviceType|array#and']
  if (typeof serviceType !== 'string' || !/^[A-Za-z0-9,._-]{1,200}$/.test(serviceType)) return false
  return !hasOwn(body, 'sourceType')
    || typeof body.sourceType === 'string' && /^[A-Za-z0-9,._-]{1,100}$/.test(body.sourceType)
}

function isBoundedWorkOrderQuotationListBody(body: Readonly<Record<string, unknown>> | undefined): boolean {
  if (!body) return false
  // R1 FlipPageInfo treats _all=1 as an instruction to expand rows to the
  // total. Requiring it here would block the actual bounded adapter request;
  // allowing it would bypass the backend 1/3-row limit. Fail closed on _all.
  const required = [
    'page',
    'rows',
    'sortField',
    'sortOrder',
    'is:serviceAppointmentId|string#and',
    'is:type|integer#and',
  ]
  const keys = Object.keys(body)
  if (required.length !== keys.length || required.some((key) => !hasOwn(body, key))) return false
  const workOrderId = body['is:serviceAppointmentId|string#and']
  return body.page === 1
    && (body.rows === 1 || body.rows === 3)
    && body.sortField === 'createTime'
    && body.sortOrder === 'desc'
    && body['is:type|integer#and'] === 1
    && typeof workOrderId === 'string'
    && /^[A-Za-z0-9_-]{1,100}$/.test(workOrderId)
}

function isBoundedWorkOrderListBody(body: Readonly<Record<string, unknown>> | undefined): boolean {
  if (!body) return false
  const required = ['page', 'rows', 'sortField', 'sortOrder', 'is:state|integer#and']
  const allowed = new Set([
    ...required,
    'orderState',
    'in:status|array#and',
    ...workOrderSearchFields.map((field) => `regex:${field}|string#or`),
  ])
  const keys = Object.keys(body)
  if (required.some((key) => !hasOwn(body, key)) || keys.some((key) => !allowed.has(key))) return false

  const page = Number(body.page)
  const rows = Number(body.rows)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(rows) || rows < 1 || rows > 50) return false
  if (body.sortOrder !== 'desc' || !['createTime', 'updateTime'].includes(String(body.sortField))) return false
  if (body['is:state|integer#and'] !== 1) return false

  if (hasOwn(body, 'orderState') && (typeof body.orderState !== 'string' || body.orderState.length > 40)) return false
  if (hasOwn(body, 'in:status|array#and') && (typeof body['in:status|array#and'] !== 'string' || body['in:status|array#and'].length > 120)) return false

  return workOrderSearchFields.every((field) => {
    const key = `regex:${field}|string#or`
    if (!hasOwn(body, key)) return true
    const value = body[key]
    return typeof value === 'string' && value.length <= 100
  })
}

export function isProductionRoleMutationPath(path: string): boolean {
  return normalizedApiRoute(path) === 'function/changeRole'
}
