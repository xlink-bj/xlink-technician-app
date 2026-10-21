#!/usr/bin/env node
/**
 * EQ06 behavior authority lane. Unlike source-string tests, every entry here
 * exercises an actual domain, adapter, or state transition through assertions.
 *
 * Explicit manifests keep Codex changes from accidentally skipping the
 * critical paths after a module move. They do NOT measure coverage percentages.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const suites = Object.freeze({
  'quotation-financial-sku': [
    'tests/g4f/quotation-engine.test.ts',
    'tests/g4f/quotation-order-submission.test.ts',
    'tests/g4f/quotation-sku-identity-review.test.ts',
    'tests/g4f/quotation-order-signing-read-boundary.test.ts',
  ],
  'authorization-transport': [
    'tests/g4f/production-read-only.test.ts',
    'tests/g4f/p0-order-raw-transport-fence.test.ts',
  ],
  'action-draft-catalog': [
    'tests/g4d/action-workspace.test.ts',
    'tests/engineering/eq02-action-draft-helpers.test.ts',
    'tests/engineering/eq04-quotation-catalog-bridge.test.ts',
  ],
  'mock-isolation-failure': [
    'tests/engineering/eq01-mock-scenarios.test.ts',
    'tests/engineering/eq05-mock-command-state.test.ts',
    'tests/engineering/eq05b-mock-fault-scenarios.test.ts',
  ],
  // EQ07: stale async saves/edits must never unlock a workflow write.
  'async-form-workflow-p0': [
    'tests/engineering/eq07-command-state-consistency.test.ts',
    'tests/engineering/r1-appointment-wire-unification.test.ts',
    'tests/engineering/r1-appointment-conditional-runtime.test.ts',
  ],
  // EQ09: actor isolation and durable Order replay fences are business-critical.
  'actor-price-and-order-isolation': [
    'tests/engineering/r1-catalog-price-identity-fence.test.ts',
    'tests/g4f/p0-role-order-tenant-negative.test.ts',
    'tests/g4f/quotation-order-browse-handoff.test.ts',
  ],
})
const required = ['quotation-financial-sku','authorization-transport','action-draft-catalog','mock-isolation-failure','async-form-workflow-p0','actor-price-and-order-isolation']
const all = []
for (const category of required) {
  const paths = suites[category]
  if (!Array.isArray(paths) || paths.length < 2) throw new Error('Empty critical suite '+category)
  for (const path of paths) {
    const full = resolve(path)
    if (!path.startsWith('tests/') || !path.endsWith('.test.ts') || !existsSync(full)) {
      throw new Error('Missing behavior test: '+path)
    }
    const content = readFileSync(full, 'utf8')
    // Every suite must execute tests and actual assertions. Source-string
    // checks may coexist but must never be the entire behavior contract.
    if (!/\b(?:it|test)(?:\.each)?\s*\(/.test(content) || !/\bexpect\s*\(/.test(content)) {
      throw new Error('Behavior assertions not found in '+path)
    }
    if (all.includes(path)) throw new Error('Duplicated behavior test: '+path)
    all.push(path)
  }
}
const manifest = {
  kind:'behavior-suite-manifest-NOT-coverage',
  categories:Object.entries(suites).map(([name,files])=>({name,files:files.length})),
  fileCount:all.length,
  coverage:'NOT_MEASURED',
}
process.stdout.write(JSON.stringify(manifest)+'\n')
if (process.argv.includes('--run')) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  // One shared Vitest invocation keeps isolated fixture lifetimes intact.
  const run = spawnSync(pnpm, ['exec','vitest','run',...all], {
    cwd:process.cwd(), stdio:'inherit',
    env:{...process.env,VITE_XLINK_ENABLE_REAL_WRITES:'false',VITE_XLINK_ENVIRONMENT:'test'},
  })
  if (run.error) throw run.error
  process.exitCode = run.status ?? 1
}
