#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const contractFile = resolve(fileURLToPath(new URL('../contracts/beta/survey/historical.json', import.meta.url)))

function fail(message) {
  throw new Error(`Survey contract check failed: ${message}`)
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

function digest(contract) {
  const { fingerprint: _fingerprint, ...content } = contract
  return createHash('sha256').update(JSON.stringify(canonicalize(content))).digest('hex')
}

function isPrimitive(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

const contract = JSON.parse(await readFile(contractFile, 'utf8'))
if (
  contract.sanitized !== true
  || contract.environment !== 'beta'
  || contract.lifecycleEvidence !== 'historical_inactive'
  || contract.domain !== 'survey'
  || contract.semanticPurpose !== 'survey'
) fail('authority markers must identify a sanitized historical Beta Survey contract')

const fields = contract.fieldRows
if (!Array.isArray(fields) || fields.length !== contract.fieldRowCount || fields.length !== 61) {
  fail('field row count must be 61 and agree with fieldRows')
}

const fieldIds = new Set()
const valueKeyCounts = new Map()
const orders = []
for (const field of fields) {
  if (!field || typeof field !== 'object') fail('every field row must be an object')
  if (!/^survey-field-\d{3}$/.test(field.fieldId) || fieldIds.has(field.fieldId)) fail('fieldId aliases must be unique and deterministic')
  fieldIds.add(field.fieldId)
  if (typeof field.valueKey !== 'string' || !field.valueKey.trim()) fail('every field needs a valueKey')
  if (typeof field.label !== 'string' || !field.label.trim()) fail('every field needs a captured display label')
  if (typeof field.type !== 'string' || !field.type.trim()) fail('every field needs a type')
  if (typeof field.required !== 'boolean' || typeof field.multiple !== 'boolean' || typeof field.readOnly !== 'boolean') {
    fail(`field ${field.fieldId} is missing boolean behavior metadata`)
  }
  if (!Number.isInteger(field.order)) fail(`field ${field.fieldId} has an invalid order`)
  orders.push(field.order)
  valueKeyCounts.set(field.valueKey, (valueKeyCounts.get(field.valueKey) ?? 0) + 1)
  if (field.showField !== undefined && !fields.some((candidate) => candidate.valueKey === field.showField)) {
    fail(`field ${field.fieldId} references an unknown showField`)
  }
  if (field.frontEndConfig?.showField !== undefined && !fields.some((candidate) => candidate.valueKey === field.frontEndConfig.showField)) {
    fail(`field ${field.fieldId} frontEndConfig references an unknown showField`)
  }
  if (field.frontEndConfig !== undefined && typeof field.frontEndConfig !== 'object') fail(`field ${field.fieldId} has malformed structural metadata`)
  for (const key of ['showType', 'showField', 'showFieldPreset', 'showValue', 'extsShowValue', 'frontEndConfig']) {
    if (field[key] !== undefined && field[key] !== null && !isPrimitive(field[key]) && !Array.isArray(field[key]) && typeof field[key] !== 'object') {
      fail(`field ${field.fieldId} has malformed ${key}`)
    }
  }
}
const sortedOrders = [...orders].sort((left, right) => left - right)
if (sortedOrders.some((order, index) => order !== index + 1)) fail('field order must be a unique 1..N sequence')

const duplicates = [...valueKeyCounts.entries()].filter(([, count]) => count > 1).map(([key]) => key).sort()
if (JSON.stringify(duplicates) !== JSON.stringify([...(contract.duplicateValueKeys ?? [])].sort())) {
  fail('duplicate valueKey declaration does not match field rows')
}
if (!duplicates.includes('province') || !duplicates.includes('length') || !duplicates.includes('width') || !duplicates.includes('gap4')) {
  fail('confirmed duplicate Survey value keys are not represented')
}

if (!Array.isArray(contract.providers)) fail('provider references are missing')
for (const provider of contract.providers) {
  if (!provider.id || !provider.verification || !Array.isArray(provider.options)) fail('provider metadata is malformed')
  for (const option of provider.options) {
    if (!option || typeof option.value !== 'string' || !option.value.startsWith('survey-option-')) fail('provider options must use deterministic aliases')
  }
}

const serialized = JSON.stringify(contract)
for (const forbidden of ['JSESSIONID', 'sessionRef', 'access_token', 'token', 'phoneLogin', 'customerName', '138000', '7971040108398070730']) {
  if (serialized.includes(forbidden)) fail(`forbidden sensitive/raw value found: ${forbidden}`)
}
if (contract.fingerprint !== digest(contract)) fail('fingerprint is stale or non-deterministic')

console.log(`Survey contract check passed: ${fields.length} rows; duplicate value keys ${duplicates.join(', ')}`)
