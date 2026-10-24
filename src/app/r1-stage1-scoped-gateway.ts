import type { ApiCommandRequest, ApiCommandTransport } from '@adapters/api/technician-api-commands'
import { isProductionReadOnlyRuntime, isProductionReadOnlyTarget } from '@shared/config'
import type { SessionSnapshot, TechnicianApiReadPort, WorkflowNodeRead } from '@shared/ports'
import { evaluateNodeVisibility } from '@runtimes/workflow/policy'
import type { R1MultiStepScope } from '@features/work-orders/r1-multistep-offline-transaction'
import type { R1OfflineSpecialCommandGateway } from './r1-stage1-functional-flow'

/**
 * The missing adapter boundary between the R1 source-backed transaction plan
 * and an authorized backend command transport. This factory is deliberately
 * NOT installed in the App composition root: an isolated writable fixture and
 * an explicit Owner-scoped grant are prerequisites. A real Production target
 * is unconditionally denied, even if a caller supplies a permissive grant.
 */
export interface R1Stage1PilotGatewayOptions {
  readonly scope: R1MultiStepScope
  readonly node: { readonly kind: 'main' } | {
    readonly kind: 'child'
    readonly parentRuntimeNodeId: string
  }
  readonly environment: string
  readonly apiBaseUrl: string
  readonly read: TechnicianApiReadPort
  readonly command: ApiCommandTransport
  readonly getSession: () => SessionSnapshot | null
  /** No default permission. Caller must separately verify the exact pilot. */
  readonly isExplicitPilotWriteAuthorized?: (scope: R1MultiStepScope) => boolean
}

function sessionIdentity(session: SessionSnapshot | null): string | null {
  if (!session?.sessionRef || !session.user?.id || !session.currentRole?.id) return null
  return JSON.stringify([
    session.sessionRef, session.user.id, session.currentRole.id,
    session.roleVersion ?? null,
  ])
}

function activeMatchingNode(node: WorkflowNodeRead, scope: R1MultiStepScope,
  session: SessionSnapshot): boolean {
  if (String(node.id) !== scope.runtimeNodeId
    || node.sourceNodeType !== scope.sourceNodeType
    || String(node.formDefinitionId ?? '') !== scope.formDefinitionId
    || String(node.runId ?? '') !== scope.workflowRunId
    || node.nodeTypeEvidence !== 'runtime_node_def') return false
  return evaluateNodeVisibility(node, {
    userId: session.user.id,
    roleIds: session.currentRole ? [session.currentRole.id] : [],
    organizationRoles: [],
  }).visible
}

/** No generic path access. A stale/incorrect special command cannot be
 * smuggled through an otherwise authorized transaction scope. */
function isScopedR1Command(request: ApiCommandRequest, scope: R1MultiStepScope): boolean {
  if (request.r1Special !== true || request.method !== 'POST') return false
  if (request.path === `biz/extForm/upsert/${encodeURIComponent(scope.formDefinitionId)}`) {
    if(typeof request.body?.dataStr!=='string' || request.jsonBody!==undefined)return false
    try {
      const data=JSON.parse(request.body.dataStr) as Record<string,unknown>
      return data !== null && typeof data==='object' && !Array.isArray(data)
        && data.sid===scope.workOrderId && data.nodeId===scope.runtimeNodeId
        && data.workflowId===scope.workflowRunId && data.smodule==='serviceAppointment'
        && (data.state===1 || data.state===-1)
    } catch { return false }
  }
  if (scope.sourceNodeType === 'forms'
    && request.path === `workflowNode/updateExts/${encodeURIComponent(scope.runtimeNodeId)}`)
    return request.jsonBody !== undefined && request.body === undefined
  if (scope.sourceNodeType === 'repeat'
    && request.path === `biz/extForm/remove/${encodeURIComponent(scope.formDefinitionId)}`)
    return typeof request.body?.formDataId === 'string' && request.jsonBody === undefined
  if (request.path === 'workflow/process') {
    const body=request.body
    return request.jsonBody === undefined && body?.sid === scope.workOrderId
      && body.workflowNodeId === scope.runtimeNodeId
      && body.smodule === 'serviceAppointment'
      && (scope.sourceNodeType==='forms'
        ? (body.nodeFormDefId==='' || body.nodeFormDefId===scope.formDefinitionId)
          && body.nodeFormDataId===''
        : body.nodeFormDefId===scope.formDefinitionId
          && typeof body.nodeFormDataId==='string'
          && body.nodeFormDataId.length>0)
  }
  return false
}

