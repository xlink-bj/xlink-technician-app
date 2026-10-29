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
function selectorFrequencies(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const count = new Map()
  // Includes responsive nested rules: legacy repeats are debt, not assumed dead CSS.
  for (const match of withoutComments.matchAll(/^\s*(\.[^{};]+?)\s*\{[^{}]*\}/gm)) {
    const selector = match[1].trim().replace(/\s+/g, ' ')
    count.set(selector, (count.get(selector) ?? 0) + 1)
  }
  return count
}
function repeatedSelectors(css) {
  return [...selectorFrequencies(css)].filter(([, num]) => num > 1).map(([name, num]) => `${name} ×${num}`)
}

// CUI-02 mainline reconciliation: #227's older split cannot be layered over
// the five owners now on main. Protect the remaining legacy CSS debt with an
// exact accepted-main ceiling; lowering any number is safe. Legitimate growth
// needs a reviewed budget change and real H5 / MP visual parity evidence.
const debtCeiling = Object.freeze({
  legacyBytes: 57799,
  totalOwnerBytes: 83700,
  legacyRepeatedRootExcess: 172,
})
const legacyBytes = Buffer.byteLength(legacy, 'utf8')
const totalOwnerBytes = legacyBytes + owners.reduce((total, [, css]) => total + Buffer.byteLength(css, 'utf8'), 0)
const legacyRepeatedRootExcess = [...selectorFrequencies(legacy).values()].reduce((total, num) => total + Math.max(0, num - 1), 0)
if (legacyBytes > debtCeiling.legacyBytes) failures.push(`legacy CSS grew to ${legacyBytes} bytes (ceiling ${debtCeiling.legacyBytes})`)
if (totalOwnerBytes > debtCeiling.totalOwnerBytes) failures.push(`quotation component CSS grew to ${totalOwnerBytes} bytes (ceiling ${debtCeiling.totalOwnerBytes})`)
if (legacyRepeatedRootExcess > debtCeiling.legacyRepeatedRootExcess) {
  failures.push(`legacy repeated root-selector excess grew to ${legacyRepeatedRootExcess} (ceiling ${debtCeiling.legacyRepeatedRootExcess})`)
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
  process.stdout.write(`CUI-01/CUI-02 CSS ownership PASS: unique component owners; stable cascade; legacy debt ${legacyBytes}B / ${totalOwnerBytes}B total / ${legacyRepeatedRootExcess} repeated definitions (no growth)\n`)
}
