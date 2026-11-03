import { createMockR1BusinessOptions } from '@adapters/api/mock/r1-business-options'
import { createUniNetworkStatusPort } from '@adapters/platform/uni-network-status'
import { createActionDraftRepository, type ActionDraftIdentity } from '@runtimes/action'
/** A-only, synthetic main-App bridge for the existing R1 special transaction
 * coordinator. This module cannot dispatch to any real HTTP transport. */
import { isDevMockJourneyEnabled } from '@adapters/api/mock/journey'
import { tryMockRead } from '@adapters/api/mock/router'
import { tryMockR1SpecialCommand } from '@adapters/api/mock/r1-special-protocol'
import { withR1SpecialMockTransaction } from '@adapters/api/mock/r1-special-state'
import { formDefinition } from '@adapters/api/read-models/form'
import {
  mockR1FormsWorkOrderId, mockR1RepeatWorkOrderId,
  mockSyntheticDynamicFormDefinitionId, mockR1AddFormCodeId, mockR1NoteFormDefinitionId,
} from '@adapters/api/mock/fixtures'
import { executeR1Stage1FunctionalCandidate, type R1Stage1Intent } from './r1-stage1-functional-flow'
import {
  inspectR1MultiStepReceipt, closeCompletedR1ReceiptAfterReadback,
  closeCompletedR1MutationReceiptAfterReadback, type R1MultiStepScope,
  type R1MultiStepReceipt,
} from '@features/work-orders/r1-multistep-offline-transaction'
import type {
  StoragePort, FormDefinitionRead, MediaUploadQueuePort, MediaFilePickerPort,
} from '@shared/ports'
import {
  isR1FileWireArray, r1FileWireFromUpload, type MediaUploadTask, type MediaUploadTaskId,
} from '@shared/types'
import { projectR1LocalFields } from '@features/work-orders/r1-local-form-fields'
import { asOpaqueId } from '@shared/types'
import {
  createDefaultStoragePort, createDefaultMediaFilePickerPort,
  createDefaultMediaUploadQueue, createDefaultUploadPort,
  createDefaultAuthSessionPort,
} from './composition'
import { validateR1SpecialMockFields, type R1SpecialMockFields } from '@features/work-orders/r1-special-mock-form-fields'

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

async function scopedDefinition(id = definition, isCurrent: () => boolean = () => false): Promise<FormDefinitionRead> {
  if (![definition, mockR1NoteFormDefinitionId].includes(id)) throw new Error('未知表单类型。')
  const result = await tryMockRead('biz/extField/query', { extId: id }, { latencyMs: 0 })
  const mapped = formDefinition(result, asOpaqueId<'FormDefinitionId'>(id))
  if (String(mapped.id) !== id || !mapped.fields?.length) {
    throw new Error('当前表单定义未能从 Mock 源核验。')
  }
  const provider = createMockR1BusinessOptions(isCurrent)
  const fields = await Promise.all(mapped.fields.map(async field => {
    if (field.type !== 'bizSelect') return field
    const result = await provider.getBusinessRecordOptions!({ valueOption: field.valueOption ?? '' })
    if (!isCurrent() || result.state !== 'succeeded' || !result.data) throw new Error('业务选项读取失败，请重新进入当前工单。')
    return { ...field, options: result.data.items }
  }))
  return { ...mapped, fields }
}

