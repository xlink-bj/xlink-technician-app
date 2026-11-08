import type { AuthSessionPort, TechnicianApiReadPort, FormDefinitionRead, WorkflowNodeRead } from '@shared/ports'
import type { ApiReadRequest, ApiReadTransport } from '@adapters/api/technician-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createR1ScopedFormReader } from '@adapters/api/r1-scoped-form-read'
import { createSurveyReadOnlyMediaCodec } from '@adapters/api/survey-readonly-media-codec'
import { bindR1ScopedFieldOptions, readR1ScopedFieldOptions } from '@adapters/api/r1-scoped-field-options'
import { formDefinition } from '@adapters/api/read-models/form'
import { workflowNode } from '@adapters/api/read-models/workflow'
import { evaluateNodeVisibility } from '@runtimes/workflow/policy'
import { isFieldApplicable } from '@runtimes/dynamic-form'
import { ACTION_FORM_SURFACE, actionFormSchemaFor } from '@features/work-orders/action-form-schema'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { asOpaqueId } from '@shared/types'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { parseR1RepeatGrant } from './r1-repeat-authorization'
import { parseR1FormsGrant } from './r1-forms-authorization'

type Row = Record<string, unknown>
const deny = (): never => { throw Error('当前表单的身份、关联或完整性无法核实，请重新读取工单。') }
const row = (v: unknown): Row => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : deny()
const id = (v: unknown): string => typeof v === 'string' && v.trim() === v && v.length > 0 ? v : deny()
// Keep complete EXTS transient. The display projection deliberately drops
// unknown keys, so comparing that projection cannot establish read stability.
function formsExtsJson(value: unknown): string {
  const validate = (v: unknown): void => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return
    if (typeof v === 'number' && Number.isFinite(v)) return
    if (Array.isArray(v)) { for (const item of v) validate(item); return }
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      for (const item of Object.values(v)) validate(item)
      return
    }
    deny()
  }
  row(value); validate(value)
  return JSON.stringify(value)
}

