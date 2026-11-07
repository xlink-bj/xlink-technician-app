/** Exact local normal-order read experiment. No signing, command, or global auth grant. */
import type { AuthSessionPort, TechnicianApiReadPort } from '@shared/ports'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { localSessionAuthorityIdentity } from '@adapters/auth/local-session-authority'
import { createUniAuthBackendDriver, type UniRequestExecutor } from '@adapters/auth/uni-auth-backend'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'
import { asRecord } from '@adapters/common/records'
import { AdapterMappingError } from '@adapters/common/operations'
import { localSessionAuthorityPolicy } from './local-session-authority'

export const localSigningReadScope = Object.freeze({ ...localSessionAuthorityIdentity,
  workOrderId: '8807110700000003003', orderId: '6394054458844070688',
  workflowRunId: '3029534988360106939', runtimeNodeId: '1293980233076948777' })
const scope = localSigningReadScope
const deny = (): never => { throw new AdapterMappingError('当前订单只读身份或关联无法核实，请重新读取工单。') }
const record = (value: unknown) => asRecord(value, 'local signing read')
const orderBody = { page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
  'is:serviceAppointmentId|string#and': scope.workOrderId, 'is:type|integer#and': 1 }
const contractBody = { page: 1, rows: 3, sortField: 'createTime', sortOrder: 'desc',
  'is:serviceAppointmentId|string#and': scope.workOrderId,
  'is:state|integer#or': '1', 'is:exts.contractStatus|string#or': '-2' }
function exactBody(actual: unknown, expected: Record<string, unknown>): boolean {
  const a = record(actual)
  return Object.keys(a).length === Object.keys(expected).length && Object.entries(expected).every(([k,v]) => a[k] === v)
}

