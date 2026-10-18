#!/usr/bin/env node
/**
 * EQ06 deliberately corrupts two critical guards ONLY inside an ephemeral
 * CI working tree, tests for real detection, then restores exact file bytes.
 * This is a *two-mutant spot check*, NOT a mutation coverage percentage.
 * No changes are committed, pushed or executed against real API endpoints.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'

const probes = [
  {
    name:'invalid-quantity-rejection',
    path:'src/features/work-orders/quotation/validation.ts',
    original:'if (!parseQuotationQuantity(group.maintainAreaNum).valid) {',
    mutated:'if (false && !parseQuotationQuantity(group.maintainAreaNum).valid) {',
    test:'tests/engineering/eq06-critical-domain-branches.test.ts',
    expectedFailure:/rejects invalid area|invalid scoped repair form fields/,
  },
  {
    name:'package-is-not-direct-catalog-kind',
    path:'src/features/work-orders/quotation/model.ts',
    original:'return (QUOTATION_DIRECT_CATALOG_KINDS as readonly string[]).includes(kind)',
    mutated:'return true',
    test:'tests/engineering/eq04-quotation-catalog-bridge.test.ts',
    expectedFailure:/direct selection accepts only/,
  },
]
const results=[]
let failed=false
for (const probe of probes) {
  const path=resolve(process.cwd(),probe.path)
  const original=readFileSync(path,'utf8')
  if(original.split(probe.original).length!==2){
    throw new Error('EQ06 probe source contract drift: '+probe.name)
  }
  const mutated=original.replace(probe.original,probe.mutated)
  let test
  try {
    writeFileSync(path,mutated)
    test=spawnSync('pnpm',['exec','vitest','run',probe.test,'--reporter=verbose'],{
      cwd:process.cwd(),encoding:'utf8',timeout:120_000,
      env:{...process.env,VITE_XLINK_ENVIRONMENT:'test',VITE_XLINK_ENABLE_REAL_WRITES:'false'},
    })
  } finally {
    writeFileSync(path,original)
  }
  if(readFileSync(path,'utf8')!==original)throw new Error('EQ06 failed to restore '+probe.name)
  const logs=(test?.stdout??'')+'\n'+(test?.stderr??'')
  const killed=test?.status!==0 && probe.expectedFailure.test(logs)
  results.push({
    name:probe.name,source:probe.path,test:probe.test,
    mutationDetected:Boolean(killed),testExit:test?.status??null,
    restored:true,
  })
  process.stdout.write('EQ06 mutation '+probe.name+': '+(killed?'DETECTED':'NOT DETECTED')+'\n')
  if(!killed){failed=true;process.stderr.write(logs.slice(-5000)+'\n')}
}
const report={
  method:'Two ephemeral targeted mutation probes (NOT mutation coverage)',
  target: 'Quotation invalid quantity and direct Catalog Package rejection',
  detected:results.filter(x=>x.mutationDetected).length,
  total:results.length,
  probes:results,
}
const out=process.argv.indexOf('--output')
if(out>=0){
  const candidate=process.argv[out+1]
  if(!candidate?.startsWith('.review/eq06/')||candidate.includes('..'))throw Error('Output must be inside .review/eq06/')
  const output=resolve(process.cwd(),candidate)
  mkdirSync(dirname(output),{recursive:true})
  writeFileSync(output,JSON.stringify(report,null,2)+'\n')
}
if(failed)process.exitCode=1
