#!/usr/bin/env node

/**
 * Read-only Beta Inspection contract discovery.
 *
 * This module intentionally keeps real identifiers and values in memory only.
 * The emitted contract contains deterministic aliases and structural/value
 * shapes, never a raw backend envelope.
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

import { assertAllowedBetaReadPath, assertBetaApiBaseUrl, createBetaReadClient } from './beta-api-client.mjs'

const ACTIVE_NODE_STATES = new Set([0, '0', 'active'])
const CODE_FIELD_TYPES = new Set(['select', 'radio', 'checkbox'])
const FRONTEND_STRUCTURAL_KEYS = new Set([
  'componentType',
  'max',
  'min',
  'maxLength',
  'minLength',
  'group',
  'operationType',
  'surveyTool',
  'showField',
  'showType',
  'showFieldPreset',
  'showValue',
])

export class ContractDiscoveryError extends Error {
  constructor(message, code = 'contract_discovery_failed') {
    super(message)
    this.name = 'ContractDiscoveryError'
    this.code = code
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function object(value) {
  return isObject(value) ? value : undefined
}

function parseObject(value) {
  if (typeof value === 'string' && value.trim()) {
    try {
      return object(JSON.parse(value))
    } catch {
      return undefined
    }
  }
  return object(value)
}

function firstString(record, keys) {
  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function booleanFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function unwrapData(raw) {
  const envelope = object(raw)
  const data = envelope?.data
  return object(data) ?? raw
}

function rowsFrom(raw) {
  const envelope = object(raw)
  if (Array.isArray(envelope?.data)) return envelope.data
  if (Array.isArray(envelope?.items)) return envelope.items
  if (Array.isArray(envelope?.records)) return envelope.records
  const data = object(envelope?.data)
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.records)) return data.records
  return []
}

function endpoint(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function safeHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

function createAliasRegistry() {
  const aliases = new Map()
  return {
    alias(kind, value) {
      const key = `${kind}:${String(value)}`
      if (!aliases.has(key)) aliases.set(key, `${kind}-${safeHash(value)}`)
      return aliases.get(key)
    },
  }
}

function optionAlias(value, aliases) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = String(value)
  // Existing Mock aliases are safe and remain stable across captures.
  if (/^(repair-part-code|mock-)/.test(text)) return text
  return aliases.alias('option', text)
}

function shapeOf(value) {
  if (Array.isArray(value)) return { kind: 'array', length: value.length }
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { kind: typeof value }
  }
  if (value === undefined) return undefined
  return { kind: 'object' }
}

function sanitizeConditionValue(value, aliases) {
  if (Array.isArray(value)) return value.map((item) => sanitizeConditionValue(item, aliases))
  if (value === '$exist') return value
  if (typeof value === 'string') return optionAlias(value, aliases) ?? value
  return value
}

function structuralConfig(value, aliases) {
  const config = parseObject(value)
  if (!config) return undefined
  const result = {}
  for (const key of Object.keys(config).sort()) {
    if (!FRONTEND_STRUCTURAL_KEYS.has(key)) continue
    const entry = config[key]
    if (key === 'showField' || key === 'showType' || key === 'showFieldPreset') {
      result[key] = entry
    } else if (key === 'showValue') {
      result[key] = sanitizeConditionValue(entry, aliases)
    } else if (key === 'componentType' && typeof entry === 'string') {
      result[key] = entry
    } else if (typeof entry === 'number' || typeof entry === 'boolean') {
      result[key] = entry
    } else if (Array.isArray(entry)) {
      result[key] = { shape: shapeOf(entry), values: entry.map((item) => sanitizeConditionValue(item, aliases)) }
    } else if (entry !== undefined) {
      result[key] = shapeOf(entry)
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function sanitizeOption(raw, aliases) {
  const record = object(raw)
  const value = firstString(record, ['value', 'code', 'id', '_id'])
  const label = firstString(record, ['label', 'name', 'text', 'codelabel'])
  if (!value || !label) return undefined
  const children = Array.isArray(record.children)
    ? record.children.map((child) => sanitizeOption(child, aliases)).filter(Boolean)
    : undefined
  return {
    value: optionAlias(value, aliases),
    label,
    ...(children?.length ? { children } : {}),
  }
}

function visibilityMetadata(record, aliases) {
  const config = parseObject(record.frontEndConfig)
  const exts = object(record.exts)
  const showField = firstString(record, ['showField']) ?? firstString(config, ['showField'])
  const showType = firstString(record, ['showType']) ?? firstString(config, ['showType'])
  const showValue = record.showValue
    ?? exts?.showValue
    ?? config?.showValue
    ?? object(config?.exts)?.showValue
  if (!showField && showType === undefined && showValue === undefined) return undefined
  return {
    ...(showType !== undefined ? { showType } : {}),
    ...(showField ? { showField } : {}),
    ...(record.showFieldPreset !== undefined ? { showFieldPreset: record.showFieldPreset } : {}),
    ...(showValue !== undefined ? { showValue: sanitizeConditionValue(showValue, aliases) } : {}),
  }
}

function sanitizeField(raw, index, aliases) {
  const record = object(raw) ?? {}
  const identity = firstString(record, ['_id', 'id', 'fieldId'])
  const key = firstString(record, ['name', 'key', 'fieldName'])
  if (!key) throw new ContractDiscoveryError(`field row ${index + 1} has no field name`, 'malformed_field_row')
  const type = firstString(record, ['type', 'fieldType']) ?? 'unknown'
  const inlineOptions = Array.isArray(record.options)
    ? record.options.map((item) => sanitizeOption(item, aliases)).filter(Boolean)
    : undefined
  const visibility = visibilityMetadata(record, aliases)
  const config = structuralConfig(record.frontEndConfig, aliases)
  const rawOrder = Number(record.order ?? record.sort ?? index + 1)
  return {
    identity: identity ? aliases.alias('field', identity) : `field-${String(index + 1).padStart(3, '0')}`,
    order: Number.isFinite(rawOrder) ? rawOrder : index + 1,
    key,
    label: firstString(record, ['nameDisp', 'label', 'displayName', 'name']) ?? key,
    type,
    required: booleanFlag(record.required),
    readOnly: booleanFlag(record.readOnly ?? record.readonly),
    multiple: booleanFlag(record.multiple),
    state: record.state ?? 1,
    ...(firstString(record, ['valueOption']) ? { valueOption: firstString(record, ['valueOption']) } : {}),
    ...(inlineOptions?.length ? { options: inlineOptions } : {}),
    ...(visibility ? { visibility } : {}),
    ...(config ? { frontEndConfig: config } : {}),
  }
}

function valueShapes(record) {
  const result = {}
  const extensions = object(record?.exts)
  if (extensions) {
    for (const [key, value] of Object.entries(extensions)) result[key] = shapeOf(value)
  }
  const metadata = new Set([
    '_id', 'id', 'dataId', 'extId', 'formDefId', 'definitionId',
    'workflowRunId', 'runId', 'workflowId', 'exts', 'tenantId',
  ])
  for (const [key, value] of Object.entries(record ?? {})) {
    if (!metadata.has(key) && !result[key]) result[key] = shapeOf(value)
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)))
}

function sanitizeFormData(raw, requestedFormDefinitionId, aliases) {
  const records = rowsFrom(raw)
  return {
    returnedRecordCount: records.length,
    records: records.map((item) => {
      const record = object(item) ?? {}
      const recordId = firstString(record, ['_id', 'id', 'dataId'])
      const definitionId = firstString(record, ['definitionId', 'extId', 'formDefId'])
      const workflowRunId = firstString(record, ['workflowRunId', 'runId', 'workflowId'])
      return {
        idPresent: Boolean(recordId),
        definitionIdMatchesRequested: definitionId === requestedFormDefinitionId,
        workflowRunIdPresent: Boolean(workflowRunId),
        valueShapes: valueShapes(record),
        ...(recordId ? { idAlias: aliases.alias('form-data', recordId) } : {}),
      }
    }),
  }
}

function activeFormNode(raw, requestedNodeId) {
  const payload = unwrapData(raw)
  const candidates = Array.isArray(payload?.workflowNode)
    ? payload.workflowNode
    : Array.isArray(payload?.workflowNodes)
      ? payload.workflowNodes
      : Array.isArray(payload?.nodes)
        ? payload.nodes
        : []
  const node = requestedNodeId
    ? candidates.find((item) => firstString(object(item), ['_id', 'id', 'workflowNodeId']) === requestedNodeId)
    : undefined
  const eligible = (item) => {
    const record = object(item)
    const nodeDef = object(record?.nodeDef)
    const formDefinitionId = firstString(nodeDef, ['formDefId', 'formDefinitionId'])
    // R1's Inspection workflow is a repeat node. This is a verified semantic
    // discriminator for this contract family; generic `forms` nodes are not
    // sufficient because Appointment and other forms share that category.
    return Boolean(formDefinitionId)
      && nodeDef?.nodeType === 'repeat'
      && ACTIVE_NODE_STATES.has(record?.state ?? record?.lifecycle)
  }
  if (requestedNodeId && !node) {
    throw new ContractDiscoveryError('requested inspection workflow node was not observed', 'node_not_found')
  }
  const selected = node ? (eligible(node) ? node : undefined) : candidates.filter(eligible)
  if (!selected || (Array.isArray(selected) && selected.length === 0)) {
    throw new ContractDiscoveryError('explicit Inspection workflow identity is required', 'inspection_identity_required')
  }
  if (Array.isArray(selected) && selected.length !== 1) {
    throw new ContractDiscoveryError('multiple active form nodes observed; provide XLINK_SCHEMA_INSPECTION_NODE_ID', 'ambiguous_inspection_form')
  }
  return Array.isArray(selected) ? selected[0] : selected
}

function nodeContext(node, aliases) {
  const record = object(node) ?? {}
  const nodeDef = object(record.nodeDef) ?? {}
  const nodeId = firstString(record, ['_id', 'id', 'workflowNodeId'])
  const formDefinitionId = firstString(nodeDef, ['formDefId', 'formDefinitionId'])
  const workflowRunId = firstString(record, ['workflowRunId', 'runId', 'workflowId'])
  const formDataId = firstString(record, ['formDataId', 'dataId'])
  const readOnlyIds = record.formFieldIdsReadOnly ?? nodeDef.formFieldIdsReadOnly
  return {
    activeNode: true,
    nodeCategory: firstString(nodeDef, ['nodeType', 'type']) ?? 'forms',
    ...(nodeId ? { workflowNodeRuntimeId: aliases.alias('workflow-node', nodeId) } : {}),
    ...(formDefinitionId ? { formDefinitionId: aliases.alias('form-definition', formDefinitionId) } : {}),
    ...(workflowRunId ? { workflowRunId: aliases.alias('workflow-run', workflowRunId) } : {}),
    ...(formDataId ? { formDataId: aliases.alias('form-data', formDataId) } : { formDataId: 'optional' }),
    ...(Array.isArray(readOnlyIds)
      ? { formFieldIdsReadOnly: readOnlyIds.map((id) => aliases.alias('field', id)) }
      : { formFieldIdsReadOnly: 'optional' }),
  }
}

function usableRelationship(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim().length > 0
  if (Array.isArray(value)) return value.length > 0 && value.every((item) => usableRelationship(item))
  return false
}

function sanitizedRelationship(value, aliases) {
  if (Array.isArray(value)) return value.map((item) => sanitizedRelationship(item, aliases))
  if (typeof value === 'string' || typeof value === 'number') return optionAlias(value, aliases)
  return shapeOf(value)
}

function parsePartsProvider(raw, codeType, aliases) {
  const groups = Array.isArray(raw) ? raw : rowsFrom(raw)
  const group = groups.map(object).find((item) => item?.type === codeType)
  if (!group) return { verification: 'UNKNOWN', options: [], reason: 'missing_group' }
  if (!Array.isArray(group.children) || group.children.length === 0) {
    return { verification: 'PARTIAL', options: [], reason: 'empty_hierarchy' }
  }

  const visit = (items) => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('empty_hierarchy')
    return items.map((item) => {
      const option = object(item)
      const value = firstString(option, ['value', 'code', 'id', '_id'])
      const label = firstString(option, ['name', 'label', 'text'])
      if (!value || !label) throw new Error('malformed_hierarchy_node')
      if (option.children !== undefined && !Array.isArray(option.children)) {
        throw new Error('malformed_hierarchy_children')
      }
      const children = option.children?.length ? visit(option.children) : undefined
      return { value: optionAlias(value, aliases), label, ...(children ? { children } : {}) }
    })
  }

  try {
    return { verification: 'VERIFIED', options: visit(group.children) }
  } catch (error) {
    return { verification: 'PARTIAL', options: [], reason: error instanceof Error ? error.message : 'malformed_hierarchy' }
  }
}

function parseQualifiedProvider(raw, valueOption, aliases) {
  const entries = Array.isArray(raw) ? raw : rowsFrom(raw)
  const matches = entries.map(object).filter((item) => item?.eleid === valueOption)
  if (matches.length === 0) return { verification: 'UNKNOWN', options: [], reason: 'requested_element_missing' }
  if (matches.length !== 1) return { verification: 'PARTIAL', options: [], reason: 'ambiguous_requested_element' }
  const optionRecord = object(matches[0]?.options)
  if (!optionRecord) return { verification: 'UNKNOWN', options: [], reason: 'option_object_missing' }
  const optionEntries = Object.entries(optionRecord)
  if (optionEntries.length === 0) return { verification: 'PARTIAL', options: [], reason: 'empty_options' }
  if (optionEntries.some(([value, label]) => !String(value).trim() || typeof label !== 'string' || !label.trim())) {
    return { verification: 'PARTIAL', options: [], reason: 'malformed_option_pair' }
  }
  return {
    verification: 'VERIFIED',
    options: optionEntries.map(([value, label]) => ({ value: optionAlias(value, aliases), label: label.trim() })),
  }
}

function sanitizePackageRecord(raw, aliases) {
  const record = object(raw)
  const extensions = object(record?.exts)
  const value = firstString(record, ['_id', 'id', 'value', 'code'])
  const label = firstString(record, ['name', 'label', 'text'])
  const serviceType = record?.serviceType
  const repairPart = extensions?.repairPart
  if (!value || !label || !usableRelationship(serviceType) || !usableRelationship(repairPart)) return undefined
  return {
    value: optionAlias(value, aliases),
    label,
    serviceType: sanitizedRelationship(serviceType, aliases),
    repairPart: sanitizedRelationship(repairPart, aliases),
    ...(record.sourceType !== undefined ? { sourceType: sanitizedRelationship(record.sourceType, aliases) } : {}),
  }
}

function parsePackageProvider(raw, aliases) {
  const records = rowsFrom(raw)
  if (records.length === 0) return { verification: 'UNKNOWN', options: [], reason: 'empty_records' }
  const options = records.map((record) => sanitizePackageRecord(record, aliases))
  if (options.some((option) => !option)) return { verification: 'PARTIAL', options: [], reason: 'missing_package_relationship' }
  return { verification: 'VERIFIED', options }
}

function sanitizeInspectionSopRecord(raw, aliases) {
  const record = object(raw)
  const value = firstString(record, ['_id', 'id', 'dataId'])
  const part = record?.part
  const order = record?.sopOrder ?? record?.order
  const requiredKeys = ['content', 'isQualified', 'reason', 'otherReason', 'inspectionImg']
  if (!value || !usableRelationship(part) || order === undefined || requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) {
    return undefined
  }
  return {
    idAlias: aliases.alias('inspection-sop', value),
    part: sanitizedRelationship(part, aliases),
    contentShape: shapeOf(record.content),
    ...(record.required !== undefined ? { required: booleanFlag(record.required) } : {}),
    order: shapeOf(order),
    isQualifiedShape: shapeOf(record.isQualified),
    reasonShape: shapeOf(record.reason),
    otherReasonShape: shapeOf(record.otherReason),
    inspectionImgShape: shapeOf(record.inspectionImg),
  }
}

function parseInspectionSopProvider(raw, aliases) {
  const records = rowsFrom(raw)
  if (records.length === 0) return { verification: 'UNKNOWN', options: [], reason: 'empty_records' }
  const options = records.map((record) => sanitizeInspectionSopRecord(record, aliases))
  if (options.some((option) => !option)) return { verification: 'PARTIAL', options: [], reason: 'malformed_inspection_sop_record' }
  return { verification: 'VERIFIED', options }
}

function providerShape(kind) {
  if (kind === 'r1_multistage_code') return { kind: 'grouped_cascade', groupKey: 'type', childrenKey: 'children', valueKey: 'value', labelKey: 'name' }
  if (kind === 'r1_batch_code') return { kind: 'element_options', elementKey: 'eleid', optionsKey: 'options' }
  if (kind === 'business_record') return { kind: 'business_record_options', valueKey: '_id', labelKey: 'name', relationshipKey: 'exts.repairPart' }
  if (kind === 'custom_record') return { kind: 'inspection_sop_records', partKey: 'part', contentKey: 'content', qualificationKey: 'isQualified', mediaKey: 'inspectionImg' }
  return { kind: 'unknown' }
}

async function readJson(options, path, body) {
  const allowedPath = assertAllowedBetaReadPath(path)
  if (options.readClient) {
    try {
      return await options.readClient.read(allowedPath, body)
    } catch (error) {
      throw new ContractDiscoveryError(
        error instanceof Error ? error.message : 'Beta read could not be completed',
        error?.code ?? 'beta_read_failed',
      )
    }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const response = await fetch(endpoint(options.apiBaseUrl, allowedPath), {
      method: 'POST',
      headers: {
        Cookie: `JSESSIONID=${options.sessionRef}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])),
      signal: controller.signal,
    })
    if (!response.ok) throw new ContractDiscoveryError(`Beta read failed with HTTP ${response.status}`, 'beta_read_failed')
    return await response.json()
  } catch (error) {
    if (error instanceof ContractDiscoveryError) throw error
    throw new ContractDiscoveryError('Beta read could not be completed', 'beta_read_failed')
  } finally {
    clearTimeout(timer)
  }
}

function providerEntry(id, kind, verification, endpointPath, requestKeys, options, reason) {
  return {
    id,
    kind,
    verification,
    endpoint: endpointPath,
    requestKeys,
    responseShape: providerShape(kind),
    options,
    ...(reason ? { reason } : {}),
  }
}

async function captureProviders(options, fields, serviceAppointment, formDataRecord, aliases) {
  const providerIds = new Set()
  for (const field of fields) {
    if (field.valueOption) providerIds.add(field.valueOption)
    if (field.key === 'inspectionContent' && !field.options) providerIds.add('inspectionContent')
    if (field.key === 'inspectionSOP') providerIds.add('inspectionSOP')
  }
  const providers = []
  for (const id of providerIds) {
    if (id === 'parts') {
      try {
        const raw = await readJson(options, 'i/code/selectMultistageCode.do', { types: id, ...(options.tenantId ? { tenantId: options.tenantId } : {}) })
        const parsed = parsePartsProvider(raw, id, aliases)
        providers.push(providerEntry(id, 'r1_multistage_code', parsed.verification, 'i/code/selectMultistageCode.do', ['types', 'tenantId'], parsed.options, parsed.reason))
      } catch (error) {
        providers.push(providerEntry(id, 'r1_multistage_code', 'UNKNOWN', 'i/code/selectMultistageCode.do', ['types', 'tenantId'], [], error.code))
      }
      continue
    }
    if (CODE_FIELD_TYPES.has(fields.find((field) => field.valueOption === id)?.type)) {
      try {
        const raw = await readJson(options, 'i/code/selectCode.do', {
          jsonPara: JSON.stringify([{ codeId: id, eleid: id }]),
          ...(options.tenantId ? { tenantId: options.tenantId } : {}),
        })
        const parsed = parseQualifiedProvider(raw, id, aliases)
        providers.push(providerEntry(id, 'r1_batch_code', parsed.verification, 'i/code/selectCode.do', ['jsonPara', 'tenantId'], parsed.options, parsed.reason))
      } catch (error) {
        providers.push(providerEntry(id, 'r1_batch_code', 'UNKNOWN', 'i/code/selectCode.do', ['jsonPara', 'tenantId'], [], error.code))
      }
      continue
    }
    if (id === 'projPackage') {
      const serviceType = firstString(serviceAppointment, ['serviceType'])
      if (!serviceType) {
        providers.push(providerEntry(id, 'business_record', 'UNKNOWN', 'biz/projPackage/queryWithRank', ['_all', 'is:state|integer#and', 'in:serviceType|array#and', 'sourceType', 'sortField', 'sortOrder'], [], 'service_type_not_observed'))
        continue
      }
      try {
        const sourceType = firstString(object(serviceAppointment?.exts), ['sourceType'])
        const raw = await readJson(options, 'biz/projPackage/queryWithRank', {
          _all: '1',
          'is:state|integer#and': '1',
          'in:serviceType|array#and': serviceType,
          ...(sourceType ? { sourceType } : {}),
          sortField: 'order,_id',
          sortOrder: 'asc',
        })
        const parsed = parsePackageProvider(raw, aliases)
        providers.push(providerEntry(id, 'business_record', parsed.verification, 'biz/projPackage/queryWithRank', ['_all', 'is:state|integer#and', 'in:serviceType|array#and', 'sourceType', 'sortField', 'sortOrder'], parsed.options, parsed.reason))
      } catch (error) {
        providers.push(providerEntry(id, 'business_record', 'UNKNOWN', 'biz/projPackage/queryWithRank', ['_all', 'is:state|integer#and', 'in:serviceType|array#and', 'sourceType', 'sortField', 'sortOrder'], [], error.code))
      }
      continue
    }
    if (id === 'inspectionSOP') {
      const part = formDataRecord?.part
      if (part === undefined) {
        providers.push(providerEntry(id, 'custom_record', 'UNKNOWN', 'biz/extForm/queryByColName/inspectionSOP', ['_all', 'is:state|integer#and', 'all:part|array#and', 'sortField', 'sortOrder'], [], 'part_value_not_observed'))
        continue
      }
      try {
        const raw = await readJson(options, 'biz/extForm/queryByColName/inspectionSOP', {
          _all: '1',
          'is:state|integer#and': '1',
          'all:part|array#and': JSON.stringify(part),
          sortField: 'sopOrder',
          sortOrder: 'asc',
        })
        const parsed = parseInspectionSopProvider(raw, aliases)
        providers.push(providerEntry(id, 'custom_record', parsed.verification, 'biz/extForm/queryByColName/inspectionSOP', ['_all', 'is:state|integer#and', 'all:part|array#and', 'sortField', 'sortOrder'], parsed.options, parsed.reason))
      } catch (error) {
        providers.push(providerEntry(id, 'custom_record', 'UNKNOWN', 'biz/extForm/queryByColName/inspectionSOP', ['_all', 'is:state|integer#and', 'all:part|array#and', 'sortField', 'sortOrder'], [], error.code))
      }
      continue
    }
    providers.push(providerEntry(id, 'unknown', 'UNKNOWN', 'unknown', [], [], 'provider_contract_not_classified'))
  }
  return providers
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

export function contractFingerprint(snapshot) {
  const { fingerprint: _fingerprint, capturedAt: _capturedAt, ...content } = snapshot
  return createHash('sha256').update(JSON.stringify(canonicalize(content))).digest('hex')
}

export function validateContractSnapshot(snapshot) {
  if (!isObject(snapshot)) throw new ContractDiscoveryError('contract snapshot must be an object', 'malformed_snapshot')
  if (snapshot.environment !== 'beta' || snapshot.contractKind !== 'inspection-form') {
    throw new ContractDiscoveryError('contract snapshot has an invalid authority marker', 'malformed_snapshot')
  }
  if (!isObject(snapshot.form) || typeof snapshot.form.id !== 'string') {
    throw new ContractDiscoveryError('contract snapshot form identity is missing', 'malformed_snapshot')
  }
  if (!Array.isArray(snapshot.fields) || snapshot.fields.length !== snapshot.form.fieldCount) {
    throw new ContractDiscoveryError('contract snapshot field count is inconsistent', 'malformed_snapshot')
  }
  const keys = new Set()
  for (const field of snapshot.fields) {
    if (!isObject(field) || typeof field.key !== 'string' || keys.has(field.key)) {
      throw new ContractDiscoveryError('contract snapshot contains duplicate or malformed fields', 'malformed_snapshot')
    }
    keys.add(field.key)
  }
  if (snapshot.fingerprint && snapshot.fingerprint !== 'pending-compute' && snapshot.fingerprint !== contractFingerprint(snapshot)) {
    throw new ContractDiscoveryError('contract snapshot fingerprint is stale', 'stale_snapshot')
  }
  const serialized = JSON.stringify(snapshot)
  for (const forbidden of ['Cookie', 'JSESSIONID', 'sessionId', 'access_token', 'phone', 'customerName', 'address']) {
    if (serialized.includes(forbidden)) throw new ContractDiscoveryError('contract snapshot contains forbidden sensitive data', 'sensitive_snapshot')
  }
  return true
}

export async function discoverInspectionContract(options) {
  const aliases = createAliasRegistry()
  const workOrderId = firstString(options, ['workOrderId'])
  if (!workOrderId) {
    throw new ContractDiscoveryError(
      'Inspection contract capture requires an explicit work order identity',
      'inspection_identity_required',
    )
  }
  const workOrderRaw = await readJson(options, `basic/serviceAppointment/queryById/${encodeURIComponent(workOrderId)}`, { type: 'query' })

  const node = activeFormNode(workOrderRaw, options.workflowNodeId ?? options.nodeId)
  const nodeRecord = object(node) ?? {}
  const nodeDef = object(nodeRecord.nodeDef) ?? {}
  const formDefinitionId = firstString(nodeDef, ['formDefId', 'formDefinitionId'])
  if (!formDefinitionId) throw new ContractDiscoveryError('active inspection node has no form definition identity', 'missing_form_definition')

  const fieldRaw = await readJson(options, 'biz/extField/query', {
    extId: formDefinitionId,
    sortField: 'order',
    sortOrder: 'asc',
    'is:state|integer#and': 1,
    _all: 1,
  })
  const fieldRows = rowsFrom(fieldRaw)
  if (fieldRows.length === 0) throw new ContractDiscoveryError('inspection form definition returned no field rows', 'empty_form_definition')
  const fields = fieldRows.map((row, index) => sanitizeField(row, index, aliases))
  const payload = unwrapData(workOrderRaw)
  const serviceAppointment = object(payload?.serviceAppointment)
  const formDataId = firstString(nodeRecord, ['formDataId', 'dataId'])
  let formData
  let formDataRecord
  if (formDataId) {
    const rawFormData = await readJson(options, `biz/extForm/query/${encodeURIComponent(formDefinitionId)}`, {
      sortField: 'createTime',
      sortOrder: 'desc',
      'is:_id|string#and': formDataId,
    })
    const dataRows = rowsFrom(rawFormData)
    formDataRecord = dataRows.length === 1 ? object(dataRows[0]) : undefined
    formData = sanitizeFormData(rawFormData, formDefinitionId, aliases)
  }
  const providers = await captureProviders(options, fields, serviceAppointment, formDataRecord, aliases)
  const snapshot = {
    schemaVersion: 1,
    environment: 'beta',
    contractKind: 'inspection-form',
    captureStatus: 'verified_read_only_observation',
    capturedAt: new Date().toISOString().slice(0, 10),
    source: {
      authority: 'authenticated_beta_read',
      productionParity: 'unknown',
      r1: 'historical_wire_and_runtime_reference',
      r2: 'presentation_reference_only',
    },
    form: { id: aliases.alias('form-definition', formDefinitionId), fieldCount: fields.length },
    workflowContextShape: nodeContext(node, aliases),
    fields,
    providers,
    ...(formData ? { formDataShape: formData } : { formDataShape: { observed: false, reason: 'no current FormData' } }),
  }
  return { ...snapshot, fingerprint: contractFingerprint(snapshot) }
}

function argsFrom(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=', 2)
    values[key] = inline ?? argv[index + 1]
    if (inline === undefined) index += 1
  }
  return values
}

export async function runInspectionContractCli(argv = process.argv.slice(2)) {
  const args = argsFrom(argv)
  const apiBaseUrl = process.env.XLINK_SCHEMA_API_BASE_URL?.trim()
  const sessionRef = process.env.XLINK_SCHEMA_SESSION_REF?.trim()
  if (!apiBaseUrl || !sessionRef) {
    throw new ContractDiscoveryError('XLINK_SCHEMA_API_BASE_URL and XLINK_SCHEMA_SESSION_REF are required for a read-only Beta capture', 'missing_beta_credentials')
  }
  const normalizedApiBaseUrl = assertBetaApiBaseUrl(apiBaseUrl)
  const snapshot = await discoverInspectionContract({
    apiBaseUrl: normalizedApiBaseUrl,
    sessionRef,
    timeoutMs: Number(process.env.XLINK_SCHEMA_TIMEOUT_MS ?? 15_000),
    tenantId: process.env.XLINK_SCHEMA_TENANT_ID?.trim(),
    workOrderId: args['work-order'] ?? process.env.XLINK_SCHEMA_WORK_ORDER_ID?.trim(),
    nodeId: args.node ?? process.env.XLINK_SCHEMA_INSPECTION_NODE_ID?.trim(),
    readClient: createBetaReadClient({
      apiBaseUrl: normalizedApiBaseUrl,
      sessionRef,
      timeoutMs: Number(process.env.XLINK_SCHEMA_TIMEOUT_MS ?? 15_000),
    }),
  })
  const outputFile = args.output ?? process.env.XLINK_SCHEMA_OUTPUT_FILE?.trim()
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`
  if (outputFile) await writeFile(outputFile, serialized, 'utf8')
  else process.stdout.write(serialized)
  return snapshot
}

export async function runContractCheck(snapshotFile, options = {}) {
  const source = await readFile(snapshotFile, 'utf8')
  const snapshot = JSON.parse(source)
  validateContractSnapshot(snapshot)
  const result = {
    fingerprint: contractFingerprint(snapshot),
    fieldCount: snapshot.fields.length,
    providers: snapshot.providers.map((provider) => ({ id: provider.id, verification: provider.verification })),
  }
  if (options.live) {
    if (!options.apiBaseUrl || !options.sessionRef) {
      throw new ContractDiscoveryError('live drift check requires Beta read credentials', 'missing_beta_credentials')
    }
    const normalizedApiBaseUrl = assertBetaApiBaseUrl(options.apiBaseUrl)
    const live = await discoverInspectionContract({
      ...options,
      apiBaseUrl: normalizedApiBaseUrl,
      readClient: createBetaReadClient({
        apiBaseUrl: normalizedApiBaseUrl,
        sessionRef: options.sessionRef,
        timeoutMs: options.timeoutMs,
      }),
    })
    if (contractFingerprint(live) !== result.fingerprint) {
      throw new ContractDiscoveryError('current sanitized Beta contract differs from the committed snapshot', 'contract_drift')
    }
    result.live = 'matched'
  }
  return result
}
