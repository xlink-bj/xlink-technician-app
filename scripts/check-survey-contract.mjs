#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const inventoryFile = resolve(fileURLToPath(new URL('../contracts/beta/form-families/observed.json', import.meta.url)))

function fail(message) {
  throw new Error(`Survey contract check failed: ${message}`)
}

const inventory = JSON.parse(await readFile(inventoryFile, 'utf8'))
if (inventory.sanitized !== true || inventory.environment !== 'beta') {
  fail('inventory must be a sanitized Beta observation')
}

const survey = inventory.families?.find((family) => family.classification === 'SURVEY')
if (!survey || !Array.isArray(survey.fieldRows)) fail('SURVEY field-row inventory is missing')
if (survey.fieldRows.length !== survey.fieldRowCount) fail('fieldRowCount does not match fieldRows')

const keys = survey.fieldRows.map((field) => field.key)
if (keys.some((key) => typeof key !== 'string' || key.trim().length === 0)) fail('every field row needs a value key')

const counts = new Map()
for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
const duplicates = [...counts.entries()]
  .filter(([, count]) => count > 1)
  .map(([key]) => key)
  .sort()
const declaredDuplicates = [...(survey.duplicateFieldKeys ?? [])].sort()
if (JSON.stringify(duplicates) !== JSON.stringify(declaredDuplicates)) {
  fail('declared duplicate value keys do not match the row inventory')
}

const ids = survey.fieldRows.map((_, index) => `survey-field-${String(index + 1).padStart(3, '0')}`)
if (new Set(ids).size !== ids.length) fail('deterministic Survey field-row identities collide')

console.log(`Survey contract check passed: ${survey.fieldRows.length} rows; duplicate value keys ${duplicates.join(', ')}`)