export function createLocalSigningReadAuthority(input: {
  readonly auth: Pick<AuthSessionPort, 'getCurrentSession'>
  readonly read: Pick<TechnicianApiReadPort, 'listWorkOrders' | 'isWorkOrderListedForCurrentSession'>
  readonly env?: Record<string, unknown>
  readonly origin?: string
  readonly transport?: ApiReadTransport
  readonly request?: UniRequestExecutor
}) {
  const env = input.env ?? import.meta.env
  const origin = input.origin ?? (typeof window === 'undefined' ? '' : window.location.origin)
  const enabled = () => Boolean(env.PROD !== true && env.VITE_XLINK_LOCAL_SIGNING_READ === 'normal-order-readonly-v1'
    && env.VITE_XLINK_LOCAL_SESSION_RESTORE === 'natural-readonly-v1'
    && env.VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS !== 'true' && env.VITE_XLINK_H5_MOCK_E2E !== 'true'
    && localSessionAuthorityPolicy(env, origin))
  const currentKey = (): string | null => {
    const actor = input.auth.getCurrentSession()
    if (!enabled() || !actor || actor.user.id !== scope.userId || actor.currentRole?.id !== scope.roleId) return null
    const key = sessionAuthorizationFingerprint({ sessionRef: actor.sessionRef, userId: actor.user.id,
      roleId: actor.currentRole.id, roleVersion: actor.roleVersion })
    return key ? JSON.stringify([key, scope]) : null
  }
  const request = input.request
  const transport = input.transport ?? createUniApiReadTransport({ apiBaseUrl: String(env.VITE_XLINK_API_BASE_URL),
    getSessionRef: () => input.auth.getCurrentSession()?.sessionRef ?? null, request })
  let generation = 0
  let prepared: { key: string; ticket: number; detail: string } | null = null
  let verifiedOrder: string | null = null
  const listed = () => input.read.isWorkOrderListedForCurrentSession?.(scope.workOrderId) === true
  const check = (key: string, ticket: number, requireList = true) => {
    if (ticket !== generation || currentKey() !== key || (requireList && !listed())) deny()
  }
  const fresh = async (key: string, ticket: number, requireList = true) => {
    check(key, ticket, requireList)
    const policy = localSessionAuthorityPolicy(env, origin), actor = input.auth.getCurrentSession()
    if (!policy || !actor) return deny()
    const result = record(await createUniAuthBackendDriver({ apiBaseUrl: String(env.VITE_XLINK_API_BASE_URL), localSessionAuthority: policy, request }).restore(actor.sessionRef))
    if (result.valid !== true) deny()
    check(key, ticket, requireList)
  }
  const detail = async (key: string, ticket: number): Promise<string> => {
    await fresh(key, ticket)
    const envelope = record(await transport.execute({ method: 'POST',
      path: `basic/serviceAppointment/queryById/${scope.workOrderId}`, body: {} }))
    await fresh(key, ticket)
    if (envelope.success !== true || envelope.status !== 1) deny()
    const d = record(envelope.data), sa = record(d.serviceAppointment), wf = record(d.workflow), exts = record(sa.exts)
    if (sa._id !== scope.workOrderId || sa.tenantId !== scope.tenantId || sa.orgId !== scope.orgId
      || sa.state !== 1 || sa.serviceType !== '11' || exts.sourceType !== '4'
      || (exts.scheduleFlag !== undefined && exts.scheduleFlag !== null && exts.scheduleFlag !== '')
      || sa.workflowId !== scope.workflowRunId || wf._id !== scope.workflowRunId || wf.tenantId !== scope.tenantId
      || wf.formDataId !== scope.workOrderId || wf.state !== 0 || !Array.isArray(d.workflowNode)) return deny()
    const nodes = (d.workflowNode as unknown[]).map(record)
    if (new Set(nodes.map(n => n._id)).size !== nodes.length) deny()
    const n = nodes.find(n => n._id === scope.runtimeNodeId)
    if (!n || n.tenantId !== scope.tenantId || n.orgId !== scope.orgId || n.workflowId !== scope.workflowRunId
      || n.workflowFormDataId !== scope.workOrderId || n.workflowFormColName !== 'serviceAppointment'
      || n.state !== 0 || record(n.nodeDef).nodeType !== 'placeOrder'
      || !Array.isArray(n.handlerIds) || !n.handlerIds.every(v => typeof v === 'string' && v.trim() === v && v.length > 0)
      || !n.handlerIds.some(v => v === scope.userId || v === scope.roleId || v === `${scope.orgId}+${scope.roleId}`)) return deny()
    // Local backend read increments only this top-level revision. It is not
    // authority; retain every other source field in the race comparison.
    const stableSa = Object.fromEntries(Object.entries(sa).filter(([name]) => name !== '_version'))
    return JSON.stringify([stableSa, wf, nodes])
  }
  const allowed = (sid: string) => Boolean(sid === scope.workOrderId && prepared && prepared.ticket === generation
    && prepared.key === currentKey() && listed())
  const guarded: ApiReadTransport = { async execute(query: ApiReadRequest) {
    const p = prepared
    try {
      if (!p || !allowed(scope.workOrderId) || query.method !== 'POST' || query.query !== undefined
        || Object.keys(query).some(k => !['method','path','body'].includes(k))) return deny()
      const isOrder = query.path === 'basic/order/query'
      if (!isOrder && query.path !== 'basic/contract/query.do') return deny()
      if (!exactBody(query.body, isOrder ? orderBody : contractBody) || (!isOrder && verifiedOrder !== p.key)) return deny()
      if (await detail(p.key, p.ticket) !== p.detail) return deny()
      const raw = await transport.execute(isOrder ? query : { ...query, body: { ...contractBody,
        'is:orderId|string#and': scope.orderId, 'is:orgId|string#and': scope.orgId } })
      if (await detail(p.key, p.ticket) !== p.detail) return deny()
      const envelope = record(raw)
      // Source FlipPageInfo shape, no permissive aliases or inferred empty rows.
      if (!Array.isArray(envelope.data) || envelope.data.length > 3 || envelope.page !== 1
        || envelope.size !== 3 || !Number.isSafeInteger(envelope.total) || Number(envelope.total) < envelope.data.length
        || (!isOrder && Number(envelope.total) > 3)) return deny()
      const rows = (envelope.data as unknown[]).map(record)
      if (new Set(rows.map(r => r._id)).size !== rows.length) deny()
      for (const r of rows) {
        if (typeof r._id !== 'string' || !r._id || (r.id !== undefined && r.id !== r._id)
          || r.tenantId !== scope.tenantId || r.orgId !== scope.orgId || r.serviceAppointmentId !== scope.workOrderId
          || (isOrder ? r.type !== 1 || ![0,1].includes(Number(r.state)) || typeof r.state !== 'number'
            : r.orderId !== scope.orderId)) deny()
      }
      if (isOrder) verifiedOrder = rows.filter(r => r._id === scope.orderId).length === 1 ? p.key : null
      check(p.key, p.ticket)
      return raw
    } catch (error) {
      // A superseded request must never revoke a newer prepared generation.
      if (p && p.ticket === generation && prepared === p) {
        prepared = null; verifiedOrder = null
      }
      throw error
    }
  } }
  return {
    enabled, currentKey,
    isContractReadAllowed: allowed,
    port: createQuotationOrderReadAdapter(guarded, allowed, currentKey, allowed),
    async prepare(sid: string, orderId: string): Promise<void> {
      const ticket = ++generation; prepared = null; verifiedOrder = null
      const key = currentKey()
      if (!key || sid !== scope.workOrderId || orderId !== scope.orderId) return deny()
      await fresh(key, ticket, false)
      if (!listed()) {
        let total: number | undefined
        const seen = new Set<string>()
        for (let page = 1; page <= 10; page++) {
          check(key, ticket, false)
          const result = await input.read.listWorkOrders({ page, pageSize: 20 })
          check(key, ticket, false)
          const d = result.data
          if (result.state !== 'succeeded' || !d || !Number.isSafeInteger(d.totalCount) || d.totalCount! < 0
            || d.totalCount! > 200 || (total !== undefined && total !== d.totalCount)
            || (d.page !== undefined && d.page !== page)
            || d.items.length !== Math.min(20, Math.max(0, d.totalCount! - (page - 1) * 20))) return deny()
          total = d.totalCount
          for (const item of d.items) { if (!item.id || seen.has(item.id)) deny(); seen.add(item.id) }
          if (seen.has(sid) || seen.size === total) break
        }
        if (!seen.has(sid)) return deny()
      }
      const snapshot = await detail(key, ticket)
      check(key, ticket)
      prepared = { key, ticket, detail: snapshot }
    },
  }
}
