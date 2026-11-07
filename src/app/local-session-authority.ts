/** Default-off local-only wiring; production and command guards are unaffected. */
import { localSessionAuthorityIdentity, localQaSessionAuthorityIdentity, type LocalSessionAuthorityPolicy } from '@adapters/auth/local-session-authority'
export function localSessionAuthorityPolicy(env: Record<string, unknown> = import.meta.env,
  origin = typeof window==='undefined'?'':window.location.origin): LocalSessionAuthorityPolicy | undefined {
  const identity = env.VITE_XLINK_LOCAL_SESSION_RESTORE === 'natural-readonly-v1' ? localSessionAuthorityIdentity
    : env.VITE_XLINK_LOCAL_SESSION_RESTORE === 'ack-audit-readonly-v1' ? localQaSessionAuthorityIdentity : undefined
  if(!identity || env.DEV!==true || env.VITE_XLINK_ENVIRONMENT!=='dev'
    || origin!=='http://127.0.0.1:5189' || env.VITE_XLINK_API_BASE_URL!=='http://127.0.0.1:5189/xlink/wm'
    || env.VITE_XLINK_AUTH_API_BASE_URL || env.VITE_XLINK_AUTH_TENANT!==identity.tenantId
    || env.VITE_XLINK_MOCK!=='false' || env.VITE_XLINK_ENABLE_REAL_WRITES!=='false' || env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES!=='false') return undefined
  return {...identity,enabled:true}
}
