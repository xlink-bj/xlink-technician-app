/** A-only, synthetic main-App bridge for the existing R1 special transaction
 * coordinator. This module cannot dispatch to any real HTTP transport. */
import { isDevMockJourneyEnabled } from '@adapters/api/mock/journey'
import { tryMockRead } from '@adapters/api/mock/router'
import { tryMockR1SpecialCommand } from '@adapters/api/mock/r1-special-protocol'
import {
  mockR1FormsWorkOrderId, mockR1RepeatWorkOrderId,
  mockSyntheticDynamicFormDefinitionId,
} from '@adapters/api/mock/fixtures'
import { executeR1Stage1FunctionalCandidate, type R1Stage1Intent } from './r1-stage1-functional-flow'
import {
  inspectR1MultiStepReceipt, closeCompletedR1ReceiptAfterReadback,
  closeCompletedR1MutationReceiptAfterReadback, type R1MultiStepScope,
} from '@features/work-orders/r1-multistep-offline-transaction'
import type { StoragePort } from '@shared/ports'

import type {
  AStageSpecialKind, AStageMockActor, AStageSpecialAction, AStageSpecialRecord,
  AStageSpecialView, AStageSpecialOutcome,
} from '@features/work-orders/a-stage-special-mock-port'
export type {
  AStageSpecialKind, AStageMockActor, AStageSpecialAction, AStageSpecialRecord,
  AStageSpecialView, AStageSpecialOutcome,
} from '@features/work-orders/a-stage-special-mock-port'

const targets = {
  forms: { sid: mockR1FormsWorkOrderId, node: 'mock-workflow-node-020-forms', run: 'mock-workflow-run-020' },
  repeat: { sid: mockR1RepeatWorkOrderId, node: 'mock-workflow-node-021-repeat', run: 'mock-workflow-run-021' },
} as const
const definition = mockSyntheticDynamicFormDefinitionId

function object(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : null
}
function safeActor(actor: AStageMockActor | null | undefined): actor is AStageMockActor {
  return actor?.userId === 'synthetic-user' && actor.roleId === 'synthetic-role'
    && typeof actor.identity === 'string' && actor.identity.length > 0
}
export function isAStageSpecialMockAvailable(kind: AStageSpecialKind, workOrderId: string,
  actor: AStageMockActor | null | undefined): boolean {
  return isDevMockJourneyEnabled() && targets[kind]?.sid === workOrderId && safeActor(actor)
}
async function rawDetail(kind: AStageSpecialKind) {
  const target = targets[kind]
  const result = await tryMockRead(`basic/serviceAppointment/queryById/${target.sid}`, {}, { latencyMs: 0 })
  const detail = object(object(result)?.data)
  const node = detail && Array.isArray(detail.workflowNode)
    ? detail.workflowNode.map(object).find(row => row?._id === target.node) : null
  const nodeDef = object(node?.nodeDef)
  if (object(detail?.serviceAppointment)?._id !== target.sid
    || object(detail?.workflow)?._id !== target.run
    || node?.workflowId !== target.run || nodeDef?.nodeType !== kind
    || nodeDef.formDefId !== definition) throw new Error('当前表单节点身份未能核对。')
  return node!
}
async function scopedForms(kind: AStageSpecialKind, id?: string) {
  const data = id ? { 'is:_id|string#and': id }
    : { 'is:workflowId|string#and': targets[kind].run }
  const result = await tryMockRead(`biz/extForm/query/${definition}`, data, { latencyMs: 0 })
  const rows = object(result)?.data
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => !object(row))) {
    throw new Error('表单记录回读失败，不能继续提交。')
  }
  return rows.map(row => object(row)!)
}
function scope(kind: AStageSpecialKind, actor: AStageMockActor): R1MultiStepScope {
  const target = targets[kind]
  return { userId: actor.userId, workOrderId: target.sid,
    runtimeNodeId: target.node, workflowRunId: target.run,
    formDefinitionId: definition, sourceNodeType: kind,
    authorizationScope: actor.identity }
}

