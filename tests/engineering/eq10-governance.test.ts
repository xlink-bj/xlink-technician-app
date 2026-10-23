import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function node(script: string, ...args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_ENVIRONMENT: 'test' },
    encoding: 'utf8',
    timeout: 20000,
  })
}

describe('EQ10 permanent engineering governance (synthetic / no backend)', () => {
  it('audits real source import boundaries and fails on seven injected violations', () => {
    const result = node('scripts/check-eq10-ownership.mjs', '--self-test')
    expect(result).toContain('EQ10 ownership audit PASS')
    expect(result).toContain('7 injected boundary regressions detected')
  })

  it('requires actual test suites in all six critical behavioral lanes', () => {
    const result = node('scripts/verify-critical-behavior.mjs')
    const manifest = JSON.parse(result.trim()) as {
      kind: string
      fileCount: number
      categories: readonly { name: string; files: number }[]
      coverage: string
    }
    expect(manifest.kind).toBe('behavior-suite-manifest-NOT-coverage')
    expect(manifest.coverage).toBe('NOT_MEASURED')
    expect(manifest.categories.map(item => item.name)).toEqual([
      'quotation-financial-sku',
      'authorization-transport',
      'action-draft-catalog',
      'mock-isolation-failure',
      'async-form-workflow-p0',
      'actor-price-and-order-isolation',
    ])
    expect(manifest.categories.every(item => item.files >= 2)).toBe(true)
    expect(manifest.fileCount).toBeGreaterThanOrEqual(18)
  })

  it('makes architecture and critical manifest checks part of canonical quick/full commands', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    for (const command of ['verify', 'verify:quick']) {
      expect(pkg.scripts[command]).toContain('check:engineering-ownership')
      expect(pkg.scripts[command]).toContain('check:critical')
      expect(pkg.scripts[command]).toContain('check:boundaries')
      expect(pkg.scripts[command]).toContain('typecheck')
    }
    expect(pkg.scripts['verify:full']).toContain('pnpm run verify')
    expect(pkg.scripts['verify:critical']).toContain('--run')
    expect(pkg.scripts['check:stacked-provenance']).toBe('node scripts/check-eq10-stack.mjs')
  })

  it('keeps the integration manifest explicitly separate from live backend production parity', () => {
    const value = JSON.parse(readFileSync('docs/engineering/eq10-stacked-manifest.json', 'utf8')) as {
      purpose: string
      ancestry: readonly { pr: number; sha: string }[]
      siblingEvidence: { appointment: { pr: number }; catalog: { pr: number } }
      alwaysOff: readonly string[]
      unverified: readonly string[]
    }
    expect(value.purpose).toContain('NOT-production-parity')
    expect(value.ancestry.map(x => x.pr)).toEqual([184, 187, 188, 189])
    expect(value.ancestry.every(x => /^[0-9a-f]{40}$/.test(x.sha))).toBe(true)
    expect(value.siblingEvidence.appointment.pr).toBe(185)
    expect(value.siblingEvidence.catalog.pr).toBe(186)
    expect(value.alwaysOff).toContain('Production/Beta business writes')
    expect(value.unverified).toContain('backend-enforced idempotency')
  })
})