/** Source-backed AddFormCode lookup. Unknown definitions never reach a write. */
async function scopedDefinitions(kind: AStageSpecialKind, node: Record<string, unknown>, isCurrent: () => boolean) {
  const nodeDef = object(node.nodeDef)
  if (nodeDef?.formDefId !== definition) throw new Error('节点 FormDef 身份不一致。')
  if (kind === 'repeat') return [{ id: definition, label: '现场复检', definition: await scopedDefinition(definition, isCurrent) }]
  if (nodeDef.addFormCodeId !== mockR1AddFormCodeId) throw new Error('AddFormCode 来源未核验。')
  const source = object(await tryMockRead('code/query',
    { parentId: nodeDef.addFormCodeId }, { latencyMs: 0 }))?.data
  if (!Array.isArray(source) || !source.length || source.length > 20) throw new Error('新增表单列表无效。')
  const ids = new Set<string>()
  const choices: { id: string; label: string; definition: FormDefinitionRead }[] = []
  for (const raw of source) {
    const row = object(raw), id = object(row?.exts)?.formDefId
    if (row?.state !== 1 || typeof row.name !== 'string' || !row.name.trim()
      || typeof id !== 'string' || ids.has(id) || ![definition, mockR1NoteFormDefinitionId].includes(id)) {
      throw new Error('来源表单包含重复或未授权定义。')
    }
    ids.add(id)
    choices.push({ id, label: row.name.trim(), definition: await scopedDefinition(id, isCurrent) })
  }
  if (!ids.has(definition)) throw new Error('默认表单不存在于来源清单。')
  return choices
}
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
async function scopedForms(kind: AStageSpecialKind, id?: string, formDefId = definition) {
  if (formDefId !== definition && !(kind === 'forms' && formDefId === mockR1NoteFormDefinitionId)) {
    throw new Error('禁止跨节点读取未知表单。')
  }
  const data = id ? { 'is:_id|string#and': id }
    : { 'is:workflowId|string#and': targets[kind].run }
  const result = await tryMockRead(`biz/extForm/query/${formDefId}`, data, { latencyMs: 0 })
  const rows = object(result)?.data
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => !object(row))) {
    throw new Error('表单记录回读失败，不能继续提交。')
  }
  return rows.map(row => object(row)!)
}
function scope(kind: AStageSpecialKind, actor: AStageMockActor, formDefId = definition): R1MultiStepScope {
  const target = targets[kind]
  return { userId: actor.userId, workOrderId: target.sid,
    runtimeNodeId: target.node, workflowRunId: target.run,
    formDefinitionId: formDefId, sourceNodeType: kind,
    authorizationScope: actor.identity }
}

