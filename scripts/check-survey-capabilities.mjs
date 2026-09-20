#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import {
  buildSurveyCapabilityInventory,
  inventoryFile,
  readSurveyContract,
} from './survey-capabilities.mjs'

function fail(message) {
  throw new Error(`Survey capability check failed: ${message}`)
}

const contract = await readSurveyContract()
const actual = JSON.parse(await readFile(inventoryFile, 'utf8'))
const expected = buildSurveyCapabilityInventory(contract)

if (contract.fieldRows.length !== 61) fail(`historical field count drifted: ${contract.fieldRows.length}`)
if (expected.mobileDetailFieldCount !== 45) fail(`mobile-detail field count drifted: ${expected.mobileDetailFieldCount}`)
if (expected.classifiedFieldCount !== expected.mobileDetailFieldCount) fail('not every mobile-detail row was classified')
if (actual.source?.fingerprint !== contract.fingerprint) fail('capability inventory source fingerprint is stale')
if (actual.source?.semanticIdentity !== 'all_extfield_rows_colName_survey') fail('capability inventory semantic identity is invalid')
if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('capability inventory does not match historical contract derivation')

const allowedClasses = new Set([
  'GENERIC_INPUT',
  'OPTION_INPUT',
  'MEDIA_INPUT',
  'PRESENTATION_ONLY',
  'CUSTOM_EXPERIENCE',
  'DERIVED_OR_SYSTEM',
  'UNSUPPORTED_UNKNOWN',
])
for (const row of actual.capabilities) {
  if (!allowedClasses.has(row.capabilityClass)) fail(`${row.fieldId} has invalid capability class`)
  if (!['SUPPORTED', 'PARTIAL', 'UNKNOWN'].includes(row.implementationStatus)) fail(`${row.fieldId} has invalid implementation status`)
  if (!row.mobileApplicable) fail(`${row.fieldId} is not mobile applicable`)
}

console.log(`Survey capability check passed: ${contract.fieldRows.length} historical rows; ${actual.mobileDetailFieldCount} mobile-detail rows; ${actual.classifiedFieldCount} classified rows`)
