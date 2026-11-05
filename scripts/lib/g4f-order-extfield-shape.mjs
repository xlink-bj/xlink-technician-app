export const ORDER_EXTFIELD_ROUTE = 'biz/extField/query'
export const ORDER_EXTFIELD_PAGE_LIMIT = 50
export const ORDER_EXTFIELD_TENANT_SENTINEL = '__current_account_tenant__'

const allowedShowList = new Set([1, 2, 3, 4, 5, 6])
const knownOperationTypes = new Set(['editable', 'readonly', 'creatable'])
const runtimeSupportedTypes = new Set([
  'text', 'textarea', 'phone', 'IDNumber', 'number', 'digit', 'date', 'time', 'datetime',
  'select', 'bizSelect', 'cascade', 'radio', 'checkbox', 'switch', 'rate', 'file', 'image',
])
const identifierPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function safeIdentifier(value) {
  return typeof value === 'string' && identifierPattern.test(value) ? value : undefined
}

function safeType(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value) ? value : 'UNKNOWN'
}

function booleanFrom(value) {
  if (value === true || value === 1 || value === '1') return true
  if (value === false || value === 0 || value === '0') return false
  return null
}

function parsedConfig(value) {
  if (typeof value === 'string') {
    if (value.length > 64_000) return {}
    try {
      return record(JSON.parse(value)) ?? {}
    } catch {
      return {}
    }
  }
  return record(value) ?? {}
}

function visibilityKind(value) {
  if (value === 1 || value === '1') return 'ALWAYS'
  if (value === 2 || value === '2') return 'WHEN_VALUE_EXISTS'
  if (value === 3 || value === '3') return 'CONDITIONAL'
  return 'UNKNOWN'
}

function stageKind(value) {
  if (value === 'placeOrder') return 'PLACE_ORDER'
  if (value === 'submitOrder') return 'SUBMIT_ORDER'
  return 'UNKNOWN'
}

function providerKind(fieldType, hasValueOption) {
  switch (fieldType) {
    case 'code':
    case 'select':
    case 'radio':
    case 'checkbox':
      return hasValueOption ? 'CODE_PROVIDER' : 'PROVIDER_MISSING'
    case 'cascade':
      return hasValueOption ? 'CASCADE_PROVIDER' : 'PROVIDER_MISSING'
    case 'bizSelect':
      return 'DYNAMIC_PROVIDER_UNTRUSTED'
    default:
      return hasValueOption ? 'UNCLASSIFIED_PROVIDER' : 'NONE'
  }
}

function runtimeCapability(fieldType) {
  if (fieldType === 'gap') return 'PRESENTATION_ONLY'
  return runtimeSupportedTypes.has(fieldType) ? 'SUPPORTED_GENERIC' : 'UNSUPPORTED'
}

function providerReadiness(kind) {
  if (kind === 'PROVIDER_MISSING') return 'BLOCKED_PROVIDER_MISSING'
  if (kind === 'DYNAMIC_PROVIDER_UNTRUSTED') return 'BLOCKED_DYNAMIC_PROVIDER_UNTRUSTED'
  if (kind === 'CODE_PROVIDER' || kind === 'CASCADE_PROVIDER' || kind === 'UNCLASSIFIED_PROVIDER') {
    return 'CONFIGURED_REQUIRES_RUNTIME_MAPPING_REVIEW'
  }
  return 'NOT_REQUIRED_OR_INLINE'
}

function safeShowList(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && allowedShowList.has(entry)))].sort((a, b) => a - b)
}

export function buildOrderExtFieldRequestBody() {
  return Object.freeze({
    tenantId: ORDER_EXTFIELD_TENANT_SENTINEL,
    colName: 'order',
    'is:state|integer#and': '1',
    'in:showList|string#and': '4',
    sortField: 'order',
    sortOrder: 'asc',
    page: '1',
    size: String(ORDER_EXTFIELD_PAGE_LIMIT),
  })
}

export function parseOrderExtFieldPage(payload) {
  const page = record(payload)
  if (!page || !Array.isArray(page.data) || page.data.length > ORDER_EXTFIELD_PAGE_LIMIT) {
    return { ok: false, reason: 'INVALID_PAGE_SHAPE' }
  }
  const total = Number(page.total)
  if (!Number.isInteger(total) || total < page.data.length) {
    return { ok: false, reason: 'INVALID_TOTAL' }
  }
  if (!page.data.every((row) => record(row) !== undefined)) {
    return { ok: false, reason: 'INVALID_ROW_SHAPE' }
  }
  return { ok: true, rows: page.data, total }
}

