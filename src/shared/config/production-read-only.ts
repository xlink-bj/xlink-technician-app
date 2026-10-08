const productionApiHosts = new Set(['xlink.fsgo365.cn'])

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
  if (
    path !== 'biz/extForm/queryByColName/leakageCause'
    || path.includes('?')
    || path.includes('#')
    || input.method !== 'POST'
  ) return false
  if (input.query && Object.keys(input.query).length > 0) return false
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

export function isProductionRoleMutationPath(path: string): boolean {
  return normalizedApiRoute(path) === 'function/changeRole'
}
