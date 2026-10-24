/**
 * Owner-scoped, isolated R1 Beta pilot executor + authoritative readback.
 *
 * Deliberately NOT installed in the main application bootstrap. A Mock UI
 * control, build flag, or HTTP ACK cannot grant a business write. An isolated
 * pilot must supply an exact Owner grant and a fresh, source-backed reader.
 * Raw FormData, EXTS and customer information never enter persisted receipts.
 */
import type { SessionSnapshot, StoragePort, TechnicianApiReadPort, WorkflowNodeRead } from '@shared/ports'
import type { R1PilotRawReadbackPort } from '@shared/ports/r1-pilot-readback'
import { isProductionReadOnlyRuntime, isProductionReadOnlyTarget } from '@shared/config'
import { asOpaqueId } from '@shared/types'
import { evaluateNodeVisibility } from '@runtimes/workflow/policy'
import {
  closeCompletedR1MutationReceiptAfterReadback,
  closeCompletedR1ReceiptAfterReadback,
  inspectR1MultiStepReceipt,
  type R1MultiStepReceipt,
  type R1MultiStepScope,
} from '@features/work-orders/r1-multistep-offline-transaction'
import { createR1Stage1PilotCommandGateway, type R1Stage1PilotGatewayOptions } from './r1-stage1-scoped-gateway'
import { executeR1Stage1FunctionalCandidate, type R1Stage1Intent } from './r1-stage1-functional-flow'

export type R1PilotReadbackStatus =
  | 'not_authorized' | 'manual_reconciliation' | 'awaiting_readback' | 'verified'

export interface R1PilotReadbackResult {
  readonly state: R1PilotReadbackStatus
  /** Safe for UI: no form values, customer details or session identifiers. */
  readonly reason: string
}

/** Authoritative source must be fetched independently AFTER the write, not
 * reconstructed from a normalized UI FormDataRead, a draft, or command ACK.
 * The real Beta adapter remains a separate audited integration task.
 */
export interface R1PilotExecutionOptions extends Omit<R1Stage1PilotGatewayOptions, 'scope' | 'node'> {
  readonly storage: StoragePort
  readonly rawReadback: R1PilotRawReadbackPort
}
export type R1PilotNodeLocation = R1Stage1PilotGatewayOptions['node']

function fingerprint(session: SessionSnapshot | null): string | null {
  if (!session?.sessionRef || !session.user?.id || !session.currentRole?.id || !session.roleVersion) return null
  return JSON.stringify([session.sessionRef, session.user.id, session.currentRole.id, session.roleVersion])
}

function result(state: R1PilotReadbackStatus, reason: string): R1PilotReadbackResult {
  return { state, reason }
}

function exactNode(node: WorkflowNodeRead, scope: R1MultiStepScope): boolean {
  return String(node.id) === scope.runtimeNodeId
    && node.sourceNodeType === scope.sourceNodeType
    && node.nodeTypeEvidence === 'runtime_node_def'
    && String(node.formDefinitionId ?? '') === scope.formDefinitionId
    && String(node.runId ?? '') === scope.workflowRunId
}

/** A full post-Process FormData read must independently prove every ID and
 * identity. A caller-provided workflowCompleted=true is not sufficient.
 */
function verifiedProcessedRecords(
  records: readonly Readonly<Record<string, unknown>>[] | null,
  scope: R1MultiStepScope,
  ids: readonly string[],
): boolean {
  if (!records || records.length !== ids.length || ids.length === 0 || ids.length > 50
    || new Set(ids).size !== ids.length) return false
  const verified = new Set<string>()
  for (const record of records) {
    const id = record._id
    if (typeof id !== 'string' || !ids.includes(id) || verified.has(id)
      || record.sid !== scope.workOrderId || record.nodeId !== scope.runtimeNodeId
      || record.smodule !== 'serviceAppointment' || record.state !== 1
      || (record.formDefId !== undefined && record.formDefId !== scope.formDefinitionId)
      || (scope.sourceNodeType === 'repeat' && record.workflowId !== scope.workflowRunId)) return false
    verified.add(id)
  }
  return verified.size === ids.length
}

