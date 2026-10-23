#!/usr/bin/env node
/**
 * EQ10 offline draft-stack integrity: ancestry, provenance, and immutable
 * business-source delta. Run from repo root; no network or file writes.
 * Does NOT prove unrelated siblings were merged or backend contracts work.
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const manifestPath = 'docs/engineering/eq10-stacked-manifest.json'
const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'))
function git(...args) {
  const result = spawnSync('git', args, { encoding:'utf8', cwd:process.cwd() })
  if (result.error) throw result.error
  return { ok:result.status===0, stdout:result.stdout.trim(), stderr:result.stderr.trim() }
}
function sha(value) { return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) }

function audit(spec, files) {
  const problems = []
  if (spec.schemaVersion!==1 || !sha(spec.anchorCommit)) {
    problems.push('unsupported manifest version or invalid anchor SHA')
  }
  if (!Array.isArray(spec.ancestry) || spec.ancestry.length!==4
    || JSON.stringify(spec.ancestry.map(p=>p.pr))!==JSON.stringify([184,187,188,189])) {
    problems.push('required EQ07→EQ09 parent chain missing or reordered')
  } else {
    if (spec.ancestry[3].sha!==spec.anchorCommit) problems.push('last ancestry SHA must equal EQ09 pinned base')
    for (const step of spec.ancestry) {
      if (!sha(step.sha) || !git('merge-base','--is-ancestor',step.sha,'HEAD').ok) {
        problems.push('missing verified stacked ancestor: #'+step.pr)
      }
    }
  }
  const allowed = new Set(spec.governanceOnlyPaths ?? [])
  if (allowed.size!==9) problems.push('governance path allowlist was changed without review')
  for (const name of files) {
    if (!allowed.has(name)) problems.push('unexpected diff outside EQ10 governance scope: '+name)
    if (name.startsWith('src/') || /(?:pnpm-lock\.yaml|\.png|\.webp|\.jpg|\.jpeg)$/.test(name)) {
      problems.push('application/backend/lockfile/golden delta prohibited: '+name)
    }
  }
  for (const name of allowed) if (!files.includes(name)) problems.push('required governance artifact missing: '+name)
  const evidence = spec.siblingEvidence
  if (!evidence || evidence.appointment?.pr!==185 || evidence.catalog?.pr!==186) {
    problems.push('unmerged sibling evidence provenance missing')
  } else {
    const appointmentTest = evidence.appointment.behaviorTest
    const catalog = evidence.catalog
    if (!existsSync(resolve(appointmentTest)) || !existsSync(resolve(catalog.test))) {
      problems.push('source-backed sibling regression test absent')
    }
    if (!sha(catalog.gitBlobSha) || git('hash-object', catalog.path).stdout!==catalog.gitBlobSha) {
      problems.push('R1-Q07 copied catalog read guard diverged from independently reviewed source')
    }
  }
  if (spec.purpose!=='offline-draft-stack-convergence-NOT-production-parity') {
    problems.push('production parity must never be inferred from the offline stack')
  }
  return problems.sort()
}
const changed = git('diff','--name-only',manifest.anchorCommit,'HEAD')
if (!changed.ok) throw new Error('git diff cannot verify exact EQ09 parent')
const files = changed.stdout ? changed.stdout.split('\n') : []
const violations = audit(manifest, files)
if (violations.length) {
  console.error('EQ10 stacked governance violations:')
  for (const issue of violations) console.error('- '+issue)
  process.exitCode = 1
} else {
  console.log('EQ10 verified stack PASS: #184→#187→#188→#189 ancestor, #185/#186 port provenance, '+files.length+' governance-only paths; NO application delta.')
}
if (process.argv.includes('--self-test')) {
  if (violations.length) throw new Error('Real stacked integration must pass before self-test')
  const copies = () => JSON.parse(JSON.stringify(manifest))
  const negatives = [
    ['unauthorized src/ delta', copies(), [...files,'src/features/work-orders/action-workspace.ts']],
    ['unauthorized lockfile', copies(), [...files,'pnpm-lock.yaml']],
    ['missing governance artifact', copies(), files.filter(p=>p!=='package.json')],
    ['changed reviewed base', {...copies(),anchorCommit:'0000000000000000000000000000000000000000'}, files],
    ['catalog guard drift', {...copies(),siblingEvidence:{...manifest.siblingEvidence,catalog:{...manifest.siblingEvidence.catalog,gitBlobSha:'0000000000000000000000000000000000000000'}}}, files],
  ]
  for (const [label,spec,paths] of negatives) {
    if (audit(spec, paths).length===0) throw new Error('EQ10 negative stack sentinel failed: '+label)
  }
  console.log('EQ10 negative stack sentinels PASS: '+negatives.length+' synthetic violations detected, no working-tree mutation.')
}
