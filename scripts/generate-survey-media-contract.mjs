#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { buildSurveyMediaContract } from './survey-media-contract.mjs'

const contractPath = resolve(fileURLToPath(new URL('../contracts/beta/survey/historical.json', import.meta.url)))
const outputPath = resolve(fileURLToPath(new URL('../contracts/beta/survey/media-contract.json', import.meta.url)))
const contract = JSON.parse(await readFile(contractPath, 'utf8'))
const mediaContract = buildSurveyMediaContract(contract)
await writeFile(outputPath, `${JSON.stringify(mediaContract, null, 2)}\n`, 'utf8')
console.log(`Generated Survey media contract: ${mediaContract.rows.length} rows`)
