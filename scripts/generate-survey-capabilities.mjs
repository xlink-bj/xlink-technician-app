#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  buildSurveyCapabilityInventory,
  buildSurveyCapabilityMatrixMarkdown,
  inventoryFile,
  matrixFile,
  readSurveyContract,
} from './survey-capabilities.mjs'

const contract = await readSurveyContract()
const inventory = buildSurveyCapabilityInventory(contract)
await mkdir(resolve(inventoryFile, '..'), { recursive: true })
await mkdir(resolve(matrixFile, '..'), { recursive: true })
await writeFile(inventoryFile, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
await writeFile(matrixFile, buildSurveyCapabilityMatrixMarkdown(inventory), 'utf8')
console.log(`Survey capability inventory generated: ${inventory.mobileDetailFieldCount} mobile-detail rows`)
