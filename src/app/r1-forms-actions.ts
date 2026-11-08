/** Normal local forms create/save adapter. R1 full EXTS replacement is retained;
 * this client lock does not provide cross-client CAS. No edit/delete/process. */
import type { AuthSessionPort } from '@shared/ports'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
import { planR1FormsUpdateExts } from '@features/work-orders/r1-forms-exts-plan'
import { r1SpecialFormUpsert, r1FormsUpdateExtsCommand } from '@adapters/api/r1-special-workflow-wires'
import { normalizeCommandResponse, type ApiCommandTransport } from '@adapters/api/technician-api-commands'
import { isHandlerMatch, evaluateNodeVisibility } from '@runtimes/workflow/policy'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { asOpaqueId } from '@shared/types'
import { createLocalFixtureMutationLock } from './local-fixture-mutation-lock'
import { r1RepeatActionsEnabled as localFormWritesEnabled, type R1RepeatScope } from './r1-repeat-actions'

const deny = (): never => { throw Error('普通表单的身份、归属、字段或回执无法核实，禁止提交或自动重试。') }
const keys = ['tenantId','userId','roleId','workOrderId','workflowRunId','runtimeNodeId','formDefinitionId'] as const
function success(raw: unknown): Record<string, unknown> {
  normalizeCommandResponse(raw)
  const r = raw as Record<string, unknown>
  if (!(r.success === true || r.status === 1) || (Object.hasOwn(r,'success') && r.success !== true)
    || (Object.hasOwn(r,'status') && r.status !== 1)) deny()
  return r
}
function savedIdentity(raw: Record<string, unknown>, scope: R1RepeatScope): string {
  const source = raw.data ?? raw.entity ?? raw
  if (!source || typeof source !== 'object' || Array.isArray(source)) return deny()
  const row = source as Record<string, unknown>
  const ids = ['_id','id','dataId'].filter(k => Object.hasOwn(row,k)).map(k => row[k])
  if (!ids.length || new Set(ids).size !== 1 || ids.some(v => typeof v !== 'string'
    || !v || v.trim() !== v || v.includes(',') || v.startsWith('local-'))) return deny()
  // The selected FormData container owns these wire fields. Missing optional
  // fields are not invented; unrelated envelope/entity metadata is not merged.
  const ownership = { tenantId:scope.tenantId, sid:scope.workOrderId, nodeId:scope.runtimeNodeId,
    workflowId:scope.workflowRunId, workflowRunId:scope.workflowRunId, runId:scope.workflowRunId,
    definitionId:scope.formDefinitionId, extId:scope.formDefinitionId,
    formDefId:scope.formDefinitionId, formDefinitionId:scope.formDefinitionId,
    smodule:'serviceAppointment', state:1 }
  for (const [key, expected] of Object.entries(ownership)) {
    if (Object.hasOwn(row,key) && row[key] !== expected) return deny()
  }
  // The existing FormData mapper also recognizes these nested run aliases;
  // nested Workflow._id remains a different entity's identity.
  if (row.workflow != null) {
    if (typeof row.workflow !== 'object' || Array.isArray(row.workflow)) return deny()
    const workflow = row.workflow as Record<string,unknown>
    for (const key of ['workflowId','workflowRunId','runId']) {
      if (Object.hasOwn(workflow,key) && workflow[key] !== scope.workflowRunId) return deny()
    }
  }
  return ids[0] as string
}
export function createR1FormsActions(input: {
  readonly env: Record<string, unknown>; readonly origin: string
  readonly getSession: AuthSessionPort['getCurrentSession']
  readonly hasExactGrant: (scope: R1RepeatScope) => boolean
  readonly readLatest: (scope: R1RepeatScope) => Promise<R1NodeFormsSnapshot>
  readonly fullExts: (snapshot: R1NodeFormsSnapshot) => Readonly<Record<string, unknown>> | null
  readonly transport: ApiCommandTransport
  readonly createLock?: typeof createLocalFixtureMutationLock
}) {
  const locks = new Map<string, ReturnType<typeof createLocalFixtureMutationLock>>()
  const key = (s: R1RepeatScope) => {
    if (keys.some(k => typeof s[k] !== 'string' || !s[k] || s[k].trim() !== s[k] || s[k].includes(','))) return deny()
    return JSON.stringify(keys.map(k => s[k]))
  }
  const lockFor = (s: R1RepeatScope) => {
    const k = key(s)
    if (!locks.has(k)) locks.set(k, (input.createLock ?? createLocalFixtureMutationLock)(`xlink:r1-forms:${k}`))
    return locks.get(k)!
  }
  const fingerprint = () => {
    const s = input.getSession()
    return s && sessionAuthorizationFingerprint({ sessionRef:s.sessionRef, userId:s.user.id,
      roleId:s.currentRole?.id, roleVersion:s.roleVersion })
  }
  return {
    locked: (s: R1RepeatScope) => lockFor(s).locked,
    async saveOnly(source: R1RepeatScope, values: Readonly<Record<string,unknown>>) {
      const s = Object.freeze({...source}), draft = Object.freeze({...values}), identity = fingerprint()
      const check = () => {
        const a = input.getSession()
        if (!identity || fingerprint() !== identity || a?.user.id !== s.userId || a.currentRole?.id !== s.roleId
          || input.env.VITE_XLINK_AUTH_TENANT !== s.tenantId || !localFormWritesEnabled(input.env,input.origin)
          || !input.hasExactGrant(s)) deny()
      }
      check()
      return lockFor(s).run(async mark => {
        const read = async () => {
          check(); const snapshot = await input.readLatest(s); check()
          const n = snapshot.node, actor = { userId:asOpaqueId<'UserId'>(s.userId), roleIds:[asOpaqueId<'RoleId'>(s.roleId)], organizationRoles:[] }
          if (snapshot.workOrderId !== s.workOrderId || n.id !== s.runtimeNodeId || n.runId !== s.workflowRunId
            || n.sourceNodeType !== 'forms' || n.nodeTypeEvidence !== 'runtime_node_def' || n.lifecycle !== 'active'
            || n.formDefinitionId !== s.formDefinitionId || snapshot.definition.id !== s.formDefinitionId
            || !isHandlerMatch(actor,n.handlers ?? []) || !evaluateNodeVisibility(n,actor).visible) deny()
          const exts = input.fullExts(snapshot)
          if (!exts || !Array.isArray(exts.formList)) return deny()
          return {snapshot,exts}
        }
        const before = await read(); check()
        // Bounded creation only. Existing records never become edit credentials.
        if (before.snapshot.records.length !== 0) return deny()
        const normalized = normalizeR1RepeatValues(before.snapshot,draft)
        const title = before.snapshot.node.displayName || '现场记录'
        const record = (id:string) => ({_id:id,formDefId:s.formDefinitionId,formTitle:title,state:1})
        const plan = (id:string) => planR1FormsUpdateExts({sourceNodeType:'forms',workflowNodeId:s.runtimeNodeId,
          authoritativeExts:before.exts,change:{kind:'saved',record:record(id)}})
        let placeholder = '__forms_preflight_only__'
        const previousList = before.exts.formList
        if (!Array.isArray(previousList)) return deny()
        const occupied = new Set(previousList.map(r => r && typeof r === 'object' ? (r as Record<string,unknown>)._id : undefined))
        while (occupied.has(placeholder)) placeholder += 'x'
        plan(placeholder)
        const request = r1SpecialFormUpsert({sourceNodeType:'forms',definitionId:asOpaqueId<'FormDefinitionId'>(s.formDefinitionId),
          formData:normalized,workOrderId:asOpaqueId<'WorkOrderId'>(s.workOrderId),
          workflowNodeId:asOpaqueId<'WorkflowNodeRuntimeId'>(s.runtimeNodeId),workflowRunId:asOpaqueId<'WorkflowRunId'>(s.workflowRunId),state:1})
        const receipt = (stage:string, savedId?:string) => {
          const k = `xlink:r1-forms-receipt:${key(s)}`
          const raw = JSON.stringify({version:1,stage,...(savedId?{savedId}:{})})
          localStorage.setItem(k,raw)
          if (localStorage.getItem(k) !== raw) deny()
        }
        check(); mark('uncertain'); receipt('upsert_may_have_dispatched')
        const savedId = savedIdentity(success(await input.transport.execute(request)),s); check()
        if (occupied.has(savedId)) return deny()
        // A fresh role/node/EXTS read between the two writes detects observable
        // changes. This is not CAS and cannot close a later server-side race.
        const intermediate = await read(); check()
        if (intermediate.snapshot.records.length !== 0
          || JSON.stringify(intermediate.exts) !== JSON.stringify(before.exts)
          || JSON.stringify(normalizeR1RepeatValues(intermediate.snapshot,draft)) !== JSON.stringify(normalized)) return deny()
        const planned = plan(savedId)
        receipt('exts_may_have_dispatched',savedId); check()
        success(await input.transport.execute(r1FormsUpdateExtsCommand({sourceNodeType:'forms',planned}))); check()
        receipt('readback_pending',savedId)
        const after = await read(); check()
        if (JSON.stringify(after.exts) !== JSON.stringify(planned.body) || after.snapshot.records.length !== 1
          || JSON.stringify(normalizeR1RepeatValues(after.snapshot,draft)) !== JSON.stringify(normalized)
          || after.snapshot.records[0]!.id !== savedId
          || Object.entries(normalized).some(([k,v]) => after.snapshot.records[0]!.values?.[k] !== v)) return deny()
        receipt('verified',savedId); mark('ready')
        return after.snapshot
      })
    },
  }
}
