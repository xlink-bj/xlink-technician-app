#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const contractFile = fileURLToPath(new URL('../contracts/beta/survey/leakage-cause-contract.json', import.meta.url))
const contract = JSON.parse(await readFile(contractFile, 'utf8'))

function fail(message) {
  throw new Error(`Survey leakage-cause contract check failed: ${message}`)
}

if (contract.schemaVersion !== 1) fail('schema version is invalid')
if (contract.sourceSurveyFingerprint !== '9ed17f08b2d786fd6810b1afcddd60ac6d53eb9cd711173334bd00e6e6fa4aa6') fail('source fingerprint is stale')
if (contract.domain !== 'survey' || contract.experience !== 'leakage_cause' || contract.status !== 'PARTIAL') fail('semantic identity/status is invalid')
if (contract.triggerField?.fieldId !== 'survey-field-057' || contract.triggerField?.valueKey !== 'leakageCauseSelect' || contract.triggerField?.type !== 'select') fail('trigger field identity is invalid')
if (contract.valueField?.fieldId !== 'survey-field-058' || contract.valueField?.valueKey !== 'leakageCause' || contract.valueField?.type !== 'data' || contract.valueField?.required !== true || contract.valueField?.multiple !== true) fail('value field identity is invalid')
if (contract.provider?.endpoint !== 'biz/extForm/queryByColName/leakageCause' || contract.provider?.method !== 'POST') fail('provider endpoint is invalid')
if (JSON.stringify(contract.provider?.request) !== JSON.stringify({ _all: '1', sortField: 'partOrder,leakageCauseOrder', sortOrder: 'asc' })) fail('provider request shape is invalid')
if (JSON.stringify(contract.provider?.responseRow) !== JSON.stringify({ part: 'string', leakageCause: 'string', label: 'string' })) fail('provider response shape is invalid')
if (contract.partDependency?.visibleToVisiblePolicy !== 'UNKNOWN') fail('unverified visible-to-visible policy was asserted')
if (contract.evidence?.sanitized !== true || contract.evidence?.productionDataIncluded !== false) fail('evidence sanitization marker is invalid')

console.log('Survey leakage-cause contract check passed')
