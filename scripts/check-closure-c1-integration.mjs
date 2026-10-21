#!/usr/bin/env node
/**
 * Closure C1 - prove one exact, reviewable engineering integration candidate.
 * All reads are local Git objects/source; no API or production network access.
 * This is NOT an approval to merge main or proof of live R1 business parity.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const upstream = 'ffed2fd4e6494dd1cd4a37936ded364654072f9f' // #190
const ancestors = Object.freeze([
  ['#182 login consent', 'f7ee7360e302d576dd4a44164592b5bcdf2c1b0e'],
  ['#183 appointment wire', '18ae65d85713cadc40cc00b87a44d3dba90ffdeb'],
  ['#184 verified two-parent merge', 'c383a642485e609e52a9110efb91c10938e30025'],
  ['#184 integration head', 'b511cb572902fa0118ca02957e4d77ce6b9528da'],
  ['#187 P0', '934cca0c8aa5bd92fbb1317cd056c90eebc8b93e'],
  ['#188 architecture', '2fab824a7aff97eb5c36134db45cdad817d7d462'],
  ['#189 reliability', 'a5d494cd1cbed4d89b60bac31178559ccd50807a'],
  ['#190 quality', upstream],
])
const exactFiles = Object.freeze([
  '.github/workflows/closure-c1-integration-gate.yml',
  'docs/engineering/CLOSURE_C1_INTEGRATION_DECISION.md',
  'scripts/check-closure-c1-integration.mjs',
  'tests/engineering/closure-c1-integration.test.ts',
])
const provenPortBlobs = Object.freeze({
  'src/features/session/login-consent.ts': '2c9cca0d92efc0746543c0fa830bc67ea46e25f8',
  'tests/engineering/r1-manual-login-consent.test.ts': '8f132ca208e5d2f8a2cb5ddf193b50b780583161',
  'tests/engineering/r1-appointment-wire-unification.test.ts': '52082157f345698d3c67e9d6fac629201905f4bc',
  // #185 Runtime code is intentionally normalized by #188's common Form Schema;
  // the original verified behavior tests must be byte-identical.
  'tests/engineering/r1-appointment-conditional-runtime.test.ts': '176d60d16bd445bc37846c4acb186ea29eda84b7',
  // #186 R1-Q07 source and tests were copied, not merged from the sibling PR.
  'src/adapters/api/quotation-catalog-api.ts': '38280537f23c783c1d4152d05365b256f40a76ba',
  'tests/engineering/r1-catalog-price-identity-fence.test.ts': '17b08c9158f9cb370535eac657cef0ec7486161b',
})

function git(...args) {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd: process.cwd() })
  if (r.error) throw r.error
  return { ok: r.status === 0, value: (r.stdout ?? '').trim(), error: (r.stderr ?? '').trim() }
}

function collectProof() {
  const delta = git('diff', '--name-only', upstream, 'HEAD')
  if (!delta.ok) throw new Error('Cannot compare candidate to pinned #190')
  const checked = git('rev-parse', 'HEAD')
  if (!checked.ok) throw new Error('Cannot determine exact candidate commit')
  const parent = git('show', '-s', '--format=%P', ancestors[2][1])
  const blobs = Object.fromEntries(Object.keys(provenPortBlobs).map(file => {
    const x = git('hash-object', file)
    return [file, x.ok ? x.value : 'NOT_READABLE']
  }))
  const actorRuntime = readFileSync('src/features/work-orders/appointment-form-runtime.ts','utf8')
  const dynamicRuntime = readFileSync('src/features/work-orders/dynamic-form-action.ts','utf8')
  const sharedSchema = readFileSync('src/features/work-orders/action-form-schema.ts','utf8')
  const cmdAdapter = readFileSync('src/adapters/api/technician-api-commands.ts','utf8')
  const wireOwner = readFileSync('src/adapters/api/action-command-wires.ts','utf8')
  return {
    head: checked.value,
    paths: delta.value ? delta.value.split('\n') : [],
    parents: parent.value.split(' ').filter(Boolean),
    ancestry: ancestors.map(([label, sha]) => ({
      label, sha, present: git('merge-base','--is-ancestor',sha,'HEAD').ok,
    })),
    blobs,
    transformed: {
      appointmentShared: actorRuntime.includes('actionFormSchemaFor(field)'),
      dynamicShared: dynamicRuntime.includes('actionFormSchemaFor(field,'),
      semantics: ['visibility','showList','multiple','valueOption','unsupportedReason'].every(k => sharedSchema.includes(k)),
      wireAdapter: cmdAdapter.includes('formDataUpsertCommand(input, safety)')
        && cmdAdapter.includes('workflowCompleteCommand(input)'),
      separatedWrites: wireOwner.includes('biz/extForm/upsert/')
        && wireOwner.includes("path: 'workflow/process'"),
    },
  }
}

function evaluate(proof) {
  const errors = []
  for (const p of proof.ancestry) if (!p.present) errors.push('Missing verified ancestor: ' + p.label)
  if (proof.parents.join(' ') !== ancestors.slice(0,2).map(x=>x[1]).join(' ')) {
    errors.push('#184 merge must retain the exact #182/#183 two-parent history')
  }
  if (proof.paths.slice().sort().join('\n') !== exactFiles.slice().sort().join('\n')) {
    errors.push('Integration candidate contains an unreviewed or missing delta')
  }
  for (const [path, value] of Object.entries(provenPortBlobs)) {
    if (proof.blobs[path] !== value) errors.push('Sibling/source blob provenance mismatch: ' + path)
  }
  for (const [key, value] of Object.entries(proof.transformed)) {
    if (!value) errors.push('Intentional common Runtime/Adapter integration missing: '+key)
  }
  if (!/^[0-9a-f]{40}$/.test(proof.head)) errors.push('Missing exact candidate HEAD')
  return errors
}

const proof=collectProof()
const issues=evaluate(proof)
if (issues.length) {
  console.error('CLOSURE-C1 INTEGRATION BLOCKED')
  for (const issue of issues) console.error('- ' + issue)
  process.exitCode=1
} else {
  console.log('CLOSURE-C1 OFFLINE INTEGRATION PROVEN')
  console.log(JSON.stringify({
    head:proof.head,
    verifiedAncestors:proof.ancestry.length,
    twoParentR1Merge:true,
    inheritedSiblingBlobs:Object.keys(provenPortBlobs).length,
    sharedRuntimeAndWireBoundaries:true,
    integrationOnlyFiles:proof.paths.length,
    verdict:'candidate-is-unmerged-NOT-production-ready',
  }))
}
if (process.argv.includes('--self-test')) {
  if (issues.length) throw new Error('Clean integration proof required before negative self-tests')
  const clone = value => JSON.parse(JSON.stringify(value))
  const mutations=[
    ['omitted original R1 source', p=>{p.ancestry[0].present=false}],
    ['wrong merge parent', p=>{p.parents[1]='0000000000000000000000000000000000000000'}],
    ['unreviewed application file', p=>{p.paths.push('src/features/work-orders/action-workspace.ts')}],
    ['missing governance artifact', p=>{p.paths=p.paths.slice(1)}],
    ['tampered R1-Q07 catalog', p=>{p.blobs['src/adapters/api/quotation-catalog-api.ts']='0000000000000000000000000000000000000000'}],
    ['lost conditional Appointment tests', p=>{p.blobs['tests/engineering/r1-appointment-conditional-runtime.test.ts']='NOT_READABLE'}],
    ['bypassed shared form semantics', p=>{p.transformed.semantics=false}],
    ['bypassed command wire owner', p=>{p.transformed.wireAdapter=false}],
  ]
  for (const [name, change] of mutations) {
    const copy = clone(proof)
    change(copy)
    if (!evaluate(copy).length) throw new Error('Fail-closed sentinel failed: '+name)
  }
  console.log('CLOSURE-C1 NEGATIVE SENTINELS PASS: '+mutations.length+' synthetic integration regressions rejected')
}
