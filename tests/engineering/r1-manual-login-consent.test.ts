import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  legalLoginPolicies, manualLoginConsentIssue, manualLoginConsentMessage,
  submitR1ManualLogin,
} from '@features/session/login-consent'
import type { AuthStartRequest, SessionSnapshot } from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'

const valid = legalLoginPolicies({
  VITE_XLINK_PRIVACY_POLICY_URL: 'https://xlink.example.org/privacy',
  VITE_XLINK_USER_AGREEMENT_URL: 'https://xlink.example.org/terms',
})
const input = { phoneNumber:'13800000000', verificationCode:'123456' }
const ok: OperationSnapshot<SessionSnapshot> = { state:'succeeded', data: {
  sessionRef: 'synthetic-session' as never,
  user:{ id:'synthetic-user' as never, displayName:'Synthetic User' },
  capabilityNames:[],
}}
describe('R1 L02 explicit manual-login consent and legal provenance', () => {
  it('requires TWO independently approved HTTPS documents, never defaults to old R1 links', () => {
    expect(valid).toEqual({
      privacyUrl:'https://xlink.example.org/privacy',
      agreementUrl:'https://xlink.example.org/terms',
    })
    expect(legalLoginPolicies({})).toEqual({privacyUrl:null,agreementUrl:null})
    for(const bad of ['http://legacy.example.org/terms','javascript:alert(1)','//legacy.example.org',
      'https://user:password@example.com/legal','https://localhost/legal',
      'https://staging.invalid/legal','https://example.org/legal#t','https://example.org:8080/legal']){
      expect(legalLoginPolicies({VITE_XLINK_PRIVACY_POLICY_URL:bad}).privacyUrl,bad).toBeNull()
    }
  })
  it('distinguishes missing documents from an unchecked form',()=>{
    expect(manualLoginConsentIssue(true,{privacyUrl:null,agreementUrl:null})).toBe('policy_unavailable')
    expect(manualLoginConsentIssue(false,valid)).toBe('consent_required')
    expect(manualLoginConsentIssue(true,valid)).toBeNull()
    expect(manualLoginConsentMessage('consent_required')).toContain('同意')
    expect(manualLoginConsentMessage('policy_unavailable')).toContain('尚未配置')
  })
  it('blocks Auth Transport with missing policy links, even if checkbox was set',async()=>{
    const start=vi.fn(async()=>ok)
    const state={inFlight:false}
    const res=await submitR1ManualLogin(input,state,true,{privacyUrl:null,agreementUrl:null},start)
    expect(res.state).toBe('failed_terminal')
    expect(res.error?.category).toBe('unsupported_capability')
    expect(start).not.toHaveBeenCalled()
    expect(state.inFlight).toBe(false)
  })
  it('blocks Auth Transport before any request when user has not checked both documents',async()=>{
    const start=vi.fn(async()=>ok)
    const res=await submitR1ManualLogin(input,{inFlight:false},false,valid,start)
    expect(res.state).toBe('failed_terminal')
    expect(res.error?.category).toBe('validation')
    expect(start).not.toHaveBeenCalled()
  })
  it('delegates once to the unchanged Session port ONLY after affirmative manual consent',async()=>{
    const start=vi.fn(async(_request:AuthStartRequest)=>ok)
    const state={inFlight:false}
    expect((await submitR1ManualLogin(input,state,true,valid,start)).state).toBe('succeeded')
    expect(start).toHaveBeenCalledExactlyOnceWith(input)
    expect(state.inFlight).toBe(false)
  })
  it('keeps user consent out of persisted authentication payload, and quick login unaffected',()=>{
    const page=readFileSync('src/pages/index/index.vue','utf8')
    const submit=page.split('async function submit(): Promise<void> {')[1]?.split('async function logout():')[0]
    const quick=page.split('async function quickLogin(): Promise<void> {')[1]?.split('async function handleMockToggle')[0]
    expect(submit).toContain('const consentIssue = manualLoginConsentIssue(')
    expect(submit).toContain('await submitR1ManualLogin(')
    expect(quick).toContain('await submitLogin(')
    expect(quick).not.toContain('manualLoginConsentIssue')
    const authSource=readFileSync('src/shared/ports/auth.ts','utf8')
    expect(authSource).not.toContain('privacyUrl')
    expect(authSource).not.toContain('accepted')
    expect(page).toContain('data-testid="r1-login-consent"')
    expect(page).not.toContain('登录即表示同意')
  })
})
