const MATERIAL_CODE_TENANT_ID = '1340835581184723420'
const MATERIAL_SALES_PAGE_ROWS = 50
const MATERIAL_SKU_PAGE_ROWS = 30
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

export function r1MaterialSalesFieldsRequestBody() {
  return {
    page: 1,
    rows: MATERIAL_SALES_PAGE_ROWS,
    sortField: 'order',
    sortOrder: 'asc',
    colName: 'material',
    'is:state|integer#and': 1,
  }
}

export function r1MaterialSkuRequestBody(spuId) {
  return {
    page: 1,
    rows: MATERIAL_SKU_PAGE_ROWS,
    'is:state|integer#and': 1,
    spuid: spuId,
  }
}

/** Audit-only exact Order detail read; IDs must come from the current role-scoped type=1 list. */
export function isAllowedR1ListedOrderDetailRead({
  path, method, search, body, requestCount, maxRequestCount = 100,
  selectedOrderId, selectedWorkOrderId, orderWorkOrderById,
  lookedUpOrderIds, workOrderDetailReadCount = 0, maxPerWorkOrder = 3,
}) {
  if (path !== 'basic/order/queryById' || method !== 'POST' || !noSearchParams(search)
    || !Number.isSafeInteger(requestCount) || requestCount < 0
    || !Number.isSafeInteger(maxRequestCount) || maxRequestCount < 1 || requestCount >= maxRequestCount
    || !Number.isSafeInteger(workOrderDetailReadCount) || workOrderDetailReadCount < 0
    || !Number.isSafeInteger(maxPerWorkOrder) || maxPerWorkOrder < 1 || workOrderDetailReadCount >= maxPerWorkOrder
    || !ID_PATTERN.test(selectedOrderId ?? '') || !ID_PATTERN.test(selectedWorkOrderId ?? '')
    || !(orderWorkOrderById instanceof Map) || orderWorkOrderById.get(selectedOrderId) !== selectedWorkOrderId
    || !(lookedUpOrderIds instanceof Set) || lookedUpOrderIds.has(selectedOrderId)) return false
  const actual = recordOf(body)
  return Boolean(actual && hasExactKeys(actual, ['id']) && actual.id === selectedOrderId)
}

export function r1MaterialCodeOptionsRequestBody(valueOptionIds) {
  return {
    jsonPara: JSON.stringify(valueOptionIds.map(id => ({ codeId: id, eleid: id }))),
    tenantId: MATERIAL_CODE_TENANT_ID,
  }
}

export function isAllowedR1MaterialSalesFieldsRequest({ path, method, search, body, requestCount }) {
  if (path !== 'biz/extField/query' || method !== 'POST' || !noSearchParams(search) || requestCount !== 0) return false
  const actual = recordOf(body)
  const expected = recordOf(r1MaterialSalesFieldsRequestBody())
  return Boolean(actual && expected && hasExactKeys(actual, Object.keys(expected))
    && Object.entries(expected).every(([key, value]) => actual[key] === value))
}

export function isAllowedR1MaterialCodeOptionsRequest({ path, method, search, body, requestCount, expectedValueOptionIds }) {
  if (path !== 'i/code/selectCode.do' || method !== 'POST' || !noSearchParams(search) || requestCount !== 0
    || !Array.isArray(expectedValueOptionIds) || expectedValueOptionIds.length < 1
    || expectedValueOptionIds.length > 30
    || expectedValueOptionIds.some(id => typeof id !== 'string' || !ID_PATTERN.test(id))
    || new Set(expectedValueOptionIds).size !== expectedValueOptionIds.length) return false
  const actual = recordOf(body)
  if (!actual || !hasExactKeys(actual, ['jsonPara', 'tenantId']) || actual.tenantId !== MATERIAL_CODE_TENANT_ID) return false
  let providers
  try { providers = JSON.parse(actual.jsonPara) } catch { return false }
  if (!Array.isArray(providers) || providers.length !== expectedValueOptionIds.length) return false
  const seen = new Set()
  for (const provider of providers) {
    if (!provider || typeof provider !== 'object' || Array.isArray(provider)
      || !hasExactKeys(provider, ['codeId', 'eleid'])
      || typeof provider.codeId !== 'string' || !ID_PATTERN.test(provider.codeId)
      || provider.eleid !== provider.codeId || seen.has(provider.codeId)) return false
    seen.add(provider.codeId)
  }
  return expectedValueOptionIds.every(id => seen.has(id))
}

export function isAllowedR1SingleSpuMaterialSkuRequest({ path, method, search, body, requestCount, selectedSpuId }) {
  if (path !== 'basic/material/query' || method !== 'POST' || !noSearchParams(search) || requestCount !== 0
    || typeof selectedSpuId !== 'string' || !ID_PATTERN.test(selectedSpuId)) return false
  const actual = recordOf(body)
  const expected = recordOf(r1MaterialSkuRequestBody(selectedSpuId))
  return Boolean(actual && expected && hasExactKeys(actual, Object.keys(expected))
    && Object.entries(expected).every(([key, value]) => actual[key] === value))
}

/** Read one active SKU page only for a SPU extracted from a scoped Order and not yet queried. */
export function isAllowedR1OrderDerivedSpuMaterialSkuRequest({
  path, method, search, body, requestCount, maxRequestCount = 100,
  selectedSpuId, orderDerivedSpuIds, lookedUpSpuIds,
}) {
  if (path !== 'basic/material/query' || method !== 'POST' || !noSearchParams(search)
    || !Number.isSafeInteger(requestCount) || requestCount < 0
    || !Number.isSafeInteger(maxRequestCount) || maxRequestCount < 1 || requestCount >= maxRequestCount
    || typeof selectedSpuId !== 'string' || !ID_PATTERN.test(selectedSpuId)
    || !(orderDerivedSpuIds instanceof Set) || !orderDerivedSpuIds.has(selectedSpuId)
    || !(lookedUpSpuIds instanceof Set) || lookedUpSpuIds.has(selectedSpuId)) return false
  const actual = recordOf(body)
  const expected = recordOf(r1MaterialSkuRequestBody(selectedSpuId))
  return Boolean(actual && expected && hasExactKeys(actual, Object.keys(expected))
    && Object.entries(expected).every(([key, value]) => actual[key] === value))
}

export const r1SkuReadAuditBounds = Object.freeze({
  materialSalesRows: MATERIAL_SALES_PAGE_ROWS,
  materialSkuRows: MATERIAL_SKU_PAGE_ROWS,
})
