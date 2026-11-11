import {createSurveyMediaPageActions} from './r1-survey-media-actions'
import { supportsSurveyConditionalCreate } from '@features/work-orders/r1-survey-conditional-create'
import { createRepeatAppointmentPageActions } from './r1-repeat-appointment-actions'
import type { AuthSessionPort,MediaFilePickerPort,MediaUploadQueuePort } from '@shared/ports'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import type { R1RepeatActionProvider } from '@features/work-orders/r1-repeat-actions-port'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { createR1RepeatActions, r1RepeatActionsEnabled, type R1RepeatScope } from './r1-repeat-actions'

const keys = ['tenantId','userId','roleId','workOrderId','workflowRunId','runtimeNodeId','formDefinitionId'] as const
export interface R1RepeatGrant {
  readonly version: 1 | 2 | 3
  readonly profile?: 'survey-media-first'
  readonly scope: R1RepeatScope
  readonly expiresAt: string
  readonly fieldIds: readonly string[]
  readonly operations: readonly ('create' | 'complete' | 'edit')[]
  readonly recordIds?: readonly string[]
}
/** A deployment grant is explicit data, not an inferred permission from node/type/DEV. */
export function parseR1RepeatGrant(raw: unknown, now = Date.now()): R1RepeatGrant | null {
  try {
    if (typeof raw !== 'string' || raw.length > 10000) return null
    const g = JSON.parse(raw), s = g?.scope
    if (!g || ![1,2,3].includes(g.version) || Object.keys(g).sort().join() !== (g.version===2?['version','scope','expiresAt','fieldIds','operations','recordIds']:g.version===3?['version','scope','expiresAt','fieldIds','operations','profile']:['version','scope','expiresAt','fieldIds','operations']).sort().join() || !s || Object.keys(s).sort().join() !== [...keys].sort().join()
      || keys.some(k => typeof s[k] !== 'string' || !s[k] || s[k].trim() !== s[k] || s[k].includes(','))
      || typeof g.expiresAt !== 'string' || !Number.isFinite(Date.parse(g.expiresAt)) || Date.parse(g.expiresAt) <= now
      || !Array.isArray(g.fieldIds) || g.fieldIds.length < 1 || g.fieldIds.length > 50
      || g.fieldIds.some((v: unknown) => typeof v !== 'string' || !v || v.trim() !== v)
      || new Set(g.fieldIds).size !== g.fieldIds.length
      || (g.version===1?JSON.stringify(g.operations)!=='["create","complete"]':g.version===3?g.profile!=='survey-media-first'||JSON.stringify(g.operations)!=='["create"]':
        JSON.stringify(g.operations)!=='["edit"]'||!Array.isArray(g.recordIds)||g.recordIds.length<1||g.recordIds.length>50
        ||g.recordIds.some((v:unknown)=>typeof v!=='string'||!v||v.trim()!==v||v.includes(','))||new Set(g.recordIds).size!==g.recordIds.length)) return null
    return Object.freeze({ ...g, scope: Object.freeze({ ...s }), fieldIds: Object.freeze([...g.fieldIds]), operations: Object.freeze([...g.operations]), ...(g.version===2?{recordIds:Object.freeze([...g.recordIds])}:{}) })
  } catch { return null }
}

