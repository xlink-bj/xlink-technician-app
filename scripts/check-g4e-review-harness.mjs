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
const galleryPage = await read('__review/design-system-gallery.vue')
const galleryStyle = galleryPage.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? ''
const universalSelectorPattern = /(?:^|[,{>+~])\s*\*(?=\s*(?:[>+~.#:[,{\s]|$))/m
const reviewConfig = await read('vite.review.config.ts')
const uniReviewConfig = await read('vite.uni-h5-review.config.ts')
const mpReviewConfig = await read('vite.mp-weixin-review.config.ts')
const uniReviewAppSource = await readTree('review-app')
const packageJson = JSON.parse(await read('package.json'))
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
if (!galleryStyle) {
  fail('Design System Gallery must keep its review-only presentation styles in the gallery page')
}
if (universalSelectorPattern.test(galleryStyle)) {
  fail('Design System Gallery WXSS must not use universal selectors; use explicit review-only classes')
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
if (!uniReviewConfig.includes("process.env.UNI_INPUT_DIR = reviewInputDir")) {
  fail('uni H5 review must use the supported explicit UNI_INPUT_DIR input root')
}
if (!uniReviewConfig.includes("port: 5174")) {
  fail('uni H5 review must use its isolated development port')
}
if (!uniReviewConfig.includes("'./review-app'")) {
  fail('uni H5 review config must point at the review-only input root')
}
if (!mpReviewConfig.includes('process.env.UNI_INPUT_DIR = reviewInputDir')) {
  fail('MP review must use the supported explicit UNI_INPUT_DIR input root')
}
if (!mpReviewConfig.includes('design-system-mp-weixin')) {
  fail('MP review must use an isolated output directory')
}
if (packageJson.scripts?.['build:mp-weixin-review'] !== 'uni build -p mp-weixin -c vite.mp-weixin-review.config.ts --outDir ../unpackage/design-system-mp-weixin') {
  fail('MP review build script must use the installed uni CLI and review config')
}
if (!uniReviewAppSource.includes('pages/design-system/index')) {
  fail('uni H5 review pages.json must register only the review page')
}
if (!uniReviewAppSource.includes('createSSRApp') || uniReviewAppSource.includes('installReviewRpxCompatibility')) {
  fail('uni H5 review must use the real page runtime without the raw H5 rpx shim')
}
if (!uniReviewAppSource.includes('DesignSystemGallery')) {
  fail('uni H5 review page must mount the real Design System Gallery content')
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
  if (entry.includes(forbidden) || reviewConfig.includes(forbidden) || gallerySource.includes(forbidden) || uniReviewConfig.includes(forbidden) || mpReviewConfig.includes(forbidden) || uniReviewAppSource.includes(forbidden)) {
    fail(`review infrastructure contains forbidden credential/PII marker: ${forbidden}`)
  }
}

for (const forbidden of ['@app/bootstrap', '@features/', '@adapters/', 'apiRead', 'commandApi', 'VITE_XLINK_', 'saveDynamicForm', 'completeDynamicForm']) {
  if (uniReviewConfig.includes(forbidden) || mpReviewConfig.includes(forbidden) || uniReviewAppSource.includes(forbidden)) {
    fail(`uni H5 Design System review must remain shared-UI-only and offline: ${forbidden}`)
  }
}

const productionMpManifestPath = resolve(root, 'dist/build/mp-weixin/app.json')
try {
  const productionMpManifest = await readFile(productionMpManifestPath, 'utf8')
  if (productionMpManifest.includes('pages/design-system/index') || productionMpManifest.includes('__review')) {
    fail('normal MP artifact must not contain the review page')
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  // The source/build checks remain useful before the normal MP artifact exists.
}

const reviewMpManifestPath = resolve(root, 'unpackage/design-system-mp-weixin/app.json')
try {
  const reviewMpManifest = JSON.parse(await readFile(reviewMpManifestPath, 'utf8'))
  if (JSON.stringify(reviewMpManifest.pages) !== JSON.stringify(['pages/design-system/index'])) {
    fail('MP review artifact must contain only the review page')
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  // Allow source-only checks before the review MP artifact is built.
}

const reviewGalleryWxssPath = resolve(root, 'unpackage/design-system-mp-weixin/__review/design-system-gallery.wxss')
try {
  const reviewGalleryWxss = await readFile(reviewGalleryWxssPath, 'utf8')
  if (universalSelectorPattern.test(reviewGalleryWxss)) {
    fail('compiled Design System Gallery WXSS contains a universal selector unsupported by the MP target')
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  // Allow source-only checks before the review MP artifact is built.
}

console.log('G4-E review harness check passed: isolated dev entry, Mock-only, real writes disabled, no production route exposure')
