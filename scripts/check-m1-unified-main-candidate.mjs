#!/usr/bin/env node
/**
 * M1 main integration gate: no application APIs, credentials, network, writes
 * or branch mutation. Called twice:
 *   --manifest-only [--manifest PATH] in shallow normal CI tests.
 *   (no args) in a full-history, read-only GitHub PR main-target job.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT = 'docs/verification/M1_UNIFIED_MAIN_INTEGRATION_MANIFEST.json'
const EXPECTED_BASE = 'f5ed0f640986737e6d7bb14f430d3b3edc078d06'
const EXPECTED_MAIN = 'c57fb3cc876c8ca3fb133d74dcf4833f8f755b32'
const ANCESTORS = Object.freeze({
  main: EXPECTED_MAIN,
  i2_sku_draft: 'f948d837d0d9e9422df774c1eaec43592a98f5fc',
  i3_offline_price: '683bb63b2a6f44bbb83afa3ea27f58ea01fcdecd',
  i7_reconciled_history: '928efb2706bd9e4cd05e3a6e0f7d9905732b8b39',
  i6_source_order_contract: 'df9021cd3f10dbf22fff7fa94b0602c013fb9a33',
  i8_six_stage_evidence: 'f00d4c55870805055b5d2b149448bce14d56c110',
  i6_current_handler: '30194c2e2d3539c4849fd4e8b9603f52e75a4f6e',
  i7_workorder_role_isolation: EXPECTED_BASE,
})
const EXCLUDED = Object.freeze({
  i2_production_sku_probe_NOT_EXECUTED: 'a950b2205acb1581ac2a17181773f331642ab59a',
  i4_owner_visual_review_NOT_APPROVED: '4b2572b5f6af6b8e5abfa5831de6eeb5912b5796',
})
const ALLOWED = Object.freeze([
  '.github/workflows/m1-unified-main-candidate-gate.yml',
  'docs/verification/M1_UNIFIED_MAIN_INTEGRATION_CANDIDATE.md',
  PROJECT,
  'scripts/check-m1-unified-main-candidate.mjs',
  'tests/g4f/m1-unified-main-candidate.test.ts',
])
const STAGES = Object.freeze({
  login: 'src/pages/index/index.vue',
  work_order: 'src/pages/work-orders/detail.vue',
  appointment: 'src/pages/work-orders/action-workspace.vue',
  survey: 'src/features/work-orders/components/SurveyActionContent.vue',
  quotation: 'src/features/work-orders/quotation/QuotationActionWorkspace.vue',
  signing: 'src/pages/work-orders/signing-order-read.vue',
})
const GATES = Object.freeze({
  live_role: 'NOT_RUN',
  sku_and_order: 'BLOCKED_ENV',
  beta_write: 'NOT_APPROVED',
  real_signing: 'NOT_APPROVED',
  physical_media: 'NOT_RUN',
  owner_ux: 'NOT_APPROVED',
  main_merge: 'NOT_APPROVED',
  production_release: 'NOT_APPROVED',
})
function assert(ok, message) {
  if (!ok) throw new Error('M1_INTEGRATION_GATE_BLOCKED:' + message)
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000,
  }).trim()
}
function hasObject(sha) {
  try { git('cat-file', '-e', sha + '^{commit}'); return true } catch { return false }
}
function ancestor(sha) {
  try { git('merge-base', '--is-ancestor', sha, 'HEAD'); return true }
  catch (err) {
    if (err?.status === 1) return false
    throw err
  }
}
function validateManifest(m) {
  assert(m?.schemaVersion === 1 && m.track === 'M1_ENGINEERING_MAIN_DRAFT_NOT_RELEASE',
    'MANIFEST_SCHEMA')
  assert(m.observedDate === '2026-10-13' && m.mainTip === EXPECTED_MAIN
    && m.candidateBaseline === EXPECTED_BASE, 'PINNED_SOURCE_IDS')
  assert(m.acceptance?.formalRoundsAccepted === 1 && m.acceptance.totalRounds === 8
    && m.acceptance.i7DoD === '1/4' && m.acceptance.i8DoD === '0/4'
    && m.acceptance.release === 'NOT_APPROVED'
    && m.acceptance.ownerUX === 'NOT_APPROVED'
    && m.acceptance.businessParity === 'NOT_VERIFIED', 'FORMAL_ACCEPTANCE_INFLATED')
  assert(m.checks?.coreValidate?.run === 38365405856
    && m.checks.coreValidate.conclusion === 'SUCCESS'
    && m.checks.coreValidate.suites === 98 && m.checks.coreValidate.tests === 991
    && m.checks.coreValidate.mpBuild === 'PASS' && m.checks.coreValidate.appBuild === 'PASS'
    && m.checks?.mainH5?.run === 38365405883
    && m.checks.mainH5.conclusion === 'SUCCESS'
    && m.checks.mainH5.loginBoot === 2
    && m.checks.mainH5.realMainAppDevMock === 23
    && m.checks.mainH5.legacyG4F === 26, 'UNTRACEABLE_ENGINEERING_EVIDENCE')
  for (const [key, sha] of Object.entries(ANCESTORS)) {
    assert(m.requiredAncestors?.find(x => x.gate === key)?.sha === sha,
      'REQUIRED_ANCESTOR:' + key)
  }
  assert(m.requiredAncestors.length === Object.keys(ANCESTORS).length,
    'REQUIRED_ANCESTOR_COUNT')
  for (const [key, sha] of Object.entries(EXCLUDED)) {
    assert(m.excludedIndependentEvidence?.find(x => x.gate === key)?.sha === sha,
      'UNAPPROVED_EVIDENCE_EXCLUDED:' + key)
  }
  assert(m.excludedIndependentEvidence.length === Object.keys(EXCLUDED).length,
    'EXCLUDED_EVIDENCE_COUNT')
  assert(equal(m.allowedChangesAfterBaseline, ALLOWED), 'ADDITIONAL_CODE_CHANGES')
  assert(m.stages?.length === 6, 'SIX_STAGE_COVERAGE')
  for (const [key, path] of Object.entries(STAGES)) {
    const stage = m.stages.find(x => x.key === key)
    assert(stage?.state === 'MOCK_CODE_ONLY' && stage.source === path
      && Object.hasOwn(GATES, stage.gate), 'MOCK_NOT_REAL:' + key)
  }
  assert(m.independentGates?.length === Object.keys(GATES).length, 'INDEPENDENT_GATE_COUNT')
  for (const [key, state] of Object.entries(GATES)) {
    const row = m.independentGates.find(x => x.id === key)
    assert(row?.state === state && Number.isSafeInteger(row.issue),
      'UNAUTHORIZED_GATE_PROMOTION:' + key)
  }
  for (const [key, value] of Object.entries(m.effects ?? {})) {
    assert(value === false, 'UNWITNESSED_EFFECT:' + key)
  }
  assert(m.effects && Object.keys(m.effects).length === 9,
    'INCOMPLETE_NO_SIDE_EFFECT_DECLARATION')
}

try {
  const args = process.argv.slice(2)
  const only = args.includes('--manifest-only')
  const idx = args.indexOf('--manifest')
  assert(idx < 0 || Boolean(args[idx + 1]), 'MISSING_MANIFEST_PATH')
  const target = idx < 0 ? PROJECT : args[idx + 1]
  const m = JSON.parse(readFileSync(resolve(target), 'utf8'))
  validateManifest(m)
  if (!only) {
    assert(git('status', '--porcelain') === '', 'DIRTY_CHECKOUT')
    for (const [gate, sha] of Object.entries(ANCESTORS)) {
      assert(hasObject(sha) && ancestor(sha), 'MISSING_ANCESTRY:' + gate)
    }
    for (const [gate, sha] of Object.entries(EXCLUDED)) {
      assert(!hasObject(sha) || !ancestor(sha), 'UNAPPROVED_BRANCH_INCLUDED:' + gate)
    }
    assert(git('rev-parse', 'HEAD^{tree}') !== '', 'MISSING_TREE')
    const changed = git('diff', '--name-only', EXPECTED_BASE, 'HEAD').split(/\r?\n/).filter(Boolean).sort()
    assert(equal(changed, [...ALLOWED].sort()), 'UNREVIEWED_CONTENT_DELTA:' + changed.join(','))
    for (const path of Object.values(STAGES)) {
      assert(existsSync(path), 'MISSING_STAGE_SOURCE:' + path)
    }
    assert(git('rev-parse', EXPECTED_MAIN + ':'+'.github/workflows/validate.yml')
      === git('rev-parse', EXPECTED_BASE + ':'+'.github/workflows/validate.yml'),
      'MAIN_VALIDATE_CI_DRIFT')
  }
  process.stdout.write(JSON.stringify({
    result: only ? 'MANIFEST_FAIL_CLOSED_PASS' : 'MAIN_INTEGRATION_ANCESTRY_AND_DELTA_PASS',
    observedMainAncestor: true,
    sourceStages: 6,
    independentLiveAndOwnerGates: 8,
    acceptance: 'M1_1_OF_8_ONLY',
    actualTenantParity: 'NOT_VERIFIED',
    trueDevices: 'NOT_RUN',
    betaWrites: 'NOT_APPROVED',
    mainMerge: 'NOT_PERFORMED',
  }) + '\n')
} catch (err) {
  process.stderr.write((err instanceof Error ? err.message : 'M1_INTEGRATION_GATE_ERROR') + '\n')
  process.exitCode = 1
}
