import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  advanceLoginStage,
  stageForLoginMethod,
  supportedLoginMethod,
} from '@features/session/login-flow'

const loginPage = readFileSync(new URL('../../src/pages/index/index.vue', import.meta.url), 'utf8')
const loginTemplate = loginPage.split('<script setup')[0]

describe('G4-UX production Login flow', () => {
  it('transitions from brand launch to method selection to the supported form', () => {
    expect(advanceLoginStage('launch')).toBe('methods')
    expect(stageForLoginMethod(supportedLoginMethod)).toBe('form')
  })

  it('keeps the Login brand lockup text-only', () => {
    expect(loginPage).toContain('class="brand-copy"')
    expect(loginPage).toContain('class="brand-name">修链</text>')
    expect(loginPage).toContain('class="brand-tagline">屋顶维修</text>')
    expect(loginPage).not.toContain('brand-mark')
  })

  it('keeps unsupported R2 auth methods unavailable without a backend path', () => {
    expect(stageForLoginMethod('password')).toBeUndefined()
    expect(stageForLoginMethod('quick')).toBeUndefined()
    expect(loginPage).toContain('UI/DEV BEHAVIOR REQUIRES CONTRACT EVIDENCE')
  })

  it('keeps engineering guidance out of rendered Login copy', () => {
    expect(loginTemplate).not.toContain('需合同证据')
    expect(loginTemplate).not.toContain('待合同确认')
    expect(loginTemplate).not.toContain('UI/DEV BEHAVIOR REQUIRES CONTRACT EVIDENCE')
    expect(loginTemplate).toContain('暂未开放')
    expect(loginTemplate).toContain('请输入已收到的验证码')
  })

  it('keeps bootstrap non-interactive and renders a reachable disabled-aware primary action', () => {
    expect(loginPage).toContain("session.status === 'unknown'")
    expect(loginPage).toContain("loginStage === 'launch'")
    expect(loginPage).toContain("loginStage === 'methods'")
    expect(loginPage).toMatch(/class="submit"[^>]*:aria-disabled="isBusy[^>]*@tap="onSubmit"/)
    expect(loginPage).toContain('class="code-button" disabled')
  })
})
