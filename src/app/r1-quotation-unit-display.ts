/** Display-only company labels. This provider never changes wire unit codes or grants commands. */
import { shallowRef } from 'vue'
import type { AuthSessionPort, TechnicianApiReadPort } from '@shared/ports'
import type { ApiReadTransport } from '@adapters/api/technician-api'
import { workflowNode } from '@adapters/api/read-models/workflow'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import type { LocalUnitDisplay } from '@features/work-orders/quotation/local-unit-display'
import { companyUnitLabels } from '@features/work-orders/quotation/company-unit-labels'
import { createNormalQuotationPartsReader } from './r1-quotation-parts-read'
import { normalQuotationReadEnabled, normalQuotationScopeMatches } from './r1-quotation-read-policy'

type Row = Record<string, unknown>
const row = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Missing unit display context')
  return value as Row
}

/** Compare authority, not read-time audit fields (R1 increments SA._version on reads).
 * The parts reader still independently validates the complete raw association. */
function authoritySnapshot(raw: unknown, nodeId: string): string {
  const data = row(row(raw).data), sa = row(data.serviceAppointment), wf = row(data.workflow)
  if (!Array.isArray(data.workflowNode)) throw Error('Missing unit display nodes')
  const candidates = data.workflowNode.map(row).filter(node => node._id === nodeId)
  if (candidates.length !== 1) throw Error('Ambiguous unit display node')
  const node = candidates[0]!, mapped = workflowNode(node)
  return JSON.stringify({
    appointment: [sa._id, sa.tenantId, sa.orgId, sa.state, sa.serviceType, row(sa.exts).sourceType, sa.workflowId],
    workflow: [wf._id, wf.tenantId, wf.orgId, wf.formDataId, wf.defId, wf.state],
    nodeScope: [node._id, node.tenantId, node.orgId, node.workflowId, node.workflowFormDataId,
      node.workflowFormColName, node.state, row(node.nodeDef)._id],
    nodeAuthority: [mapped.definitionId, mapped.runId, mapped.parentNodeId, mapped.sourceNodeType,
      mapped.nodeTypeEvidence, mapped.category, mapped.lifecycle, mapped.handlers, mapped.visibility,
      mapped.isSystem, mapped.isSentinel, mapped.formDefinitionId],
  })
}

export function createNormalQuotationUnitDisplay(input: {
  readonly auth: Pick<AuthSessionPort, 'getCurrentSession'>
  readonly read: Pick<TechnicianApiReadPort, 'listWorkOrders' | 'isWorkOrderListedForCurrentSession' | 'getWorkOrderDetail'>
  readonly env: Record<string, unknown>
  readonly origin: string
  readonly transport?: ApiReadTransport
}): LocalUnitDisplay {
  const transport = input.transport ?? createUniApiReadTransport({
    apiBaseUrl: String(input.env.VITE_XLINK_API_BASE_URL),
    getSessionRef: () => input.auth.getCurrentSession()?.sessionRef ?? null,
  })
  const labels = shallowRef<ReadonlyMap<string, string> | null>(null)
  let loadedIdentity: string | null = null
  let generation = 0
  let pending: { identity: string; promise: Promise<boolean> } | null = null
  const identity = (workOrderId: string): string | null => {
    const session = input.auth.getCurrentSession()
    if (!normalQuotationReadEnabled(input.env, input.origin) || !session
      || !workOrderId || workOrderId.trim() !== workOrderId
      || input.read.isWorkOrderListedForCurrentSession?.(workOrderId) !== true
      || !normalQuotationScopeMatches(input.env, session, workOrderId)) return null
    const actor = sessionAuthorizationFingerprint({ sessionRef: session.sessionRef,
      userId: session.user.id, roleId: session.currentRole?.id, roleVersion: session.roleVersion })
    return actor ? JSON.stringify([actor, workOrderId, input.env.VITE_XLINK_AUTH_TENANT,
      input.env.VITE_XLINK_NORMAL_QUOTATION_SCOPE ?? null]) : null
  }
  const clear = () => { generation++; labels.value = null; loadedIdentity = null; pending = null }
  const verified = (workOrderId: string) => {
    const current = identity(workOrderId)
    if (!current || loadedIdentity && current !== loadedIdentity) { clear(); return false }
    return Boolean(labels.value && current === loadedIdentity)
  }
  return {
    isVerifiedScope: verified,
    displayLabel(workOrderId, wireUnit) {
      // Installing this provider must not change Production/Mock/disabled UI.
      if (!normalQuotationReadEnabled(input.env, input.origin)) { clear(); return wireUnit ?? '' }
      return verified(workOrderId) && wireUnit ? labels.value?.get(wireUnit) ?? '未核对' : '未核对'
    },
    load(workOrderId) {
      const startIdentity = identity(workOrderId)
      if (!startIdentity) { clear(); return Promise.resolve(false) }
      if (pending?.identity === startIdentity) return pending.promise
      clear()
      const requestGeneration = generation
      const current = () => generation === requestGeneration && identity(workOrderId) === startIdentity
      const check = () => { if (!current()) throw Error('Unit display scope revoked') }
      let contextSnapshot: string | undefined
      let selectedNodeId: string | undefined
      const guardedTransport: ApiReadTransport = { async execute(request) {
        check(); const result = await transport.execute(request); check()
        if (request.path.startsWith('basic/serviceAppointment/queryById/')) {
          if (!selectedNodeId) throw Error('Missing selected unit display node')
          const snapshot = authoritySnapshot(result, selectedNodeId)
          if (contextSnapshot !== undefined && snapshot !== contextSnapshot) throw Error('Unit display context changed')
          contextSnapshot = snapshot
        }
        return result
      } }
      const readParts = createNormalQuotationPartsReader({ ...input, transport: guardedTransport })
      const promise = (async () => {
        try {
          check()
          const result = await input.read.getWorkOrderDetail(workOrderId as Parameters<TechnicianApiReadPort['getWorkOrderDetail']>[0])
          check()
          const detail = result.data
          if (result.state !== 'succeeded' || !detail || detail.id !== workOrderId) return false
          const nodes = detail.workflowNodes?.filter(node => node.category === 'placeOrder' && node.lifecycle === 'active') ?? []
          if (nodes.length !== 1) return false
          const nodeId = String(nodes[0]!.id)
          selectedNodeId = nodeId
          // Reuse the actual provider's full raw current-node/list/actor validation.
          if ((await readParts(detail, nodeId))?.state !== 'succeeded') return false
          check()
          const raw = await guardedTransport.execute({ method: 'POST', path: 'i/code/selectCode.do', body: {
            jsonPara: JSON.stringify([{ codeId: 'company', eleid: 'company' }]),
            tenantId: String(input.env.VITE_XLINK_AUTH_TENANT),
          } })
          // R1 may return a JSON text response; never recursively unwrap invented envelopes.
          const mapped = companyUnitLabels(typeof raw === 'string' ? JSON.parse(raw) : raw)
          if (!mapped || (await readParts(detail, nodeId))?.state !== 'succeeded') return false
          check()
          labels.value = mapped; loadedIdentity = startIdentity
          return true
        } catch { return false }
        finally { if (generation === requestGeneration) pending = null }
      })()
      pending = { identity: startIdentity, promise }
      return promise
    },
  }
}
