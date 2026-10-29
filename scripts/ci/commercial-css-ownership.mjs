#!/usr/bin/env node
/**
 * CUI-01: protect the commercial visual-ownership boundary.
 * Browser geometry is checked separately in real uni-app H5. This guard keeps
 * new cascades and the removed (template-dead) catalogue artwork from growing.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = path => readFileSync(resolve(root, path), 'utf8')
const failures = []
const q01 = read('src/features/work-orders/quotation/Q01CommercialBaseline.css')
const q03 = read('src/features/work-orders/quotation/Q03CommercialBaseline.css')
const legacy = read('src/features/work-orders/quotation/QuotationActionContent.styles.css')
const template = read('src/features/work-orders/quotation/QuotationActionContent.vue')
const ownershipFiles = [
  'QuotationShared.css',
  'QuotationGroups.css',
  'QuotationEditor.css',
  'QuotationCatalog.css',
  'QuotationPackageConfiguration.css',
]
const owners = ownershipFiles.map(name => [name, read(`src/features/work-orders/quotation/${name}`)])

// These dedicated files are FINAL paint owners, not open-ended override piles.
function repeatedSelectors(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const count = new Map()
  // Both final-owner files deliberately avoid nested @media overrides.
  for (const match of withoutComments.matchAll(/^\s*(\.[^{};]+?)\s*\{[^{}]*\}/gm)) {
    const selector = match[1].trim().replace(/\s+/g, ' ')
    count.set(selector, (count.get(selector) ?? 0) + 1)
  }
  return [...count].filter(([, num]) => num > 1).map(([name, num]) => `${name} ×${num}`)
}
for (const [name, css] of [['Q01', q01], ['Q03', q03], ...owners]) {
  const duplicates = repeatedSelectors(css)
  if (duplicates.length) failures.push(`${name} final CSS has duplicate selectors: ${duplicates.join(', ')}`)
}
const expectedImports = [...ownershipFiles, 'QuotationActionContent.styles.css']
  .map(name => `<style src="./${name}"></style>`).join('\n')
if (!template.includes(expectedImports)) {
  failures.push('quotation CSS owners must stay in original cascade order')
}

// Confirm dead layout code stays deleted while it remains absent from the real
// Vue screen. If a future change genuinely reintroduces it, re-evaluate intent
// and explicit ownership instead of silently adding another CSS layer.
const obsolete = [
  'catalog-art', 'catalog-thumbnail-copy', 'catalog-thumbnail-caption',
  'catalog-toolbar', 'catalog-item-price-state',
]
for (const name of obsolete) {
  if (!template.includes(name) && [legacy, ...owners.map(([, css]) => css)].some(css => css.includes('.quotation-content__' + name))) {
    failures.push(`obsolete selector .quotation-content__${name} reintroduced without DOM owner`)
  }
}

if (failures.length) {
  for (const failure of failures) process.stderr.write('CUI-01 FAIL: ' + failure + '\n')
  process.exitCode = 1
} else {
  process.stdout.write('CUI-01 CSS ownership PASS: unique Q01/Q03 and component-owner selectors; stable cascade order; no obsolete catalogue artwork\n')
}
