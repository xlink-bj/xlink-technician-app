#!/usr/bin/env node
/**
 * CUI-02: enforce one CSS owner per quotation component.
 * Deliberately parses only root rules. Nested @media rules stay in shared CSS
 * and are not counted as repeated component selectors.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const base = 'src/features/work-orders/quotation/'
const owners = [
  'QuotationActionContent.styles.css',
  'QuotationEditor.styles.css',
  'QuotationGroups.styles.css',
  'QuotationPackageConfiguration.styles.css',
  'QuotationCatalog.styles.css',
]
const component = readFileSync(resolve(base, 'QuotationActionContent.vue'), 'utf8')
const error = []
const cross = new Map()
let rules = 0
let totalBytes = 0

function rootSelectors(css, name) {
  const selectors = []
  let start = 0
  let open = 0
  let depth = 0
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) open = i
      depth++
    } else if (css[i] === '}') {
      depth--
      if (depth < 0) error.push(name + ': unexpected closing brace')
      if (depth === 0) {
        const selector = css.slice(start, open)
          .replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ')
        if (selector.startsWith('.')) selectors.push(selector)
        start = i + 1
      }
    }
  }
  if (depth !== 0) error.push(name + ': unbalanced braces')
  return selectors
}

for (const name of owners) {
  const css = readFileSync(resolve(base, name), 'utf8')
  totalBytes += Buffer.byteLength(css, 'utf8')
  const selectors = rootSelectors(css, name)
  rules += selectors.length
  const within = new Set()
  for (const selector of selectors) {
    if (within.has(selector)) error.push(name + ': duplicate root selector ' + selector)
    within.add(selector)
    if (cross.has(selector)) {
      error.push('multiple CSS owners for ' + selector + ': ' + cross.get(selector) + ', ' + name)
    } else cross.set(selector, name)
  }
  const match = component.match(new RegExp('<style src="./' + name.replaceAll('.', '\\.') + '"></style>', 'g'))
  if ((match?.length ?? 0) !== 1) error.push(name + ': must have exactly one Vue style import')
}

const expected = [
  ...owners,
  'Q01CommercialBaseline.css',
  'Q03CommercialBaseline.css',
]
const actual = [...component.matchAll(/<style src="\.\/([^"]+)"\s*><\/style>/g)].map(m => m[1])
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  error.push('CSS import order changed: ' + actual.join(', '))
}

// Detect CSS volume growth from another additive override pile. Raising this
// limit requires visual-contract proof and explicit ownership review.
if (totalBytes > 76000) error.push('component CSS exceeded 76,000-byte reviewed budget: ' + totalBytes)
if (error.length) {
  for (const item of error) process.stderr.write('CUI-02 FAIL: ' + item + '\n')
  process.exitCode = 1
} else {
  process.stdout.write('CUI-02 PASS: 5 distinct component CSS owners, ' + rules +
    ' unique root selectors, ' + totalBytes +
    ' bytes; Q01 and Q03 baselines imported after owners\n')
}
