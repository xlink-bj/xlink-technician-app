#!/usr/bin/env node
/**
 * M1 I8 acceptance baseline guard. Static, credential-free, NO API calls.
 * Its purpose is to detect unsupported acceptance/release claims or loss of
 * essential architecture/safety anchors, not to certify real business parity.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const relative = p => resolve(root, p)
function ensure(condition, message) {
  if (!condition) throw new Error('M1 I8 baseline FAIL: ' + message)
}
function file(path) {
  ensure(existsSync(relative(path)), 'missing source/evidence: ' + path)
  return readFileSync(relative(path), 'utf8')
}

const argIndex = process.argv.indexOf('--manifest')
const manifestFile = argIndex >= 0 ? process.argv[argIndex + 1] : null
ensure(argIndex < 0 || Boolean(manifestFile), 'missing --manifest argument')
const manifest = JSON.parse(readFileSync(
  manifestFile ? resolve(process.cwd(), manifestFile) : relative('docs/verification/M1_I8_ACCEPTANCE_MANIFEST.json'),
  'utf8',
))

ensure(manifest.schemaVersion === 1, 'unknown evidence schema')
ensure(/^\d{4}-\d\d-\d\d$/.test(manifest.observedDate), 'missing snapshot date')
ensure(/^[0-9a-f]{40}$/.test(manifest.evidenceCommit), 'snapshot must pin exact checked source commit')
ensure(manifest.formalAcceptedIterations === 1 && manifest.totalIterations === 8,
  'formal acceptance count must not be inflated from Mock-only work')
ensure(manifest.i8Issue === 98 && manifest.m1ControlIssue === 33, 'wrong M1 tracker ownership')
ensure(manifest.finalBusinessRelease === 'NOT_APPROVED', 'release cannot be authorized by CI')
ensure(manifest.ownerUXApproval === 'NOT_GIVEN', 'Owner UX approval is not an engineering inference')
ensure(manifest.backendChanged === false && manifest.actualBusinessWritesRun === false,
  'snapshot cannot claim a backend change or unobserved business write')

const e = manifest.evidence
ensure(e.validate.conclusion === 'SUCCESS' && e.validate.testSuites > 0 && e.validate.testCount > 0,
  'engineering test evidence absent')
ensure(e.h5.conclusion === 'SUCCESS' && e.h5.startup > 0 && e.h5.mainMock > 0 && e.h5.legacy > 0,
  'H5 evidence absent')
ensure(Number.isSafeInteger(e.validate.run) && Number.isSafeInteger(e.h5.run),
  'CI must use exact run IDs rather than undocumented summaries')
ensure(e.validate.mpBuild === 'PASS' && e.validate.appBuild === 'PASS', 'expected cross-build evidence missing')
ensure(e.device.mpWeixin === 'NOT_RUN' && e.device.android === 'NOT_RUN' && e.device.ios === 'NOT_RUN',
  'CI bundle build must not masquerade as real device validation')
ensure(e.betaSigning === 'NOT_RUN' && e.productionTenantSigning === 'NOT_RUN',
  'signing runtime is not authorized by Mock CI')

const stageRefs = {
  login: ['L01', 'L02', 'L03', 'L04'],
  work_orders: ['W00', 'W02', 'W03', 'W04', 'W05'],
  appointment: ['A01', 'A02', 'A03', 'A04'],
  survey: ['S01', 'S02', 'S03', 'S04'],
  quotation: ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'],
  signing: ['C01', 'C02', 'C03', 'C04'],
}
const ids = Object.keys(stageRefs)
ensure(Array.isArray(manifest.phases) && manifest.phases.length === ids.length,
  'required exactly six distinct business stages')
const ledger = file('docs/verification/M1_I1_R1_SIX_STAGE_PARITY_LEDGER.md')
for (const [index, expected] of ids.entries()) {
  const p = manifest.phases[index]
  ensure(p?.id === expected, 'stage sequence mismatch at ' + index)
  ensure(p.h5State === 'SYNTHETIC_ONLY' && p.realBusinessParity === 'NOT_VERIFIED',
    'synthetic H5 stage must not claim R1 live parity: ' + expected)
  ensure(['PARTIAL_CODE','ENGINEERING_TESTED'].includes(p.codeState),
    'unknown engineering stage evidence state: ' + expected)
  ensure(typeof p.risk === 'string' && p.risk.length > 12,
    'stage risk must remain explicit: ' + expected)
  ensure(Array.isArray(p.appPaths) && p.appPaths.length >= 2,
    'missing code evidence for ' + expected)
  for (const path of p.appPaths) file(path)
  ensure(JSON.stringify(p.i1Refs) === JSON.stringify(stageRefs[expected]),
    'I1 scenario identifiers differ for ' + expected)
  for (const ref of p.i1Refs) {
    ensure(ledger.includes('| ' + ref + ' '), 'I1 original evidence row absent: ' + ref)
  }
}
ensure(new Set(manifest.phases.map(p => p.id)).size === ids.length, 'duplicated stage identity')
ensure(Array.isArray(manifest.gates) && manifest.gates.length >= 9, 'incomplete gate ledger')
const requiredGates = [
  'live_role','sku_catalog','price_order','contract_field','signing_side_effect',
  'physical_mp','physical_android_ios','owner_visual','merge_release',
]
for (const key of requiredGates) {
  const gate = manifest.gates.find(g => g.id === key)
  ensure(Boolean(gate), 'missing independent release gate: ' + key)
  ensure(['BLOCKED_APPROVAL','BLOCKED_ENV','UNRESOLVED_SOURCE','NOT_RUN','DEFERRED_OWNER'].includes(gate.state),
    'unsupported PASS/release claim: ' + key)
  ensure(Number.isSafeInteger(gate.issue) && typeof gate.evidence === 'string'
    && gate.evidence.length > 12, 'untraceable release gate: ' + key)
}
ensure(Array.isArray(manifest.architectureAuthorities) && manifest.architectureAuthorities.length >= 5,
  'missing architecture references')
for (const path of manifest.architectureAuthorities) file(path)

const anchors = [
  ['src/pages/work-orders/action-workspace.vue',
   ['<QuotationActionWorkspace','<SurveyActionContent','<GenericDynamicFormActionContent',
     'setActionWorkspacePageTitle']],
  ['src/pages/work-orders/signing-order-read.vue',
   ['signing-order-read-verified','signing-read-reconciled-status',
     'signing-intent-no-dispatch','signing-order-read-no-write']],
  ['src/adapters/api/uni-api-command-transport.ts',
   ['isUnapprovedR1SigningCommandPath(input.path)',"route.startsWith('signature/')",
     "route === 'basic/contract/remove'"]],
  ['src/adapters/api/quotation-order-api.ts',
   ['listR1ContractsForSigningReview','allowSyntheticContractRead','unsupported_capability']],
  ['src/app/business-mock.ts',["isDevSyntheticContractReadPreviewEnabled",
     "workOrderId === mockWorkOrderIds[1]"]],
  ['src/features/work-orders/signing/r1-signing-command-intents.ts',
   ['r1SigningCommandDispatchDenied','mayDispatch: false']],
  ['src/features/work-orders/signing/r1-signing-command-readback.ts',
   ["phase:'accepted_unverified'","phase:'needs_attention'"]],
  ['src/shared/config/production-read-only.ts', ['isProductionReadOnlyTarget',
    'isProductionReadOnlyRuntime']],
]
for (const [path, expected] of anchors) {
  const source = file(path)
  for (const term of expected) ensure(source.includes(term), 'architecture/safety contract drift: ' + path + ' :: ' + term)
}

console.log('M1 I8 baseline: six source-linked stages; nine independent gates; guard anchors intact')
console.log('Evidence frozen at ' + manifest.evidenceCommit.slice(0,12)
  + ', current checkout NOT claimed as signed, device-tested or release-ready')