function matchesFormsList(
  node: WorkflowNodeRead,
  readback: import('@shared/ports/r1-pilot-readback').R1PilotAuthoritativeMutationEvidence,
): boolean {
  const list = node.formList
  const raw = readback.formsExts?.formList
  if (!list || list.source !== 'exts.formList' || list.evidence !== 'available'
    || list.truncated || !Array.isArray(raw) || raw.length !== list.entries.length
    || raw.length > 50) return false
  return list.entries.every(item => raw.some(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const record = entry as Record<string, unknown>
    return record._id === item.id && (record.state === 1 ? 'active'
      : record.state === -1 ? 'deleted' : 'unknown') === item.state
  }))
}

/** A role change, revoked list membership, wrong node, or uncertain receipt
 * returns HOLD and NEVER automatically retries any command.
 */
export function createR1Stage1PilotExecution(options: R1PilotExecutionOptions) {
  const initialIdentity = fingerprint(options.getSession())
  const authorized = (scope: R1MultiStepScope): boolean => {
    const session = options.getSession()
    return Boolean(initialIdentity && fingerprint(session) === initialIdentity
      && String(session?.user.id) === scope.userId
      && scope.authorizationScope.trim() && scope.workflowRunId
      && scope.formDefinitionId && scope.runtimeNodeId
      && options.isExplicitPilotWriteAuthorized?.(scope) === true
      && !isProductionReadOnlyRuntime()
      && !isProductionReadOnlyTarget(options.environment, options.apiBaseUrl)
      && options.read.isWorkOrderListedForCurrentSession?.(scope.workOrderId) === true)
  }

  async function freshlyReadNode(scope: R1MultiStepScope, location: R1PilotNodeLocation):
    Promise<WorkflowNodeRead | null> {
    if (!authorized(scope)) return null
    const detail = await options.read.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(scope.workOrderId))
    if (!authorized(scope) || detail.state !== 'succeeded' || !detail.data
      || String(detail.data.id) !== scope.workOrderId) return null
    let nodes = detail.data.workflowNodes ?? []
    if (location.kind === 'main') {
      if (String(detail.data.workflowRunId ?? '') !== scope.workflowRunId) return null
    } else {
      const parent = nodes.find(node => String(node.id) === location.parentRuntimeNodeId)
      const session = options.getSession()
      if (!parent || !session || parent.category !== 'subworkflow'
        || !['subflow', 'subflows'].includes(parent.sourceNodeType ?? '')
        || !evaluateNodeVisibility(parent, {
          userId: session.user.id,
          roleIds: session.currentRole ? [session.currentRole.id] : [],
          organizationRoles: [],
        }).visible) return null
      const children = await options.read.getChildWorkflowNodes(parent.id)
      if (!authorized(scope) || children.state !== 'succeeded' || !children.data) return null
      nodes = children.data
    }
    const matches = nodes.filter(node => String(node.id) === scope.runtimeNodeId)
    return matches.length === 1 && exactNode(matches[0]!, scope) ? matches[0]! : null
  }

  async function reconcile(
    scope: R1MultiStepScope,
    location: R1PilotNodeLocation,
    expectedFields?: Readonly<Record<string, string | number | boolean>>,
  ): Promise<R1PilotReadbackResult> {
    if (!authorized(scope)) return result('not_authorized', '当前角色或隔离 Pilot 授权已失效。')
    const receipt = await inspectR1MultiStepReceipt(options.storage, scope)
    if (receipt.state !== 'succeeded') return result('manual_reconciliation', '事务回执异常，禁止重试。')
    if (!receipt.data) return result('awaiting_readback', '当前没有待核验的事务。')
    if (receipt.data.state !== 'completed') {
      return result('manual_reconciliation', '可能已有部分命令送达，需人工核对，不自动重放。')
    }
    const recorded = receipt.data
    try {
      const node = await freshlyReadNode(scope, location)
      if (!node) return result('awaiting_readback', 'R1 节点身份未获得独立回读确认。')
      if (recorded.steps.includes('workflow_process')) {
        if (node.lifecycle !== 'closed') {
          return result('awaiting_readback', 'Workflow 节点尚未在回读中显示完成。')
        }
        if (scope.sourceNodeType === 'forms') {
          const list = node.formList
          if (!list || list.source !== 'exts.formList'
            || list.evidence !== 'available' || list.truncated
            || !recorded.savedFormDataIds.every(id => list.entries.some(
              entry => String(entry.id) === id && entry.state === 'active',
            ))) return result('awaiting_readback', 'R1 EXTS 尚未证实完整的表单集合。')
        } else if (node.formList && (node.formList.evidence !== 'available'
          || node.formList.truncated)) {
          return result('awaiting_readback', 'Repeat 列表结构不完整。')
        }
        const records = await options.rawReadback.readProcessedRecords(scope, recorded.savedFormDataIds)
        if (!authorized(scope) || !verifiedProcessedRecords(records, scope, recorded.savedFormDataIds)) {
          return result('awaiting_readback', '服务端完整 FormData 未逐一核实。')
        }
        const closed = await closeCompletedR1ReceiptAfterReadback(options.storage, scope, {
          workOrderId: scope.workOrderId,
          runtimeNodeId: scope.runtimeNodeId,
          sourceNodeType: scope.sourceNodeType,
          savedFormDataIds: recorded.savedFormDataIds,
          workflowCompleted: true,
        })
        return closed ? result('verified', 'R1 节点及 FormData 已完成服务端核验。')
          : result('awaiting_readback', '无法安全关闭事务回执。')
      }
      if (node.lifecycle !== 'active') {
        return result('awaiting_readback', '保存/删除后的 R1 节点状态不一致。')
      }
      const evidence = await options.rawReadback.readMutation(scope, recorded)
      if (!authorized(scope) || !evidence) {
        return result('awaiting_readback', '完整 FormData/EXTS 读回未完成。')
      }
      if (scope.sourceNodeType === 'forms' && !matchesFormsList(node, evidence)) {
        return result('awaiting_readback', '两路 R1 forms 列表回读不一致。')
      }
      const saved = recorded.steps[0] === 'form_upsert'
        || recorded.steps[0] === 'repeat_form_upsert'
      if (saved && (!expectedFields || Object.keys(expectedFields).length === 0)) {
        return result('awaiting_readback', '保存核验缺少本次瞬态字段，禁止仅凭 ACK 解除防重放锁。')
      }
      const closed = await closeCompletedR1MutationReceiptAfterReadback(options.storage, scope, {
        ...evidence, ...(saved ? { expectedFields } : {}),
      })
      return closed ? result('verified', 'R1 保存/删除已完成服务端双重核验。')
        : result('awaiting_readback', '回读字段或身份未通过校验。')
    } catch {
      return result('awaiting_readback', 'R1 读回失败，保留回执供人工核验。')
    }
  }

  async function execute(intent: R1Stage1Intent, location: R1PilotNodeLocation):
    Promise<R1PilotReadbackResult> {
    if (!authorized(intent.scope)) {
      return result('not_authorized', '只有明确授权的隔离 Beta 工单允许执行。')
    }
    const gateway = createR1Stage1PilotCommandGateway({ ...options, scope: intent.scope, node: location })
    const commandResult = await executeR1Stage1FunctionalCandidate(options.storage, intent, gateway)
    if (commandResult.state !== 'succeeded' || !commandResult.data) {
      return result('manual_reconciliation', '事务未完成或结果不明，不得自动重复提交。')
    }
    return reconcile(intent.scope, location,
      intent.kind === 'forms_save' || intent.kind === 'repeat_save' ? intent.fields : undefined)
  }

  return { execute, reconcile }
}
