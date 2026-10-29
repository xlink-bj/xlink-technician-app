#!/usr/bin/env node
/**
 * DS07-C5 hard gate. Only the six inherited DS02A snapshots may fail.
 * A changed failure pattern is a genuine regression and blocks candidate prep.
 */
import { readFileSync } from 'node:fs'

const filename = process.argv[2]
if (!filename) throw new Error('usage: node scripts/check-ds07c5-legacy-visual.mjs <playwright-report.json>')
const report = JSON.parse(readFileSync(filename, 'utf8'))
const observed = new Map()

function walk(suite) {
  for (const spec of suite.specs ?? []) {
    const m = /^Real H5 (list|detail|quote) (320|375|390)px$/.exec(spec.title)
    if (!m) throw new Error('Unrecognized or additional visual test: ' + spec.title)
    const key = `${m[1]}-${m[2]}`
    if (observed.has(key)) throw new Error('Duplicate test ' + key)
    const tests = spec.tests ?? []
    if (tests.length !== 1 || !tests[0].results?.length) throw new Error('Missing actual execution: ' + key)
    const actual = tests[0].results.at(-1).status
    observed.set(key, actual)
  }
  for (const child of suite.suites ?? []) walk(child)
}
for (const suite of report.suites ?? []) walk(suite)

const expected = new Map()
for (const width of [320, 375, 390]) {
  expected.set(`list-${width}`, 'passed')
  expected.set(`detail-${width}`, 'failed')
  expected.set(`quote-${width}`, 'failed')
}
if (observed.size !== expected.size) throw new Error('Expected exactly 9 tests, saw ' + observed.size)
for (const [name, result] of expected) {
  if (observed.get(name) !== result) {
    throw new Error(`VISUAL HOLD HAS CHANGED: ${name} expected ${result}; actual ${observed.get(name) ?? 'missing'}`)
  }
}
process.stdout.write('DS07-C5 inherited baseline classification VERIFIED: list 3 PASS; detail/quote 6 FAIL. No other failures.\n')
