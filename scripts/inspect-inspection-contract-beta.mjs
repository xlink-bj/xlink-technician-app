#!/usr/bin/env node

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { discoverInspectionContract } from './inspection-contract.mjs'
import {
  betaLocalDefaults,
  BetaApiClientError,
  assertBetaApiBaseUrl,
  createBetaReadClient,
  loginBeta,
  normalizeBetaLoginMethod,
} from './beta-api-client.mjs'

const FORBIDDEN_CREDENTIAL_ARGS = new Set(['phone', 'code', 'password'])

function argsFrom(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=', 2)
    if (FORBIDDEN_CREDENTIAL_ARGS.has(key)) {
      throw new BetaApiClientError(
        'Phone, verification code and password must not be supplied through CLI arguments',
        'credential_cli_forbidden',
      )
    }
    values[key] = inline ?? argv[index + 1]
    if (inline === undefined) index += 1
  }
  return values
}

function loginOptions(args) {
  const defaults = betaLocalDefaults()
  const method = normalizeBetaLoginMethod(args.method ?? process.env.XLINK_BETA_LOGIN_METHOD ?? defaults.method)
  const credential = method === '2'
    ? process.env.XLINK_BETA_PASSWORD ?? defaults.password
    : defaults.code
  return {
    apiBaseUrl: args['base-url'] ?? defaults.apiBaseUrl,
    tenantId: args.tenant ?? defaults.tenantId,
    phone: defaults.phone,
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBetaInspectionContractCli().catch((error) => {
    const message = error instanceof BetaApiClientError || error instanceof Error
      ? error.message
      : 'Beta contract inspection failed'
    console.error(message)
    process.exitCode = 1
  })
}
