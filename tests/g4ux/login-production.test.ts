import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  advanceLoginStage,
  stageForLoginMethod,
  supportedLoginMethod,
} from '@features/session/login-flow'
import { resolveQuickLoginInput } from '@features/session/quick-login'

const loginPage = readFileSync(new URL('../../src/pages/index/index.vue', import.meta.url), 'utf8')
const loginTemplate = loginPage.split('<script setup')[0]
const appEntry = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8')

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

  it('keeps password login unavailable while exposing R2 quick login as a bounded test shortcut', () => {
    expect(stageForLoginMethod('password')).toBeUndefined()
    expect(resolveQuickLoginInput({
      VITE_XLINK_ENVIRONMENT: 'test',
      VITE_XLINK_QUICK_LOGIN_PHONE: 'test-phone',
    })).toEqual({ phoneNumber: 'test-phone', verificationCode: '999999' })
    expect(resolveQuickLoginInput({
      VITE_XLINK_ENVIRONMENT: 'prod',
      VITE_XLINK_QUICK_LOGIN_PHONE: 'test-phone',
    })).toBeNull()
    expect(resolveQuickLoginInput({
      VITE_XLINK_ENVIRONMENT: 'prod',
      VITE_XLINK_LOCAL_DEV: 'true',
      VITE_XLINK_QUICK_LOGIN_PHONE: 'production-phone',
      VITE_XLINK_QUICK_LOGIN_CODE: 'configured-production-code',
    })).toEqual({ phoneNumber: 'production-phone', verificationCode: 'configured-production-code' })
    expect(resolveQuickLoginInput({
      VITE_XLINK_ENVIRONMENT: 'prod',
      VITE_XLINK_LOCAL_DEV: 'true',
      VITE_XLINK_QUICK_LOGIN_PHONE: 'production-phone',
    })).toEqual({ phoneNumber: 'production-phone', verificationCode: '999999' })
    expect(loginPage).toContain('@tap="quickLogin"')
    expect(loginPage).toContain('使用已配置的账号继续')
    expect(loginPage).toContain('当前未配置快捷登录')
    expect(loginPage).not.toContain('18600372156')
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
    expect(loginPage).toMatch(/class="submit"[^>]*:disabled="isBusy"[^>]*@tap="submit"/)
    expect(loginPage).toContain('class="code-button" disabled')
  })

  it('registers MP App before page attachment and keeps H5 root bootstrap independent', () => {
    expect(appEntry).toMatch(/function createTechnicianApplication\(\)\s*\{[\s\S]*?const application = createApplication\(\)/)
    expect(appEntry).toContain('export { createTechnicianApplication as createApp }')
    expect(appEntry).toMatch(/\/\/ #ifdef MP-WEIXIN\s+application\.app\.mount\('#app'\)\s+mountedMiniProgram = application\s+\/\/ #endif/)
    expect(appEntry).toMatch(/\/\/ #ifdef MP-WEIXIN\s+createTechnicianApplication\(\)\s+\/\/ #endif/)
    expect(appEntry).toContain('return application')
    expect(appEntry).toContain('application.app.use(__plugin)')
    expect(appEntry).toMatch(/\/\/ #ifdef H5\s+[^]*?import\('@app\/bootstrap'\)\.then\([\s\S]*?application\.app\.mount\('#app'\)\s+\}\)\s+\/\/ #endif/)
    // The H5 entry must not eagerly mount a second root on module import.
    expect(appEntry).not.toMatch(/\nconst application = createApplication\(\)/)
  })
})
