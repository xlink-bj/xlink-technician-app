#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const contractFile = resolve(fileURLToPath(new URL('../contracts/beta/survey/media-p0-contract.json', import.meta.url)))
const contract = JSON.parse(await readFile(contractFile, 'utf8'))

function fail(message) {
  throw new Error(`Survey media P0 contract check failed: ${message}`)
}

if (
  contract.schemaVersion !== 1
  || contract.environment !== 'beta'
  || contract.domain !== 'survey_media_p0'
  || contract.semanticIdentity !== 'generic_durable_media_queue_with_survey_codec_boundary'
  || contract.sanitized !== true
) fail('authority markers are malformed')

if (contract.source?.noLiveWrite !== true || contract.source?.rawProductionPayloadPersisted !== false) fail('live-write or raw-payload safety marker is missing')
if (contract.genericRuntime?.surveySpecificQueue !== false) fail('media queue must remain generic')
if (contract.genericRuntime?.uploadQueue !== 'MediaUploadQueuePort') fail('generic queue port is missing')
if (contract.genericRuntime?.surveySpecificCodec !== 'survey-form-codec.ts') fail('Survey codec boundary is missing')

const requiredIdentity = ['userId', 'workOrderId', 'workflowNodeId', 'formDefinitionId', 'formDataId', 'fieldId', 'valueKey', 'localAssetId']
if (JSON.stringify(contract.taskIdentity) !== JSON.stringify(requiredIdentity)) fail('task identity scope is incomplete')
const requiredStates = ['queued', 'preprocessing', 'ready_to_upload', 'uploading', 'uploaded', 'failed_retryable', 'failed_terminal']
if (JSON.stringify(contract.states) !== JSON.stringify(requiredStates)) fail('task state machine is incomplete or reordered')
if (contract.durability?.localAssetBeforeUpload !== true || contract.durability?.tempPathOnly !== false) fail('durable local media boundary is not explicit')
if (contract.durability?.automaticRetry !== false || contract.durability?.ambiguousUpload !== 'manual_retry_required') fail('ambiguous upload policy is unsafe')
if (contract.formSafety?.remoteRefBeforeConfirmedUpload !== false || contract.formSafety?.localPathInFormData !== false) fail('FormData safety boundary is malformed')
if (contract.platform?.mp_weixin?.status !== 'PARTIAL' || contract.platform?.app?.status !== 'PARTIAL') fail('platform verification must remain honest')
if (contract.photoEvidence?.camera?.locationRequired !== true || contract.photoEvidence?.camera?.watermark !== 'PREPROCESSOR_REQUIRED') fail('camera evidence policy is not source-backed')
if (!Array.isArray(contract.deferred) || !contract.deferred.some((item) => String(item).includes('serviceGoods/projPackage'))) fail('serviceGoods deferred disposition is missing')

const serialized = JSON.stringify(contract)
for (const forbidden of ['http://', 'https://', 'JSESSIONID', 'access_token', 'sessionRef', 'phoneLogin', 'customerName', '138000']) {
  if (serialized.includes(forbidden)) fail(`sensitive/raw value found: ${forbidden}`)
}

console.log('Survey media P0 contract check passed: generic durable queue; platform status PARTIAL; real writes disabled')
