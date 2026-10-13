#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { buildSurveyMediaContract, MEDIA_KEYS } from './survey-media-contract.mjs'

const historicalPath = resolve(fileURLToPath(new URL('../contracts/beta/survey/historical.json', import.meta.url)))
const mediaPath = resolve(fileURLToPath(new URL('../contracts/beta/survey/media-contract.json', import.meta.url)))
const historical = JSON.parse(await readFile(historicalPath, 'utf8'))
const media = JSON.parse(await readFile(mediaPath, 'utf8'))

function fail(message) {
  throw new Error(`Survey media contract check failed: ${message}`)
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

const expected = buildSurveyMediaContract(historical)
if (media.schemaVersion !== 1 || media.environment !== 'beta' || media.domain !== 'survey') fail('authority markers are malformed')
if (media.semanticIdentity !== 'media_rows_derived_only_from_verified_survey_extfields') fail('semantic identity marker is missing')
if (media.source?.fingerprint !== historical.fingerprint) fail('source fingerprint does not match historical Survey contract')
if (JSON.stringify(media.rows) !== JSON.stringify(expected.rows)) fail('rows are stale; regenerate from historical Survey contract')
if (media.fieldRowCount !== MEDIA_KEYS.length || media.rows.length !== MEDIA_KEYS.length) fail('media row count must be 24')
if (!media.rows.every((row) => row.mobileApplicable && row.persistedShape === 'LIST_OF_MEDIA_OBJECTS_URL_NAME_EXTNAME')) {
  fail('every row must be mobile-applicable with an explicit persisted media shape')
}
if (media.policies?.aggregateMaxCount !== 'UNKNOWN') fail('aggregate media limit must remain UNKNOWN')
if (media.policies?.offlineSupport !== 'NOT_IMPLEMENTED') fail('offline media support must remain explicit')
const required = new Set(media.rows.filter((row) => row.required).map((row) => row.valueKey))
for (const key of ['surveyDrawing', 'images1', 'images2']) if (!required.has(key)) fail(`required media field missing: ${key}`)
if (media.rows.find((row) => row.valueKey === 'surveyDrawing')?.onlineStatus !== 'UNKNOWN_SPECIAL_TOOL') fail('Survey drawing must remain special-tool unknown')
if (media.rows.find((row) => row.valueKey === 'infraredImageList')?.maxCount !== 4) fail('infrared max-count evidence must remain 4')
for (const row of media.rows) {
  if (row.maxCount !== 'UNKNOWN' && (!Number.isInteger(row.maxCount) || row.maxCount < 1)) fail(`invalid max count for ${row.valueKey}`)
}
const serialized = JSON.stringify(media)
for (const forbidden of ['http://', 'https://', 'JSESSIONID', 'access_token', 'sessionRef', 'phoneLogin', 'customerName', '138000']) {
  if (serialized.includes(forbidden)) fail(`sensitive or raw transport value found: ${forbidden}`)
}
if (digest(media.rows) !== digest(expected.rows)) fail('media rows are non-deterministic')
console.log(`Survey media contract check passed: ${media.rows.length} rows; aggregate max UNKNOWN; offline NOT_IMPLEMENTED`)
