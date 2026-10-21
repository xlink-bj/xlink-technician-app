#!/usr/bin/env node
/* Actual executed Vitest V8 coverage summary, not a source-string census. */
import { readFileSync } from 'node:fs'
const input=process.argv[2] || 'coverage/coverage-summary.json'
const root=JSON.parse(readFileSync(input,'utf8'))
const paths=[
  'src/features/work-orders/action-workspace-read-model.ts',
  'src/features/work-orders/quotation/order-submission.ts',
  'src/adapters/api/uni-api-command-transport.ts',
]
const issues=[]
const rows=[]
for(const path of paths) {
  const candidates=Object.entries(root).filter(([name])=>name.replaceAll('\\','/').endsWith('/'+path) || name.replaceAll('\\','/')===path)
  if(candidates.length!==1){issues.push(path+': expected exactly one instrumented path, got '+candidates.length);continue}
  const [name,metrics]=candidates[0]
  const coverage={}
  for(const k of ['lines','statements','functions','branches']){
    const m=metrics[k]
    if(!m || !Number.isInteger(m.total) || !Number.isInteger(m.covered) || m.total<0 || m.covered<0 || m.covered>m.total || !Number.isFinite(m.pct)) issues.push(path+': invalid '+k+' counters')
    else coverage[k]={covered:m.covered,total:m.total,pct:m.pct}
  }
  if(coverage.lines?.covered===0 || coverage.branches?.covered===0) issues.push(path+': no executed line/branch evidence')
  rows.push({path,...coverage})
}
if(!root.total?.lines || !root.total?.branches || !Number.isFinite(root.total.branches.pct)) issues.push('missing actual Vitest total coverage summary')
if(issues.length){console.error('C3 COVERAGE INVALID: '+issues.join(' | '));process.exitCode=1}
else console.log(JSON.stringify({
  kind:'vitest-v8-executed-scoped-baseline-NOT-global-and-NOT-mutation-score',
  measuredFiles:rows,
  totalForConfiguredScope:{lines:root.total.lines,branches:root.total.branches},
  baselinePolicy:'record numbers; do not invent thresholds until reviewed',
},null,2))
