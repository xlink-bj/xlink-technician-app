#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

async function read(relativePath) {
  return readFile(resolve(root, relativePath), 'utf8')
}

function fail(message) {
  throw new Error(`G4-E review harness check failed: ${message}`)
}

const entry = await read('__review/g4e-survey-main.ts')
const html = await read('__review/g4e-survey.html')
const reviewConfig = await read('vite.review.config.ts')
const pages = await read('src/pages.json')
const appConfig = await read('vite.config.ts')

if (!entry.includes("if (import.meta.env.PROD)")) {
  fail('review entry must stop before mounting in production builds')
}
if (!entry.includes("G4-E H5 review harness is development-only")) {
  fail('review entry must expose an explicit development-only guard')
}
if (!html.includes('/__review/g4e-survey-main.ts')) {
  fail('review HTML must use the isolated review entry')
}
if (!reviewConfig.includes("VITE_XLINK_ENABLE_REAL_WRITES': JSON.stringify('false')")) {
  fail('review config must hard-disable real writes')
}
if (!reviewConfig.includes("VITE_XLINK_MOCK': JSON.stringify('true')")) {
  fail('review config must force Mock mode')
}
if (pages.includes('__review') || pages.includes('g4e-survey')) {
  fail('production pages.json must not expose the review route')
}
if (appConfig.includes('__review') || appConfig.includes('g4e-survey')) {
  fail('production Vite config must not include the review entry')
}
for (const forbidden of ['VITE_XLINK_QUICK_LOGIN_PHONE', 'sessionRef', 'access_token', '138000']) {
  if (entry.includes(forbidden) || reviewConfig.includes(forbidden)) {
    fail(`review infrastructure contains forbidden credential/PII marker: ${forbidden}`)
  }
}

console.log('G4-E review harness check passed: isolated dev entry, Mock-only, real writes disabled, no production route exposure')
