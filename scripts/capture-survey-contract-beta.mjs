#!/usr/bin/env node

/**
 * Capture the historical Beta Survey field contract through the same
 * authenticated, read-only infrastructure used by the local app.
 *
 * The requested form identity is supplied at runtime only. The output is a
 * sanitized contract: field/option/form identities are deterministic aliases
 * and no session, tenant, customer, work-order or media data is persisted.
 */

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import {
  assertBetaApiBaseUrl,
  betaLocalDefaults,
  createBetaReadClient,
  loginBeta,
  normalizeBetaLoginMethod,
} from './beta-api-client.mjs'

const DEFAULT_OUTPUT = resolve(fileURLToPath(new URL('../contracts/beta/survey/historical.json', import.meta.url)))
const STRUCTURAL_KEYS = new Set([
  'componentType',
  'max',
  'min',
  'maxlength',
  'maxLength',
  'minlength',
  'minLength',
  'group',
  'operationType',
  'surveyTool',
  'showField',
  'showType',
  'showFieldPreset',
  'showValue',
  'value',
  'label',
  'url',
  'params',
])

function object(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

function stringValue(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function booleanFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function shapeOf(value) {
  if (Array.isArray(value)) return { kind: 'array', length: value.length }
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return { kind: typeof value }
  if (value === undefined) return undefined
  return { kind: 'object' }
}

function aliasRegistry() {
  const aliases = new Map()
  return {
    alias(kind, value) {
      const key = `${kind}:${String(value)}`
      if (!aliases.has(key)) {
        const digest = createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
        aliases.set(key, `survey-${kind}-${digest}`)
      }
      return aliases.get(key)
    },
  }
}

function optionAlias(value, aliases) {
  const normalized = stringValue(value)
  return normalized ? aliases.alias('option', normalized) : undefined
}

function sanitizeCondition(value, aliases) {
  if (Array.isArray(value)) return value.map((item) => sanitizeCondition(item, aliases))
  if (value === '$exist') return value
  if (typeof value === 'string' || typeof value === 'number') return optionAlias(value, aliases) ?? value
  if (typeof value === 'boolean' || value === null) return value
  return shapeOf(value)
}

function structuralConfig(value, aliases) {
  const config = typeof value === 'string'
    ? (() => {
        try { return object(JSON.parse(value)) } catch { return undefined }
      })()
    : object(value)
  if (!config) return undefined

  const result = {}
  for (const key of Object.keys(config).sort()) {
    if (!STRUCTURAL_KEYS.has(key)) continue
    const entry = config[key]
    if (key === 'showValue') result[key] = sanitizeCondition(entry, aliases)
    else if (key === 'showField' || key === 'showType' || key === 'showFieldPreset' || key === 'componentType') {
      const normalized = stringValue(entry)
      if (normalized !== undefined) result[key] = normalized
    } else if (key === 'url' || key === 'params') {
      result[key] = shapeOf(entry)
    } else if (typeof entry === 'number' || typeof entry === 'boolean') {
      result[key] = entry
    } else if (typeof entry === 'string') {
      result[key] = entry.length <= 120 ? entry : { kind: 'string' }
    } else if (Array.isArray(entry)) {
      result[key] = { shape: shapeOf(entry), values: entry.map((item) => sanitizeCondition(item, aliases)) }
    } else if (entry !== undefined) {
      result[key] = shapeOf(entry)
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function sanitizeOption(raw, aliases) {
  const record = object(raw)
  const value = stringValue(record?.value ?? record?.code ?? record?.id ?? record?._id)
  const label = stringValue(record?.label ?? record?.name ?? record?.text ?? record?.codelabel)
  if (!value || !label) return undefined
  const children = Array.isArray(record.children)
    ? record.children.map((item) => sanitizeOption(item, aliases)).filter(Boolean)
    : []
  return {
    value: optionAlias(value, aliases),
    label,
    ...(children.length > 0 ? { children } : {}),
  }
}

function rowsFrom(raw) {
  if (Array.isArray(raw)) return raw
  const envelope = object(raw)
  if (Array.isArray(envelope?.data)) return envelope.data
  if (Array.isArray(envelope?.items)) return envelope.items
  if (Array.isArray(envelope?.records)) return envelope.records
  const data = object(envelope?.data)
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.records)) return data.records
  return []
}

/**
 * The caller-supplied form id is only a lookup selector. The raw ExtField
 * rows must independently prove the Survey collection before a Survey
 * contract can be emitted.
 */
export function assertSurveyFieldRows(rawFields) {
  const rows = Array.isArray(rawFields) ? rawFields : []
  if (rows.length === 0) throw new Error('Survey contract capture refused: ExtField response contains no rows')
  const invalidIndex = rows.findIndex((row) => stringValue(object(row)?.colName)?.toLocaleLowerCase() !== 'survey')
  if (invalidIndex >= 0) {
    throw new Error(`Survey contract capture refused: ExtField row ${invalidIndex + 1} does not prove colName=survey`)
  }
  return rows
}

function showListValue(raw, index) {
  if (raw === undefined) throw new Error(`Survey field row ${index + 1} has no showList metadata`)
  const parsed = typeof raw === 'string'
    ? (() => {
        try { return JSON.parse(raw) } catch { return undefined }
      })()
    : raw
  if (!Array.isArray(parsed)) throw new Error(`Survey field row ${index + 1} has malformed showList metadata`)
  const values = parsed.map(stringValue)
  if (values.some((value) => value === undefined)) {
    throw new Error(`Survey field row ${index + 1} has malformed showList metadata`)
  }
  return values
}

function sanitizeField(raw, index, aliases) {
  const record = object(raw) ?? {}
  const key = stringValue(record.name ?? record.key ?? record.fieldName)
  if (!key) throw new Error(`Survey field row ${index + 1} has no value key`)
  const showList = showListValue(record.showList, index)
  const config = structuralConfig(record.frontEndConfig, aliases)
  const rootShowValue = record.showValue
  const extsShowValue = object(record.exts)?.showValue
  const inlineOptions = Array.isArray(record.options)
    ? record.options.map((item) => sanitizeOption(item, aliases)).filter(Boolean)
    : []
  const rawOrder = Number(record.order ?? index + 1)
  const result = {
    fieldId: `survey-field-${String(index + 1).padStart(3, '0')}`,
    valueKey: key,
    label: stringValue(record.nameDisp ?? record.label ?? record.displayName ?? record.name) ?? key,
    type: stringValue(record.type ?? record.fieldType) ?? 'unknown',
    required: booleanFlag(record.required),
    multiple: booleanFlag(record.multiple),
    order: Number.isFinite(rawOrder) ? rawOrder : index + 1,
    state: record.state ?? 1,
    readOnly: booleanFlag(record.readOnly ?? record.readonly),
    showList,
    ...(record.fixed !== undefined ? { fixed: typeof record.fixed === 'string' || typeof record.fixed === 'boolean' ? record.fixed : shapeOf(record.fixed) } : {}),
    ...(record.operationType !== undefined ? { operationType: typeof record.operationType === 'string' || typeof record.operationType === 'number' ? record.operationType : shapeOf(record.operationType) } : {}),
    ...(stringValue(record.valueOption) ? { valueOption: stringValue(record.valueOption) } : {}),
    ...(inlineOptions.length > 0 ? { inlineOptions } : {}),
    ...(stringValue(record.showType) ? { showType: stringValue(record.showType) } : {}),
    ...(stringValue(record.showField) ? { showField: stringValue(record.showField) } : {}),
    ...(record.showFieldPreset !== undefined ? { showFieldPreset: record.showFieldPreset } : {}),
    ...(rootShowValue !== undefined ? { showValue: sanitizeCondition(rootShowValue, aliases) } : {}),
    ...(extsShowValue !== undefined ? { extsShowValue: sanitizeCondition(extsShowValue, aliases) } : {}),
    ...(config ? { frontEndConfig: config } : {}),
  }
  for (const keyName of ['minlength', 'maxlength', 'minLength', 'maxLength', 'group', 'placeholder', 'width', 'customizeFlag']) {
    if (record[keyName] !== undefined) {
      const value = typeof record[keyName] === 'string' || typeof record[keyName] === 'number' || typeof record[keyName] === 'boolean'
        ? record[keyName]
        : shapeOf(record[keyName])
      result[keyName] = value
    }
  }
  return result
}

function sanitizeParts(raw, aliases) {
  const group = rowsFrom(raw).map(object).find((item) => item?.type === 'parts')
  if (!group || !Array.isArray(group.children) || group.children.length === 0) {
    return { verification: 'UNKNOWN', options: [], reason: 'parts provider group not observed' }
  }
  const visit = (items) => items.map((item) => {
    const option = object(item)
    const value = stringValue(option?.value ?? option?.code ?? option?.id ?? option?._id)
    const label = stringValue(option?.name ?? option?.label ?? option?.text)
    if (!value || !label) throw new Error('malformed parts provider option')
    const children = Array.isArray(option.children) && option.children.length > 0 ? visit(option.children) : []
    return { value: optionAlias(value, aliases), label, ...(children.length > 0 ? { children } : {}) }
  })
  try {
    return { verification: 'VERIFIED', options: visit(group.children) }
  } catch (error) {
    return { verification: 'PARTIAL', options: [], reason: error instanceof Error ? error.message : 'malformed parts provider' }
  }
}

function sanitizeCodeProvider(raw, valueOption, aliases) {
  const entries = rowsFrom(raw).map(object).filter((item) => item?.eleid === valueOption)
  if (entries.length !== 1) return { verification: entries.length === 0 ? 'UNKNOWN' : 'PARTIAL', options: [], reason: 'requested code element was not unique' }
  const options = object(entries[0].options)
  if (!options || Object.keys(options).length === 0) return { verification: 'PARTIAL', options: [], reason: 'code provider options are empty' }
  const result = Object.entries(options)
    .map(([value, label]) => typeof label === 'string' && label.trim() ? { value: optionAlias(value, aliases), label: label.trim() } : undefined)
    .filter(Boolean)
  return result.length === Object.keys(options).length
    ? { verification: 'VERIFIED', options: result }
    : { verification: 'PARTIAL', options: [], reason: 'code provider option pair is malformed' }
}

function providerRef(id, kind, verification, endpoint, requestKeys, options, reason) {
  return {
    id,
    kind,
    verification,
    endpoint,
    requestKeys,
    options,
    ...(reason ? { reason } : {}),
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

async function capture(options, env = process.env) {
  const defaults = betaLocalDefaults()
  const formDefinitionId = env.XLINK_SCHEMA_SURVEY_FORM_ID?.trim()
  if (!formDefinitionId) throw new Error('XLINK_SCHEMA_SURVEY_FORM_ID is required for read-only Survey capture')
  const method = normalizeBetaLoginMethod(env.XLINK_BETA_LOGIN_METHOD?.trim() || defaults.method)
  const credential = method === '2'
    ? env.XLINK_BETA_PASSWORD ?? defaults.password
    : defaults.code
  const loginOptions = {
    apiBaseUrl: options.baseUrl ?? defaults.apiBaseUrl,
    tenantId: options.tenant ?? defaults.tenantId,
    phone: defaults.phone,
    method,
    credential,
    timeoutMs: defaults.timeoutMs,
  }
  const login = await loginBeta(loginOptions)
  const apiBaseUrl = assertBetaApiBaseUrl(loginOptions.apiBaseUrl)
  const client = createBetaReadClient({ apiBaseUrl, sessionRef: login.sessionRef, timeoutMs: defaults.timeoutMs })
  const aliases = aliasRegistry()
  const rawDefinition = await client.read('biz/extField/query', {
    extId: formDefinitionId,
    sortField: 'order',
    sortOrder: 'asc',
    'is:state|integer#and': 1,
    _all: 1,
  })
  const rawFields = assertSurveyFieldRows(rowsFrom(rawDefinition))
  const fieldRows = rawFields.map((row, index) => sanitizeField(row, index, aliases))
  const providers = []
  const valueOptions = [...new Set(fieldRows.map((field) => field.valueOption).filter(Boolean))]
  for (const valueOption of valueOptions) {
    if (valueOption === 'parts') {
      const raw = await client.read('i/code/selectMultistageCode.do', { types: 'parts', tenantId: defaults.tenantId })
      const parsed = sanitizeParts(raw, aliases)
      providers.push(providerRef('parts', 'r1_multistage_code', parsed.verification, 'i/code/selectMultistageCode.do', ['types', 'tenantId'], parsed.options, parsed.reason))
    } else if (valueOption === 'projPackage') {
      providers.push(providerRef('projPackage', 'business_record', 'UNKNOWN', 'biz/projPackage/queryWithRank', ['_all', 'is:state|integer#and', 'in:serviceType|array#and', 'sourceType', 'sortField', 'sortOrder'], [], 'Survey-stage service type was not observed; no package options fabricated'))
    } else {
      const raw = await client.read('i/code/selectCode.do', {
        jsonPara: JSON.stringify([{ codeId: valueOption, eleid: valueOption }]),
        tenantId: defaults.tenantId,
      })
      const parsed = sanitizeCodeProvider(raw, valueOption, aliases)
      providers.push(providerRef(valueOption, 'r1_batch_code', parsed.verification, 'i/code/selectCode.do', ['jsonPara', 'tenantId'], parsed.options, parsed.reason))
    }
  }
  if (fieldRows.some((field) => field.valueKey === 'leakageCause')) {
    providers.push(providerRef('leakageCause', 'unknown', 'UNKNOWN', 'unknown', [], [], 'custom data/provider contract not verified'))
  }

  const snapshot = {
    schemaVersion: 2,
    environment: 'beta',
    lifecycleEvidence: 'historical_inactive',
    domain: 'survey',
    semanticPurpose: 'survey',
    sanitized: true,
    source: {
      authority: 'authenticated Beta read-only capture',
      fieldEndpoint: 'biz/extField/query',
      fieldRequest: ['extId', 'sortField=order', 'sortOrder=asc', 'is:state|integer#and=1', '_all=1'],
      notes: ['R2 supplies presentation examples only; it is not a backend dictionary.', 'No active Survey membership was required or asserted.'],
    },
    fieldRowCount: fieldRows.length,
    fieldRows,
    duplicateValueKeys: [...new Set(fieldRows.map((field) => field.valueKey).filter((key, _, all) => all.filter((candidate) => candidate === key).length > 1))].sort(),
    providers,
    evidence: {
      formIdentity: 'explicit historical Survey family read through ExtField rows; raw identity omitted',
      activeNodeObserved: false,
      rawIdentityPersisted: false,
    },
  }
  snapshot.fingerprint = createHash('sha256').update(JSON.stringify(canonicalize(snapshot))).digest('hex')
  return snapshot
}

function argsFrom(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=', 2)
    args[key] = inline ?? argv[++index]
  }
  return args
}

export async function runSurveyContractCaptureCli(argv = process.argv.slice(2), env = process.env) {
  const args = argsFrom(argv)
  const snapshot = await capture({ baseUrl: args['base-url'], tenant: args.tenant }, env)
  const output = args.output ?? env.XLINK_SCHEMA_OUTPUT_FILE?.trim() ?? DEFAULT_OUTPUT
  await mkdir(resolve(output, '..'), { recursive: true })
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`Sanitized historical Survey contract captured: ${snapshot.fieldRowCount} rows`)
  return snapshot
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runSurveyContractCaptureCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Survey contract capture failed')
    process.exitCode = 1
  }
}
