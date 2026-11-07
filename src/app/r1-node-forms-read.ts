import type { AuthSessionPort, TechnicianApiReadPort, FormDefinitionRead, WorkflowNodeRead } from '@shared/ports'
import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createR1ScopedFormReader } from '@adapters/api/r1-scoped-form-read'
import { formDefinition } from '@adapters/api/read-models/form'
import { workflowNode } from '@adapters/api/read-models/workflow'
import { evaluateNodeVisibility } from '@runtimes/workflow/policy'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { asOpaqueId } from '@shared/types'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { parseR1RepeatGrant } from './r1-repeat-authorization'

type Row = Record<string, unknown>
const deny = (): never => { throw Error('当前表单的身份、关联或完整性无法核实，请重新读取工单。') }
const row = (v: unknown): Row => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : deny()
const id = (v: unknown): string => typeof v === 'string' && v.trim() === v && v.length > 0 ? v : deny()

/** Explicit local read rollout, not a synthetic record/node adapter. Production stays closed. */
export function normalNodeFormsReadEnabled(env: Record<string, unknown>, origin: string): boolean {
  const readonlyMode = env.VITE_XLINK_ENABLE_REAL_WRITES === 'false' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'false'
  const scopedWriteMode = env.VITE_XLINK_R1_REPEAT_ACTIONS === 'true'
    && env.VITE_XLINK_ENABLE_REAL_WRITES === 'true' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'true'
    && parseR1RepeatGrant(env.VITE_XLINK_R1_REPEAT_GRANT)?.scope.tenantId === env.VITE_XLINK_AUTH_TENANT
  return env.DEV === true && env.VITE_XLINK_R1_NODE_FORM_READ === 'true'
    && env.VITE_XLINK_ENVIRONMENT === 'dev'
    && origin === 'http://127.0.0.1:5189'
    && env.VITE_XLINK_API_BASE_URL === `${origin}/xlink/wm`
    && (readonlyMode || scopedWriteMode)
    && env.VITE_XLINK_MOCK === 'false'
    && env.VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS !== 'true'
    && (env.VITE_XLINK_AUTH_API_BASE_URL === undefined || env.VITE_XLINK_AUTH_API_BASE_URL === '')
    && env.VITE_XLINK_H5_MOCK_E2E !== 'true'
}

