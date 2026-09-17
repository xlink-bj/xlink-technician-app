#!/usr/bin/env node

import { writeFile } from 'node:fs/promises'

import { discoverInspectionContract } from './inspection-contract.mjs'
import {
  betaDefaults,
  BetaApiClientError,
  assertBetaApiBaseUrl,
  createBetaReadClient,
  loginBeta,
  normalizeBetaLoginMethod,
} from './beta-api-client.mjs'

function argsFrom(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=', 2)
    values[key] = inline ?? argv[index + 1]
    if (inline === undefined) index += 1
  }
  return values
}

function loginOptions(args) {
  const defaults = betaDefaults()
  const method = normalizeBetaLoginMethod(args.method ?? defaults.method)
  const credential = method === '2'
    ? args.password ?? defaults.password
    : args.code ?? defaults.code
  return {
    apiBaseUrl: args['base-url'] ?? defaults.apiBaseUrl,
    tenantId: args.tenant ?? defaults.tenantId,
    phone: args.phone ?? defaults.phone,
    method,
    credential,
    timeoutMs: defaults.timeoutMs,
  }
}

export async function runBetaInspectionContractCli(argv = process.argv.slice(2)) {
  const args = argsFrom(argv)
  const resolvedLoginOptions = loginOptions(args)
  const login = await loginBeta(resolvedLoginOptions)
  const apiBaseUrl = assertBetaApiBaseUrl(resolvedLoginOptions.apiBaseUrl)
  const snapshot = await discoverInspectionContract({
    apiBaseUrl,
    sessionRef: login.sessionRef,
    timeoutMs: resolvedLoginOptions.timeoutMs,
    tenantId: resolvedLoginOptions.tenantId,
    workOrderId: args['work-order'] ?? process.env.XLINK_SCHEMA_WORK_ORDER_ID?.trim(),
    nodeId: args.node ?? process.env.XLINK_SCHEMA_INSPECTION_NODE_ID?.trim(),
    readClient: createBetaReadClient({
      apiBaseUrl,
      sessionRef: login.sessionRef,
      timeoutMs: resolvedLoginOptions.timeoutMs,
    }),
  })
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`
  const outputFile = args.output ?? process.env.XLINK_SCHEMA_OUTPUT_FILE?.trim()
  if (outputFile) await writeFile(outputFile, serialized, 'utf8')
  else process.stdout.write(serialized)
  return snapshot
}

runBetaInspectionContractCli().catch((error) => {
  const message = error instanceof BetaApiClientError || error instanceof Error
    ? error.message
    : 'Beta contract inspection failed'
  console.error(message)
  process.exitCode = 1
})
