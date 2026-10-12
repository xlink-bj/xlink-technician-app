#!/usr/bin/env node
/**
 * M1 I7 - read-only reconciled-ancestry gate.
 * Requires a full, clean git checkout. No network, credentials, write API,
 * branch mutation, database or Production environment is used.
 */
import { execFileSync } from 'node:child_process'

const I2 = 'f948d837d0d9e9422df774c1eaec43592a98f5fc'
const I7 = 'f511be635e7280a9c063b70e8205f96cec3792ca'
const MERGE = '460a8c126da7088cc578aff4aaea357517c6fa7d'
const PARALLEL_LOCAL_PROBE = 'a950b2205acb1581ac2a17181773f331642ab59a'
const DOC = 'docs/verification/M1_I2_SKU_REMOVAL_R1_PARITY_DELTA.md'
const allowed = new Set([
  '.github/workflows/m1-i7-integration-gate.yml',
  'docs/verification/M1_I7_RECONCILED_CANDIDATE.md',
  'scripts/check-m1-i7-reconciliation.mjs',
])

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 12_000 }).trim()
}
function ensure(test, message) {
  if (!test) throw new Error(message)
}
function isAncestor(a, b) {
  try {
    git('merge-base', '--is-ancestor', a, b)
    return true
  } catch (error) {
    // Exit code 1 means NOT an ancestor. Other errors remain a hard failure.
    if (error?.status === 1) return false
    throw error
  }
}
try {
  ensure(git('status', '--porcelain').length === 0, 'DIRTY_CHECKOUT')
  // The gate must validate real Git ancestry, not merely compare rendered docs.
  const parents = git('show', '-s', '--format=%P', MERGE).split(/\s+/)
  ensure(parents.length === 2 && parents[0] === I7 && parents[1] === I2, 'WRONG_MERGE_PARENTS')
  const mergeTree = git('rev-parse', MERGE + '^{tree}')
  ensure(mergeTree === git('rev-parse', I7 + '^{tree}'), 'MERGE_CHANGED_SOURCE_TREE')
  ensure(git('rev-parse', I2 + ':' + DOC) === git('rev-parse', I7 + ':' + DOC),
    'I2_SOURCE_DOC_NOT_IDENTICAL')
  ensure(isAncestor(I2, 'HEAD') && isAncestor(I7, 'HEAD') && isAncestor(MERGE, 'HEAD'),
    'MISSING_RECONCILED_ANCESTRY')
  // A separately authorized local Production probe is intentionally not
  // silently included in this candidate, regardless of its passing offline CI.
  ensure(!isAncestor(PARALLEL_LOCAL_PROBE, 'HEAD'), 'UNREVIEWED_LOCAL_PROBE_IMPORTED')
  const delta = git('diff', '--name-only', I7, 'HEAD').split(/\r?\n/).filter(Boolean)
  ensure(delta.length > 0 && delta.every(path => allowed.has(path)),
    'UNREVIEWED_CONTENT_DELTA')
  ensure(delta.includes('docs/verification/M1_I7_RECONCILED_CANDIDATE.md'),
    'MISSING_CANDIDATE_MANIFEST')
  const content = git('diff', '--name-only', I7, MERGE)
  ensure(content === '', 'MERGE_HAS_CONTENT_DELTA')
  process.stdout.write(JSON.stringify({
    status: 'RECONCILED_CANDIDATE_CODE_TREE_VERIFIED',
    i2Ancestor: true, i7Ancestor: true,
    mergeTreeIdenticalToI7: true, i2DocumentBlobIdentical: true,
    externalSkuProbeIncluded: false, permittedCandidateFiles: delta.length,
    realBusinessWrites: 'NOT_AUTHORIZED', mainMerge: 'NOT_PERFORMED',
    r1RuntimeParity: 'NOT_VERIFIED', devices: 'NOT_RUN',
  }) + '\n')
} catch (error) {
  process.stderr.write('I7_INTEGRATION_GATE_BLOCKED: ' + (error instanceof Error ? error.message : 'UNKNOWN') + '\n')
  process.exitCode = 1
}
