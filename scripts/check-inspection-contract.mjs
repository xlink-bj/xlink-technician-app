#!/usr/bin/env node

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runContractCheck } from './inspection-contract.mjs'

const snapshotFile = resolve(fileURLToPath(new URL('../contracts/beta/inspection/current.json', import.meta.url)))
const live = process.argv.includes('--live') || process.env.XLINK_SCHEMA_CHECK_LIVE === 'true'

runContractCheck(snapshotFile, {
  live,
  apiBaseUrl: process.env.XLINK_SCHEMA_API_BASE_URL?.trim(),
  sessionRef: process.env.XLINK_SCHEMA_SESSION_REF?.trim(),
  timeoutMs: Number(process.env.XLINK_SCHEMA_TIMEOUT_MS ?? 15_000),
  tenantId: process.env.XLINK_SCHEMA_TENANT_ID?.trim(),
  workOrderId: process.env.XLINK_SCHEMA_WORK_ORDER_ID?.trim(),
  nodeId: process.env.XLINK_SCHEMA_INSPECTION_NODE_ID?.trim(),
})
  .then((result) => {
    console.log(`Inspection contract check passed: ${result.fieldCount} fields; fingerprint ${result.fingerprint}`)
    for (const provider of result.providers) console.log(`- ${provider.id}: ${provider.verification}`)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Inspection contract check failed')
    process.exitCode = 1
  })