export function sanitizeOrderExtFieldPage(payload) {
  const parsed = parseOrderExtFieldPage(payload)
  if (!parsed.ok) return parsed

  const keyAliases = new Map()
  const rowAliases = new Map()
  parsed.rows.forEach((field, index) => {
    const key = safeIdentifier(field.name)
    if (key) {
      const aliases = rowAliases.get(key) ?? []
      aliases.push(`Field-${String(index + 1).padStart(2, '0')}`)
      rowAliases.set(key, aliases)
      if (!keyAliases.has(key)) keyAliases.set(key, `ValueKey-${String(keyAliases.size + 1).padStart(2, '0')}`)
    }
  })

  const fields = parsed.rows.map((field, index) => {
    const config = parsedConfig(field.frontEndConfig)
    const key = safeIdentifier(field.name)
    const type = safeType(field.type)
    const valueOptionConfigured = typeof field.valueOption === 'string' && field.valueOption.length > 0
    const serviceTypes = Array.isArray(config.serviceType)
      ? config.serviceType
      : typeof config.serviceType === 'string' && config.serviceType.length > 0
        ? [config.serviceType]
        : undefined
    const dependency = safeIdentifier(config.showField ?? field.showField)
    const dispensableDependency = safeIdentifier(config.dispensableField)
    const operationType = typeof field.operationType === 'string' && knownOperationTypes.has(field.operationType)
      ? field.operationType.toUpperCase()
      : 'UNKNOWN'

    const aliasesForDependency = dependency ? rowAliases.get(dependency) ?? [] : []
    const aliasesForDispensableDependency = dispensableDependency ? rowAliases.get(dispensableDependency) ?? [] : []

    const fieldProvider = providerKind(type, valueOptionConfigured)

    return {
      row: `Field-${String(index + 1).padStart(2, '0')}`,
      valueKeyAlias: key ? keyAliases.get(key) : 'UNSAFE_OR_MISSING',
      labelConfigured: typeof field.nameDisp === 'string' && field.nameDisp.trim().length > 0,
      type,
      enabled: booleanFrom(field.state),
      showList: safeShowList(field.showList),
      showListShape: Array.isArray(field.showList) ? 'VALID_ARRAY' : 'UNKNOWN',
      required: booleanFrom(field.required),
      multiple: booleanFrom(field.multiple),
      operationType,
      visibility: visibilityKind(field.showType),
      stage: stageKind(config.showType),
      applicability: {
        serviceTypeRestricted: serviceTypes !== undefined,
        serviceTypeRuleCount: serviceTypes?.length ?? 0,
        personTypeRestricted: config.personType !== undefined && config.personType !== null && config.personType !== '',
      },
      condition: {
        present: dependency !== undefined,
        dependsOn: dependency
          ? aliasesForDependency.length === 1 ? aliasesForDependency[0] : aliasesForDependency.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED'
          : null,
        comparisonValue: dependency ? 'REDACTED' : null,
      },
      dispensableRule: {
        present: dispensableDependency !== undefined,
        dependsOn: dispensableDependency
          ? aliasesForDispensableDependency.length === 1 ? aliasesForDispensableDependency[0] : aliasesForDispensableDependency.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED'
          : null,
        comparisonValue: dispensableDependency ? 'REDACTED' : null,
      },
      provider: {
        kind: fieldProvider,
        configured: valueOptionConfigured,
        readiness: providerReadiness(fieldProvider),
      },
      runtimeCapability: runtimeCapability(type),
    }
  })

  return {
    ok: true,
    total: parsed.total,
    returned: fields.length,
    truncated: parsed.total > fields.length,
    pageLimit: ORDER_EXTFIELD_PAGE_LIMIT,
    fields,
  }
}

export function r1ServiceTypeApplies(config, serviceType) {
  const configured = config.serviceType
  // This intentionally follows placeOrders.vue's source expression:
  // configured && current ? configured.indexOf(current) !== -1 : true.
  if (!configured || !serviceType) return { state: 'applies' }
  if (Array.isArray(configured) || typeof configured === 'string') {
    return { state: configured.indexOf(serviceType) !== -1 ? 'applies' : 'filtered' }
  }
  return { state: 'blocked' }
}