export function createNormalNodeFormsReader(input: {
  readonly auth: Pick<AuthSessionPort, 'getCurrentSession'>
  readonly read: Pick<TechnicianApiReadPort, 'listWorkOrders' | 'isWorkOrderListedForCurrentSession' | 'getDynamicCodeOptions'>
  /** Same tenant used by this application's real login request. Never a route parameter. */
  readonly tenantId: string
  readonly env: Record<string, unknown>
  readonly origin: string
  readonly transport?: ApiReadTransport
}): R1NodeFormsReader {
  const transport = input.transport ?? createUniApiReadTransport({
    apiBaseUrl: String(input.env.VITE_XLINK_API_BASE_URL),
    getSessionRef: () => input.auth.getCurrentSession()?.sessionRef ?? null,
  })
  let generation = 0
  let current: { snapshot: R1NodeFormsSnapshot; fingerprint: string } | null = null
  const enabled = () => normalNodeFormsReadEnabled(input.env, input.origin)
  const fingerprint = () => {
    const a = input.auth.getCurrentSession()
    return enabled() && a ? sessionAuthorizationFingerprint({ sessionRef: a.sessionRef,
      userId: a.user.id, roleId: a.currentRole?.id, roleVersion: a.roleVersion }) : null
  }
  return {
    enabled,
    clear() { generation++; current = null },
    isCurrent(snapshot) { return current?.snapshot === snapshot && fingerprint() === current.fingerprint
      && input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId) === true },
    async load(workOrderId, runtimeNodeId) {
      const ticket = ++generation; current = null
      const actor = input.auth.getCurrentSession(), identity = fingerprint()
      if (!identity || !actor?.currentRole || !enabled()) return deny()
      id(workOrderId); id(runtimeNodeId); id(input.tenantId)
      const checkActor = () => { if (ticket !== generation || fingerprint() !== identity) deny() }
      // A cold route must rebuild authority through the normal role-scoped list.
      let total: number | undefined
      const listed = new Set<string>()
      if (input.read.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) {
        for (let page = 1; page <= 10; page++) {
          checkActor()
          const response = await input.read.listWorkOrders({ page, pageSize: 20 })
          checkActor()
          const d = response.data
          if (response.state !== 'succeeded' || !d) return deny()
          if (!Number.isSafeInteger(d.totalCount)
            || d.totalCount! < 0 || d.totalCount! > 200 || (total !== undefined && total !== d.totalCount)
            || (d.page !== undefined && d.page !== page) || d.items.length !== Math.min(20, Math.max(0, d.totalCount! - (page - 1) * 20))) deny()
          total = d.totalCount
          for (const item of d.items) { const key = id(item.id); if (listed.has(key)) deny(); listed.add(key) }
          if (listed.has(workOrderId) || listed.size === total) break
        }
      }
      const check = () => { checkActor(); if (input.read.isWorkOrderListedForCurrentSession?.(workOrderId) !== true) deny() }
      const execute = async (request: ApiReadRequest) => { check(); const raw = await transport.execute(request); check(); return raw }
      let rawFill: readonly string[] | undefined
      const readNode = async (): Promise<WorkflowNodeRead> => {
        const envelope = row(await execute({ method: 'POST', path: `basic/serviceAppointment/queryById/${encodeURIComponent(workOrderId)}`, body: {} }))
        if (envelope.success !== true || envelope.status !== 1) deny()
        const data = row(envelope.data), sa = row(data.serviceAppointment), wf = row(data.workflow)
        if (sa._id !== workOrderId || sa.tenantId !== input.tenantId || sa.state !== 1
          || wf._id !== id(sa.workflowId) || wf.tenantId !== input.tenantId || wf.formDataId !== workOrderId || wf.state !== 0
          || !Array.isArray(data.workflowNode)) deny()
        const nodes = (data.workflowNode as unknown[]).map(row)
        if (new Set(nodes.map(n => id(n._id))).size !== nodes.length) deny()
        const rawNode = nodes.find(n => n._id === runtimeNodeId)
        if (!rawNode) return deny()
        if (rawNode.tenantId !== input.tenantId || rawNode.workflowId !== wf._id
          || rawNode.workflowFormDataId !== workOrderId || rawNode.workflowFormColName !== 'serviceAppointment' || rawNode.state !== 0) deny()
        const def = row(rawNode.nodeDef)
        if (!['forms', 'repeat'].includes(String(def.nodeType)) || (rawNode.formDefId !== undefined && rawNode.formDefId !== def.formDefId)) deny()
        id(def.formDefId)
        const readonlyIds = rawNode.formFieldIdsReadOnly ?? def.formFieldIdsReadOnly
        const readonlyValid = Array.isArray(readonlyIds)
          && readonlyIds.every(v => typeof v === 'string' && v.length > 0 && v.trim() === v)
          && new Set(readonlyIds).size === readonlyIds.length
          && (rawNode.formFieldIdsReadOnly === undefined || def.formFieldIdsReadOnly === undefined
            || JSON.stringify(rawNode.formFieldIdsReadOnly) === JSON.stringify(def.formFieldIdsReadOnly))
        rawFill = readonlyValid && Array.isArray(def.formFieldIdsFill)
          && def.formFieldIdsFill.every(v => typeof v === 'string' && v.length > 0 && v.trim() === v)
          && new Set(def.formFieldIdsFill).size === def.formFieldIdsFill.length
          ? [...def.formFieldIdsFill] : undefined
        const node = workflowNode(rawNode)
        if (node.formDefinitionId !== def.formDefId || node.runId !== wf._id || node.nodeTypeEvidence !== 'runtime_node_def'
          || !evaluateNodeVisibility(node, { userId: actor.user.id, roleIds: [actor.currentRole!.id], organizationRoles: [] }).visible) deny()
        return node
      }
      const node = await readNode(), definitionId = id(node.formDefinitionId)
      const fillableFieldIds = rawFill
      const ext = row(await execute({ method: 'POST', path: 'biz/ext/queryById.do', body: { id: definitionId } }))
      if (ext._id !== definitionId || ext.tenantId !== input.tenantId || ext.state !== 1
        || !['0', '1'].includes(String(ext.type)) || typeof ext.colName !== 'string' || !ext.colName) deny()
      const fields: Row[] = []; let fieldTotal: number | undefined
      for (let page = 1; page <= 4; page++) {
        const raw = row(await execute({ method: 'POST', path: 'biz/extField/query', body: {
          extId: definitionId, 'is:state|integer#and': 1, sortField: 'order', sortOrder: 'asc', page, rows: 50 } }))
        if (!Number.isSafeInteger(raw.total) || (raw.total as number) < 1 || (raw.total as number) > 200
          || (fieldTotal !== undefined && fieldTotal !== raw.total) || raw.page !== page || raw.size !== 50 || !Array.isArray(raw.data)) deny()
        fieldTotal = raw.total as number
        if ((raw.data as unknown[]).length !== Math.min(50, fieldTotal - (page - 1) * 50)) deny()
        for (const f of (raw.data as unknown[]).map(row)) {
          if (f.extId !== definitionId || f.tenantId !== input.tenantId || f.state !== 1 || fields.some(x => x._id === f._id)) deny()
          id(f._id); fields.push(f)
        }
        if (fields.length === fieldTotal) break
      }
      if (fields.length !== fieldTotal) deny()
      const definition = formDefinition({ data: fields }, asOpaqueId<'FormDefinitionId'>(definitionId))
      const hydrated = []
      for (const f of definition.fields ?? []) {
        if (f.valueOption && ['radio', 'select', 'checkbox'].includes(f.type)) {
          check()
          const options = await input.read.getDynamicCodeOptions?.({ valueOption: f.valueOption })
          check()
          if (!options || options.state !== 'succeeded' || !options.data) return deny()
          if (!Array.isArray(options.data.items)
            || options.data.items.length > 100 || new Set(options.data.items.map(x => x.value)).size !== options.data.items.length) deny()
          hydrated.push({ ...f, options: options.data.items })
        } else hydrated.push(f)
      }
      const reader = createR1ScopedFormReader({ transport: { execute }, scope: {
        tenantId: input.tenantId, workOrderId, runtimeNodeId, workflowRunId: id(node.runId),
        formDefinitionId: definitionId, sourceNodeType: node.sourceNodeType as 'forms' | 'repeat',
      }, isCurrent: () => ticket === generation && fingerprint() === identity,
      ...(node.formList ? { formList: node.formList } : {}) })
      const discovered = await reader.discover()
      // List rows are discovery, not the detail read used to display a record.
      const records = []
      for (const r of discovered) records.push((await reader.select(String(r.data.id))).data)
      const after = await readNode()
      if (JSON.stringify(after) !== JSON.stringify(node) || JSON.stringify(rawFill) !== JSON.stringify(fillableFieldIds)) deny()
      check()
      const snapshot: R1NodeFormsSnapshot = { workOrderId, node, definition: { ...definition, fields: hydrated } as FormDefinitionRead, records,
        ...(fillableFieldIds ? { fillableFieldIds } : {}) }
      current = { snapshot, fingerprint: identity }
      return snapshot
    },
  }
}