export function createNormalRepeatActionProvider(input: {
  readonly auth: Pick<AuthSessionPort, 'getCurrentSession'>
  readonly reader: R1NodeFormsReader
  readonly env: Record<string, unknown>
  readonly origin: string
  readonly media?:{readonly picker:MediaFilePickerPort;readonly queue:MediaUploadQueuePort}
}): R1RepeatActionProvider {
  const grant = () => input.env.VITE_XLINK_R1_REPEAT_ACTIONS === 'true'
    && r1RepeatActionsEnabled(input.env, input.origin) ? parseR1RepeatGrant(input.env.VITE_XLINK_R1_REPEAT_GRANT) : null
  const permitted = (scope: R1RepeatScope) => {
    const g = grant()
    return Boolean(g && keys.every(k => scope[k] === g.scope[k]))
  }
  const hasConditionalSource = (snapshot:R1NodeFormsSnapshot) => {
    const proof=input.reader.currentSurveyConditionalSource?.(snapshot)
    return Boolean(proof&&input.reader.isCurrentSurveyConditionalSource?.(snapshot,proof)===true)
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
  return {
    forSnapshot(snapshot) {
      const g = grant(), a = input.auth.getCurrentSession()
      if (!g || !schemaMatches(snapshot) || !input.reader.isCurrent(snapshot)
        || a?.user.id !== g.scope.userId || a.currentRole?.id !== g.scope.roleId) return null
      // Typed image creation never falls through to scalar/appointment grants.
      if(snapshot.definition.purpose==='survey'&&snapshot.definition.fields?.some(f=>f.type==='file')){
        if(!input.media)return null
        return createSurveyMediaPageActions({snapshot,reader:input.reader,auth:input.auth,env:input.env,origin:input.origin,getGrant:grant,media:input.media,
          transport:createUniApiCommandTransport({apiBaseUrl:String(input.env.VITE_XLINK_API_BASE_URL),getSessionRef:()=>input.auth.getCurrentSession()?.sessionRef??null})})
      }
      if(g.version===3)return null
      if(g.version===2)return createRepeatAppointmentPageActions({snapshot,auth:input.auth,reader:input.reader,env:input.env,origin:input.origin,
        getGrant:()=>{const latest=grant();return latest?.version===2?{...latest,version:2 as const}:null},schemaMatches,
        transport:createUniApiCommandTransport({apiBaseUrl:String(input.env.VITE_XLINK_API_BASE_URL),getSessionRef:()=>input.auth.getCurrentSession()?.sessionRef??null})})
      const conditionalCreate = supportsSurveyConditionalCreate(snapshot)
      if(conditionalCreate&&!hasConditionalSource(snapshot))return null
      const s = g.scope
      const createGrantIdentity = (value: R1RepeatGrant) => JSON.stringify([
        value.version, keys.map(key => value.scope[key]), [...value.fieldIds].sort(),
        value.operations, value.expiresAt,
      ])
      const initialGrantIdentity = createGrantIdentity(g)
      const permitsOriginalCreateGrant = (scope: R1RepeatScope) => {
        const latest = grant()
        return latest?.version === 1 && permitted(scope)
          && createGrantIdentity(latest) === initialGrantIdentity
      }
      // Each page action owns its read snapshot. A different page or an external
      // reread revokes it; only this action's successful reads may renew it.
      let leaseSnapshot = snapshot
      const ownsSnapshot = (scope: R1RepeatScope) => permitsOriginalCreateGrant(scope) && input.reader.isCurrent(leaseSnapshot)
        && (!conditionalCreate || hasConditionalSource(leaseSnapshot))
      const actions = createR1RepeatActions({ hasSurveyConditionalSource:hasConditionalSource, initialSnapshot: snapshot, readOriginal: (s, id) => input.reader.currentFormOriginal?.(s, id) ?? null, env: input.env, origin: input.origin,
        getSession: () => input.auth.getCurrentSession(), hasExactGrant: ownsSnapshot,
        transport: createUniApiCommandTransport({ apiBaseUrl: String(input.env.VITE_XLINK_API_BASE_URL),
          getSessionRef: () => input.auth.getCurrentSession()?.sessionRef ?? null }),
        async readLatest(scope) {
          if (!ownsSnapshot(scope)) throw Error('本轮表单写入授权已失效')
          const latest = await input.reader.load(scope.workOrderId, scope.runtimeNodeId)
          if (!permitsOriginalCreateGrant(scope) || !input.reader.isCurrent(latest) || !schemaMatches(latest)) throw Error('当前表单配置已变化')
          leaseSnapshot = latest
          return latest
        },
      })
      return { locked: () => actions.locked(s), saveOnly: values => actions.saveOnly(s, values), complete: () => actions.complete(s) }
    },
  }
}
