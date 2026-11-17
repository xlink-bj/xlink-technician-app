import { describe, expect, it } from 'vitest'
import {startR1CommandReadback,reduceR1CommandReadback} from '@features/work-orders/signing/r1-signing-command-readback'

const scope='role-session-workorder-019'
const accepted = {type:'accepted' as const,scope,requestKey:'intent-123',command:'electronic' as const}
const read= {type:'read_started' as const,scope,requestKey:'intent-123'}
const observed=(stage:'record_signed'|'signing_in_progress'|'signing_exception'|'contract_query_inconclusive',version=1)=>({
  type:'read_observed' as const,scope,requestKey:'intent-123',stage,version,
})
describe('I6 post-command readback reducer (pure, no outgoing requests)',()=>{
  it('cannot show accepted as signed without independent readback',()=>{
    const next=reduceR1CommandReadback(startR1CommandReadback(scope),accepted)
    expect(next).toMatchObject({phase:'accepted_unverified',accepted:true,requestKey:'intent-123'})
    expect(next.note).toContain('不能证明')
  })
  it('drops a duplicate acceptance and blocks same-scope second action',()=>{
    const one=reduceR1CommandReadback(startR1CommandReadback(scope),accepted)
    expect(reduceR1CommandReadback(one,accepted)).toBe(one)
    expect(reduceR1CommandReadback(one,{...accepted,requestKey:'intent-456',command:'resend_sms'})).toBe(one)
  })
  it('requires read_started before a read observation',()=>{
    const one=reduceR1CommandReadback(startR1CommandReadback(scope),accepted)
    expect(reduceR1CommandReadback(one,observed('record_signed'))).toBe(one)
  })
  it('pending status never triggers a resend, then a newer read may show recorded signature',()=>{
    let s=reduceR1CommandReadback(startR1CommandReadback(scope),accepted)
    s=reduceR1CommandReadback(s,read)
    s=reduceR1CommandReadback(s,observed('signing_in_progress',1))
    expect(s.phase).toBe('waiting_for_external')
    s=reduceR1CommandReadback(s,read)
    s=reduceR1CommandReadback(s,observed('record_signed',2))
    expect(s.phase).toBe('recorded_signed_unverified')
    expect(s.note).toContain('仍须核实')
  })
  it('a stale version is ignored, preventing late network results from rewriting state',()=>{
    let s=reduceR1CommandReadback(startR1CommandReadback(scope),accepted)
    s=reduceR1CommandReadback(s,read)
    s=reduceR1CommandReadback(s,observed('signing_in_progress',7))
    s=reduceR1CommandReadback(s,read)
    expect(reduceR1CommandReadback(s,observed('record_signed',6))).toBe(s)
  })
  it('wrong session, wrong request or invalid version never causes a stage transition',()=>{
    let s=reduceR1CommandReadback(startR1CommandReadback(scope),accepted)
    s=reduceR1CommandReadback(s,read)
    for(const e of [
      {...observed('record_signed'),scope:'other-scope'},
      {...observed('record_signed'),requestKey:'other-intent'},
      {...observed('record_signed'),version:NaN},
      {...observed('record_signed'),version:-1},
    ])expect(reduceR1CommandReadback(s,e)).toBe(s)
  })
  it('status=-3/source conflict mandates attention without automatic retries',()=>{
    let s=reduceR1CommandReadback(startR1CommandReadback(scope),accepted)
    s=reduceR1CommandReadback(s,read)
    s=reduceR1CommandReadback(s,observed('signing_exception'))
    expect(s).toMatchObject({phase:'needs_attention',accepted:true})
    expect(s.note).toContain('不自动重试')
  })
  it('readback failure is unknown and cannot infer success',()=>{
    let s=reduceR1CommandReadback(startR1CommandReadback(scope),accepted)
    s=reduceR1CommandReadback(s,read)
    s=reduceR1CommandReadback(s,{type:'read_failed',scope,requestKey:'intent-123'})
    expect(s.phase).toBe('needs_attention')
    expect(s.note).toContain('未知')
  })
  it('bounded empty observation is waiting, never no-contract',()=>{
    let s=reduceR1CommandReadback(startR1CommandReadback(scope),accepted)
    s=reduceR1CommandReadback(s,read)
    s=reduceR1CommandReadback(s,observed('contract_query_inconclusive'))
    expect(s.phase).toBe('waiting_for_external')
  })
  it('clear revokes request correlation/identities',()=>{
    const one=reduceR1CommandReadback(startR1CommandReadback(scope),accepted)
    expect(reduceR1CommandReadback(one,{type:'clear'})).toEqual(startR1CommandReadback(scope))
  })
})
