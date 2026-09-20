#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { buildSurveyCapabilityInventory, readSurveyContract } from './survey-capabilities.mjs'

const closureFile = resolve(fileURLToPath(new URL('../contracts/beta/survey/g4e-closure-readiness.json', import.meta.url)))
const closure = JSON.parse(await readFile(closureFile, 'utf8'))
const surveyContract = await readSurveyContract()
const inventory = buildSurveyCapabilityInventory(surveyContract)

const allowedStatuses = new Set([
  'PASS',
  'PARTIAL',
  'DEFERRED_NON_BLOCKING',
  'BLOCKED_EXTERNAL',
  'LIVE_VALIDATION_PENDING',
  'LIVE_CONTRACT_REVALIDATION_PENDING',
  'DEVICE_VALIDATION_PENDING',
  'VISUAL_VALIDATION_PENDING',
  'NOT_AUTHORIZED',
  'NOT_APPLICABLE',
])
const ownerClasses = new Set(['FRONTEND', 'BACKEND', 'PRODUCT', 'ENVIRONMENT', 'DEVICE_QA', 'VISUAL_QA'])

function fail(message) {
  throw new Error(`G4-E closure readiness check failed: ${message}`)
}

function equal(actual, expected, label) {
  if (actual !== expected) fail(`${label} must be ${JSON.stringify(expected)}`)
}

function checkItem(item, collection) {
  if (!item || typeof item !== 'object') fail(`${collection} contains a malformed item`)
  if (!item.id || typeof item.id !== 'string') fail(`${collection} item is missing id`)
  if (!allowedStatuses.has(item.status)) fail(`${collection}.${item.id} has uncontrolled status ${item.status}`)
  if (!ownerClasses.has(item.owner)) fail(`${collection}.${item.id} has missing/invalid owner ${item.owner}`)
  if (typeof item.blocksFrontendEngineering !== 'boolean' || typeof item.blocksProductionReadiness !== 'boolean') {
    fail(`${collection}.${item.id} is missing blocker classification`)
  }
}

equal(closure.schemaVersion, 1, 'schemaVersion')
equal(closure.domain, 'g4e_survey_onsite', 'domain')
equal(closure.sanitized, true, 'sanitized')
if (!/^[0-9a-f]{40}$/.test(closure.head)) fail('audit head must be a full commit SHA')
if (closure.branch !== 'rebuild/g4e-onsite-inspection') fail('branch is incorrect')
equal(closure.realMutationAuthorization, 'NOT_AUTHORIZED', 'real mutation authorization')
equal(closure.frontendEngineeringStatus, 'PASS', 'frontend engineering status')
equal(closure.productCompletionStatus, 'PARTIAL', 'product completion status')
equal(closure.productionReadinessStatus, 'PARTIAL', 'production readiness status')
equal(closure.g4fAuthorized, false, 'G4-F authorization')

for (const [key, value] of Object.entries(closure.foundation ?? {})) equal(value, 'PASS', `foundation.${key}`)
if (Object.keys(closure.foundation ?? {}).length < 10) fail('accepted foundation inventory is incomplete')

for (const collection of ['implemented', 'productDeferred', 'externalDependencies', 'liveValidationPending', 'deviceValidationPending', 'visualValidationPending', 'residualEvidence']) {
  if (!Array.isArray(closure[collection]) || closure[collection].length === 0) fail(`${collection} is missing`)
  for (const item of closure[collection]) checkItem(item, collection)
}

const deferred = new Map(closure.productDeferred.map((item) => [item.id, item]))
for (const id of ['serviceGoods-projPackage', 'surveyDrawing-surveyTool']) {
  const item = deferred.get(id)
  if (!item) fail(`${id} must remain explicitly deferred`)
  equal(item.status, 'DEFERRED_NON_BLOCKING', `${id} status`)
  equal(item.blocksFrontendEngineering, false, `${id} frontend blocker`)
  equal(item.blocksProductionReadiness, false, `${id} production blocker`)
}

const onsite = closure.externalDependencies.find((item) => item.id === 'survey-onsite-checkin-record-owner-and-command')
if (!onsite || onsite.status !== 'BLOCKED_EXTERNAL' || onsite.owner !== 'BACKEND') fail('Survey onsite check-in must remain a backend external dependency')
if (closure.implemented.some((item) => /onsite.?check.?in/i.test(item.id))) fail('onsite check-in must not be marked implemented')

const watermark = closure.externalDependencies.filter((item) => item.id.startsWith('real-watermark-'))
if (watermark.length < 3 || watermark.some((item) => item.status !== 'BLOCKED_EXTERNAL')) fail('real watermark production blockers are incomplete')
const watermarkArchitecture = closure.implemented.find((item) => item.id === 'camera-watermark-architecture')
if (!watermarkArchitecture || watermarkArchitecture.status !== 'PASS') fail('camera watermark architecture must remain PASS')

const required = inventory.capabilities.filter((field) => field.required && field.mobileApplicable)
const governedDeferred = new Set(closure.formExecutability.deferredExcludedFieldKeys)
const requiredUnsupported = required.filter((field) => !governedDeferred.has(field.valueKey) && (
  field.capabilityClass === 'UNSUPPORTED_UNKNOWN'
  || field.implementationStatus === 'UNKNOWN'
  || field.submissionMode === 'BLOCKED'
))
if (requiredUnsupported.length > 0) fail(`required visible unsupported fields are not classified: ${requiredUnsupported.map((field) => field.valueKey).join(', ')}`)
equal(JSON.stringify(closure.formExecutability.requiredVisibleUnsupportedFieldKeys), JSON.stringify([]), 'required visible unsupported field list')
equal(JSON.stringify(closure.formExecutability.requiredVisibleUnknownFieldKeys), JSON.stringify([]), 'required visible unknown field list')
equal(closure.formExecutability.requiredVisibleOrdinaryStatus, 'PASS', 'ordinary required field execution')
equal(closure.formExecutability.requiredVisibleMediaSourceBackedStatus, 'PASS', 'required media source-backed execution')
equal(closure.formExecutability.requiredVisibleMediaProductionStatus, 'PARTIAL', 'required media production status')
equal(closure.formExecutability.status, 'PASS', 'form executability status')
if (!required.some((field) => field.valueKey === 'leakageCause' && field.implementationStatus === 'SUPPORTED')) fail('Leakage Cause is not supported in the required mobile detail set')

const serialized = JSON.stringify(closure)
for (const forbidden of ['http://', 'https://', 'JSESSIONID', 'access_token', 'sessionRef', 'phoneLogin', 'customerName', '138000']) {
  if (serialized.includes(forbidden)) fail(`sensitive/raw value found: ${forbidden}`)
}

console.log('G4-E closure readiness check passed: frontend foundation PASS; deferred fields non-blocking; external/live/device/visual dependencies classified; G4-F unauthorized')
