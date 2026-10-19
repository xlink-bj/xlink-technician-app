import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  r1ManualLoginIssue, r1ManualLoginIssueText,
} from '@features/session/r1-manual-login-preflight'

const input = (phoneNumber: string, verificationCode: string) => ({ phoneNumber, verificationCode })

describe('M1-S1 L01 — R1 source-backed manual login preflight', () => {
  it('accepts only 11 digits of mobile and 6 digits of code', () => {
    expect(r1ManualLoginIssue(input('13800000000', '000123'))).toBeNull()
    expect(r1ManualLoginIssue(input(' 13800000000 ', ' 012345 '))).toBeNull()
    expect(r1ManualLoginIssue(input('12800000000', '123456'))).toBe('phone_format')
    expect(r1ManualLoginIssue(input('00000000000', '123456'))).toBe('phone_format')
    expect(r1ManualLoginIssue(input('1380000000', '123456'))).toBe('phone_format')
    expect(r1ManualLoginIssue(input('138000000000', '123456'))).toBe('phone_format')
    expect(r1ManualLoginIssue(input('1380000000a', '123456'))).toBe('phone_format')
    expect(r1ManualLoginIssue(input('138 0000000', '123456'))).toBe('phone_format')
    expect(r1ManualLoginIssue(input('13800000000', '12345'))).toBe('code_format')
    expect(r1ManualLoginIssue(input('13800000000', '1234567'))).toBe('code_format')
    expect(r1ManualLoginIssue(input('13800000000', '12a456'))).toBe('code_format')
  })

  it('keeps empty values separate from malformed formats', () => {
    expect(r1ManualLoginIssue(input('', '123456'))).toBe('phone_required')
    expect(r1ManualLoginIssue(input('13800000000', ' '))).toBe('code_required')
    for (const issue of ['phone_required', 'phone_format', 'code_required', 'code_format'] as const) {
      expect(r1ManualLoginIssueText(issue).trim()).not.toBe('')
    }
  })

  it('the real manual form fails locally BEFORE login dispatch; quick login remains separate', () => {
    const page = readFileSync(new URL('../../src/pages/index/index.vue', import.meta.url), 'utf8')
    const manual = page.split('async function submit(): Promise<void> {')[1]?.split('\nasync function logout():')[0]
    expect(manual).toContain('const issue = r1ManualLoginIssue(')
    expect(manual).toContain('message.value = r1ManualLoginIssueText(issue)')
    expect(manual).toContain('if (issue) {')
    expect(manual).toContain('const consentIssue = manualLoginConsentIssue(')
    expect(manual?.indexOf('return')).toBeLessThan(manual?.indexOf('const result = await submitR1ManualLogin(') ?? -1)
    expect(manual?.indexOf('const consentIssue = manualLoginConsentIssue('))
      .toBeLessThan(manual?.indexOf('const result = await submitR1ManualLogin(') ?? -1)
    expect(page).toContain('maxlength="11"')
    expect(page).toContain('maxlength="6"')
    const quick = page.split('async function quickLogin(): Promise<void> {')[1]?.split('\nasync function handleMockToggle')[0]
    expect(quick).toContain('resolveQuickLoginInput()')
    expect(quick).not.toContain('r1ManualLoginIssue')
    expect(page).toContain('class="code-button" disabled')
  })
})
