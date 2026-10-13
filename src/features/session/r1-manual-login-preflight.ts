import type { LoginFormInput } from './login'

/**
 * M1-S1 L01 — R1 business/subpackages/login/loginAuth.vue:300-323.
 * Manually entered mobile/SMS code must be syntactically valid before
 * invoking the auth port. This deliberately does not cover DEV-only quick
 * login, which uses an explicitly configured and differently gated contract.
 * No SMS-send endpoint is enabled.
 */
export type R1ManualLoginIssue =
  | 'phone_required' | 'phone_format' | 'code_required' | 'code_format'

export function r1ManualLoginIssue(input: LoginFormInput): R1ManualLoginIssue | null {
  const phone = input.phoneNumber.trim()
  const code = input.verificationCode.trim()
  if (!phone) return 'phone_required'
  if (!/^\d{11}$/.test(phone)) return 'phone_format'
  if (!code) return 'code_required'
  if (!/^\d{6}$/.test(code)) return 'code_format'
  return null
}

export function r1ManualLoginIssueText(issue: R1ManualLoginIssue): string {
  switch (issue) {
    case 'phone_required': return '请输入手机号'
    case 'phone_format': return '请输入11位手机号'
    case 'code_required': return '请输入验证码'
    case 'code_format': return '请输入6位数字验证码'
  }
}