export function r1PersonTypeApplies(config, personType) {
  const configured = config.personType
  if (!configured) return { state: 'applies' }
  if (configured === null || typeof configured === 'object') return { state: 'blocked' }
  // R1 uses loose equality for this field. Restrict the projection to the
  // primitive values supported by that comparison; no coercion of objects.
  const left = typeof configured === 'boolean' ? Number(configured) : configured
  const right = typeof personType === 'boolean' ? Number(personType) : personType
  if (typeof left !== 'string' && typeof left !== 'number') return { state: 'blocked' }
  if (typeof right !== 'string' && typeof right !== 'number') return { state: 'blocked' }
  const matches = typeof left === 'string' && typeof right === 'string'
    ? left === right
    : Number.isNaN(Number(left)) || Number.isNaN(Number(right))
      ? false
      : Number(left) === Number(right)
  return { state: matches ? 'applies' : 'filtered' }
}

function summarizeEffectiveRows(rows) {
  const byType = Object.create(null)
  let required = 0
  let configuredProviders = 0
  let conditional = 0
  let unsupported = 0
  let presentationOnly = 0
  for (const row of rows) {
    byType[row.type] = (byType[row.type] ?? 0) + 1
    if (row.required === true) required += 1
    if (row.provider.configured) configuredProviders += 1
    if (row.condition.present) conditional += 1
    if (row.runtimeCapability === 'UNSUPPORTED') unsupported += 1
    if (row.runtimeCapability === 'PRESENTATION_ONLY') presentationOnly += 1
  }
  return {
    rows: rows.length,
    required,
    byType,
    configuredProviders,
    conditional,
    unsupported,
    presentationOnly,
  }
}

/**
 * Sanitized per-context projection of the bounded active Order ExtField page.
 * It mirrors R1's client-side `getFields()` stage/service/person filtering;
 * it intentionally emits no raw key, label, option ID/value, or field value.
 */
export function summarizeEffectiveOrderExtFieldPage(payload, context) {
  const sanitized = sanitizeOrderExtFieldPage(payload)
  if (!sanitized.ok) return sanitized
  if (typeof context?.serviceType !== 'string' || !context.serviceType.trim()) {
    return { ok: false, reason: 'SERVICE_TYPE_REQUIRED' }
  }
  const parsed = parseOrderExtFieldPage(payload)
  if (!parsed.ok) return parsed
  const placeOrder = []
  const submitOrder = []
  let blockedServiceRules = 0
  let blockedPersonRules = 0
  let unknownStageRows = 0
  for (const field of parsed.rows) {
    const config = parsedConfig(field.frontEndConfig)
    const stage = config.showType
    if (stage !== 'placeOrder' && stage !== 'submitOrder') {
      unknownStageRows += 1
      continue
    }
    const service = r1ServiceTypeApplies(config, context.serviceType)
    if (service.state === 'blocked') {
      blockedServiceRules += 1
      continue
    }
    if (service.state === 'filtered') continue
    if (stage === 'placeOrder') {
      placeOrder.push(field)
      continue
    }
    const person = r1PersonTypeApplies(config, context.personType ?? '0')
    if (person.state === 'blocked') {
      blockedPersonRules += 1
      continue
    }
    if (person.state === 'applies') submitOrder.push(field)
  }
  const rowIndexByIdentity = new Map(parsed.rows.map((_, index) => [parsed.rows[index], index]))
  const sanitizedByIndex = new Map(sanitized.fields.map(field => [Number(field.row.slice('Field-'.length)) - 1, field]))
  const project = (rows) => summarizeEffectiveRows(rows.map(row => sanitizedByIndex.get(rowIndexByIdentity.get(row))))
  return {
    ok: true,
    total: sanitized.total,
    returned: sanitized.returned,
    truncated: sanitized.truncated,
    pageLimit: sanitized.pageLimit,
    r1Projection: 'SOURCE_GET_FIELDS_SHOW_TYPE_SERVICE_TYPE_PERSON_TYPE',
    context: {
      serviceTypePresent: true,
      submitOrderPersonTypeSource: context.personType === undefined ? 'R1_DEFAULT_0' : 'EXPLICIT_CONTEXT',
    },
    effective: {
      placeOrder: project(placeOrder),
      submitOrder: project(submitOrder),
      blockedServiceRules,
      blockedPersonRules,
      unknownStageRows,
    },
    providers: 'OMITTED_FROM_FIELD_SUMMARY',
  }
}

