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

describe('Engineering ownership and critical behavior governance (synthetic / no backend)', () => {
  it('audits real source import boundaries and fails on eight injected violations', () => {
    const result = node('scripts/check-engineering-ownership.mjs', '--self-test')
    expect(result).toContain('Engineering ownership audit PASS')
    expect(result).toContain('8 injected boundary regressions detected')
  })

  it('requires actual test suites in all six critical behavioral lanes', () => {
    const result = node('scripts/verify-critical-behavior.mjs')
    const manifest = JSON.parse(result.trim()) as {
      kind: string
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
    expect(manifest.categories.every(item => item.files > 0)).toBe(true)
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
  })
})
