#!/usr/bin/env node
// Style ownership only. Runtime behavior is covered by the real component,
// authorization, draft/media and business tests in the normal verify lane.
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = path => readFile(resolve(root, path), 'utf8')
const fail = message => { throw new Error(`UI ownership check failed: ${message}`) }

const existingVisualOverrideBudget = {
  'src/features/work-orders/components/MockJourneyContextPanel.vue': 2,
  'src/features/work-orders/components/SurveyCompleteConfirmation.vue': 1,
  'src/features/work-orders/quotation/QuotationActionContent.vue': 12,
  'src/features/work-orders/quotation/QuotationActionWorkspace.vue': 1,
  'src/features/work-orders/quotation/QuotationOrderHub.vue': 2,
  'src/pages/work-orders/material-sku-mock-review.vue': 1,
  'src/pages/work-orders/signing-mock-review.vue': 2,
}

async function walkPresentationSources(dir) {
  const found = []
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name).replace(/\\/g, '/')
    if (entry.isDirectory()) found.push(...await walkPresentationSources(path))
    else if (/\.(vue|scss)$/.test(entry.name)) found.push(path)
  }
  return found
}

for (const file of [
  ...await walkPresentationSources('src/features'),
  ...await walkPresentationSources('src/pages'),
]) {
  const source = await read(file)
  const style = file.endsWith('.vue') ? source.slice(source.indexOf('<style') < 0 ? source.length : source.indexOf('<style')) : source
  const buttonOverrides = (style.match(/\.app-button\b/g) ?? []).length
  const permitted = existingVisualOverrideBudget[file] ?? 0
  if (buttonOverrides > permitted) {
    fail(`DS-01: ${file} defines ${buttonOverrides} AppButton style references (legacy allowance ${permitted}); reuse shared component props instead`)
  }
}

await import('./check-ui-style-ownership.mjs')
console.log('UI style ownership check passed')
