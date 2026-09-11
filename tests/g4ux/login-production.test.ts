import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  advanceLoginStage,
  stageForLoginMethod,
  supportedLoginMethod,
} from '@features/session/login-flow'

const loginPage = readFileSync(new URL('../../src/pages/index/index.vue', import.meta.url), 'utf8')

describe('G4-UX production Login flow', () => {
  it('transitions from brand launch to method selection to the supported form', () => {
    expect(advanceLoginStage('launch')).toBe('methods')
    expect(stageForLoginMethod(supportedLoginMethod)).toBe('form')
  })

  it('keeps unsupported R2 auth methods unavailable without a backend path', () => {
    expect(stageForLoginMethod('password')).toBeUndefined()
    expect(stageForLoginMethod('quick')).toBeUndefined()
    expect(loginPage).toContain('UI/DEV BEHAVIOR REQUIRES CONTRACT EVIDENCE')
  })

  it('keeps bootstrap non-interactive and renders a reachable disabled-aware primary action', () => {
    expect(loginPage).toContain("session.status === 'unknown'")
    expect(loginPage).toContain("loginStage === 'launch'")
    expect(loginPage).toContain("loginStage === 'methods'")
    expect(loginPage).toMatch(/class="submit"[^>]*:aria-disabled="isBusy[^>]*@tap="onSubmit"/)
    expect(loginPage).toContain('class="code-button" disabled')
  })
})
