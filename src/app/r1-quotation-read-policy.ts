/** Read-provider rollout during readonly mode or one externally fenced local Order run.
 * This grants no command or Workflow permission. */
import type { SessionSnapshot } from '@shared/ports'
const scopeKeys = ['tenantId','userId','roleId','workOrderId','workflowRunId','runtimeNodeId','workflowDefinitionId'] as const
export interface NormalQuotationReadScope { readonly version: 1; readonly scope: Readonly<Record<typeof scopeKeys[number],string>>; readonly expiresAt: string }
export function parseNormalQuotationReadScope(raw: unknown, now=Date.now()): NormalQuotationReadScope | null {
  try { if(typeof raw!=='string'||raw.length>5000)return null;const g=JSON.parse(raw)
    if(!g||Object.keys(g).sort().join()!=='expiresAt,scope,version'||g.version!==1||!g.scope
      ||Object.keys(g.scope).sort().join()!==[...scopeKeys].sort().join()
      ||scopeKeys.some(k=>typeof g.scope[k]!=='string'||!g.scope[k]||g.scope[k].trim()!==g.scope[k]||!/^[A-Za-z0-9_-]+$/.test(g.scope[k]))
      ||typeof g.expiresAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(g.expiresAt)||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=now)return null
    return Object.freeze({...g,scope:Object.freeze({...g.scope})})
  }catch{return null}
}
export function normalQuotationReadEnabled(env:Record<string,unknown>,origin:string):boolean {
  const readonly=env.VITE_XLINK_ENABLE_REAL_WRITES==='false'&&env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES==='false'
  const fenced=env.VITE_XLINK_NORMAL_QUOTATION_RUN==='create-once'&&env.VITE_XLINK_ENABLE_REAL_WRITES==='true'
    &&env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES==='false'&&parseNormalQuotationReadScope(env.VITE_XLINK_NORMAL_QUOTATION_SCOPE)?.scope.tenantId===env.VITE_XLINK_AUTH_TENANT
  return env.DEV===true&&env.PROD!==true&&env.VITE_XLINK_R1_NODE_FORM_READ==='true'&&env.VITE_XLINK_ENVIRONMENT==='dev'
    &&origin==='http://127.0.0.1:5189'&&env.VITE_XLINK_API_BASE_URL===origin+'/xlink/wm'&&(readonly||fenced)
    &&env.VITE_XLINK_MOCK==='false'&&env.VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS!=='true'&&!env.VITE_XLINK_AUTH_API_BASE_URL&&env.VITE_XLINK_H5_MOCK_E2E!=='true'
    &&typeof env.VITE_XLINK_AUTH_TENANT==='string'&&env.VITE_XLINK_AUTH_TENANT.trim()===env.VITE_XLINK_AUTH_TENANT&&env.VITE_XLINK_AUTH_TENANT.length>0
}
export function normalQuotationScopeMatches(env:Record<string,unknown>,session:SessionSnapshot|null|undefined,workOrderId:string,nodeId?:string,runId?:string,definitionId?:string):boolean {
  if(env.VITE_XLINK_ENABLE_REAL_WRITES==='false'&&env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES==='false')return true
  const g=parseNormalQuotationReadScope(env.VITE_XLINK_NORMAL_QUOTATION_SCOPE)?.scope
  return Boolean(g&&session&&g.tenantId===env.VITE_XLINK_AUTH_TENANT&&g.userId===session.user.id&&g.roleId===session.currentRole?.id&&g.workOrderId===workOrderId
    &&(!nodeId||g.runtimeNodeId===nodeId)&&(!runId||g.workflowRunId===runId)&&(!definitionId||g.workflowDefinitionId===definitionId))
}