/** Returns only ephemeral provider IDs for the exact effective fields. Do not persist this value. */
export function effectiveOrderExtFieldProviderPlan(payload, context) {
  const parsed = parseOrderExtFieldPage(payload)
  if (!parsed.ok) return parsed
  if (typeof context?.serviceType !== 'string' || !context.serviceType.trim()) {
    return { ok: false, reason: 'SERVICE_TYPE_REQUIRED' }
  }
  const codeIds = []
  const cascadeIds = []
  const codeSet = new Set()
  const cascadeSet = new Set()
  for (const field of parsed.rows) {
    const config = parsedConfig(field.frontEndConfig)
    if (config.showType !== 'placeOrder' && config.showType !== 'submitOrder') continue
    if (r1ServiceTypeApplies(config, context.serviceType).state !== 'applies') continue
    if (config.showType === 'submitOrder'
      && r1PersonTypeApplies(config, context.personType ?? '0').state !== 'applies') continue
    if (typeof field.valueOption !== 'string' || field.valueOption.length === 0) continue
    if (!['code', 'select', 'radio', 'checkbox', 'cascade'].includes(field.type)) continue
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(field.valueOption)) return { ok: false, reason: 'INVALID_PROVIDER_ID' }
    const isCascade = field.type === 'cascade'
    const target = isCascade ? cascadeIds : codeIds
    const seen = isCascade ? cascadeSet : codeSet
    if (!seen.has(field.valueOption)) {
      seen.add(field.valueOption)
      target.push(field.valueOption)
    }
  }
  if (codeIds.length > 30 || cascadeIds.length > 10) return { ok: false, reason: 'PROVIDER_LIMIT_EXCEEDED' }
  return { ok: true, codeIds, cascadeIds }
}

export function providerRows(payload) {
  let value = payload
  if (typeof value === 'string' && value.length <= 1_000_000) {
    try { value = JSON.parse(value) } catch { return null }
  }
  if (Array.isArray(value)) return value
  const outer = record(value)
  let nested = outer?.data
  if (typeof nested === 'string' && nested.length <= 1_000_000) {
    try { nested = JSON.parse(nested) } catch { return null }
  }
  if (Array.isArray(nested)) return nested
  if (Array.isArray(record(nested)?.items)) return record(nested).items
  return null
}

/** Counts Code options and identity completeness without retaining labels or option values. */
export function sanitizeOrderCodeProviderResponse(payload, expectedIds) {
  if (!Array.isArray(expectedIds) || expectedIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id))) {
    return { ok: false, reason: 'INVALID_EXPECTED_PROVIDER_IDS' }
  }
  if (expectedIds.length === 0) return { ok: true, providers: 0, options: 0, emptyProviders: 0 }
  const rows = providerRows(payload)
  if (!rows || rows.length > expectedIds.length) return { ok: false, reason: 'INVALID_PROVIDER_RESPONSE' }
  const expected = new Set(expectedIds)
  const seen = new Set()
  let options = 0
  let emptyProviders = 0
  for (const raw of rows) {
    const row = record(raw)
    if (!row || typeof row.eleid !== 'string' || !expected.has(row.eleid) || seen.has(row.eleid)) {
      return { ok: false, reason: 'PROVIDER_IDENTITY_MISMATCH' }
    }
    let values = row.options
    if (typeof values === 'string' && values.length <= 1_000_000) {
      try { values = JSON.parse(values) } catch { return { ok: false, reason: 'PROVIDER_OPTIONS_INVALID' } }
    }
    values = record(values)
    if (!values) return { ok: false, reason: 'PROVIDER_OPTIONS_MISSING' }
    const count = Object.keys(values).length
    options += count
    if (count === 0) emptyProviders += 1
    seen.add(row.eleid)
  }
  return {
    ok: true,
    providers: rows.length,
    missingProviders: expectedIds.length - seen.size,
    options,
    emptyProviders,
  }
}

