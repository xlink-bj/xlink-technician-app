import { describe, expect, it, vi } from 'vitest'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { isUnapprovedR1QuotationStageMutationPath } from '@adapters/api/uni-api-command-transport'
import { createQuotationOrderCommandAdapter } from '@adapters/api/quotation-order-commands'
import type { ApiCommandTransport } from '@adapters/api/technician-api-commands'

const filename='docs/verification/R1_SIX_STAGE_SOURCE_PARITY_MANIFEST.json'
const manifest=JSON.parse(readFileSync(filename,'utf8'))
function run(mutate:(m:typeof manifest)=>void) {
  const dir=mkdtempSync(resolve(tmpdir(),'r1-review-'))
  try {
    const m=structuredClone(manifest)
    mutate(m)
    const local=resolve(dir,'manifest.json')
    writeFileSync(local,JSON.stringify(m))
    const result=spawnSync(process.execPath,['scripts/check-r1-six-stage-parity.mjs','--manifest',local],{
      cwd:process.cwd(),encoding:'utf8',timeout:10000,
      env:{...process.env,VITE_XLINK_ENABLE_REAL_WRITES:'true'},
    })
    return {status:result.status, output:result.stdout+result.stderr}
  } finally {rmSync(dir,{recursive:true,force:true})}
}
describe('R1 original source -> six-stage simulator evidence is not business acceptance',()=>{
  it('validates all six pinned stages while real account, device, SKU, signing remain blocked',()=>{
    const r=run(()=>{})
    expect(r.status).toBe(0)
    expect(r.output).toContain('R1_SOURCE_GROUNDED_SYNTHETIC_ENGINEERING_ONLY')
    expect(r.output).toContain('"stages":6')
    expect(r.output).toContain('"live":"NOT_VERIFIED"')
  })
  it('rejects synthetic work-order H5 claimed as real backend parity',()=>{
    const r=run(m=>{m.stages[1].liveParity='VERIFIED'})
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('STAGE_OR_LIVE_PARITY:work_orders')
  })
  it('rejects automatic formal release, main merge or production operation promotion',()=>{
    for(const [key,val] of [
      ['formalM1Iterations','8/8'],['mainMerge','APPROVED'],['productionWrite','APPROVED'],
      ['backendTenantACL','VERIFIED'],['physicalApp','PASS']
    ] as const){
      const r=run(m=>{m.acceptance[key]=val})
      expect(r.status,key).not.toBe(0)
      expect(r.output).toContain('UNAUTHORIZED_GATE_PROMOTION:')
    }
  })
  it('pins original quote type0 vs type1 sources as independent stage/write semantics',()=>{
    for(const mutation of [
      (m:typeof manifest)=>{m.stages[4].r1Evidence=m.stages[4].r1Evidence.slice(1)},
      (m:typeof manifest)=>{m.stages[4].r1Evidence[1].fact='same generic Order write for all stages'},
      (m:typeof manifest)=>{m.stages[4].r1Evidence[2].blob='0'.repeat(40)},
    ]){
      const r=run(mutation)
      expect(r.status).not.toBe(0)
    }
  })
  it('cannot silently delete R1 login consent requirements',()=>{
    const r=run(m=>{m.stages[0].confirmedOpenGaps=['only password mode is missing','real role unknown']})
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('R1_CONSENT_GAP_SILENCED')
  })
  it('requires executable behavior tests and original pinned ServiceAppointment identity',()=>{
    const noTest=run(m=>{m.stages[2].tests=['tests/not-existent.test.ts','tests/g4d/accept-appointment.test.ts']})
    expect(noTest.status).not.toBe(0)
    expect(noTest.output).toContain('TEST_PATH_MISSING')
    const swapped=run(m=>{m.stages[1].r1Evidence[0].path='business/subpackages2/workOrder/workOrders.vue'})
    expect(swapped.status).not.toBe(0)
    expect(swapped.output).toContain('UNPINNED_OR_CHANGED_R1_BLOB')
  })
  it('cannot erase the original Survey persistence side-effect or tenant-dependent catalog pricing rules',()=>{
    const noSurvey=run(m=>{m.stages[3].r1BackendEvidence=[]})
    expect(noSurvey.status).not.toBe(0)
    expect(noSurvey.output).toContain('MISSING_BACKEND_SOURCE_PROOF:survey')
    const falsePrice=run(m=>{
      m.stages[4].r1BackendEvidence[0].fact='new app local money calculation is always an authoritative catalog total'
    })
    expect(falsePrice.status).not.toBe(0)
    expect(falsePrice.output).toContain('CATALOG_PRICE_CONTEXT_SILENCED')
  })
  it('cannot erase saveOnly/full FormData upsert versus Workflow stage distinction',()=>{
    const r=run(m=>{
      m.stages[2].r1Evidence=m.stages[2].r1Evidence.filter(
        (e:{fact:string})=>!e.fact.includes('dataStr:JSON.stringify(params)')
      )
    })
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('APPOINTMENT_SAVE_WIRE_OR_WORKFLOW_GAP_SILENCED')
  })
  it('cannot label a Mock browser fixture as real device/tenant validation',()=>{
    const r=run(m=>{m.simulator.kind='PRODUCTION_ACCEPTANCE'})
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('SIMULATOR_MUST_BE_OFFLINE')
  })
  it('runtime-fences type0 quotation mutation and type1 Order confusion',async()=>{
    expect(isUnapprovedR1QuotationStageMutationPath('basic/order/creatQuotation')).toBe(true)
    expect(isUnapprovedR1QuotationStageMutationPath('basic/order/upsert')).toBe(false)
    const execute=vi.fn()
    const adapter=createQuotationOrderCommandAdapter({execute} as ApiCommandTransport)
    const blocked=await adapter.upsertOfficialOrder({
      order:{type:0,serviceAppointmentId:'synthetic-work-order',productIds:'[]'}
    })
    expect(blocked.state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })
})