/** Explicit local read rollout, not a synthetic record/node adapter. Production stays closed. */
export function normalNodeFormsReadEnabled(env: Record<string, unknown>, origin: string): boolean {
  const readonlyMode = env.VITE_XLINK_ENABLE_REAL_WRITES === 'false' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'false'
  const scopedWriteMode = env.VITE_XLINK_R1_REPEAT_ACTIONS === 'true'
    && env.VITE_XLINK_ENABLE_REAL_WRITES === 'true' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'true'
    && parseR1RepeatGrant(env.VITE_XLINK_R1_REPEAT_GRANT)?.scope.tenantId === env.VITE_XLINK_AUTH_TENANT
  const scopedFormsMode = env.VITE_XLINK_R1_FORMS_ACTIONS === 'true'
    && env.VITE_XLINK_ENABLE_REAL_WRITES === 'true' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'true'
    && parseR1FormsGrant(env.VITE_XLINK_R1_FORMS_GRANT)?.scope.tenantId === env.VITE_XLINK_AUTH_TENANT
  return env.DEV === true && env.VITE_XLINK_R1_NODE_FORM_READ === 'true'
    && env.VITE_XLINK_ENVIRONMENT === 'dev'
    && origin === 'http://127.0.0.1:5189'
    && env.VITE_XLINK_API_BASE_URL === `${origin}/xlink/wm`
    && (readonlyMode || scopedWriteMode || scopedFormsMode)
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
  let current: { snapshot: R1NodeFormsSnapshot; fingerprint: string; formsExts?: string;
    originals: ReadonlyMap<string, string> } | null = null
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
    currentFormsExts(snapshot) {
      return current?.snapshot === snapshot && fingerprint() === current.fingerprint
        && input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId) === true && current.formsExts
        ? JSON.parse(current.formsExts) as Record<string, unknown> : null
    },
    currentFormOriginal(snapshot, recordId) {
      const raw = current?.snapshot === snapshot && fingerprint() === current.fingerprint
        && input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId) === true
        ? current.originals.get(recordId) : undefined
      return raw ? JSON.parse(raw) as Record<string, unknown> : null
    },
    async confirmFormsCompletion(snapshot) {
      const identity = fingerprint(), ticket = generation
      const check = () => {
        if (!identity || fingerprint() !== identity || ticket !== generation || current?.snapshot !== snapshot
          || input.read.isWorkOrderListedForCurrentSession?.(snapshot.workOrderId) !== true
          || snapshot.node.sourceNodeType !== 'forms') deny()
      }
      check()
      // Expected IDs and business values come from the private, exact-read
      // originals, not a mutable display projection or the Process ACK.
      const businessKeys=(snapshot.definition.fields??[]).map(field=>field.valueKey)
      if(!current!.originals.size || !businessKeys.length || new Set(businessKeys).size!==businessKeys.length) return deny()
      const slot=(record:Row|undefined,key:string)=>{
        if(!record || !Object.hasOwn(record,key))return {present:false as const}
        const value=record[key]
        // This rollout supports scalar business fields only. In particular an
        // explicit invalid EXTS value must never disappear into root fallback.
        if(!(value===null || typeof value==='string' || typeof value==='boolean'
          || (typeof value==='number'&&Number.isFinite(value))))return deny()
        return {present:true as const,value}
      }
      const businessState=(raw:unknown)=>{
        const record=row(raw),exts=record.exts==null?undefined:row(record.exts)
        // Preserve each proven storage slot's presence/type/value, including
        // historical distinct root/EXTS copies; ignore all unrelated metadata.
        return JSON.stringify(businessKeys.map(key=>[key,slot(record,key),slot(exts,key)]))
      }
      const expected=new Map([...current!.originals].map(([recordId,raw])=>[recordId,businessState(JSON.parse(raw))]))
      const execute=async(request:ApiReadRequest)=>{check();const value=await transport.execute(request);check();return value}
      const terminalReferences=async()=>{
        const envelope = row(await execute({method:'POST',
          path:`basic/serviceAppointment/queryById/${encodeURIComponent(snapshot.workOrderId)}`,body:{}}))
        check()
        if(envelope.success!==true || envelope.status!==1) return deny()
        const data=row(envelope.data),sa=row(data.serviceAppointment),wf=row(data.workflow)
        if(sa._id!==snapshot.workOrderId || sa.state!==1 || sa.tenantId!==input.tenantId || sa.workflowId!==snapshot.node.runId
          || wf._id!==snapshot.node.runId || wf.tenantId!==input.tenantId || wf.formDataId!==snapshot.workOrderId
          || (wf.state!==0 && wf.state!==10) || !Array.isArray(data.workflowNode)) return deny()
        const nodes=(data.workflowNode as unknown[]).map(row)
        if(new Set(nodes.map(n=>id(n._id))).size!==nodes.length) return deny()
        const n=nodes.find(n=>n._id===snapshot.node.id)
        if(!n || n.tenantId!==input.tenantId || n.workflowId!==snapshot.node.runId
          || n.workflowFormDataId!==snapshot.workOrderId || n.workflowFormColName!=='serviceAppointment'
          || (n.formDefId!==undefined && n.formDefId!==snapshot.definition.id)
          || n.state!==10 || row(n.nodeDef).nodeType!=='forms'
          || row(n.nodeDef).formDefId!==snapshot.definition.id) return deny()
        const references=workflowNode(n).formList
        if(!references || references.source!=='exts.formList' || references.evidence!=='available' || references.truncated
          || references.entries.some(entry=>!['active','deleted'].includes(entry.state)
            || (entry.formDefinitionId!==undefined && entry.formDefinitionId!==snapshot.definition.id))
          || [...expected.keys()].some(recordId=>!references.entries.some(entry=>entry.id===recordId&&entry.state==='active'))) return deny()
        return references
      }
      const references=await terminalReferences()
      const reader=createR1ScopedFormReader({transport:{execute},scope:{
        tenantId:input.tenantId,workOrderId:snapshot.workOrderId,runtimeNodeId:String(snapshot.node.id),
        workflowRunId:id(snapshot.node.runId),formDefinitionId:String(snapshot.definition.id),sourceNodeType:'forms',
      },isCurrent:()=>{check();return true},formList:references})
      const discovered=await reader.discover()
      const verified=new Map<string,string>()
      for(const discoveredRecord of discovered){
        const selected=await reader.select(String(discoveredRecord.data.id))
        const original=reader.originalFor(selected)
        if(!original)return deny()
        verified.set(String(selected.data.id),businessState(original))
      }
      for(const [recordId,values] of expected){
        const actual=verified.get(recordId)
        if(actual!==values) return deny()
      }
      // Only active relationship identities must stay stable during this read.
      // Engine-owned unknown metadata/deleted history is not frozen by this client.
      const bindings=(refs:typeof references)=>JSON.stringify(refs.entries.filter(entry=>entry.state==='active')
        .map(entry=>[entry.id,entry.formDefinitionId??snapshot.definition.id]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
      if(bindings(await terminalReferences())!==bindings(references)) return deny()
      check(); generation++; current=null
      return {transitionVerified:true as const}
    },
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
      let rawFormsExts: string | undefined
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
        rawFormsExts = def.nodeType === 'forms' ? formsExtsJson(rawNode.exts) : undefined
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
      const formsExts = rawFormsExts
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
      // Validate every applicable binding before the first provider request.
      // Static mobile exclusions alone can skip a provider; conditional fields
      // still hydrate, regardless of the currently selected record's values.
      const bindings = (definition.fields ?? []).map(field =>
        isFieldApplicable(actionFormSchemaFor(field), ACTION_FORM_SURFACE)
          ? bindR1ScopedFieldOptions({ rawField: fields.find(raw => raw._id === field.fieldId),
            field, tenantId: input.tenantId, definitionId })
          : null)
      const hydrated = []
      for (const [index, field] of (definition.fields ?? []).entries()) {
        const binding = bindings[index]
        hydrated.push(binding ? { ...field, options: await readR1ScopedFieldOptions(binding, { execute }) } : field)
      }
      // Attachment decoding belongs only to this read-only rollout, never the
      // scoped write snapshots consumed by edit/save/completion capabilities.
      const readOnlySurveyMedia = input.env.VITE_XLINK_ENABLE_REAL_WRITES === 'false'
        && input.env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'false'
        ? createSurveyReadOnlyMediaCodec(definition, ext.colName, fields) : undefined
      const reader = createR1ScopedFormReader({ transport: { execute }, readOnlySurveyMedia, scope: {
        tenantId: input.tenantId, workOrderId, runtimeNodeId, workflowRunId: id(node.runId),
        formDefinitionId: definitionId, sourceNodeType: node.sourceNodeType as 'forms' | 'repeat',
      }, isCurrent: () => ticket === generation && fingerprint() === identity,
      ...(node.formList ? { formList: node.formList } : {}) })
      const discovered = await reader.discover()
      // List rows are discovery, not the detail read used to display a record.
      const records = []
      const originals = new Map<string,string>()
      for (const r of discovered) {
        const selected=await reader.select(String(r.data.id))
        records.push(selected.data)
        const original=reader.originalFor(selected)
        if(!original) return deny()
        originals.set(String(selected.data.id),formsExtsJson(original))
      }
      const after = await readNode()
      if (JSON.stringify(after) !== JSON.stringify(node) || JSON.stringify(rawFill) !== JSON.stringify(fillableFieldIds)
        || rawFormsExts !== formsExts) deny()
      check()
      const snapshot: R1NodeFormsSnapshot = { workOrderId, node, definition: { ...definition, fields: hydrated } as FormDefinitionRead, records,
        ...(fillableFieldIds ? { fillableFieldIds } : {}) }
      current = { snapshot, fingerprint: identity, originals, ...(formsExts ? { formsExts } : {}) }
      return snapshot
    },
  }
}
