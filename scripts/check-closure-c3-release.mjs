#!/usr/bin/env node
/* Offline evidence preflight only. Never grants release or executes real writes. */
import { readFileSync } from 'node:fs'
const data=JSON.parse(readFileSync('docs/engineering/closure-c3-readiness.json','utf8'))
const parent='ffc3fe53d6a275a807ad943c177e15d42391ff70'
const required=['exact_head_ci','critical_behavior','three_platform_builds','mock_journey_and_golden','production_mutation_denial','r1_backend_contract_evidence','rollback_plan_and_owner','release_owner_approval']
const external=['r1_backend_contract_evidence','rollback_plan_and_owner','release_owner_approval']
function audit(plan){
  const issues=[]
  if(plan.schemaVersion!==1 || plan.inheritedCandidate!==parent) issues.push('pinned source must match #192')
  if(plan.mode!=='offline_preflight' || plan.realBusinessWrites!==false || plan.productionAuthorized!==false || plan.mainMergeAuthorized!==false) issues.push('no release or write authorization')
  if(plan.releaseDecision!=='HOLD_EXTERNAL_EVIDENCE') issues.push('offline CI can never grant release approval')
  if(!Array.isArray(plan.checks) || JSON.stringify(plan.checks.map(x=>x.id))!==JSON.stringify(required)) issues.push('missing or reordered readiness checks')
  else for (const x of plan.checks){
    if(!['offline_verified','blocked_pending_external_evidence'].includes(x.status)||!x.evidence?.trim()) issues.push('invalid evidence for '+x.id)
    if(external.includes(x.id) && x.status!=='blocked_pending_external_evidence') issues.push('external blocker cannot be self-attested: '+x.id)
  }
  if(JSON.stringify(plan.unresolved)!==JSON.stringify(external)) issues.push('external blockers list cannot be discarded')
  return issues
}
const issues=audit(data)
if(issues.length){console.error('C3 preflight DENIED: '+issues.join('; '));process.exitCode=1}
else console.log('C3 offline evidence preflight PASS; RELEASE HOLD_EXTERNAL_EVIDENCE')
if(process.argv.includes('--self-test')){
  if(issues.length) throw Error('baseline must pass')
  const changes=[
    x=>{x.realBusinessWrites=true}, x=>{x.productionAuthorized=true},
    x=>{x.mainMergeAuthorized=true}, x=>{x.releaseDecision='GO_LIVE'},
    x=>{x.inheritedCandidate='0'.repeat(40)}, x=>{x.unresolved=[]},
    x=>{x.checks.pop()}, x=>{x.checks.find(c=>c.id==='r1_backend_contract_evidence').status='offline_verified'},
    x=>{x.checks.find(c=>c.id==='rollback_plan_and_owner').status='offline_verified'},
  ]
  for(const mutate of changes){
    const caseData=JSON.parse(JSON.stringify(data));mutate(caseData)
    if(!audit(caseData).length) throw Error('unsafe readiness mutation escaped')
  }
  console.log('C3 negative readiness drills PASS: '+changes.length)
}
