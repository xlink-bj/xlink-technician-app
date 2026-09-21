#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

async function read(relativePath) {
  return readFile(resolve(root, relativePath), 'utf8')
}

async function readTree(relativePath) {
  const directory = resolve(root, relativePath)
  const entries = await readdir(directory, { withFileTypes: true })
  const sources = []
  for (const entry of entries) {
    const child = `${relativePath}/${entry.name}`
    if (entry.isDirectory()) sources.push(await readTree(child))
    else if (/\.(ts|vue|js|json)$/.test(entry.name)) sources.push(await read(child))
  }
  return sources.join('\n')
}

function fail(message) {
  throw new Error(`G4-E review harness check failed: ${message}`)
}

const entry = await read('__review/g4e-survey-main.ts')
const html = await read('__review/g4e-survey.html')
const galleryEntry = await read('__review/design-system-main.ts')
const galleryHtml = await read('__review/design-system.html')
const gallerySource = [
  galleryEntry,
  galleryHtml,
  await read('__review/design-system-gallery.vue'),
  await read('__review/design-system-gallery-fixtures.ts'),
].join('\n')
const reviewConfig = await read('vite.review.config.ts')
const pages = await read('src/pages.json')
const appConfig = await read('vite.config.ts')
const productionSource = await readTree('src')

if (!entry.includes("if (import.meta.env.PROD)")) {
  fail('review entry must stop before mounting in production builds')
}
if (!entry.includes("G4-E H5 review harness is development-only")) {
  fail('review entry must expose an explicit development-only guard')
}
if (!html.includes('/__review/g4e-survey-main.ts')) {
  fail('review HTML must use the isolated review entry')
}
if (!galleryEntry.includes("if (import.meta.env.PROD)")) {
  fail('Design System Gallery entry must stop before mounting in production builds')
}
if (!galleryEntry.includes('Design System Gallery is development-only')) {
  fail('Design System Gallery entry must expose an explicit development-only guard')
}
if (!galleryHtml.includes('/__review/design-system-main.ts')) {
  fail('Design System Gallery HTML must use the isolated review entry')
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
if (pages.includes('design-system.html') || pages.includes('design-system')) {
  fail('production pages.json must not expose the Design System Gallery route')
}
if (productionSource.includes('__review/design-system') || productionSource.includes('design-system-gallery')) {
  fail('production source must not import the Design System Gallery')
}
for (const forbidden of ['@app/bootstrap', '@features/', '@adapters/', 'apiRead', 'commandApi', 'VITE_XLINK_', 'saveDynamicForm', 'completeDynamicForm']) {
  if (gallerySource.includes(forbidden)) {
    fail(`Design System Gallery must remain shared-UI-only and offline: ${forbidden}`)
  }
}
for (const forbidden of ['VITE_XLINK_QUICK_LOGIN_PHONE', 'sessionRef', 'access_token', '138000']) {
  if (entry.includes(forbidden) || reviewConfig.includes(forbidden) || gallerySource.includes(forbidden)) {
    fail(`review infrastructure contains forbidden credential/PII marker: ${forbidden}`)
  }
}

console.log('G4-E review harness check passed: isolated dev entry, Mock-only, real writes disabled, no production route exposure')
