#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const qaRoutes = [
  'pages/work-orders/signing-mock-review',
  'pages/work-orders/material-sku-mock-review',
  'pages/work-orders/child-subflow-mock-review',
  'pages/dev/qa-console',
]
const guardedBlock = /^\s*\/\/ #ifdef XLINK_DEV_QA\s*\r?\n([\s\S]*?)^\s*\/\/ #endif\s*\r?\n/m

function fail(message) {
  throw new Error(`C1 release QA page boundary FAIL: ${message}`)
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

function checkSource() {
  const raw = read('src/pages.json')
  const match = guardedBlock.exec(raw)
  if (!match) fail('four QA routes must be protected by XLINK_DEV_QA')
  const releaseSource = raw.replace(guardedBlock, '')
  const devSource = raw
    .replace(/^\s*\/\/ #ifdef XLINK_DEV_QA\s*$/m, '')
    .replace(/^\s*\/\/ #endif\s*$/m, '')
  let release
  let dev
  try {
    release = JSON.parse(releaseSource)
    dev = JSON.parse(devSource)
  } catch {
    fail('both release and DEV page tables must parse as JSON after preprocessing')
  }

  const releaseRoutes = release.pages.map(page => page.path)
  const devRoutes = dev.pages.map(page => page.path)
  if (new Set(releaseRoutes).size !== releaseRoutes.length ||
    new Set(devRoutes).size !== devRoutes.length) {
    fail('duplicate page route')
  }
  if (qaRoutes.some(route => releaseRoutes.includes(route)) ||
    qaRoutes.some(route => !devRoutes.includes(route))) {
    fail('QA pages must exist in DEV only')
  }
  const devOnlyRoutes = devRoutes.filter(route => !releaseRoutes.includes(route))
  if (devOnlyRoutes.length !== qaRoutes.length ||
    devOnlyRoutes.some(route => !qaRoutes.includes(route))) {
    fail('conditional block must contain exactly the four approved QA routes')
  }
  if (JSON.stringify(devRoutes.filter(route => !qaRoutes.includes(route))) !==
    JSON.stringify(releaseRoutes)) {
    fail('commercial route order changed between profiles')
  }

  const scripts = JSON.parse(read('package.json')).scripts
  for (const command of ['dev:h5', 'dev:mp-weixin']) {
    if (!scripts[command]?.includes('UNI_CUSTOM_CONTEXT=') ||
      !scripts[command].includes('XLINK_DEV_QA')) {
      fail(`${command} must explicitly enable DEV QA routes`)
    }
  }
  for (const command of ['build:h5', 'build:mp-weixin', 'build:app']) {
    if (scripts[command]?.includes('XLINK_DEV_QA')) {
      fail(`${command} must never enable DEV QA routes`)
    }
  }
  console.log(`C1 source QA boundary: PASS (${releaseRoutes.length} release / ${devRoutes.length} DEV routes)`)
}

function checkReleaseContext() {
  const customContext = process.env.UNI_CUSTOM_CONTEXT
  if (customContext) {
    let context
    try {
      context = JSON.parse(customContext)
    } catch {
      fail('UNI_CUSTOM_CONTEXT must be valid JSON for a release build')
    }
    if (context && typeof context === 'object' && 'XLINK_DEV_QA' in context) {
      fail('release build must not inherit the XLINK_DEV_QA compiler flag')
    }
  }
  console.log('C1 release compiler context: PASS (XLINK_DEV_QA disabled)')
}

function checkH5(expectDev) {
  const assetDir = resolve(root, 'dist/build/h5/assets')
  if (!existsSync(assetDir)) fail('H5 release assets missing')
  const files = readdirSync(assetDir)
  for (const route of qaRoutes) {
    const prefix = route.replaceAll('/', '-') + '.'
    const exists = files.some(file => file.startsWith(prefix))
    if (exists !== expectDev) fail(`H5 route asset ${route} expected ${expectDev ? 'present' : 'absent'}`)
  }
  const entrypoints = files.filter(file => /^index-.*\.js$/.test(file))
  if (!entrypoints.length) fail('H5 application entrypoint missing')
  const jsSources = files.filter(file => file.endsWith('.js'))
    .map(file => readFileSync(join(assetDir, file), 'utf8'))
  const entrySources = entrypoints.map(file => readFileSync(join(assetDir, file), 'utf8'))
  for (const route of qaRoutes) {
    if (entrySources.some(source => source.includes(route)) !== expectDev) {
      fail(`H5 route table ${route} does not match build profile`)
    }
    if (!expectDev && jsSources.some(source => source.includes(route))) {
      fail(`H5 release JS still references QA route ${route}`)
    }
  }
  console.log(`C1 H5 QA boundary: PASS (four routes ${expectDev ? 'present in DEV' : 'absent in release'})`)
}

function checkMp(expectDev) {
  const dir = resolve(root, 'dist/build/mp-weixin')
  if (!existsSync(join(dir, 'app.json'))) fail('MP-WEIXIN app.json missing')
  const pages = JSON.parse(readFileSync(join(dir, 'app.json'), 'utf8')).pages
  for (const route of qaRoutes) {
    const declared = pages.includes(route)
    const assets = ['js', 'json', 'wxml', 'wxss']
      .map(ext => existsSync(join(dir, `${route}.${ext}`)))
    const assetsMatchProfile = expectDev ? assets.every(Boolean) : assets.every(exists => !exists)
    if (declared !== expectDev || !assetsMatchProfile) {
      fail(`MP-WEIXIN route ${route} expected ${expectDev ? 'present' : 'absent'}`)
    }
  }
  if (pages.length !== (expectDev ? 12 : 8)) {
    fail('MP-WEIXIN route count differs from approved baseline')
  }
  console.log(`C1 MP-WEIXIN QA boundary: PASS (four routes ${expectDev ? 'present in DEV' : 'absent in release'})`)
}

const [target = 'source', profile] = process.argv.slice(2)
const expectDev = profile === '--expect-dev'
if (profile && !expectDev) fail(`unknown profile argument ${profile}`)
switch (target) {
  case 'source':
    if (expectDev) fail('source check is profile-independent')
    checkSource()
    break
  case 'release-context':
    if (expectDev) fail('release-context check is release-only')
    checkReleaseContext()
    break
  case 'h5':
    checkH5(expectDev)
    break
  case 'mp-weixin':
    checkMp(expectDev)
    break
  default:
    fail(`unknown target ${target}`)
}