/** Counts a multistage Code tree without retaining any labels or option values. */
export function sanitizeOrderCascadeProviderResponse(payload, expectedTypes) {
  if (!Array.isArray(expectedTypes) || expectedTypes.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id))) {
    return { ok: false, reason: 'INVALID_EXPECTED_PROVIDER_IDS' }
  }
  if (expectedTypes.length === 0) return { ok: true, providers: 0, nodes: 0, leaves: 0, maxDepth: 0, terminalNodesWithEmptyChildren: 0 }
  const rows = providerRows(payload)
  if (!rows || rows.length > expectedTypes.length) return { ok: false, reason: 'INVALID_PROVIDER_RESPONSE' }
  const expected = new Set(expectedTypes)
  const seen = new Set()
  let nodes = 0
  let leaves = 0
  let maxDepth = 0
  let terminalNodesWithEmptyChildren = 0
  const visit = (node, depth) => {
    const value = record(node)
    if (!value || (value.children !== undefined && !Array.isArray(value.children))) return false
    nodes += 1
    maxDepth = Math.max(maxDepth, depth)
    const children = Array.isArray(value.children) ? value.children : []
    if (children.length === 0) {
      leaves += 1
      if (Array.isArray(value.children)) terminalNodesWithEmptyChildren += 1
      return true
    }
    return children.every(child => visit(child, depth + 1))
  }
  for (const raw of rows) {
    const row = record(raw)
    if (!row || typeof row.type !== 'string' || !expected.has(row.type) || seen.has(row.type)
      || !Array.isArray(row.children)) return { ok: false, reason: 'PROVIDER_IDENTITY_MISMATCH' }
    if (!row.children.every(child => visit(child, 1))) return { ok: false, reason: 'INVALID_CASCADE_TREE' }
    seen.add(row.type)
  }
  return {
    ok: true,
    providers: rows.length,
    missingProviders: expectedTypes.length - seen.size,
    nodes,
    leaves,
    maxDepth,
    terminalNodesWithEmptyChildren,
  }
}

export function isAllowedEffectiveOrderExtFieldRequest({ path, method, search, body, currentWorkOrder }) {
  if (path !== ORDER_EXTFIELD_ROUTE || method !== 'POST' || !currentWorkOrder || search) return false
  const params = body instanceof URLSearchParams
    ? body
    : typeof body === 'string'
      ? new URLSearchParams(body)
      : body && typeof body === 'object' && !Array.isArray(body)
        ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]))
        : new URLSearchParams()
  const expected = { ...buildOrderExtFieldRequestBody() }
  const expectedEntries = Object.entries(expected).sort(([left], [right]) => left.localeCompare(right))
  const actualEntries = [...params.entries()].sort(([left], [right]) => left.localeCompare(right))
  return actualEntries.length === expectedEntries.length
    && actualEntries.every(([key, value], index) => key === expectedEntries[index][0] && value === expectedEntries[index][1])
}

export function isAllowedEffectiveOrderCodeProviderRequest({ path, method, search, body, currentWorkOrder, expectedIds }) {
  if (path !== 'i/code/selectCode.do' || method !== 'POST' || search || !currentWorkOrder
    || !Array.isArray(expectedIds) || expectedIds.length < 1 || expectedIds.length > 30
    || expectedIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id))) return false
  const params = body instanceof URLSearchParams
    ? body
    : typeof body === 'string'
      ? new URLSearchParams(body)
      : body && typeof body === 'object' && !Array.isArray(body)
        ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]))
        : new URLSearchParams()
  if ([...params.keys()].sort().join(',') !== 'jsonPara,tenantId'
    || params.get('tenantId') !== '1340835581184723420') return false
  let providers
  try { providers = JSON.parse(params.get('jsonPara') ?? '') } catch { return false }
  return Array.isArray(providers) && providers.length === expectedIds.length
    && providers.every((provider, index) => provider && typeof provider === 'object' && !Array.isArray(provider)
      && Object.keys(provider).sort().join(',') === 'codeId,eleid'
      && provider.codeId === expectedIds[index] && provider.eleid === expectedIds[index])
}

export function isAllowedEffectiveOrderCascadeProviderRequest({ path, method, search, body, currentWorkOrder, expectedTypes, tenantId }) {
  if (path !== 'i/code/selectMultistageCode.do' || method !== 'POST' || search || !currentWorkOrder
    || !Array.isArray(expectedTypes) || expectedTypes.length < 1 || expectedTypes.length > 10
    || expectedTypes.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id))
    || new Set(expectedTypes).size !== expectedTypes.length
    || typeof tenantId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(tenantId)) return false
  const params = body instanceof URLSearchParams
    ? body
    : typeof body === 'string'
      ? new URLSearchParams(body)
      : body && typeof body === 'object' && !Array.isArray(body)
        ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]))
        : new URLSearchParams()
  return [...params.keys()].sort().join(',') === 'tenantId,types'
    && params.get('tenantId') === tenantId
    && params.get('types') === expectedTypes.join(',')
}

export function isAllowedOrderExtFieldTarget(value) {
  if (typeof value !== 'string' || !value) return false
  try {
    const target = new URL(value)
    return target.protocol === 'https:'
      && target.hostname.toLowerCase() === 'xlink.fsgo365.cn'
      && target.port === ''
      && target.pathname.replace(/\/+$/, '') === '/fsgo/wm'
      && target.username === ''
      && target.password === ''
      && target.search === ''
      && target.hash === ''
  } catch {
    return false
  }
}
