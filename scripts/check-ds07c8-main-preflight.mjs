#!/usr/bin/env node
/**
 * Read-only full-history review of existing M1 main draft plus S2 / DS stack.
 * This proves ancestry and enumerates changed files, NOT deployability.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const manifestPath = 'docs/verification/DS07C8_MAIN_INTEGRATION_MANIFEST.json'
const m = JSON.parse(readFileSync(manifestPath, 'utf8'))
const fail = (reason) => { throw new Error('DS07C8_MAIN_PREFLIGHT_BLOCKED:' + reason) }
const check = (condition, code) => { if (!condition) fail(code) }
const git = (...args) => execFileSync('git', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 16 * 1024 * 1024,
}).trim()
const isAncestor = (from, to) => {
  const p = spawnSync('git', ['merge-base', '--is-ancestor', from, to], { timeout: 30000 })
  if (p.status === 0) return true
  if (p.status === 1) return false
  fail('GIT_ANCESTRY_COMMAND:' + p.status)
}
const changes = (from, to) =>
  execFileSync('git', ['diff', '--name-only', '-z', from, to], { maxBuffer: 16 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean).sort()
const count = (from, to) => Number(git('rev-list', '--count', from + '..' + to))
function category(path) {
  if (path.startsWith('src/')) return 'application_source'
  if (path.startsWith('tests/')) return path.includes('/snapshots/') ? 'approved_or_prior_snapshots' : 'test_source'
  if (path.startsWith('.github/workflows/')) return 'ci_workflows'
  if (path.startsWith('scripts/')) return 'scripts'
  if (path.startsWith('docs/')) return 'documentation'
  if (path.startsWith('__review/') || path.startsWith('.review/')) return 'review_artifacts'
  if (/\.(png|jpg|jpeg|svg|webp|gif)$/i.test(path)) return 'media'
  return 'other'
}
try {
  check(m.schemaVersion === 1 && m.track === 'M1_DS07_MAIN_PREFLIGHT_DRAFT_NO_MERGE', 'MANIFEST_SCHEMA')
  check(m.main?.branch === 'main' && m.main?.sha === 'c57fb3cc876c8ca3fb133d74dcf4833f8f755b32', 'MAIN_PIN')
  check(m.segments?.length === 3 && m.designReviewChain?.length === 17, 'PROVENANCE_LENGTH')
  check(m.latestEngineering?.ciRun === 39107075118 && m.latestEngineering?.unitPassed === 1053
    && m.latestEngineering?.h5Passed === 39, 'ENGINEERING_EVIDENCE')
  const gated = m.acceptance
  check(gated?.mainMerge === 'NOT_APPROVED' && gated?.productionRelease === 'NOT_APPROVED'
    && gated?.productionWrites === 'NOT_APPROVED' && gated?.realTenantParity === 'NOT_VERIFIED'
    && gated?.backendSignedContract === 'NOT_VERIFIED' && gated?.physicalDevices === 'NOT_VERIFIED'
    && gated?.M1Formal === '1/8' && gated?.i7DoD === '1/4' && gated?.i8DoD === '0/4',
    'UNAUTHORIZED_BUSINESS_GATE_PROMOTION')
  check(git('status', '--porcelain') === '', 'DIRTY_REVIEW_CHECKOUT')
  check(git('rev-parse', 'refs/remotes/origin/main') === m.main.sha, 'MAIN_MOVED_REQUIRE_REVIEW')
  const c7 = m.latestEngineering.head
  check(c7 === m.segments[2].sha, 'FINAL_HEAD_MISMATCH')
  check(isAncestor(m.main.sha, c7) && isAncestor(c7, 'HEAD'), 'MAIN_OR_C7_NOT_ANCESTOR')
  check(git('rev-parse', m.main.sha + '^{commit}') !== '' && git('rev-parse', c7 + '^{commit}') !== '', 'MISSING_PINNED_OBJECT')

  const segmentCounts = []
  let last = m.main.sha
  const requiredNames = ['existing_m1_main_candidate', 'm1_s2_productization', 'ds07_c7_full_engineering']
  for (const [index, segment] of m.segments.entries()) {
    check(segment.gate === requiredNames[index], 'SEGMENT_ORDER')
    check(isAncestor(last, segment.sha), 'SEGMENT_DIVERGENCE:' + segment.gate)
    const actual = count(last, segment.sha)
    check(actual === segment.expectedCommits, 'COMMIT_COUNT_CHANGED:' + segment.gate + ':' + actual)
    segmentCounts.push({ phase: segment.gate, sourcePR: segment.pr, count: actual,
      changedFiles: changes(last, segment.sha).length })
    last = segment.sha
  }
  check(last === c7 && segmentCounts.reduce((sum, s) => sum + s.count, 0) === 921,
    'TOTAL_CHAIN_MISMATCH')
  let previous = m.segments[1].sha
  for (const p of m.designReviewChain) {
    check(isAncestor(previous, p.sha) && isAncestor(p.sha, c7), 'MISSING_STACKED_PR:' + p.pr)
    previous = p.sha
  }
  check(previous === c7, 'CHAIN_LAST_NOT_C7')
  for (const forbidden of m.excludedIndependent) {
    check(!isAncestor(forbidden.sha, c7), 'INDEPENDENT_EVIDENCE_UNAUTHORIZED:' + forbidden.pr)
  }
  const expectedDelta = [...m.allowedChangesAfterC7].sort()
  const actualDelta = changes(c7, 'HEAD')
  check(JSON.stringify(expectedDelta) === JSON.stringify(actualDelta),
    'UNREVIEWED_C8_FILE_DELTA:' + actualDelta.join(','))
  check(!actualDelta.some(path => path.startsWith('src/') || path.includes('/snapshots/')),
    'UNAPPROVED_BUSINESS_OR_GOLDEN_UPDATE')
  const allFiles = changes(m.main.sha, c7)
  const segmentFiles = m.segments.map((segment, i) =>
    ({ label: segment.gate, files: changes(i ? m.segments[i-1].sha : m.main.sha, segment.sha) }))
  const groups = {}
  for (const file of allFiles) groups[category(file)] = (groups[category(file)] ?? 0) + 1
  const result = {
    state: 'ENGINEERING_PREFLIGHT_PASS_MAIN_MERGE_HOLD',
    draftCandidateOnly: true,
    sourceHead: c7,
    reviewHead: git('rev-parse', 'HEAD'),
    mainHead: m.main.sha,
    aheadOfMainCommits: 921,
    behindMainCommits: 0,
    segmentCounts,
    totalChangedPaths: allFiles.length,
    categories: groups,
    excludedProofsAbsent: m.excludedIndependent.map(row => row.pr),
    noApplicationChangesAfterC7: true,
    ciReadOnly: true,
    mainMerge: 'NOT_APPROVED',
    productionRelease: 'NOT_APPROVED',
    realTenantSignedContract: 'NOT_VERIFIED',
    ownerVisualApprovalScope: 'DS07_DETAIL_AND_Q01_GOLDEN_ONLY',
    fullTrackedPaths: allFiles,
    perSegmentPaths: segmentFiles,
  }
  const outIndex = process.argv.indexOf('--output')
  if (outIndex >= 0) {
    const output = process.argv[outIndex+1]
    check(Boolean(output) && output.startsWith('.review/ds07c8/'), 'UNSAFE_OUTPUT_PATH')
    mkdirSync(dirname(resolve(output)), { recursive: true })
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
  }
  process.stdout.write(JSON.stringify({
    state: result.state, ahead: result.aheadOfMainCommits, changedPaths: result.totalChangedPaths,
    groups, segments: segmentCounts, mainMerge: result.mainMerge
  }) + '\n')
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message + '\n' : 'UNKNOWN_DS07C8_FAILURE\n')
  process.exitCode = 1
}
