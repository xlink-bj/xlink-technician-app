import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Closure C1 — one candidate with traceable ancestry and source-backed ports', () => {
  it('proves both original R1 parents, four hardening PRs and fail-closed negative cases without writes', () => {
    const output = execFileSync(process.execPath, ['scripts/check-closure-c1-integration.mjs','--self-test'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 20000,
      env: { ...process.env, VITE_XLINK_ENVIRONMENT: 'test', VITE_XLINK_ENABLE_REAL_WRITES: 'false' },
    })
    expect(output).toContain('CLOSURE-C1 OFFLINE INTEGRATION PROVEN')
    expect(output).toContain('8 synthetic integration regressions rejected')
    expect(output).toContain('candidate-is-unmerged-NOT-production-ready')
  })

  it('documents sibling handling instead of claiming that independent PRs were merged', () => {
    const report=readFileSync('docs/engineering/CLOSURE_C1_INTEGRATION_DECISION.md','utf8')
    expect(report).toContain('#185')
    expect(report).toContain('#186')
    expect(report).toContain('非合并')
    expect(report).toContain('R1')
    expect(report).toContain('1077')
  })

  it('keeps test-only protections of all four stages available on the single candidate', () => {
    const required=[
      'tests/engineering/eq07-command-state-consistency.test.ts',
      'tests/engineering/eq08-action-architecture.test.ts',
      'tests/g4f/quotation-order-submission.test.ts',
      'tests/engineering/eq10-governance.test.ts',
      'tests/engineering/r1-appointment-conditional-runtime.test.ts',
      'tests/engineering/r1-catalog-price-identity-fence.test.ts',
      'tests/engineering/r1-manual-login-consent.test.ts',
      'tests/engineering/r1-appointment-wire-unification.test.ts',
    ]
    for (const path of required) {
      const source=readFileSync(path,'utf8')
      expect(source).toMatch(/\b(?:it|test)(?:\.each)?\s*\(/)
      expect(source).toContain('expect(')
    }
  })
})
