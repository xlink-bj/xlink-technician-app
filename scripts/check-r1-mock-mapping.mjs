import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { validateCurrentFormDefEvidence } from './lib/r1-current-formdef-synthetic.mjs'

export function validateR1MockMapping(manifest, root = process.cwd()) {
  const require = (condition, reason) => { if (!condition) throw new Error(`R1_MOCK_MAPPING_BLOCKED:${reason}`) }
  require(manifest?.version === 1 && manifest.scope === 'SOURCE_MAPPED_SYNTHETIC_SUPPORTED_SLICE_NOT_LIVE_PARITY', 'SCOPE')
  require(manifest.productionBusinessWrites === 'HOLD_201', 'WRITE_HOLD')
  const path = (name, prefix) => {
    require(typeof name === 'string' && name.startsWith(prefix) && !name.split('/').includes('..') && existsSync(resolve(root, name)), `MISSING_EVIDENCE:${name}`)
  }
  path(manifest.inventory, 'docs/'); path(manifest.productionCoverage, 'contracts/')
  const coverage = JSON.parse(readFileSync(resolve(root, manifest.productionCoverage), 'utf8'))
  // The original production capture stays immutable. Later bounded evidence is
  // reconciled explicitly instead of rewriting its old 15-domain observation.
  path(manifest.currentEvidence, 'contracts/')
  const current = JSON.parse(readFileSync(resolve(root, manifest.currentEvidence), 'utf8'))
  require(current.version === 1 && current.classification === 'CURRENT_EVIDENCE_OVERLAY_NOT_LIVE_PARITY'
    && current.historicalCoverage === manifest.productionCoverage
    && current.domains?.length === 1 && current.domains[0].id === 'F04', 'CURRENT_EVIDENCE_SCOPE')
  for (const row of current.domains) {
    path(row.evidence, 'contracts/production/'); path(row.syntheticFixture, 'contracts/synthetic/')
    const receipt = readFileSync(resolve(root, row.evidence), 'utf8')
    require(createHash('sha256').update(receipt).digest('hex') === row.evidenceSha256, 'CURRENT_EVIDENCE_DIGEST')
    validateCurrentFormDefEvidence(row, JSON.parse(receipt), JSON.parse(readFileSync(resolve(root, row.syntheticFixture), 'utf8')))
  }
  require(JSON.stringify(manifest.domains?.map(row => row.id)) === JSON.stringify(Array.from({ length: 21 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`)), 'DOMAIN_SET')
  const tests = new Set()
  for (const row of manifest.domains) {
    require(row.liveParity === 'NOT_VERIFIED' && typeof row.unresolved === 'string' && row.unresolved.length > 10, `UNPROVEN_PROMOTION:${row.id}`)
    const observation = current.domains.find(item => item.id === row.id) ?? coverage.domains.find(item => item.id === row.id)
    require(observation?.limit === row.unresolved && !observation.serverBusinessWritePermissionTested, `COVERAGE_DRIFT:${row.id}`)
    path(row.sourceEvidence, 'docs/')
    require(Array.isArray(row.unitTests) && row.unitTests.length > 0, `NO_TESTS:${row.id}`)
    for (const name of row.unitTests) { path(name, 'tests/'); require(name.endsWith('.test.ts'), 'NOT_UNIT_TEST'); tests.add(name) }
  }
  require(JSON.stringify(manifest.scenarios?.map(row => row.id)) === JSON.stringify(Array.from({ length: 8 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`)), 'SCENARIO_SET')
  for (const row of manifest.scenarios) {
    require(row.domains?.length && row.domains.every(id => manifest.domains.some(domain => domain.id === id)), `UNKNOWN_DOMAIN:${row.id}`)
    require(['EXECUTABLE_SUPPORTED_SLICE_NOT_FULL_EQUIVALENCE','PARTIAL_SCALE_EQUIVALENCE_NOT_PROVEN'].includes(row.status), `SCENARIO_PROMOTION:${row.id}`)
    require(row.browserTests?.length > 0 || row.status === 'PARTIAL_SCALE_EQUIVALENCE_NOT_PROVEN', `MISSING_BROWSER:${row.id}`)
    for (const name of row.browserTests) { path(name, 'tests/'); require(name.endsWith('.spec.ts'), 'NOT_BROWSER_TEST') }
  }
  return { state: 'MAPPING_INDEX_VALIDATED_NOT_EXECUTION_PASS', domains: 21, scenarios: 8, unitTests: [...tests].sort(), liveParity: 'NOT_VERIFIED' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = JSON.parse(readFileSync('contracts/r1-mock-mapping.json', 'utf8'))
  const result = validateR1MockMapping(manifest)
  if (process.argv.includes('--run')) {
    mkdirSync('.review/r1-mock-mapping', { recursive: true })
    const report = '.review/r1-mock-mapping/vitest.json'
    const run = spawnSync('pnpm', ['exec','vitest','run',...result.unitTests,'--reporter=json',`--outputFile=${report}`], { stdio: 'inherit' })
    if (run.status !== 0) process.exit(run.status ?? 1)
    const actual = JSON.parse(readFileSync(report, 'utf8'))
    const passed = actual.testResults.filter(suite => suite.status === 'passed' && suite.assertionResults.length > 0 && suite.assertionResults.every(test => test.status === 'passed'))
    const testPassed = name => passed.some(suite => resolve(suite.name) === resolve(name))
    const final = { ...result, state: 'SUPPORTED_UNIT_SLICE_EXECUTED_NOT_FULL_EQUIVALENCE',
      testsPassed: actual.numPassedTests,
      domains: manifest.domains.map(row => ({ id: row.id, tests: row.unitTests, result: row.unitTests.every(testPassed) ? 'PASS' : 'INCOMPLETE', unresolved: row.unresolved, liveParity: row.liveParity })),
      browserExecution: 'NOT_RUN_BY_THIS_COMMAND', scenarios: manifest.scenarios }
    const output = '.review/r1-mock-mapping/result.json'
    mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(final, null, 2) + '\n')
    if (final.domains.some(row => row.result !== 'PASS')) process.exitCode = 1
    console.log(JSON.stringify(final))
  } else console.log(JSON.stringify(result))
}
