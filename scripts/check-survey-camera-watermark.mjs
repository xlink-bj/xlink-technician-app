#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const contractFile = resolve(fileURLToPath(new URL('../contracts/beta/survey/camera-watermark-contract.json', import.meta.url)))
const contract = JSON.parse(await readFile(contractFile, 'utf8'))

function fail(message) {
  throw new Error(`Survey camera watermark contract check failed: ${message}`)
}

if (
  contract.schemaVersion !== 1
  || contract.environment !== 'beta'
  || contract.domain !== 'survey_camera_watermark'
  || contract.semanticIdentity !== 'r1_camera_post_upload_remote_watermark'
  || contract.sanitized !== true
) fail('authority markers are malformed')

if (contract.pipeline?.stage !== 'POST_UPLOAD') fail('camera watermark must be modeled as post-upload')
if (contract.r1Request?.endpoint !== 'biz/image/uploadAddLogo.do') fail('R1 watermark endpoint is missing')
if (JSON.stringify(contract.r1Request?.parameters) !== JSON.stringify(['qiniuImagePath', 'address', 'latitude', 'longitude'])) fail('watermark request parameter contract is incomplete')
if (contract.backendBehavior?.addressAuthority !== 'SERVER_REVERSE_GEOCODE') fail('address authority must be backend reverse geocoding')
if (contract.backendBehavior?.timestampAuthority !== 'SERVER_CURRENT_TIME') fail('timestamp authority must be backend server time')
if (contract.backendBehavior?.createsNewQiniuObject !== true) fail('watermark output must be a new Qiniu object')
if (contract.coordinateContract?.status !== 'CONFLICT_UNRESOLVED') fail('coordinate conflict must remain explicit')
if (contract.coordinateContract?.automaticConversion !== false) fail('automatic coordinate conversion is not allowed')
if (contract.coordinateContract?.realAdapterEnabled !== false) fail('real adapter must remain disabled')
if (contract.idempotency?.status !== 'NOT_PROVEN') fail('idempotency status must remain unproven')
if (contract.idempotency?.reconciliationApiFound !== false) fail('reconciliation API must not be claimed')
if (contract.idempotency?.ambiguousPostprocessAutoRetry !== false) fail('ambiguous postprocess auto retry must be disabled')
if (contract.runtime?.genericPort !== 'MediaPostUploadProcessorPort') fail('generic post-upload port is missing')
if (contract.runtime?.realUploadAddLogo !== 'DISABLED') fail('real uploadAddLogo must remain disabled')
if (contract.runtime?.mockPipeline !== 'ENABLED_DETERMINISTIC') fail('deterministic Mock pipeline is missing')
if (contract.pipeline?.sourceAndFinalAreDistinct !== true || contract.pipeline?.sourceRefNeverEntersSurveyFormData !== true) fail('source/final FormData safety boundary is missing')
if (contract.surveyPolicy?.albumPolicy !== 'NO_WATERMARK_NO_REQUIRED_LOCATION') fail('album regression policy is missing')
if (contract.surveyPolicy?.surveyDrawing !== 'DEFERRED_NON_BLOCKING') fail('surveyDrawing deferral is missing')

const serialized = JSON.stringify(contract)
for (const forbidden of ['http://', 'https://', 'JSESSIONID', 'access_token', 'sessionRef', 'phoneLogin', 'customerName', '138000']) {
  if (serialized.includes(forbidden)) fail(`sensitive/raw value found: ${forbidden}`)
}

console.log('Survey camera watermark contract check passed: post-upload; coordinate conflict explicit; real adapter disabled')
