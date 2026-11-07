/** Explicit local read-only authority experiment. No production fallback or cache-only success. */
import type { SessionRef } from '@shared/types'
import { AuthTransportError } from './auth-session-adapter'
import type { UniRequestExecutor } from '../common/uni-request-executor'
export const localSessionAuthorityIdentity = Object.freeze({ userId: 'local-demo-user', roleId: 'local-demo-technician', tenantId: 'local-tenant', orgId: 'local-catalog-c1-org' })
export const localQaSessionAuthorityIdentity = Object.freeze({ userId: 'local-qa-ack-audit-user', roleId: 'local-qa-ack-audit-technician', tenantId: 'local-qa-ack-audit-20261107', orgId: 'local-qa-ack-audit-org' })
export type LocalSessionAuthorityPolicy = Readonly<(typeof localSessionAuthorityIdentity | typeof localQaSessionAuthorityIdentity) & { enabled: true }>
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> { const r=record(value);return Boolean(r && Object.keys(r).length===keys.length && keys.every(k=>Object.hasOwn(r,k))) }
function unavailable(message: string, retryable = false): never { throw new AuthTransportError(message, retryable) }
export function createLocalSessionAuthorityRestorer(options: { apiBaseUrl: string; policy: LocalSessionAuthorityPolicy; request: UniRequestExecutor; timeoutMs?: number }) {
  return async (sessionRef: SessionRef): Promise<unknown> => {
    const policy=options.policy
    if (options.apiBaseUrl !== 'http://127.0.0.1:5189/xlink/wm' || !exact(policy,['enabled',...Object.keys(localSessionAuthorityIdentity)])
      || policy.enabled!==true || ![localSessionAuthorityIdentity,localQaSessionAuthorityIdentity].some(identity=>Object.entries(identity).every(([k,v])=>policy[k as keyof typeof localSessionAuthorityIdentity]===v))) unavailable('Local session authority is not configured for this target')
    if(typeof sessionRef!=='string'||!sessionRef||sessionRef!==sessionRef.trim()||sessionRef.length>256) unavailable('Stored session reference is malformed')
    let response: UniNamespace.RequestSuccessCallbackResult
    try { response = await new Promise((resolve,reject)=>options.request({
      url:'http://127.0.0.1:5189/xlink/__local/session-authority', method:'POST',
      data:{sessionRef,userId:policy.userId,roleId:policy.roleId,tenantId:policy.tenantId,orgId:policy.orgId}, header:{'Content-Type':'application/json'}, dataType:'json', withCredentials:true,
      timeout:options.timeoutMs??10000, success:resolve, fail:reject,
    })) } catch { unavailable('Local session verification could not be reached',true) }
    let body: unknown=response.data
    if(typeof body==='string') { if(body.length>16384)unavailable('Local session verification response is too large');try{body=JSON.parse(body)}catch{unavailable('Local session verification response is malformed')} }
    if(response.statusCode===401 && exact(body,['valid']) && body.valid===false) return {valid:false}
    if(response.statusCode===503 && exact(body,['valid']) && body.valid===null) unavailable('Local session verification is unavailable',true)
    if(response.statusCode!==200 || !exact(body,['valid','data']) || body.valid!==true) unavailable('Local session verification was not authoritative')
    const data=body.data
    if(!exact(data,['user','currentRole','tenantId','orgId','capabilityNames','fresh','membershipVerified'])
      || !exact(data.user,['_id']) || data.user._id!==policy.userId
      || !exact(data.currentRole,['_id']) || data.currentRole._id!==policy.roleId
      || data.tenantId!==policy.tenantId || data.orgId!==policy.orgId || data.fresh!==true || data.membershipVerified!==true
      || !Array.isArray(data.capabilityNames) || data.capabilityNames.length!==0) unavailable('Local session verification identity or authority mismatch')
    // The server verified this exact submitted reference plus actual cookie binding.
    // Keep it only inside the auth adapter result; no cookie/storage/context injection.
    return {valid:true,data:{token:sessionRef,user:data.user,currentRole:data.currentRole,capabilityNames:[]}}
  }
}