export function createAStageSpecialMockController(options: {
  readonly kind: AStageSpecialKind
  readonly workOrderId: string
  readonly getActor: () => AStageMockActor | null
  readonly storage: StoragePort
  readonly network?: import('@shared/ports').NetworkStatusPort
  readonly mediaQueue?: MediaUploadQueuePort
  readonly mediaPicker?: MediaFilePickerPort
}) {
  const { kind } = options
  let inFlight = false
  const expected = options.getActor()
  const authorized = () => safeActor(expected)
    && isAStageSpecialMockAvailable(kind, options.workOrderId, expected)
    && options.getActor()?.identity === expected.identity
    && options.getActor()?.roleId === expected.roleId

  const network = options.network ?? createUniNetworkStatusPort()
  const drafts = createActionDraftRepository(options.storage)

  // Same common queue used by any dynamic FormDef; only a source type=file
  // field is writable. The image reference from 020 cannot enter this path.
  async function listMediaTasks(formId: string, recordId?: string): Promise<readonly MediaUploadTask[]> {
    if (!authorized()) throw new Error('媒体队列身份已改变。')
    if (!options.mediaQueue) return []
    const form = await scopedDefinition(formId, authorized)
    const known = new Map((form.fields ?? []).filter(field => field.type === 'file'
      && !field.presentationOnly && !field.readOnly).map(field => [field.fieldId, field.valueKey]))
    if (!known.size) return []
    const listed = await options.mediaQueue.listForAction({
      userId: asOpaqueId<'UserId'>(expected!.userId),
      workOrderId: asOpaqueId<'WorkOrderId'>(options.workOrderId),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(targets[kind].node),
      formDefinitionId: asOpaqueId<'FormDefinitionId'>(formId),
      ...(recordId ? { formDataId: asOpaqueId<'FormDataId'>(recordId) } : {}),
    })
    if (!authorized() || listed.state !== 'succeeded' || !listed.data) throw new Error('媒体队列未能安全读取。')
    return listed.data.filter(task => task.scope.formDefinitionId === formId
      && String(task.scope.formDataId ?? '') === (recordId ?? '')
      && known.get(task.scope.fieldId) === task.scope.valueKey)
  }
  async function pickMedia(formId: string, fieldId: string, recordId?: string) {
    if (!authorized() || !options.mediaQueue || !options.mediaPicker) {
      return { state: 'failed' as const, message: '当前环境未提供安全媒体队列。' }
    }
    try {
      const form = await scopedDefinition(formId, authorized)
      const field = form.fields?.find(field => field.fieldId === fieldId && field.type === 'file'
        && !field.presentationOnly && !field.readOnly)
      if (!field) return { state: 'failed' as const, message: '字段不是可写的原始媒体字段。' }
      const previous = await listMediaTasks(formId, recordId)
      if (previous.length >= 10) return { state: 'failed' as const, message: '现场附件数量已达上限。' }
      const picked = await options.mediaPicker.pick()
      if (!authorized()) return { state: 'failed' as const, message: '操作身份已变化。' }
      if (picked.state === 'cancelled') return { state: 'cancelled' as const }
      if (picked.state !== 'granted' || !picked.value?.length) {
        return { state: 'failed' as const, message: '未能读取选中的现场附件。' }
      }
      if (picked.value.length + previous.length > 10) {
        return { state: 'failed' as const, message: '本次选择超过附件数量上限。' }
      }
      for (const media of picked.value) {
        if (!authorized()) return { state: 'failed' as const, message: '操作身份已变化。' }
        const enqueued = await options.mediaQueue.enqueue({
          scope: {
            userId: asOpaqueId<'UserId'>(expected!.userId),
            workOrderId: asOpaqueId<'WorkOrderId'>(options.workOrderId),
            workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(targets[kind].node),
            formDefinitionId: asOpaqueId<'FormDefinitionId'>(formId),
            ...(recordId ? { formDataId: asOpaqueId<'FormDataId'>(recordId) } : {}),
            fieldId, valueKey: field.valueKey,
          },
          media,
          evidence: { postUploadPolicy: 'none' },
        })
        if (enqueued.state !== 'succeeded' || !enqueued.data) {
          return { state: 'failed' as const, message: '附件未能安全保存到上传队列。' }
        }
        const processed = await options.mediaQueue.process(enqueued.data.taskId)
        if (processed.state !== 'succeeded') {
          return { state: 'failed' as const, message: '附件尚未上传完成，请检查后手动重试。' }
        }
      }
      return { state: 'succeeded' as const }
    } catch { return { state: 'failed' as const, message: '附件处理失败，原记录未改变。' } }
  }
  async function existingMediaTask(formId: string, taskId: MediaUploadTaskId, recordId?: string) {
    return (await listMediaTasks(formId, recordId)).find(item => item.taskId === taskId)
  }
  async function retryMedia(formId: string, taskId: MediaUploadTaskId, recordId?: string): Promise<boolean> {
    if (!options.mediaQueue) return false
    const task = await existingMediaTask(formId, taskId, recordId)
    if (!task || task.state !== 'failed_retryable' || task.lastError?.code === 'ambiguous_postprocess') return false
    const result = await options.mediaQueue.retry(taskId)
    return authorized() && result.state === 'succeeded'
  }
  async function discardMedia(formId: string, taskId: MediaUploadTaskId, recordId?: string): Promise<boolean> {
    if (!options.mediaQueue || !await existingMediaTask(formId, taskId, recordId)) return false
    const result = await options.mediaQueue.discard(taskId)
    return authorized() && result.state === 'succeeded'
  }
  async function finalizeMedia(formId: string, recordId?: string): Promise<boolean> {
    if (!options.mediaQueue) return true
    const tasks = await listMediaTasks(formId, recordId)
    if (tasks.some(task => task.state !== 'uploaded')) return false
    const finalized = await Promise.all(tasks.map(task => options.mediaQueue!.finalizeAfterSave(task.taskId)))
    return authorized() && finalized.every(result => result.state === 'succeeded')
  }
  function draftIdentity(formId: string, recordId?: string): ActionDraftIdentity {
    if (!authorized() || ![definition, mockR1NoteFormDefinitionId].includes(formId)
      || (kind === 'repeat' && formId !== definition)) throw new Error('草稿身份不可用')
    return { version: 1, userId: asOpaqueId<'UserId'>(expected!.userId),
      roleId: asOpaqueId<'RoleId'>(expected!.roleId),
      workOrderId: asOpaqueId<'WorkOrderId'>(options.workOrderId),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(targets[kind].node),
      actionIntent: 'interact_with_form', contentKind: 'dynamic_form',
      contentIdentity: JSON.stringify([formId, recordId ?? null]) }
  }
  // Drafts retain incomplete editing state, never command payloads or receipts.
  async function readDraft(formId: string, recordId?: string): Promise<R1SpecialMockFields | null> {
    const result = await drafts.read(draftIdentity(formId, recordId))
    if (!authorized() || result.state !== 'succeeded') throw new Error('草稿读取失败')
    if (!result.data || result.data.status !== 'unfinished') return null
    const fields = (await scopedDefinition(formId, authorized)).fields ?? []
    const values = result.data.values
    if (Object.keys(values).length > 50 || Object.entries(values).some(([key, value]) =>
      !fields.some(field => field.valueKey === key && !field.readOnly && !field.presentationOnly)
      || !(typeof value === 'string' && value.length <= 4000
        || typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean'
        || Array.isArray(value) && (value.length <= 30 && value.every(item => typeof item === 'string' && item.length <= 256)
          || isR1FileWireArray(value))))) {
      throw new Error('草稿内容无法安全恢复')
    }
    if (!authorized()) throw new Error('草稿身份已变化')
    return values as R1SpecialMockFields
  }
  async function writeDraft(formId: string, values: R1SpecialMockFields, recordId?: string): Promise<boolean> {
    const identity = draftIdentity(formId, recordId)
    const result = await drafts.write({ version: 1, identity, values: { ...values },
      status: 'unfinished', updatedAt: new Date().toISOString() })
    return authorized() && result.state === 'succeeded'
  }
  async function removeDraft(formId: string, recordId?: string): Promise<boolean> {
    const identity = draftIdentity(formId, recordId)
    const marked = await drafts.write({ version: 1, identity, values: {},
      status: 'completed', updatedAt: new Date().toISOString() })
    if (marked.state !== 'succeeded' || !authorized()) return false
    await drafts.remove(identity) // completed tombstone remains safe if cleanup fails
    return authorized()
  }

  async function load(): Promise<AStageSpecialView> {
    if (!authorized()) throw new Error('身份或环境已变化，不能操作当前表单。')
    const node = await rawDetail(kind)
    const definitions = await scopedDefinitions(kind, node, authorized)
    const formDef = definitions.find(item => item.id === definition)!.definition
    if (!authorized()) throw new Error('角色已变化，请重新进入工单。')
    const originals = kind === 'forms' ? object(node.exts)?.formList : await scopedForms('repeat')
    if (!Array.isArray(originals) || originals.length > 100) throw new Error('表单列表尚未完整读取。')
    const entries: AStageSpecialRecord[] = []
    for (const item of originals) {
      const raw = object(item)
      if (!raw || typeof raw._id !== 'string') throw new Error('表单身份无效。')
      const formDefId = typeof raw.formDefId === 'string' ? raw.formDefId : definition
      const sourceDefinition = definitions.find(item => item.id === formDefId)?.definition
      if (!sourceDefinition) throw new Error('记录所属 FormDef 没有来源证据。')
      const own = raw._id.startsWith(`mock-special-form-data-${kind}-`)
      const row = own ? (await scopedForms(kind, raw._id, formDefId))[0] : raw
      if (own && (!row || row.sid !== targets[kind].sid || row.nodeId !== targets[kind].node)) {
        throw new Error('表单身份与当前节点不一致。')
      }
      const fields = object(row?.exts)
      entries.push({ id: raw._id,
        ...(own ? { revision: JSON.stringify(row) } : {}),
        formDefinitionId: formDefId,
        title: typeof raw.formTitle === 'string' ? raw.formTitle : '现场记录',
        summary: typeof fields?.inspectionSummary === 'string' ? fields.inspectionSummary : '',
        values: Object.fromEntries(sourceDefinition.fields!.filter(field => !field.presentationOnly
          && (typeof fields?.[field.valueKey] === 'string'
            || typeof fields?.[field.valueKey] === 'number'
            || typeof fields?.[field.valueKey] === 'boolean'
            || (Array.isArray(fields?.[field.valueKey])
              && ((fields?.[field.valueKey] as unknown[]).every(item => typeof item === 'string')
                  || isR1FileWireArray(fields?.[field.valueKey])))))
          .map(field => [field.valueKey, fields![field.valueKey] as R1SpecialMockFields[string]])),
        state: raw.state === -1 ? 'deleted' : 'active', editable: own && raw.state !== -1,
      })
    }
    const receipts = await Promise.all(definitions.map(async item => {
      const receipt = await inspectR1MultiStepReceipt(options.storage, scope(kind, expected!, item.id))
      if (receipt.state !== 'succeeded') throw new Error('防重回执不可读取，操作已停止。')
      return { id: item.id, data: receipt.data }
    }))
    const pending = receipts.filter(item => item.data !== null)
    // Any sibling FormDef receipt fences the whole node, not only its editor.
    return { kind, definition: formDef, definitions, nodeActive: node.state === 0, entries,
      ...(pending.length === 1 ? { pendingFormDefinitionId: pending[0]!.id } : {}),
      receiptPending: pending.length > 0,
      pendingRecoverable: pending.length === 1 && pending[0]!.data?.state === 'completed',
      pendingNeedsOriginalFields: pending.length === 1 && pending[0]!.data?.state === 'completed'
        && ['form_upsert', 'repeat_form_upsert'].includes(pending[0]!.data?.steps[0] ?? ''),
    }
  }

  /** A Process ACK is not completion. Re-fetch workflow and the bounded
   * record list; for Save→Process also compare the saved FormData payload.
   * No optimistic UI or receipt release before all independent reads agree. */
  async function confirmProcessed(
    s: R1MultiStepScope, receipt: R1MultiStepReceipt, savedFields?: R1SpecialMockFields,
  ): Promise<boolean> {
    const node = await rawDetail(kind)
    if (node.state !== 10 || !authorized()) return false
    const records = kind === 'forms' ? object(node.exts)?.formList : await scopedForms('repeat')
    if (!Array.isArray(records) || records.length > 100) return false
    const activeIds = records.filter(row => object(row)?.state === 1)
      .map(row => object(row)?._id)
    if (!receipt.savedFormDataIds.length || receipt.savedFormDataIds.some(id => !activeIds.includes(id))) return false
    if (savedFields !== undefined) {
      const id = receipt.savedFormDataIds[0]
      if (receipt.savedFormDataIds.length !== 1 || !id) return false
      const [record] = await scopedForms(kind, id, s.formDefinitionId)
      if (!record || record._id !== id || record.sid !== s.workOrderId
        || record.nodeId !== s.runtimeNodeId || record.workflowId !== s.workflowRunId
        || record.state !== 1
        || Object.entries(savedFields).some(([key, value]) => Array.isArray(value)
          ? JSON.stringify(record[key]) !== JSON.stringify(value) : record[key] !== value)) return false
    }
    if (!authorized()) return false
    return closeCompletedR1ReceiptAfterReadback(options.storage, s, {
      workOrderId: s.workOrderId, runtimeNodeId: s.runtimeNodeId,
      sourceNodeType: kind, savedFormDataIds: receipt.savedFormDataIds,
      workflowCompleted: true,
    })
  }

  /** Resume only LOCAL receipt reconciliation. This performs fresh Mock reads
   * but never dispatches a FormData, EXTS, remove or Process command. A
   * may-have-dispatched ACK can NEVER be converted into safe-to-retry here. */
  async function recoverCompleted(originalFields: R1SpecialMockFields): Promise<AStageSpecialOutcome> {
    if (inFlight) return { state: 'blocked', message: '已有操作正在处理，请稍后再核对。' }
    inFlight = true
    try {
      if (!authorized()) return { state: 'blocked', message: '角色或环境已变化，禁止跨角色恢复。' }
      const before = await load()
      const chosen = before.definitions.find(item => item.id === before.pendingFormDefinitionId)
      if (!chosen) return { state: 'blocked', message: '无法确认待核对记录的 FormDef。' }
      const s = scope(kind, expected!, chosen.id)
      const found = await inspectR1MultiStepReceipt(options.storage, s)
      if (found.state !== 'succeeded' || !found.data) return { state: 'blocked',
        message: '没有可恢复的有效事务记录；禁止猜测并重发。' }
      const receipt = found.data
      if (receipt.state !== 'completed') return { state: 'uncertain',
        message: '已有步骤可能执行，但未获得完整 ACK；无法自动消除防重复提交保护。' }
      if (!authorized()) return { state: 'blocked', message: '读取期间角色发生变化。' }
      const saving = ['form_upsert', 'repeat_form_upsert'].includes(receipt.steps[0] ?? '')
      const deleting = ['forms_soft_delete', 'repeat_remove'].some(step => receipt.steps.includes(step as typeof receipt.steps[number]))
      const checked = saving ? validateR1SpecialMockFields(chosen.definition, originalFields) : null
      if (checked && !checked.ok) return { state: 'blocked', message: `请重新填写原保存的完整表单：${checked.message}` }
      const expectedFields = checked?.ok ? checked.fields : undefined
      let closed = false
      if (receipt.steps.includes('workflow_process')) {
        closed = await confirmProcessed(s, receipt, expectedFields)
      } else if (saving || deleting) {
        const id = saving ? receipt.savedFormDataIds[0] : receipt.targetFormDataId
        if (!id) return { state: 'uncertain', message: '回执缺少可核验记录 ID，不能清理。' }
        const record = (await scopedForms(kind, id, chosen.id))[0]
        const rows = kind === 'repeat' ? await scopedForms('repeat') : []
        const node = await rawDetail(kind)
        if (!authorized()) return { state: 'blocked', message: '回查期间身份已变化。' }
        closed = await closeCompletedR1MutationReceiptAfterReadback(options.storage, s, {
          workOrderId: s.workOrderId, runtimeNodeId: s.runtimeNodeId,
          formDefinitionId: s.formDefinitionId, workflowRunId: s.workflowRunId,
          sourceNodeType: kind,
          ...(record ? { formData: record } : {}),
          ...(expectedFields ? { expectedFields } : {}),
          ...(receipt.clearedFieldKeys?.length ? { expectedAbsentKeys: receipt.clearedFieldKeys } : {}),
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
      return await withR1SpecialMockTransaction<AStageSpecialOutcome>('snapshot-020-021', async () => {
      if (!authorized()) return { state: 'blocked', message: '当前角色或 Mock 环境不可用。' }
      if (await network.current() === 'offline') return { state: 'blocked',
        message: '网络不可用，填写内容保留在本机。连接恢复后请主动保存。' }
      const before = await load()
      if (!before.nodeActive || before.receiptPending) return { state: 'blocked',
        message: before.receiptPending ? '上一笔操作回执仍需核对，不能重复提交。' : '当前节点已完成。' }
      const selected = action.kind === 'edit' || action.kind === 'delete'
        ? before.entries.find(item => item.id === action.id && item.editable) : undefined
      const requestedId = action.kind === 'finish' ? definition
        : action.kind === 'edit' || action.kind === 'delete' ? selected?.formDefinitionId
        : action.formDefinitionId ?? definition
      const chosen = before.definitions.find(item => item.id === requestedId)
      if (!chosen) return { state: 'blocked', message: '表单不在当前节点的来源清单中。' }
      if ('formDefinitionId' in action && action.formDefinitionId !== undefined
        && action.formDefinitionId !== chosen.id) return { state: 'blocked', message: '编辑不可切换表单定义。' }
      const s = scope(kind, expected!, chosen.id)
      const node = await rawDetail(kind)
      let intent: R1Stage1Intent
      const checked = 'fields' in action
        ? validateR1SpecialMockFields(chosen.definition, action.fields) : null
      if (checked && !checked.ok) return { state: 'blocked', message: checked.message }
      const fields = checked?.ok ? checked.fields : undefined
      if (fields) {
        // A saved media value is either a verified prior record value or was
        // uploaded by the exact current common queue scope. No forged URL may
        // enter a new FormData merely by resembling the R1 wire shape.
        const tasks = await listMediaTasks(chosen.id,
          action.kind === 'edit' ? action.id : undefined)
        if (tasks.some(task => task.state !== 'uploaded')) return { state: 'blocked',
          message: '附件队列仍有未完成项目，请重试或删除后保存。' }
        for (const sourceField of chosen.definition.fields ?? []) {
          if (sourceField.type !== 'file') continue
          const submitted = fields[sourceField.valueKey]
          if (submitted === undefined) continue
          if (!isR1FileWireArray(submitted)) return { state: 'blocked', message: '附件列表格式异常。' }
          const fromQueue = tasks.filter(task => task.scope.fieldId === sourceField.fieldId)
            .flatMap(task => task.uploadedRef ? [r1FileWireFromUpload(task.uploadedRef)] : [])
            .filter((value): value is NonNullable<typeof value> => value !== null)
          const fromSaved = action.kind === 'edit' && selected
            && isR1FileWireArray(selected.values[sourceField.valueKey])
            ? selected.values[sourceField.valueKey] as readonly import('@shared/types').R1FileWireValue[] : []
          if (submitted.some(ref => ![...fromQueue, ...fromSaved]
            .some(allowed => JSON.stringify(allowed) === JSON.stringify(ref)))) {
            return { state: 'blocked', message: '附件没有来自当前表单的已完成上传。' }
          }
        }
      }
      if ('expectedRevision' in action && action.expectedRevision !== undefined
        && (!selected || selected.revision !== action.expectedRevision)) {
        return { state: 'blocked', message: '记录已被其他编辑器更新，请重新读取后再修改。' }
      }
      if (action.kind === 'save' || action.kind === 'save_finish') {
        if (action.kind === 'save_finish' && kind !== 'forms') return { state: 'blocked',
          message: '只有 forms 节点支持保存后立即完成。' }
        if (kind === 'forms') intent = { kind: 'forms_save', sourceNodeType: 'forms', scope: s,
          fields: fields!, title: (action.title || '现场记录').trim(),
          authoritativeExts: object(node.exts) ?? {}, processActive: action.kind === 'save_finish' }
        else intent = { kind: 'repeat_save', sourceNodeType: 'repeat', scope: s,
          fields: fields! }
      } else if (action.kind === 'edit' || action.kind === 'delete') {
        if (!selected) return { state: 'blocked', message: '只有当前 Mock 新建且有效的表单可以修改。' }
        const original = (await scopedForms(kind, action.id, chosen.id))[0]
        if (!original || original.state !== 1) return { state: 'blocked', message: '原始表单记录已不可用。' }
        const missing = action.kind === 'edit'
          ? chosen.definition.fields?.filter(field => !field.presentationOnly
            && Object.hasOwn(object(original.exts) ?? {}, field.valueKey)
            && fields?.[field.valueKey] === undefined) ?? [] : []
        const projected = action.kind === 'edit'
          ? projectR1LocalFields(chosen.definition, fields) : []
        // Only an explicitly omitted, previously present, source optional
        // field may be removed. Hidden/read-only/unknown fields cannot vanish.
        if (missing.some(field => {
          const state = projected.find(item => item.fieldId === field.fieldId)
          return !state?.supported || state.required || state.readOnly
        })) return { state: 'blocked', message: '现有字段不可清空，保留原始记录。' }
        const clearedFieldKeys = missing.map(field => field.valueKey)
        if (action.kind === 'delete') {
          intent = kind === 'forms'
            ? { kind: 'forms_delete', sourceNodeType: 'forms', scope: s,
              existingFormDataId: action.id, authoritativeExts: object(node.exts) ?? {},
              sourceFormData: original }
            : { kind: 'repeat_delete', sourceNodeType: 'repeat', scope: s, existingFormDataId: action.id }
        } else {
          intent = kind === 'forms'
            ? { kind: 'forms_save', sourceNodeType: 'forms', scope: s,
              fields: fields!, title: (action.title || selected.title).trim(),
              authoritativeOriginal: original, authoritativeExts: object(node.exts) ?? {},
              existingFormDataId: action.id, clearedFieldKeys, processActive: false }
            : { kind: 'repeat_save', sourceNodeType: 'repeat', scope: s,
              fields: fields!, authoritativeOriginal: original,
              existingFormDataId: action.id, clearedFieldKeys }
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
      let reconciled = false
      if (action.kind === 'finish' || action.kind === 'save_finish') {
        reconciled = await confirmProcessed(s, receipt,
          action.kind === 'save_finish' ? fields : undefined)
      } else {
        const after = await rawDetail(kind)
        const id = action.kind === 'save' || action.kind === 'edit'
          ? receipt.savedFormDataIds[0] : action.id
        const record = id ? (await scopedForms(kind, id, chosen.id))[0] : undefined
        const rows = kind === 'repeat' ? await scopedForms('repeat') : []
        reconciled = await closeCompletedR1MutationReceiptAfterReadback(options.storage, s, {
          workOrderId: s.workOrderId, runtimeNodeId: s.runtimeNodeId,
          formDefinitionId: s.formDefinitionId, workflowRunId: s.workflowRunId,
          sourceNodeType: kind,
          ...(record ? { formData: record } : {}),
          ...(action.kind === 'save' || action.kind === 'edit'
            ? { expectedFields: fields!, ...(receipt.clearedFieldKeys?.length
                ? { expectedAbsentKeys: receipt.clearedFieldKeys } : {}) } : {}),
          ...(kind === 'forms' ? { formsExts: object(after.exts) ?? {} }
            : { repeatList: { complete: true as const, workflowRunId: s.workflowRunId!,
                savedIds: rows.map(row => String(row._id)) } }),
        })
      }
      if (!reconciled || !authorized()) return { state: 'uncertain',
        message: 'Mock 已收到操作，但权威回读尚未闭环；已保留防重回执。' }
      return { state: 'succeeded', view: await load() }
      })
    } catch {
      return { state: 'uncertain', message: '表单操作被本机事务锁或回读异常阻止，禁止盲目重试。' }
    } finally { inFlight = false }
  }
  return { load, execute, recoverCompleted, network, readDraft, writeDraft, removeDraft,
    listMediaTasks, pickMedia, retryMedia, discardMedia, finalizeMedia }
}

/** Page-composed DEV capability. No page or feature creates a storage adapter. */
export function createAStageSpecialMockControllerForActor(
  options: Omit<Parameters<typeof createAStageSpecialMockController>[0], 'storage'>,
) {
  const storage = createDefaultStoragePort()
  return createAStageSpecialMockController({ ...options, storage,
    mediaPicker: createDefaultMediaFilePickerPort(),
    mediaQueue: createDefaultMediaUploadQueue(storage, createDefaultUploadPort(createDefaultAuthSessionPort())),
  })
}
