/** Local read-only rollout of R1's context-backed quotation parts dictionary. */
import type { AuthSessionPort, TechnicianApiReadPort } from '@shared/ports'
import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { cascadeCodeOptions } from '@adapters/api/read-models/code-options'
import { workflowNode } from '@adapters/api/read-models/workflow'
import { evaluateNodeVisibility } from '@runtimes/workflow/policy'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { createOperationError } from '@shared/types'
import type { LocalQuotationRepairPartsReader } from '@features/work-orders/quotation/repair-parts-provider'
import { normalQuotationReadEnabled, normalQuotationScopeMatches } from './r1-quotation-read-policy'

type Row = Record<string, unknown>
const deny = (): never => { throw Error('Quotation parts context is not verified') }
const row = (v: unknown): Row => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : deny()
const id = (v: unknown): string => typeof v === 'string' && v.length > 0 && v.trim() === v ? v : deny()

export function createNormalQuotationPartsReader(input: {
  readonly auth: Pick<AuthSessionPort, 'getCurrentSession'>
  readonly read: Pick<TechnicianApiReadPort, 'listWorkOrders' | 'isWorkOrderListedForCurrentSession'>
  readonly env: Record<string, unknown>
  readonly origin: string
  readonly transport?: ApiReadTransport
}): LocalQuotationRepairPartsReader {
  const enabled = () => normalQuotationReadEnabled(input.env, input.origin)
  const transport = input.transport ?? createUniApiReadTransport({
    apiBaseUrl: String(input.env.VITE_XLINK_API_BASE_URL),
    getSessionRef: () => input.auth.getCurrentSession()?.sessionRef ?? null,
  })
  const fingerprint = () => {
    const session = input.auth.getCurrentSession()
    return enabled() && session ? sessionAuthorizationFingerprint({ sessionRef: session.sessionRef,
      userId: session.user.id, roleId: session.currentRole?.id, roleVersion: session.roleVersion }) : null
  }
  return async (detail, workflowNodeId) => {
    const context = detail.quotationCatalogContext
    // R1 placeOrders.vue orderRepairPartsClick selects options.parts for serviceType 11/12.
    // This rollout is limited to the verified 11/4 context; other contexts retain their provider.
    if (!enabled() || context?.serviceType !== '11' || context.sourceType !== '4') return null
    // Once this context is owned, any missing/revoked evidence is an error, never repairParts fallback.
    const failed = () => ({ state: 'failed_terminal' as const,
      error: createOperationError('authorization_denied', '报价维修部位来源或当前节点权限未核对，请重新读取工单。') })
    try {
      const workOrderId = id(detail.id), nodeId = id(workflowNodeId), tenantId = id(input.env.VITE_XLINK_AUTH_TENANT)
      if (context.workOrderId !== workOrderId) deny()
      const actor = input.auth.getCurrentSession(), identity = fingerprint()
      if (!actor?.currentRole || !identity) return failed()
      const checkActor = () => { if (fingerprint() !== identity || input.env.VITE_XLINK_AUTH_TENANT !== tenantId
        || !normalQuotationScopeMatches(input.env, input.auth.getCurrentSession(), workOrderId, nodeId)) deny() }
      if (input.read.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) {
        let total: number | undefined
        const listed = new Set<string>()
        for (let page = 1; page <= 10; page++) {
          checkActor()
          const response = await input.read.listWorkOrders({ page, pageSize: 20 })
          checkActor()
          const d = response.data
          if (response.state !== 'succeeded' || !d) return failed()
          if (!Number.isSafeInteger(d.totalCount) || d.totalCount! < 0 || d.totalCount! > 200
            || (total !== undefined && total !== d.totalCount) || (d.page !== undefined && d.page !== page)
            || d.items.length !== Math.min(20, Math.max(0, d.totalCount! - (page - 1) * 20))) deny()
          total = d.totalCount
          for (const item of d.items) { const key = id(item.id); if (listed.has(key)) deny(); listed.add(key) }
          if (listed.has(workOrderId) || listed.size === total) break
        }
      }
      const check = () => { checkActor(); if (input.read.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) deny() }
      const execute = async (request: ApiReadRequest) => { check(); const raw = await transport.execute(request); check(); return raw }
      const readNode = async () => {
        const envelope = row(await execute({ method: 'POST', path: `basic/serviceAppointment/queryById/${encodeURIComponent(workOrderId)}`, body: {} }))
        if (envelope.success !== true || envelope.status !== 1) deny()
        const data = row(envelope.data), sa = row(data.serviceAppointment), wf = row(data.workflow)
        if (sa._id !== workOrderId || sa.tenantId !== tenantId || sa.state !== 1
          || sa.serviceType !== '11' || row(sa.exts).sourceType !== '4'
          || wf._id !== id(sa.workflowId) || wf.tenantId !== tenantId || wf.formDataId !== workOrderId || wf.state !== 0
          || !Array.isArray(data.workflowNode)) deny()
        if (!normalQuotationScopeMatches(input.env, input.auth.getCurrentSession(), workOrderId, nodeId, String(wf._id), String(wf.defId))) deny()
        const nodes = (data.workflowNode as unknown[]).map(row)
        if (new Set(nodes.map(n => id(n._id))).size !== nodes.length) deny()
        const raw = nodes.find(n => n._id === nodeId)
        if (!raw || raw.tenantId !== tenantId || raw.workflowId !== wf._id
          || raw.workflowFormDataId !== workOrderId || raw.workflowFormColName !== 'serviceAppointment'
          || raw.state !== 0 || row(raw.nodeDef).nodeType !== 'placeOrder') return deny()
        const node = workflowNode(raw)
        if (node.runId !== wf._id || node.nodeTypeEvidence !== 'runtime_node_def'
          || !evaluateNodeVisibility(node, { userId: actor.user.id, roleIds: [actor.currentRole!.id], organizationRoles: [] }).visible) deny()
        return JSON.stringify(node)
      }
      const before = await readNode()
      const raw = await execute({ method: 'POST', path: 'i/code/selectMultistageCode.do', body: { types: 'parts', tenantId } })
      if (!Array.isArray(raw) || raw.length !== 1 || row(raw[0]).type !== 'parts') deny()
      // Validate the full tree before normalization; never silently discard invalid branches.
      let count = 0
      const validate = (values: unknown, depth: number): void => {
        if (!Array.isArray(values) || depth > 20) deny()
        const seen = new Set<string>()
        for (const value of values as unknown[]) {
          const n = row(value), key = id(n.value)
          if (++count > 5000 || seen.has(key)) deny()
          seen.add(key); id(n.name ?? n.label)
          if (n.children !== undefined) validate(n.children, depth + 1)
        }
      }
      validate(row((raw as unknown[])[0]).children, 0)
      if (count === 0) deny()
      const data = cascadeCodeOptions(raw, 'parts')
      if (await readNode() !== before) deny()
      check()
      return { state: 'succeeded', data }
    } catch { return failed() }
  }
}
