const catalogRoutes = new Set([
  'biz/projPackage/queryWithRank',
  'biz/procedure/queryWithRank',
  'basic/material/queryWithRank',
  'biz/measure/queryWithRank',
])
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/

function entriesOf(value) {
  if (typeof value === 'string') return [...new URLSearchParams(value).entries()]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).map(([key, item]) => [key, String(item)])
}

function recordOf(value) {
  const entries = entriesOf(value)
  if (entries.length === 0 || new Set(entries.map(([key]) => key)).size !== entries.length) return null
  return Object.fromEntries(entries)
}

function hasExactKeys(record, expected) {
  const actual = Object.keys(record).sort()
  const keys = [...expected].sort()
  return actual.length === keys.length && actual.every((key, index) => key === keys[index])
}

function noSearchParams(search) {
  return search instanceof URLSearchParams && [...search.keys()].length === 0
}

/** Audit-only page reads: exact WorkOrder context, R1 active filters, no `_all`. */
export function r1BoundedSelectableCatalogPageBody(context, page = 1) {
  return {
    page,
    rows: 20,
    'is:state|integer#and': 1,
    'in:serviceType|array#and': context.serviceType,
    sourceType: context.sourceType,
    sortField: 'order,_id',
    sortOrder: 'asc',
  }
}

export function isAllowedR1SelectableCatalogPageRequest({
  path, method, search, body, context, expectedPage, requestCount, maxRequestCount = 200,
}) {
  if (!catalogRoutes.has(path) || method !== 'POST' || !noSearchParams(search)
    || !context || !ID_PATTERN.test(context.workOrderId ?? '')
    || typeof context.serviceType !== 'string' || !context.serviceType.trim()
    || typeof context.sourceType !== 'string' || !context.sourceType.trim()
    || !Number.isSafeInteger(expectedPage) || expectedPage < 1 || expectedPage > 50
    || !Number.isSafeInteger(requestCount) || requestCount < 0
    || !Number.isSafeInteger(maxRequestCount) || maxRequestCount < 1 || requestCount >= maxRequestCount) return false

  const actual = recordOf(body)
  const expected = recordOf(r1BoundedSelectableCatalogPageBody(context, expectedPage))
  return Boolean(actual && hasExactKeys(actual, Object.keys(expected))
    && Object.entries(expected).every(([key, value]) => actual[key] === value))
}

/** R1 direct-material selector SKU read, changed only from `_all` to bounded page/rows. */
export function r1BoundedSelectableSkuRequestBody(spuId, page = 1) {
  return { page, rows: 30, 'is:state|integer#and': 1, spuid: spuId }
}

/** R1 package selector queries all of one package's material SPUs together. */
export function r1BoundedSelectablePackageSkuRequestBody(spuIds, page = 1) {
  return { page, rows: 30, 'is:state|integer#and': 1, 'in:spuid|array#and': spuIds.join(',') }
}

/** Audit-only SKU pages are allowed only for a SPU returned by a scoped catalog/package read. */
export function isAllowedR1SelectableCatalogSkuPageRequest({
  path, method, search, body, selectedSpuId, listedSpuIds,
  expectedPage, requestCount, maxRequestCount = 1000,
}) {
  if (path !== 'basic/material/query' || method !== 'POST' || !noSearchParams(search)
    || !ID_PATTERN.test(selectedSpuId ?? '')
    || !(listedSpuIds instanceof Set) || !listedSpuIds.has(selectedSpuId)
    || !Number.isSafeInteger(expectedPage) || expectedPage < 1 || expectedPage > 50
    || !Number.isSafeInteger(requestCount) || requestCount < 0
    || !Number.isSafeInteger(maxRequestCount) || maxRequestCount < 1 || requestCount >= maxRequestCount) return false
  const actual = recordOf(body)
  const expected = recordOf(r1BoundedSelectableSkuRequestBody(selectedSpuId, expectedPage))
  return Boolean(actual && expected && hasExactKeys(actual, Object.keys(expected))
    && Object.entries(expected).every(([key, value]) => actual[key] === value))
}

/** R1 package SKU pages are bounded and limited to one fully read package. */
export function isAllowedR1SelectablePackageSkuPageRequest({
  path, method, search, body, selectedSpuIds, listedSpuIds,
  expectedPage, requestCount, maxRequestCount = 1000,
}) {
  if (path !== 'basic/material/query' || method !== 'POST' || !noSearchParams(search)
    || !Array.isArray(selectedSpuIds) || selectedSpuIds.length < 1 || selectedSpuIds.length > 30
    || selectedSpuIds.some(id => !ID_PATTERN.test(id)) || new Set(selectedSpuIds).size !== selectedSpuIds.length
    || !(listedSpuIds instanceof Set) || selectedSpuIds.some(id => !listedSpuIds.has(id))
    || !Number.isSafeInteger(expectedPage) || expectedPage < 1 || expectedPage > 50
    || !Number.isSafeInteger(requestCount) || requestCount < 0
    || !Number.isSafeInteger(maxRequestCount) || maxRequestCount < 1 || requestCount >= maxRequestCount) return false
  const actual = recordOf(body)
  const expected = recordOf(r1BoundedSelectablePackageSkuRequestBody(selectedSpuIds, expectedPage))
  return Boolean(actual && expected && hasExactKeys(actual, Object.keys(expected))
    && Object.entries(expected).every(([key, value]) => actual[key] === value))
}