export function createAStageSpecialMockController(options: {
  readonly kind: AStageSpecialKind
  readonly workOrderId: string
  readonly getActor: () => AStageMockActor | null
  readonly storage: StoragePort
}) {
  const { kind } = options
  let inFlight = false
  const expected = options.getActor()
  const authorized = () => safeActor(expected)
    && isAStageSpecialMockAvailable(kind, options.workOrderId, expected)
    && options.getActor()?.identity === expected.identity
    && options.getActor()?.roleId === expected.roleId

  async function load(): Promise<AStageSpecialView> {
    if (!authorized()) throw new Error('身份或环境已变化，不能操作当前表单。')
    const node = await rawDetail(kind)
    if (!authorized()) throw new Error('角色已变化，请重新进入工单。')
    const originals = kind === 'forms' ? object(node.exts)?.formList : await scopedForms('repeat')
    if (!Array.isArray(originals) || originals.length > 100) throw new Error('表单列表尚未完整读取。')
    const entries: AStageSpecialRecord[] = []
    for (const item of originals) {
      const raw = object(item)
      if (!raw || typeof raw._id !== 'string') throw new Error('表单身份无效。')
      const own = raw._id.startsWith(`mock-special-form-data-${kind}-`)
      const row = own ? (await scopedForms(kind, raw._id))[0] : raw
      if (own && (!row || row.sid !== targets[kind].sid || row.nodeId !== targets[kind].node)) {
        throw new Error('表单身份与当前节点不一致。')
      }
      const fields = object(row?.exts)
      entries.push({ id: raw._id,
        title: typeof raw.formTitle === 'string' ? raw.formTitle : '现场记录',
        summary: typeof fields?.inspectionSummary === 'string' ? fields.inspectionSummary : '',
        state: raw.state === -1 ? 'deleted' : 'active', editable: own && raw.state !== -1,
      })
    }
    const receipt = await inspectR1MultiStepReceipt(options.storage, scope(kind, expected!))
    if (receipt.state !== 'succeeded') throw new Error('防重回执不可读取，操作已停止。')
    return { kind, nodeActive: node.state === 0, entries,
      receiptPending: receipt.data !== null,
      pendingRecoverable: receipt.data?.state === 'completed',
      pendingNeedsOriginalText: receipt.data?.state === 'completed'
        && ['form_upsert', 'repeat_form_upsert'].includes(receipt.data.steps[0] ?? ''),
    }
  }

  /** Resume only LOCAL receipt reconciliation. This performs fresh Mock reads
   * but never dispatches a FormData, EXTS, remove or Process command. A
   * may-have-dispatched ACK can NEVER be converted into safe-to-retry here. */
  async function recoverCompleted(originalSummary: string): Promise<AStageSpecialOutcome> {
    if (inFlight) return { state: 'blocked', message: '已有操作正在处理，请稍后再核对。' }
    inFlight = true
    try {
      if (!authorized()) return { state: 'blocked', message: '角色或环境已变化，禁止跨角色恢复。' }
      const s = scope(kind, expected!)
      const found = await inspectR1MultiStepReceipt(options.storage, s)
      if (found.state !== 'succeeded' || !found.data) return { state: 'blocked',
        message: '没有可恢复的有效事务记录；禁止猜测并重发。' }
      const receipt = found.data
      if (receipt.state !== 'completed') return { state: 'uncertain',
        message: '已有步骤可能执行，但未获得完整 ACK；无法自动消除防重复提交保护。' }
      const node = await rawDetail(kind)
      if (!authorized()) return { state: 'blocked', message: '读取期间角色发生变化。' }
      const saving = ['form_upsert', 'repeat_form_upsert'].includes(receipt.steps[0] ?? '')
      const deleting = ['forms_soft_delete', 'repeat_remove'].some(step => receipt.steps.includes(step as typeof receipt.steps[number]))
      let closed = false
      if (receipt.steps.includes('workflow_process')) {
        closed = node.state === 10 && await closeCompletedR1ReceiptAfterReadback(options.storage, s,
          { workOrderId: s.workOrderId, runtimeNodeId: s.runtimeNodeId,
            sourceNodeType: kind, savedFormDataIds: receipt.savedFormDataIds,
            workflowCompleted: true })
      } else if (saving || deleting) {
        const id = saving ? receipt.savedFormDataIds[0] : receipt.targetFormDataId
        if (!id) return { state: 'uncertain', message: '回执缺少可核验记录 ID，不能清理。' }
        const confirmedText = originalSummary.trim()
        if (saving && (!confirmedText || confirmedText.length > 4000)) return {
          state: 'blocked', message: '请重新填写原保存的现场情况，以便与最新记录逐字核对。',
        }
        const record = (await scopedForms(kind, id))[0]
        const rows = kind === 'repeat' ? await scopedForms('repeat') : []
        if (!authorized()) return { state: 'blocked', message: '回查期间身份已变化。' }
        closed = await closeCompletedR1MutationReceiptAfterReadback(options.storage, s, {
          workOrderId: s.workOrderId, runtimeNodeId: s.runtimeNodeId,
          formDefinitionId: definition, workflowRunId: s.workflowRunId,
          sourceNodeType: kind,
          ...(record ? { formData: record } : {}),
          ...(saving ? { expectedFields: { inspectionSummary: confirmedText } } : {}),
          ...(kind === 'forms' ? { formsExts: object(node.exts) ?? {} }
            : { repeatList: { complete: true as const, workflowRunId: s.workflowRunId!,
                savedIds: rows.map(row => String(row._id)) } }),
        })
      }
      if (!closed || !authorized()) return { state: 'uncertain',
        message: '权威 Mock 回读仍不能证明完整执行；原防重回执已保留。' }
      return { state: 'succeeded', view: await load() }
    } catch { return { state: 'uncertain', message: '只读核对未能完成；未重新发送任何业务命令。' } }
    finally { inFlight = false }
  }

  async function execute(action: AStageSpecialAction): Promise<AStageSpecialOutcome> {
    if (inFlight) return { state: 'blocked', message: '正在处理上一笔表单操作。' }
    inFlight = true
    try {
      if (!authorized()) return { state: 'blocked', message: '当前角色或 Mock 环境不可用。' }
      const before = await load()
      if (!before.nodeActive || before.receiptPending) return { state: 'blocked',
        message: before.receiptPending ? '上一笔操作回执仍需核对，不能重复提交。' : '当前节点已完成。' }
      const s = scope(kind, expected!)
      const node = await rawDetail(kind)
      let intent: R1Stage1Intent
      const summary = 'summary' in action ? action.summary.trim() : ''
      if ('summary' in action && (!summary || summary.length > 4000)) return { state: 'blocked',
        message: '请填写现场情况（最多 4000 字）。' }
      if (action.kind === 'save') {
        if (kind === 'forms') intent = { kind: 'forms_save', sourceNodeType: 'forms', scope: s,
          fields: { inspectionSummary: summary }, title: (action.title || '现场记录').trim(),
          authoritativeExts: object(node.exts) ?? {}, processActive: false }
        else intent = { kind: 'repeat_save', sourceNodeType: 'repeat', scope: s,
          fields: { inspectionSummary: summary } }
      } else if (action.kind === 'edit' || action.kind === 'delete') {
        const selected = before.entries.find(row => row.id === action.id && row.editable)
        if (!selected) return { state: 'blocked', message: '只有当前 Mock 新建且有效的表单可以修改。' }
        const original = (await scopedForms(kind, action.id))[0]
        if (!original || original.state !== 1) return { state: 'blocked', message: '原始表单记录已不可用。' }
        if (action.kind === 'delete') {
          intent = kind === 'forms'
            ? { kind: 'forms_delete', sourceNodeType: 'forms', scope: s,
              existingFormDataId: action.id, authoritativeExts: object(node.exts) ?? {},
              sourceFormData: original }
            : { kind: 'repeat_delete', sourceNodeType: 'repeat', scope: s, existingFormDataId: action.id }
        } else {
          intent = kind === 'forms'
            ? { kind: 'forms_save', sourceNodeType: 'forms', scope: s,
              fields: { inspectionSummary: summary }, title: (action.title || selected.title).trim(),
              authoritativeOriginal: original, authoritativeExts: object(node.exts) ?? {},
              existingFormDataId: action.id, processActive: false }
            : { kind: 'repeat_save', sourceNodeType: 'repeat', scope: s,
              fields: { inspectionSummary: summary }, authoritativeOriginal: original,
              existingFormDataId: action.id }
        }
      } else {
        const ids = kind === 'forms' ? before.entries.filter(row => row.state === 'active').map(row => row.id)
          : before.entries.filter(row => row.state === 'active' && row.editable).map(row => row.id)
        if (!ids.length) return { state: 'blocked', message: '尚无可用于完成节点的已保存表单。' }
        intent = kind === 'forms'
          ? { kind: 'forms_finalize', sourceNodeType: 'forms', scope: s, authoritativeSavedIds: ids }
          : { kind: 'repeat_finalize', sourceNodeType: 'repeat', scope: s, authoritativeSavedIds: ids }
      }
      const gateway = {
        revalidate: async (requested: R1MultiStepScope) => {
          if (!authorized() || requested.workOrderId !== s.workOrderId
            || requested.runtimeNodeId !== s.runtimeNodeId
            || requested.authorizationScope !== s.authorizationScope) return false
          try { return (await rawDetail(kind)).state === 0 && authorized() } catch { return false }
        },
        dispatch: async (request: Parameters<typeof tryMockR1SpecialCommand>[0]) => {
          if (!authorized()) throw new Error('角色在命令发送前已变化。')
          return tryMockR1SpecialCommand(request,
            { userId: expected!.userId, roleId: expected!.roleId }, authorized)
        },
      }
      const result = await executeR1Stage1FunctionalCandidate(options.storage, intent, gateway)
      if (result.state !== 'succeeded' || !result.data) return { state: 'uncertain',
        message: '请求未完成或回执丢失。请核对当前 Mock 记录，不要重复提交。' }
      if (!authorized()) return { state: 'uncertain', message: '角色已变化，已保留回执，禁止重试。' }
      const receipt = result.data
      const after = await rawDetail(kind)
      let reconciled = false
      if (action.kind === 'finish') {
        reconciled = after.state === 10 && await closeCompletedR1ReceiptAfterReadback(options.storage, s,
          { workOrderId: s.workOrderId, runtimeNodeId: s.runtimeNodeId,
            sourceNodeType: kind, savedFormDataIds: receipt.savedFormDataIds,
            workflowCompleted: true })
      } else {
        const id = action.kind === 'save' || action.kind === 'edit'
          ? receipt.savedFormDataIds[0] : action.id
        const record = id ? (await scopedForms(kind, id))[0] : undefined
        const rows = await scopedForms('repeat')
        reconciled = await closeCompletedR1MutationReceiptAfterReadback(options.storage, s, {
          workOrderId: s.workOrderId, runtimeNodeId: s.runtimeNodeId,
          formDefinitionId: definition, workflowRunId: s.workflowRunId,
          sourceNodeType: kind,
          ...(record ? { formData: record } : {}),
          ...(action.kind === 'save' || action.kind === 'edit'
            ? { expectedFields: { inspectionSummary: summary } } : {}),
          ...(kind === 'forms' ? { formsExts: object(after.exts) ?? {} }
            : { repeatList: { complete: true as const, workflowRunId: s.workflowRunId!,
                savedIds: rows.map(row => String(row._id)) } }),
        })
      }
      if (!reconciled || !authorized()) return { state: 'uncertain',
        message: 'Mock 已收到操作，但权威回读尚未闭环；已保留防重回执。' }
      return { state: 'succeeded', view: await load() }
    } catch {
      return { state: 'uncertain', message: '表单操作结果未能完整确认，禁止盲目重试。' }
    } finally { inFlight = false }
  }
  return { load, execute, recoverCompleted }
}
