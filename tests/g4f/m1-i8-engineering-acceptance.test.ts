import { describe, expect, it } from 'vitest'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../..', import.meta.url))
const script = resolve(root, 'scripts/check-m1-i8-baseline.mjs')
const manifest = JSON.parse(readFileSync(resolve(root, 'docs/verification/M1_I8_ACCEPTANCE_MANIFEST.json'), 'utf8'))

function runWithMutation(mutate: (value: typeof manifest) => void) {
  const tmp = mkdtempSync(resolve(tmpdir(), 'm1-i8-gate-'))
  try {
    const altered = structuredClone(manifest)
    mutate(altered)
    const input = resolve(tmp, 'manifest.json')
    writeFileSync(input, JSON.stringify(altered), 'utf8')
    const result = spawnSync(process.execPath, [script, '--manifest', input], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, VITE_XLINK_ENABLE_REAL_WRITES: 'true' },
      timeout: 10000,
    })
    return { status: result.status, output: result.stdout + result.stderr }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

describe('M1 I8 honest engineering acceptance guard', () => {
  it('validates six R1-linked stages and explicitly independent release gates', () => {
    const result = runWithMutation(() => {})
    expect(result.status).toBe(0)
    expect(result.output).toContain('six source-linked stages')
  })
  it('cannot promote M1 merely because 962 CI tests passed', () => {
    const result = runWithMutation(m => { m.finalBusinessRelease = 'APPROVED' })
    expect(result.status).not.toBe(0)
    expect(result.output).toContain('release cannot be authorized by CI')
  })
  it('rejects MP build evidence misrepresented as actual real-device execution', () => {
    const result = runWithMutation(m => { m.evidence.device.mpWeixin = 'PASS' })
    expect(result.status).not.toBe(0)
    expect(result.output).toContain('must not masquerade')
  })
  it('rejects mocked Contract stage promoted to real R1 business parity', () => {
    const result = runWithMutation(m => { m.phases[5].realBusinessParity = 'VERIFIED' })
    expect(result.status).not.toBe(0)
    expect(result.output).toContain('must not claim R1 live parity')
  })
  it('rejects omissions of independently owned Contract source-field proof', () => {
    const result = runWithMutation(m => { m.gates = m.gates.filter((g: {id:string}) => g.id !== 'contract_field') })
    expect(result.status).not.toBe(0)
    expect(result.output).toContain('independent release gate')
  })
  it('the project verifier invokes this gate even when CI is otherwise green', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    expect(pkg.scripts['check:m1-i8-baseline']).toBe('node scripts/check-m1-i8-baseline.mjs')
    expect(pkg.scripts.verify).toContain('pnpm run check:m1-i8-baseline')
  })
})