export function createR1Stage1PilotCommandGateway(
  options: R1Stage1PilotGatewayOptions,
): R1OfflineSpecialCommandGateway {
  const expectedSessionIdentity=sessionIdentity(options.getSession())
  const scope=options.scope
  let lastReadAuthorized=false

  const sameScope=(candidate:R1MultiStepScope):boolean =>
    candidate.userId===scope.userId && candidate.workOrderId===scope.workOrderId
    && candidate.runtimeNodeId===scope.runtimeNodeId
    && candidate.workflowRunId===scope.workflowRunId
    && candidate.formDefinitionId===scope.formDefinitionId
    && candidate.sourceNodeType===scope.sourceNodeType
    && candidate.authorizationScope===scope.authorizationScope

  const authorizedNow=():boolean => Boolean(
    expectedSessionIdentity
    && sessionIdentity(options.getSession()) === expectedSessionIdentity
    && String(options.getSession()?.user.id) === scope.userId
    && scope.authorizationScope.trim()
    && scope.workflowRunId
    && options.isExplicitPilotWriteAuthorized?.(scope) === true
    && !isProductionReadOnlyRuntime()
    && !isProductionReadOnlyTarget(options.environment,options.apiBaseUrl),
  )

  return {
    async revalidate(requestedScope) {
      lastReadAuthorized=false
      if (!sameScope(requestedScope) || !authorizedNow()
        || options.read.isWorkOrderListedForCurrentSession?.(scope.workOrderId) !== true)
        return false
      const session=options.getSession()
      if (!session) return false
      try {
        const detail=await options.read.getWorkOrderDetail(scope.workOrderId as never)
        if (!authorizedNow() || detail.state!=='succeeded' || !detail.data
          || String(detail.data.id)!==scope.workOrderId) return false

        let nodes=detail.data.workflowNodes ?? []
        if(options.node.kind==='main') {
          if(String(detail.data.workflowRunId??'')!==scope.workflowRunId)return false
        } else {
          const parentRuntimeNodeId=options.node.parentRuntimeNodeId
          const parent=nodes.find(x=>String(x.id)===parentRuntimeNodeId)
          if(!parent || parent.category!=='subworkflow'
            || !['subflow','subflows'].includes(parent.sourceNodeType??'')
            || !evaluateNodeVisibility(parent,{
              userId:session.user.id,
              roleIds:session.currentRole?[session.currentRole.id]:[],
              organizationRoles:[],
            }).visible)return false
          const children=await options.read.getChildWorkflowNodes(parent.id)
          if(!authorizedNow() || children.state!=='succeeded'||!children.data)return false
          nodes=children.data
        }
        const matches=nodes.filter(x=>String(x.id)===scope.runtimeNodeId)
        if(matches.length!==1 || !activeMatchingNode(matches[0]!,scope,session))return false
        lastReadAuthorized=true
        return true
      } catch { return false }
    },
    async dispatch(request) {
      const valid=lastReadAuthorized && authorizedNow() && isScopedR1Command(request,scope)
      lastReadAuthorized=false
      if(!valid)
        throw new Error('R1 isolated pilot write authorization or node command scope missing')
      // Consume the permission for one send: a second request MUST perform a
      // fresh work-order/node/role read, including after a network timeout.
      return options.command.execute(request)
    },
  }
}
