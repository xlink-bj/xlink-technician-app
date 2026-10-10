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
