#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const contractFile = resolve(fileURLToPath(new URL('../contracts/beta/survey/onsite-checkin-contract.json', import.meta.url)))
const contract = JSON.parse(await readFile(contractFile, 'utf8'))

function fail(message) {
  throw new Error(`Survey onsite check-in contract check failed: ${message}`)
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} must be ${JSON.stringify(expected)}`)
}

function requireOneOf(actual, expected, label) {
  if (!expected.includes(actual)) fail(`${label} must be one of ${expected.join(', ')}`)
}

requireEqual(contract.schemaVersion, 1, 'schemaVersion')
requireEqual(contract.environment, 'beta', 'environment')
requireEqual(contract.domain, 'survey_onsite_checkin', 'domain')
requireEqual(contract.semanticIdentity, 'survey_lbs_onsite_checkin_contract', 'semanticIdentity')
requireEqual(contract.sanitized, true, 'sanitized')

const requirement = contract.businessRequirement
requireEqual(requirement?.priority, 'P0', 'priority')
requireEqual(requirement?.locationRequired, true, 'locationRequired')
requireEqual(requirement?.systemTimeRequired, true, 'systemTimeRequired')
requireEqual(requirement?.manualCheckIn, true, 'manualCheckIn')
requireEqual(requirement?.appointmentNearAutomatic, 'UNKNOWN_NEEDS_BUSINESS_CONFIG', 'appointmentNearAutomatic')
if (JSON.stringify(requirement?.sequence) !== JSON.stringify([
  'appointment_confirmation',
  'survey_onsite_check_in',
  'survey',
  'quotation',
])) fail('business sequence is incomplete or reordered')

const separation = contract.domainSeparation
requireEqual(separation?.survey, 'onsite survey / 勘查', 'Survey domain')
requireEqual(separation?.inspectionAppointment, 'inspection / 巡检', 'InspectionAppointment domain')
requireEqual(separation?.photoLocationEvidence, 'media watermark evidence only', 'photo location separation')
requireEqual(separation?.checkInBusinessRecord, 'separate business record', 'check-in record separation')
requireEqual(separation?.sameLocationPortAllowed, true, 'shared LocationPort allowance')
requireEqual(separation?.sharedBusinessState, false, 'shared business state')
requireEqual(separation?.sharedMediaQueueState, false, 'shared media queue state')

const ownership = contract.ownership
requireEqual(ownership?.recordOwner, 'UNKNOWN', 'record owner')
requireOneOf(ownership?.status, ['UNKNOWN', 'PARTIAL', 'VERIFIED'], 'ownership status')
requireEqual(ownership?.surveyEntityHasGpsPoint, false, 'Survey gpsPoint claim')

const command = contract.command
requireEqual(command?.endpoint, 'UNKNOWN', 'Survey command endpoint')
requireEqual(command?.method, 'UNKNOWN', 'Survey command method')
requireEqual(command?.status, 'UNKNOWN_NOT_PROVEN_FOR_SURVEY', 'Survey command status')
if (Object.keys(command?.request ?? {}).length !== 0) fail('unproven command request must remain empty')

const location = contract.location
requireEqual(location?.source, 'LocationPort', 'location source')
requireEqual(location?.coordinateSystem, 'UNKNOWN', 'coordinate system')
requireEqual(location?.accuracyPolicy, 'UNKNOWN', 'accuracy policy')
if (!String(location?.geofenceOrRadius).includes('UNKNOWN')) fail('geofence/radius must remain explicit UNKNOWN')
requireEqual(location?.fabricatedCoordinates, false, 'fabricated coordinates')

const time = contract.time
requireEqual(time?.authority, 'UNKNOWN', 'time authority')
requireEqual(time?.authoritativeCheckInTime, 'UNKNOWN', 'authoritative check-in time')

const appointmentNear = contract.appointmentNear
requireEqual(appointmentNear?.status, 'UNKNOWN_NEEDS_BUSINESS_CONFIG', 'appointment-near status')
for (const key of ['trigger', 'timeWindow', 'distanceRule']) {
  if (!String(appointmentNear?.[key]).includes('UNKNOWN')) fail(`appointment-near ${key} must remain UNKNOWN`)
}
requireEqual(appointmentNear?.autoImplemented, false, 'automatic check-in implementation')
requireEqual(appointmentNear?.backgroundMutation, false, 'background mutation')

const manual = contract.manual
requireEqual(manual?.status, 'REQUIREMENT_ONLY_BLOCKED_UNTIL_COMMAND_PROVEN', 'manual status')
requireEqual(manual?.saveSurvey, false, 'manual check-in must not save Survey')
requireEqual(manual?.completeWorkflow, false, 'manual check-in must not complete workflow')
requireEqual(manual?.createQuote, false, 'manual check-in must not create quote')

const idempotency = contract.idempotency
requireEqual(idempotency?.blindRetry, false, 'blind retry')
requireEqual(idempotency?.status, 'UNKNOWN', 'idempotency status')
requireEqual(idempotency?.reconciliation, 'UNKNOWN', 'reconciliation status')

requireEqual(contract.offline?.businessMutationQueue, false, 'offline business mutation queue')
requireEqual(contract.realExecution?.realWritesEnabled, false, 'real writes')
requireEqual(contract.realExecution?.betaWrites, 'NONE', 'Beta writes')
requireEqual(contract.realExecution?.productionWrites, 'NONE', 'Production writes')

const serialized = JSON.stringify(contract)
for (const forbidden of [
  'http://',
  'https://',
  'JSESSIONID',
  'access_token',
  'sessionRef',
  'phoneLogin',
  'customerName',
  '138000',
]) {
  if (serialized.includes(forbidden)) fail(`sensitive/raw value found: ${forbidden}`)
}

console.log('Survey onsite check-in contract check passed: requirement recorded; Survey command/owner/time/location explicit UNKNOWN; real writes disabled')
