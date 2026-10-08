const productionApiHosts = new Set(['xlink.fsgo365.cn'])
const workOrderSearchFields = ['title', 'name', 'phone', 'address', 'describe', 'orderNum'] as const

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
