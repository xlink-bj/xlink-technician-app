#!/usr/bin/env node

/**
 * Read-only, authenticated form-schema inspector.
 *
 * The script deliberately emits a shape-only snapshot. It never prints raw
 * response envelopes, form values, cookies, tokens, customer data, or media
 * references. Credentials/session material must be supplied at invocation
 * time and is never written by this script.
 */

const apiBaseUrl = process.env.XLINK_SCHEMA_API_BASE_URL?.trim()
const sessionRef = process.env.XLINK_SCHEMA_SESSION_REF?.trim()
const formDefinitionId = process.env.XLINK_SCHEMA_FORM_DEFINITION_ID?.trim()
const formDataId = process.env.XLINK_SCHEMA_FORM_DATA_ID?.trim()
const timeoutMs = Number(process.env.XLINK_SCHEMA_TIMEOUT_MS ?? 15_000)

if (!apiBaseUrl || !sessionRef || !formDefinitionId) {
  console.error([
    'Required environment variables are missing:',
    'XLINK_SCHEMA_API_BASE_URL',
    'XLINK_SCHEMA_SESSION_REF',
    'XLINK_SCHEMA_FORM_DEFINITION_ID',
  ].join('\n'))
  process.exitCode = 2
}

function endpoint(path) {
  return `${apiBaseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function jsonObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value
}

function parsedObject(value) {
  if (typeof value === 'string' && value.trim()) {
    try {
      return jsonObject(JSON.parse(value))
    } catch {
      return undefined
    }
  }
  return jsonObject(value)
}

function booleanFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function stringValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function valueShape(value) {
  if (Array.isArray(value)) return { kind: 'array', length: value.length }
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { kind: typeof value }
  }
  if (value === undefined) return undefined
  return { kind: 'object' }
}

function visibilityShape(row) {
  const config = parsedObject(row.frontEndConfig)
  const recordExts = jsonObject(row.exts)
  const showField = stringValue(row, ['showField']) ?? stringValue(config, ['showField'])
  const showType = stringValue(row, ['showType']) ?? stringValue(config, ['showType'])
  const showValue = row.showValue
    ?? recordExts?.showValue
    ?? config?.showValue
    ?? jsonObject(config?.exts)?.showValue
  const hasMetadata = Boolean(showField) || showType !== undefined || showValue !== undefined

  if (!hasMetadata) return undefined
  return {
    showType,
    showField,
    showFieldPreset: row.showFieldPreset ?? config?.showFieldPreset,
    showValue: valueShape(showValue),
    frontEndConfigParsed: Boolean(config),
    frontEndConfigKeys: config ? Object.keys(config).sort() : [],
  }
}

function sanitizeField(row) {
  const record = jsonObject(row) ?? {}
  const config = parsedObject(record.frontEndConfig)
  const field = {
    key: stringValue(record, ['name', 'key', 'fieldName']) ?? 'unknown',
    label: stringValue(record, ['nameDisp', 'label', 'displayName', 'name']) ?? 'unknown',
    type: stringValue(record, ['type', 'fieldType']) ?? 'unknown',
    required: booleanFlag(record.required),
    readOnly: booleanFlag(record.readOnly ?? record.readonly),
    multiple: booleanFlag(record.multiple),
    valueOption: stringValue(record, ['valueOption']),
    visibility: visibilityShape(record),
    frontEndConfigKeys: config ? Object.keys(config).sort() : [],
  }
  return Object.fromEntries(Object.entries(field).filter(([, value]) => value !== undefined))
}

function fieldValueShapeMap(record) {
  const values = {}
  const extensions = jsonObject(record?.exts)
  if (extensions) {
    for (const [key, value] of Object.entries(extensions)) values[key] = valueShape(value)
  }
  const metadata = new Set([
    '_id', 'id', 'dataId', 'extId', 'formDefId', 'definitionId',
    'workflowRunId', 'runId', 'workflowId', 'exts', 'tenantId',
  ])
  for (const [key, value] of Object.entries(record ?? {})) {
    if (!metadata.has(key) && !values[key]) values[key] = valueShape(value)
  }
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)))
}

function sanitizeFormDataPage(raw) {
  const envelope = jsonObject(raw) ?? {}
  const rows = Array.isArray(envelope.data)
    ? envelope.data
    : Array.isArray(envelope.items)
      ? envelope.items
      : []
  return {
    returnedRecordCount: rows.length,
    records: rows.map((row) => {
      const record = jsonObject(row) ?? {}
      return {
        idPresent: Boolean(record._id ?? record.id ?? record.dataId),
        definitionIdMatchesRequested: String(record.definitionId ?? record.extId ?? record.formDefId ?? '') === formDefinitionId,
        workflowRunIdPresent: Boolean(record.workflowRunId ?? record.runId ?? record.workflowId),
        valueShapes: fieldValueShapeMap(record),
      }
    }),
  }
}

async function readJson(path, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15_000)
  try {
    const response = await fetch(endpoint(path), {
      method: 'POST',
      headers: {
        Cookie: `JSESSIONID=${sessionRef}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`schema read failed with HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  if (process.exitCode) return
  const fieldResponse = await readJson('biz/extField/query', {
    extId: formDefinitionId,
    sortField: 'order',
    sortOrder: 'asc',
    'is:state|integer#and': 1,
    _all: 1,
  })
  const rawFields = jsonObject(fieldResponse)?.data
  if (!Array.isArray(rawFields)) throw new Error('schema read returned no field rows')

  const result = {
    source: 'authenticated read-only API',
    formDefinitionId,
    fieldCount: rawFields.length,
    fields: rawFields.map(sanitizeField),
  }
  if (formDataId) {
    const formDataResponse = await readJson(`biz/extForm/query/${encodeURIComponent(formDefinitionId)}`, {
      sortField: 'createTime',
      sortOrder: 'desc',
      'is:_id|string#and': formDataId,
    })
    result.formData = sanitizeFormDataPage(formDataResponse)
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'schema inspection failed')
  process.exitCode = 1
})
