import type { AuthStartRequest, SessionSnapshot } from '@shared/ports'
import { createOperationError, type OperationSnapshot } from '@shared/types'
import { submitLogin, type LoginFormInput, type LoginSubmissionState } from './login'

/**
 * R1 requires affirmative acceptance BEFORE manual login. Only configured
 * XLink-owned legal URLs may be displayed; never silently reuse R1's
 * unrelated legacy policy hosts. Missing policy configuration fails closed.
 */
export interface LoginLegalPolicies {
  readonly privacyUrl: string | null
  readonly agreementUrl: string | null
}

function securePolicyUrl(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password
      || url.hash || url.hostname.endsWith('.invalid') || url.hostname === 'localhost') return null
    if (url.port && url.port !== '443') return null
    return url.href
  } catch { return null }
}

export function legalLoginPolicies(env: Readonly<Record<string, unknown>>): LoginLegalPolicies {
  return {
    privacyUrl: securePolicyUrl(env.VITE_XLINK_PRIVACY_POLICY_URL),
    agreementUrl: securePolicyUrl(env.VITE_XLINK_USER_AGREEMENT_URL),
  }
}

export type ManualLoginConsentIssue = 'policy_unavailable' | 'consent_required'

export function manualLoginConsentIssue(
  accepted: boolean,
  policies: LoginLegalPolicies,
): ManualLoginConsentIssue | null {
  if (!policies.privacyUrl || !policies.agreementUrl) return 'policy_unavailable'
  return accepted ? null : 'consent_required'
}

export function manualLoginConsentMessage(issue: ManualLoginConsentIssue): string {
  return issue === 'policy_unavailable'
    ? '登录协议尚未配置，请联系管理员'
    : '请先阅读并同意用户协议与隐私政策'
}

/** Separate manual-login intent: DEV quick login retains its own isolated path. */
export async function submitR1ManualLogin(
  input: LoginFormInput,
  state: LoginSubmissionState,
  accepted: boolean,
  policies: LoginLegalPolicies,
  startSession: (request: AuthStartRequest) => Promise<OperationSnapshot<SessionSnapshot>>,
): Promise<OperationSnapshot<SessionSnapshot>> {
  const issue = manualLoginConsentIssue(accepted, policies)
  if (issue) {
    return {
      state: 'failed_terminal',
      error: createOperationError(issue === 'policy_unavailable' ? 'unsupported_capability' : 'validation',
        manualLoginConsentMessage(issue)),
    }
  }
  return submitLogin(input, state, startSession)
}
