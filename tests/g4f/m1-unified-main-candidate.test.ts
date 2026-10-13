import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../..', import.meta.url))
const script = resolve(root, 'scripts/check-m1-unified-main-candidate.mjs')
const baseline = JSON.parse(readFileSync(resolve(
  root, 'docs/verification/M1_UNIFIED_MAIN_INTEGRATION_MANIFEST.json',
), 'utf8'))

function check(mutate: (v: typeof baseline) => void) {
  const folder = mkdtempSync(resolve(tmpdir(), 'm1-main-integration-'))
  try {
    const copy = structuredClone(baseline)
    mutate(copy)
    const path = resolve(folder, 'evidence.json')
    writeFileSync(path, JSON.stringify(copy))
    const response = spawnSync(process.execPath,
      [script, '--manifest-only', '--manifest', path], {
        cwd: root, encoding: 'utf8', timeout: 10000,
        env: { ...process.env, VITE_XLINK_ENABLE_REAL_WRITES: 'false' },
      })
    return { status: response.status, output: response.stdout + response.stderr }
  } finally { rmSync(folder, { recursive: true, force: true }) }
}

describe('M1 main candidate fail-closed integration manifest (no Git history required)', () => {
  it('preserves six source-linked stages, eight separate gates and pinned CI facts', () => {
    const r = check(() => {})
    expect(r.status).toBe(0)
    expect(r.output).toContain('MANIFEST_FAIL_CLOSED_PASS')
    expect(r.output).toContain('M1_1_OF_8_ONLY')
  })
  it('cannot treat green synthetic H5 as an approved main merge or business release', () => {
    const r = check(m => { m.acceptance.release = 'APPROVED' })
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('FORMAL_ACCEPTANCE_INFLATED')
  })
  it('detects missing I3 price work in required integration ancestry', () => {
    const r = check(m => { m.requiredAncestors = m.requiredAncestors.filter(
      (v: { gate: string }) => v.gate !== 'i3_offline_price',
    ) })
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('REQUIRED_ANCESTOR:i3_offline_price')
  })
  it('cannot silently import the separately authorized Production SKU probe', () => {
    const r = check(m => { m.excludedIndependentEvidence = [] })
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('UNAPPROVED_EVIDENCE_EXCLUDED')
  })
  it('cannot invent real signing parity for the source-backed Contract review', () => {
    const r = check(m => { m.stages[5].state = 'LIVE_VERIFIED' })
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('MOCK_NOT_REAL:signing')
  })
  it('cannot drop independent physical-device or Owner approval gates', () => {
    for (const missing of ['physical_media','owner_ux']) {
      const r = check(m => { m.independentGates = m.independentGates.filter(
        (v: { id: string }) => v.id !== missing,
      ) })
      expect(r.status).not.toBe(0)
      expect(r.output).toContain('INDEPENDENT_GATE_COUNT')
    }
  })
  it('cannot falsify that Beta writes, signatures or main merge already happened', () => {
    for (const key of ['betaBusinessWrite','realSignature','mainBranchMutated']) {
      const r = check(m => { m.effects[key] = true })
      expect(r.status).not.toBe(0)
      expect(r.output).toContain('UNWITNESSED_EFFECT:' + key)
    }
  })
  it('rejects any proposed application source change without independent review', () => {
    const r = check(m => { m.allowedChangesAfterBaseline.push(
      'src/adapters/api/uni-api-command-transport.ts',
    ) })
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('ADDITIONAL_CODE_CHANGES')
  })
})
