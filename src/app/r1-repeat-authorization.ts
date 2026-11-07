import type { AuthSessionPort } from '@shared/ports'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import type { R1RepeatActionProvider } from '@features/work-orders/r1-repeat-actions-port'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { createR1RepeatActions, r1RepeatActionsEnabled, type R1RepeatScope } from './r1-repeat-actions'

const keys = ['tenantId','userId','roleId','workOrderId','workflowRunId','runtimeNodeId','formDefinitionId'] as const
export interface R1RepeatGrant {
  readonly version: 1
  readonly scope: R1RepeatScope
  readonly expiresAt: string
  readonly fieldIds: readonly string[]
  readonly operations: readonly ['create', 'complete']
}
/** A deployment grant is explicit data, not an inferred permission from node/type/DEV. */
export function parseR1RepeatGrant(raw: unknown, now = Date.now()): R1RepeatGrant | null {
  try {
    if (typeof raw !== 'string' || raw.length > 10000) return null
    const g = JSON.parse(raw), s = g?.scope
    if (!g || Object.keys(g).sort().join() !== ['version','scope','expiresAt','fieldIds','operations'].sort().join()
      || g.version !== 1 || !s || Object.keys(s).sort().join() !== [...keys].sort().join()
      || keys.some(k => typeof s[k] !== 'string' || !s[k] || s[k].trim() !== s[k] || s[k].includes(','))
      || typeof g.expiresAt !== 'string' || !Number.isFinite(Date.parse(g.expiresAt)) || Date.parse(g.expiresAt) <= now
      || !Array.isArray(g.fieldIds) || g.fieldIds.length < 1 || g.fieldIds.length > 50
      || g.fieldIds.some((v: unknown) => typeof v !== 'string' || !v || v.trim() !== v)
      || new Set(g.fieldIds).size !== g.fieldIds.length || JSON.stringify(g.operations) !== '["create","complete"]') return null
    return Object.freeze({ ...g, scope: Object.freeze({ ...s }), fieldIds: Object.freeze([...g.fieldIds]), operations: Object.freeze([...g.operations]) })
  } catch { return null }
}

export function createNormalRepeatActionProvider(input: {
  readonly auth: Pick<AuthSessionPort, 'getCurrentSession'>
  readonly reader: R1NodeFormsReader
  readonly env: Record<string, unknown>
  readonly origin: string
}): R1RepeatActionProvider {
  const grant = () => input.env.VITE_XLINK_R1_REPEAT_ACTIONS === 'true'
    && r1RepeatActionsEnabled(input.env, input.origin) ? parseR1RepeatGrant(input.env.VITE_XLINK_R1_REPEAT_GRANT) : null
  const permitted = (scope: R1RepeatScope) => {
    const g = grant()
    return Boolean(g && keys.every(k => scope[k] === g.scope[k]))
  }
  const schemaMatches = (snapshot: R1NodeFormsSnapshot): boolean => {
    const g = grant(), fields = snapshot.definition.fields
    return Boolean(g && fields && fields.length === g.fieldIds.length
      && fields.every(f => g.fieldIds.includes(f.fieldId))
      && snapshot.fillableFieldIds?.length === g.fieldIds.length
      && snapshot.fillableFieldIds.every(id => g.fieldIds.includes(id))
      && snapshot.node.formFieldIdsReadOnly?.length === 0
      && snapshot.workOrderId === g.scope.workOrderId && snapshot.node.id === g.scope.runtimeNodeId
      && snapshot.node.runId === g.scope.workflowRunId && snapshot.definition.id === g.scope.formDefinitionId
      && snapshot.node.formDefinitionId === g.scope.formDefinitionId && snapshot.node.sourceNodeType === 'repeat')
  }
  const actions = createR1RepeatActions({ env: input.env, origin: input.origin,
    getSession: () => input.auth.getCurrentSession(), hasExactGrant: permitted,
    transport: createUniApiCommandTransport({ apiBaseUrl: String(input.env.VITE_XLINK_API_BASE_URL),
      getSessionRef: () => input.auth.getCurrentSession()?.sessionRef ?? null }),
    async readLatest(scope) {
      if (!permitted(scope)) throw Error('本轮表单写入授权已失效')
      const snapshot = await input.reader.load(scope.workOrderId, scope.runtimeNodeId)
      if (!permitted(scope) || !input.reader.isCurrent(snapshot) || !schemaMatches(snapshot)) throw Error('当前表单配置已变化')
      return snapshot
    },
  })
  return {
    forSnapshot(snapshot) {
      const g = grant(), a = input.auth.getCurrentSession()
      if (!g || !schemaMatches(snapshot) || !input.reader.isCurrent(snapshot)
        || a?.user.id !== g.scope.userId || a.currentRole?.id !== g.scope.roleId) return null
      const s = g.scope
      return { locked: () => actions.locked(s), saveOnly: values => actions.saveOnly(s, values), complete: () => actions.complete(s) }
    },
  }
}
