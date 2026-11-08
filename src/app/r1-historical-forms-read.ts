import type { AuthSessionPort, TechnicianApiReadPort, FormDefinitionRead } from '@shared/ports'
import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createR1ScopedFormReader } from '@adapters/api/r1-scoped-form-read'
import { createSurveyReadOnlyMediaCodec } from '@adapters/api/survey-readonly-media-codec'
import { formDefinition } from '@adapters/api/read-models/form'
import { bindR1ScopedFieldOptions, readR1ScopedFieldOptions } from '@adapters/api/r1-scoped-field-options'
import { ACTION_FORM_SURFACE, actionFormSchemaFor } from '@features/work-orders/action-form-schema'
import { isFieldApplicable } from '@runtimes/dynamic-form'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { asOpaqueId } from '@shared/types'
import type { HistoricalFormsReader, HistoricalFormRead, HistoricalFormTarget } from '@features/work-orders/r1-historical-forms-read'
import { normalNodeFormsReadEnabled } from './r1-node-forms-read'
import { historicalTargets, historyDenied as deny, historyId as id, historyRow as row } from './r1-historical-forms-policy'

/** Independent read-only history rollout. No mutation originals, grant, draft,
 * receipt, action policy, or terminal verification lease is exposed. */
export function createHistoricalFormsReader(input: {
  readonly auth: Pick<AuthSessionPort, 'getCurrentSession'>
  readonly read: Pick<TechnicianApiReadPort, 'listWorkOrders' | 'isWorkOrderListedForCurrentSession'>
  readonly tenantId: string
  readonly env: Record<string, unknown>
  readonly origin: string
  readonly transport?: ApiReadTransport
}): HistoricalFormsReader {
  const transport = input.transport ?? createUniApiReadTransport({ apiBaseUrl: String(input.env.VITE_XLINK_API_BASE_URL),
    getSessionRef: () => input.auth.getCurrentSession()?.sessionRef ?? null })
  const enabled = () => normalNodeFormsReadEnabled(input.env, input.origin)
    && input.env.VITE_XLINK_ENABLE_REAL_WRITES === 'false' && input.env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'false'
  const fingerprint = () => {
    const actor = input.auth.getCurrentSession()
    return enabled() && actor?.currentRole ? sessionAuthorizationFingerprint({ sessionRef: actor.sessionRef,
      userId: actor.user.id, roleId: actor.currentRole.id, roleVersion: actor.roleVersion }) : null
  }
  let generation = 0
  let lease: { generation: number; identity: string; workOrderId: string; targets: readonly HistoricalFormTarget[];
    bindings: ReadonlyMap<HistoricalFormTarget, string> } | null = null
  const results = new WeakSet<object>()
  const current = (value: HistoricalFormTarget | HistoricalFormRead) => {
    const target = value.kind === 'historical-form-read' ? value.target : value
    return Boolean(lease && lease.generation === generation && fingerprint() === lease.identity
      && input.read.isWorkOrderListedForCurrentSession?.(lease.workOrderId) === true
      && lease.targets.includes(target) && (value.kind !== 'historical-form-read' || results.has(value)))
  }
  const detailRequest = (workOrderId: string): ApiReadRequest => ({ method: 'POST',
    path: `basic/serviceAppointment/queryById/${encodeURIComponent(workOrderId)}`, body: {} })
  return {
    enabled, isCurrent: current,
    clear() { generation++; lease = null },
    async discover(workOrderId) {
      const ticket = ++generation; lease = null
      id(workOrderId); id(input.tenantId)
      const actor = input.auth.getCurrentSession(), identity = fingerprint()
      if (!identity || !actor?.currentRole) return deny()
      const check = () => { if (generation !== ticket || fingerprint() !== identity) deny() }
      if (input.read.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) {
        let total: number | undefined
        const seen = new Set<string>()
        for (let page = 1; page <= 10; page++) {
          check(); const response = await input.read.listWorkOrders({ page, pageSize: 20, category: 'all' }); check()
          const d = response.data
          if (response.state !== 'succeeded' || !d || !Number.isSafeInteger(d.totalCount) || d.totalCount! < 0 || d.totalCount! > 200
            || total !== undefined && d.totalCount !== total || d.page !== undefined && d.page !== page
            || d.items.length !== Math.min(20, Math.max(0, d.totalCount! - (page - 1) * 20))) return deny()
          total = d.totalCount
          for (const item of d.items) { const key = id(item.id); if (seen.has(key)) return deny(); seen.add(key) }
          if (seen.has(workOrderId) || seen.size === total) break
        }
      }
      check()
      if (input.read.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) return deny()
      const raw = await transport.execute(detailRequest(workOrderId)); check()
      if (input.read.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) return deny()
      const found = historicalTargets(raw, { tenantId: input.tenantId, workOrderId, userId: String(actor.user.id), roleId: String(actor.currentRole.id) })
      lease = { generation: ticket, identity, workOrderId, ...found }
      return found.targets
    },
    async read(target) {
      if (!current(target) || !lease) return deny()
      const savedLease = lease, actor = input.auth.getCurrentSession()!
      const check = () => { if (lease !== savedLease || !current(target)) deny() }
      const execute = async (request: ApiReadRequest) => { check(); const raw = await transport.execute(request); check(); return raw }
      const verify = async () => {
        const fresh = historicalTargets(await execute(detailRequest(target.workOrderId)), { tenantId: input.tenantId,
          workOrderId: target.workOrderId, userId: String(actor.user.id), roleId: String(actor.currentRole!.id) })
        const match = fresh.targets.find(t => t.runtimeNodeId === target.runtimeNodeId && t.recordId === target.recordId
          && t.formDefinitionId === target.formDefinitionId && t.workflowRunId === target.workflowRunId)
        if (!match || fresh.bindings.get(match) !== savedLease.bindings.get(target)) return deny()
      }
      try {
        await verify()
        const ext = row(await execute({ method: 'POST', path: 'biz/ext/queryById.do', body: { id: target.formDefinitionId } }))
        if (ext._id !== target.formDefinitionId || ext.tenantId !== input.tenantId || ext.state !== 1
          || !['0', '1'].includes(String(ext.type)) || typeof ext.colName !== 'string' || !ext.colName) return deny()
        const fields: Record<string, unknown>[] = []; let total: number | undefined
        for (let page = 1; page <= 4; page++) {
          const raw = row(await execute({ method: 'POST', path: 'biz/extField/query', body: {
            extId: target.formDefinitionId, 'is:state|integer#and': 1, sortField: 'order', sortOrder: 'asc', page, rows: 50 } }))
          if (!Number.isSafeInteger(raw.total) || (raw.total as number) < 1 || (raw.total as number) > 200
            || total !== undefined && raw.total !== total || raw.page !== page || raw.size !== 50 || !Array.isArray(raw.data)
            || raw.data.length !== Math.min(50, (raw.total as number) - (page - 1) * 50)) return deny()
          total = raw.total as number
          for (const value of raw.data) {
            const f = row(value)
            if (f.extId !== target.formDefinitionId || f.tenantId !== input.tenantId || f.state !== 1 || fields.some(x => x._id === f._id)) return deny()
            id(f._id); fields.push(f)
          }
          if (fields.length === total) break
        }
        if (fields.length !== total) return deny()
        const definition = formDefinition({ data: fields }, asOpaqueId<'FormDefinitionId'>(target.formDefinitionId))
        const hydrated = []
        // Validate all bindings before sending any provider request.
        const bindings = (definition.fields ?? []).map(field => isFieldApplicable(actionFormSchemaFor(field), ACTION_FORM_SURFACE)
          ? bindR1ScopedFieldOptions({ rawField: fields.find(f => f._id === field.fieldId), field,
            tenantId: input.tenantId, definitionId: target.formDefinitionId }) : null)
        for (const [index, field] of (definition.fields ?? []).entries()) {
          const binding = bindings[index]
          hydrated.push(binding ? { ...field, options: await readR1ScopedFieldOptions(binding, { execute }) } : field)
        }
        const reader = createR1ScopedFormReader({ transport: { execute }, readOnlySurveyMedia: createSurveyReadOnlyMediaCodec(definition, ext.colName, fields), isCurrent: () => { check(); return true },
          scope: { tenantId: input.tenantId, workOrderId: target.workOrderId, runtimeNodeId: target.runtimeNodeId,
            workflowRunId: target.workflowRunId, formDefinitionId: target.formDefinitionId, sourceNodeType: 'forms' },
          formList: { source: 'exts.formList', evidence: 'available', truncated: false, entries: [{
            id: asOpaqueId<'FormDataId'>(target.recordId), formDefinitionId: asOpaqueId<'FormDefinitionId'>(target.formDefinitionId), state: 'active' }] } })
        await reader.discover()
        const selected = await reader.select(target.recordId)
        await verify(); check()
        const result: HistoricalFormRead = Object.freeze({ kind: 'historical-form-read', target,
          definition: { ...definition, fields: hydrated } as FormDefinitionRead, record: selected.data })
        results.add(result)
        return result
      } catch (error) { if (lease === savedLease) { generation++; lease = null } throw error }
    },
  }
}
