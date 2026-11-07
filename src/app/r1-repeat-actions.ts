import { normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
export { normalizeR1RepeatValues } from '@features/work-orders/r1-repeat-form'
/** Normal repeat create/save and explicit complete. No runtime grant is fabricated here. */
import type { AuthSessionPort } from '@shared/ports'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { evaluateNodeVisibility, isHandlerMatch } from '@runtimes/workflow/policy'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { asOpaqueId } from '@shared/types'
import { normalizeCommandResponse, type ApiCommandTransport } from '@adapters/api/technician-api-commands'
import { r1SpecialFormUpsert, r1RepeatBatchProcess } from '@adapters/api/r1-special-workflow-wires'
import { createLocalFixtureMutationLock } from './local-fixture-mutation-lock'

export interface R1RepeatScope {
  readonly tenantId: string
  readonly userId: string
  readonly roleId: string
  readonly workOrderId: string
  readonly workflowRunId: string
  readonly runtimeNodeId: string
  readonly formDefinitionId: string
}
const deny = (): never => { throw Error('当前记录、身份、字段或操作授权无法核实，禁止提交或自动重试。') }
const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.trim() === v && !v.includes(',')
function acknowledgedId(raw: Record<string, unknown>): string {
  const values = ['id', '_id', 'dataId'].filter(k => Object.hasOwn(raw,k)).map(k => raw[k])
  if (!values.length || values.some(v => !validId(v)) || new Set(values).size !== 1) return deny()
  return values[0] as string
}
function successEnvelope(raw: Record<string, unknown>): boolean {
  return (raw.success === true || raw.status === 1)
    && (!Object.hasOwn(raw,'success') || raw.success === true)
    && (!Object.hasOwn(raw,'status') || raw.status === 1)
}
const scopeParts = (s: R1RepeatScope) => [s.tenantId, s.userId, s.roleId, s.workOrderId, s.workflowRunId, s.runtimeNodeId, s.formDefinitionId]
export function r1RepeatActionsEnabled(env: Record<string, unknown>, origin: string): boolean {
  let url: URL
  try { url = new URL(origin) } catch { return false }
  return env.DEV === true && env.PROD !== true && env.VITE_XLINK_ENVIRONMENT === 'dev'
    && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    && url.origin === origin && env.VITE_XLINK_API_BASE_URL === `${origin}/xlink/wm`
    && env.VITE_XLINK_ENABLE_REAL_WRITES === 'true' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'true'
    && env.VITE_XLINK_MOCK === 'false' && env.VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS !== 'true'
    && !env.VITE_XLINK_AUTH_API_BASE_URL && env.VITE_XLINK_H5_MOCK_E2E !== 'true'
}
export function createR1RepeatActions(input: {
  readonly env: Record<string, unknown>
  readonly origin: string
  readonly getSession: AuthSessionPort['getCurrentSession']
  readonly hasExactGrant: (scope: R1RepeatScope) => boolean
  /** Must re-list complete scoped records and exact-read each ID through the strict normal reader. */
  readonly readLatest: (scope: R1RepeatScope) => Promise<R1NodeFormsSnapshot>
  readonly transport: ApiCommandTransport
  readonly createLock?: typeof createLocalFixtureMutationLock
}) {
  const locks = new Map<string, ReturnType<typeof createLocalFixtureMutationLock>>()
  const lockFor = (scope: R1RepeatScope) => {
    if (!scopeParts(scope).every(validId)) return deny()
    const key = `xlink:r1-repeat:${JSON.stringify(scopeParts(scope))}`
    if (!locks.has(key)) locks.set(key, (input.createLock ?? createLocalFixtureMutationLock)(key))
    return locks.get(key)!
  }
  const fingerprint = () => {
    const s = input.getSession()
    return s && sessionAuthorizationFingerprint({ sessionRef: s.sessionRef, userId: s.user.id, roleId: s.currentRole?.id, roleVersion: s.roleVersion })
  }
  function guard(scope: R1RepeatScope, identity: string | null | undefined) {
    const session = input.getSession()
    if (!identity || fingerprint() !== identity || session?.user.id !== scope.userId || session.currentRole?.id !== scope.roleId
      || !r1RepeatActionsEnabled(input.env, input.origin) || input.env.VITE_XLINK_AUTH_TENANT !== scope.tenantId
      || input.hasExactGrant(scope) !== true) deny()
  }
  function verify(snapshot: R1NodeFormsSnapshot, s: R1RepeatScope) {
    const n = snapshot.node, actor = { userId: asOpaqueId<'UserId'>(s.userId), roleIds: [asOpaqueId<'RoleId'>(s.roleId)], organizationRoles: [] }
    if (snapshot.workOrderId !== s.workOrderId || n.id !== s.runtimeNodeId || n.runId !== s.workflowRunId
      || n.formDefinitionId !== s.formDefinitionId || snapshot.definition.id !== s.formDefinitionId
      || n.sourceNodeType !== 'repeat' || n.nodeTypeEvidence !== 'runtime_node_def' || n.lifecycle !== 'active'
      || !isHandlerMatch(actor, n.handlers ?? []) || !evaluateNodeVisibility(n, actor).visible
      || snapshot.records.length > 50 || new Set(snapshot.records.map(r => r.id)).size !== snapshot.records.length
      || snapshot.records.some(r => !validId(r.id) || r.definitionId !== s.formDefinitionId || r.workflowRunId !== s.workflowRunId)) deny()
  }
  async function execute<T>(source: R1RepeatScope, action: (s: R1RepeatScope, read: () => Promise<R1NodeFormsSnapshot>, check: () => void, mark: (status: 'uncertain' | 'ready' | 'completed') => void) => Promise<T>) {
    const s = Object.freeze({ ...source }), identity = fingerprint(), check = () => guard(s, identity)
    check()
    return lockFor(s).run(async mark => {
      check()
      const read = async () => { check(); const snapshot = await input.readLatest(s); check(); verify(snapshot, s); return snapshot }
      return action(s, read, check, mark)
    })
  }
  return {
    locked: (s: R1RepeatScope) => lockFor(s).locked,
    completed: (s: R1RepeatScope) => lockFor(s).completed,
    saveOnly(scope: R1RepeatScope, values: Readonly<Record<string, unknown>>) {
      // Freeze caller data before any await; only scalar fields are supported.
      const draft = Object.freeze({ ...values })
      return execute(scope, async (s, read, check, mark) => {
        const before = await read(); check()
        if (before.records.length !== 0) return deny()
        const normalized = normalizeR1RepeatValues(before, draft)
        const request = r1SpecialFormUpsert({ sourceNodeType: 'repeat', definitionId: asOpaqueId<'FormDefinitionId'>(s.formDefinitionId), formData: normalized,
          workOrderId: asOpaqueId<'WorkOrderId'>(s.workOrderId), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(s.runtimeNodeId), workflowRunId: asOpaqueId<'WorkflowRunId'>(s.workflowRunId), state: 1 })
        check(); mark('uncertain')
        const raw = await input.transport.execute(request); check(); normalizeCommandResponse(raw)
        const envelope = raw as Record<string, unknown>, data = envelope.data
        if (!successEnvelope(envelope)) return deny()
        const ack = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : envelope
        const savedId = acknowledgedId(ack)
        const after = await read(); check()
        if (after.records.length !== 1 || after.records[0]!.id !== savedId
          || Object.entries(normalized).some(([key, value]) => after.records[0]!.values?.[key] !== value)) return deny()
        mark('ready'); return after
      })
    },
    complete(scope: R1RepeatScope) {
      return execute(scope, async (s, read, check, mark) => {
        const snapshot = await read(); check()
        const request = r1RepeatBatchProcess({ sourceNodeType: 'repeat', definitionId: snapshot.definition.id,
          workOrderId: asOpaqueId<'WorkOrderId'>(s.workOrderId), workflowNodeId: snapshot.node.id, savedFormDataIds: snapshot.records.map(r => r.id) })
        check(); mark('uncertain')
        const raw = await input.transport.execute(request); check(); normalizeCommandResponse(raw)
        const ack = raw as Record<string, unknown>
        // processWorkflow returns ReturnStatus(true), unlike startWorkflow's entity.
        // A success ACK is not transition evidence; the normal detail reread proves it.
        if (!successEnvelope(ack) || ack.status !== 1 || (ack.entity != null
          && (typeof ack.entity !== 'object' || Array.isArray(ack.entity)
            || acknowledgedId(ack.entity as Record<string,unknown>) !== s.workflowRunId))) return deny()
        mark('completed')
        return { acknowledged: true as const, transitionVerified: false as const }
      })
    },
  }
}
