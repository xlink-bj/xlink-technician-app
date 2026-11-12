import {isSurveyMediaFieldEligible} from '@features/work-orders/r1-survey-media-create'
import { ref } from 'vue'
import type { MediaFilePickerPort, MediaUploadQueuePort } from '@shared/ports'
import { asOpaqueId, r1FileWireFromUpload, type LocalMedia, type MediaUploadTask, type MediaUploadTaskId, type OperationSnapshot, type R1FileWireValue } from '@shared/types'
import { isR1NormalImageMedia, isR1NormalImageWireArray } from '@shared/form/r1-normal-image-contract'
import { isMediaUploadTask } from '@runtimes/media/media-task-validation'
import { isR1NormalFileFieldEligible } from '@features/work-orders/r1-normal-file-values'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import type { R1NormalFormFileSession } from '@features/work-orders/r1-normal-form-media-port'
import type { R1RepeatScope } from './r1-repeat-actions'

interface OwnedTask {
  readonly identity: string
  readonly media: LocalMedia
  task: MediaUploadTask
  ambiguous: boolean
  uploaded?: string
  /** Exact enqueue/process outcome, used only to confirm local cancellation. */
  cleanup?: string
}
const deny = (message = '附件来源或当前创建授权无法核实。'): never => { throw Error(message) }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const validId = (value: unknown): value is string => typeof value === 'string' && Boolean(value) && value.trim() === value && !value.includes(',')
const mime = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(value)
const taskIdentity = (task: MediaUploadTask) => JSON.stringify([task.taskId, task.scope, task.createdAt, task.evidence])
const cloneTask = (task: MediaUploadTask): MediaUploadTask => JSON.parse(JSON.stringify(task)) as MediaUploadTask
const copyValues = (values: readonly R1FileWireValue[]): readonly R1FileWireValue[] => Object.freeze(values.map(file => Object.freeze({ ...file })))
const sameValues = (left: unknown, right: readonly R1FileWireValue[]): boolean => isR1NormalImageWireArray(left) && left.length === right.length
  && left.every((file, index) => file.url === right[index]!.url && file.name === right[index]!.name && file.extname === right[index]!.extname)

/** A private epoch over the shared real upload queue. Queue scope lacks role,
 * tenant and run; only the supplied bound authorization closure supplies those
 * facts. Existing durable tasks are never evidence for this new controller. */
function createBoundFormFileSession(input: {
  readonly scope: R1RepeatScope
  readonly queue: MediaUploadQueuePort
  readonly picker: MediaFilePickerPort
  readonly getSnapshot: () => R1NodeFormsSnapshot
  readonly isAuthorized: () => boolean
}, mode:'generic'|'survey'|{sourceNodeType:string;allowedSources?:readonly string[];eligible:(snapshot:R1NodeFormsSnapshot,fieldId:string,values:Readonly<Record<string,unknown>>)=>boolean;assertNonFileValues?:(snapshot:R1NodeFormsSnapshot,values:Readonly<Record<string,unknown>>)=>void}): R1NormalFormFileSession {
  const scope = Object.freeze({ ...input.scope }), revision = ref(0)
  const owned = new Map<MediaUploadTaskId, OwnedTask>()
  let epoch = 0, disposed = false, inFlight = false, finalized = false, uncertain = false, asserted = false, text = ''
  let cancelling = false, queueBlocked = false, cancelBlocked = false
  let settled: Promise<void> = Promise.resolve(), settle: (() => void) | undefined
  const lookup = { userId: asOpaqueId<'UserId'>(scope.userId), workOrderId: asOpaqueId<'WorkOrderId'>(scope.workOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(scope.runtimeNodeId), formDefinitionId: asOpaqueId<'FormDefinitionId'>(scope.formDefinitionId) }
  const signature = (snapshot: R1NodeFormsSnapshot) => JSON.stringify([snapshot.definition.fields, snapshot.definition.purpose, snapshot.node.formFieldIdsReadOnly, snapshot.fillableFieldIds])
  const initialSignature = signature(input.getSnapshot())
  const changed = () => { revision.value++ }
  function begin() {
    inFlight = true
    settled = new Promise<void>(resolve => { settle = resolve })
    changed()
  }
  function end() {
    inFlight = false
    const done = settle; settle = undefined; done?.()
    changed()
  }
  function revoke() {
    if (!disposed) { disposed = true; epoch++; text = '附件创建授权已失效，请重新读取表单。'; changed() }
  }
  function guard(expected = epoch, afterSave = false): R1NodeFormsSnapshot {
    let snapshot: R1NodeFormsSnapshot
    try {
      snapshot = input.getSnapshot()
      if (disposed || finalized || !Object.values(scope).every(validId) || !input.isAuthorized()
        || snapshot.workOrderId !== scope.workOrderId || snapshot.node.id !== scope.runtimeNodeId
        || snapshot.node.runId !== scope.workflowRunId || snapshot.node.sourceNodeType !== (typeof mode==='object'?mode.sourceNodeType:mode==='survey'?'repeat':'forms')
        || snapshot.node.formDefinitionId !== scope.formDefinitionId || snapshot.definition.id !== scope.formDefinitionId
        || signature(snapshot) !== initialSignature) return deny()
    } catch { revoke(); return deny('附件创建授权已失效。') }
    // A normal explicit cancel invalidates old callbacks, not the actor's new
    // empty create session. Actual authorization loss above stays permanent.
    if (expected !== epoch) return deny('附件操作已取消。')
    // A verified save may already be visible to the panel before trusted local
    // cleanup runs. Close create UI without revoking cleanup's bound epoch.
    if (!afterSave && snapshot.records.length !== 0) return deny('附件只支持首次创建。')
    return snapshot
  }
  function field(fieldId: string, values: Readonly<Record<string, unknown>>, expected = epoch) {
    const snapshot = guard(expected)
    if (!object(values) || !(typeof mode==='object'?mode.eligible(snapshot,fieldId,values):mode==='survey'?isSurveyMediaFieldEligible(snapshot,fieldId):isR1NormalFileFieldEligible(snapshot, fieldId, values))) return deny('当前附件字段不可编辑。')
    const metadata = snapshot.definition.fields!.find(candidate => candidate.fieldId === fieldId)!
    const max = metadata.presentation?.max ?? 10
    if (!Number.isSafeInteger(max) || max < 0) return deny('附件数量规则尚未核实。')
    return { key: metadata.valueKey, max: Math.min(10, max) }
  }
  function exactScope(task: MediaUploadTask): boolean {
    return task.scope.userId === lookup.userId && task.scope.workOrderId === lookup.workOrderId
      && task.scope.workflowNodeId === lookup.workflowNodeId && task.scope.formDefinitionId === lookup.formDefinitionId
      && task.scope.formDataId === undefined
  }
  function uploadedValue(entry: OwnedTask): R1FileWireValue | null {
    const task = entry.task, uploaded = task.uploadedRef
    if (entry.ambiguous || task.state !== 'uploaded' || !uploaded || uploaded.uploadState !== 'uploaded'
      || uploaded.source !== entry.media.source || !mime(uploaded.mimeType) || uploaded.mimeType !== entry.media.mimeType) return null
    const value = r1FileWireFromUpload(uploaded)
    return value && isR1NormalImageWireArray([value])
      && isR1NormalImageMedia({ ...entry.media, name: `uploaded.${value.extname}` }) ? value : null
  }
  function receipt(entry: OwnedTask): R1FileWireValue | null {
    // Storage state alone cannot promote a known failed upload into this
    // controller's proof. Pin only a verified process/retry success below.
    return entry.uploaded !== undefined && JSON.stringify(entry.task.uploadedRef) === entry.uploaded ? uploadedValue(entry) : null
  }
  function currentValues(fieldId: string): readonly R1FileWireValue[] {
    const files: R1FileWireValue[] = []
    for (const entry of owned.values()) if (entry.task.scope.fieldId === fieldId) {
      const value = receipt(entry)
      if (value) files.push(value)
    }
    if (!isR1NormalImageWireArray(files)) return deny('附件回执重复或格式异常。')
    return copyValues(files)
  }
  async function readQueue(expected: number, afterSave = false): Promise<void> {
    try {
      guard(expected, afterSave)
      const result = await input.queue.listForAction(lookup)
      guard(expected, afterSave)
      if (result.state !== 'succeeded' || !Array.isArray(result.data)) return deny('附件队列暂不可读。')
      const tasks = result.data.filter(task => isMediaUploadTask(task) && exactScope(task))
      if (tasks.length !== new Set(tasks.map(task => task.taskId)).size) return deny('附件队列身份重复。')
      for (const task of result.data) if (!isMediaUploadTask(task)) return deny('附件队列数据尚未核实。')
      if (tasks.some(task => !owned.has(task.taskId))) return deny('已有附件队列属于其他编辑会话，不能自动导入。')
      for (const [taskId, entry] of owned) {
        const task = tasks.find(candidate => candidate.taskId === taskId)
        if (!task || taskIdentity(task) !== entry.identity) return deny('附件队列归属已变化。')
        if (entry.uploaded !== undefined && (task.state !== 'uploaded' || JSON.stringify(task.uploadedRef) !== entry.uploaded)) return deny('附件上传回执已变化。')
        entry.task = cloneTask(task)
      }
    } catch (error) {
      if (expected === epoch && !disposed) {
        queueBlocked = true
        text = error instanceof Error ? error.message : '附件队列暂不可读，请核对恢复。'
        changed()
      }
      throw error
    }
  }
  function validateDraft(fieldId: string, values: Readonly<Record<string, unknown>>, expected: number) {
    const selected = field(fieldId, values, expected), files = currentValues(fieldId)
    if (Object.hasOwn(values, selected.key) && !sameValues(values[selected.key], files)) return deny('附件列表与当前上传会话不一致。')
    return selected
  }
  function verifyValues(snapshot: R1NodeFormsSnapshot, values: Readonly<Record<string, unknown>>, expected: number) {
    if ([...owned.values()].some(entry => !receipt(entry))) return deny('仍有未完成或结果不明的附件。')
    const fields = snapshot.definition.fields ?? []
    const fieldPlan=typeof mode==='object'?mode.assertNonFileValues:undefined
    fieldPlan?.(snapshot,values)
    for (const [key, value] of Object.entries(values)) {
      const metadata = fields.find(candidate => candidate.valueKey === key)
      if (metadata?.type !== 'file') { if (Array.isArray(value)&&!fieldPlan) return deny(); continue }
      const selected = field(metadata.fieldId, values, expected), files = currentValues(metadata.fieldId)
      if (!sameValues(value, files) || files.length > selected.max) return deny('附件不是本会话上传的精确回执。')
    }
    for (const entry of owned.values()) if (!sameValues(values[entry.task.scope.valueKey], currentValues(entry.task.scope.fieldId))) return deny('已上传附件未完整包含在保存内容中。')
  }
  async function mutation(fieldId: string, values: Readonly<Record<string, unknown>>, action: (expected: number, selected: { key: string; max: number }) => Promise<void>): Promise<readonly R1FileWireValue[] | null> {
    if (inFlight || cancelling || queueBlocked || cancelBlocked) return null
    asserted = false
    begin()
    const expected = epoch
    try {
      if (uncertain) return deny('附件操作结果待核对，不能自动重发。')
      const selected = validateDraft(fieldId, values, expected)
      await readQueue(expected)
      validateDraft(fieldId, values, expected)
      await action(expected, selected)
      field(fieldId, values, expected)
      text = ''; changed()
      return currentValues(fieldId)
    } catch (error) {
      // Rejected awaits still cross an authorization boundary.
      try { guard(expected) } catch { /* guard permanently revokes lost authority */ }
      if (expected === epoch || disposed) {
        text = disposed ? '附件创建授权已失效，请重新读取表单。' : error instanceof Error ? error.message : '附件操作未完成，请核对后再操作。'
        changed()
      }
      return null
    } finally { end() }
  }
  function captureOutcome(entry: OwnedTask, result: OperationSnapshot<MediaUploadTask>) {
    const task = result.data
    if (!task || !isMediaUploadTask(task) || taskIdentity(task) !== entry.identity) {
      entry.ambiguous = true; uncertain = true; return
    }
    entry.task = cloneTask(task)
    const knownFailure = result.state === task.state && ['failed_retryable', 'failed_terminal'].includes(task.state)
      && !['ambiguous_upload', 'ambiguous_postprocess'].includes(task.lastError?.code ?? '')
    if (!entry.ambiguous && ((result.state === 'succeeded' && uploadedValue(entry)) || knownFailure)) {
      // Even a canceled epoch may retain this outcome for exact local cleanup.
      // It never becomes this epoch's saved-file proof here.
      entry.cleanup = JSON.stringify(task)
    } else { entry.ambiguous = true; uncertain = true }
  }
  async function uploadResult(taskId: MediaUploadTaskId, expected: number, retry: boolean) {
    const entry = owned.get(taskId)!
    guard(expected)
    entry.cleanup = undefined
    let result
    try { result = await (retry ? input.queue.retry(taskId) : input.queue.process(taskId)) }
    catch (error) { entry.ambiguous = true; uncertain = true; throw error }
    captureOutcome(entry, result)
    guard(expected)
    await readQueue(expected)
    if (result.state !== 'succeeded' || !result.data || result.data.taskId !== taskId || taskIdentity(result.data) !== entry.identity
      || JSON.stringify(result.data) !== JSON.stringify(entry.task) || !uploadedValue(entry)) {
      if (!result.data || JSON.stringify(result.data) !== JSON.stringify(entry.task)
        || !['failed_retryable', 'failed_terminal'].includes(entry.task.state)) entry.ambiguous = true
      return deny('附件尚未上传完成；已知失败请显式重试，结果不明时先核对。')
    }
    entry.uploaded = JSON.stringify(entry.task.uploadedRef)
  }
  const session: R1NormalFormFileSession = {
    revision,
    busy: () => inFlight || cancelling,
    message: () => text,
    values(fieldId) { try { if (disposed || finalized || cancelling) return []; guard(); return currentValues(fieldId) } catch { return [] } },
    canPick(fieldId, values) {
      try {
        if (inFlight || cancelling || uncertain || queueBlocked || cancelBlocked || disposed || finalized) return false
        const selected = validateDraft(fieldId, values, epoch)
        return [...owned.values()].filter(entry => entry.task.scope.fieldId === fieldId).length < selected.max
      } catch { return false }
    },
    ready(values) {
      // Reading revision makes cached task transitions observable to the UI.
      void revision.value
      try {
        if (inFlight || cancelling || uncertain || queueBlocked || cancelBlocked || disposed || finalized || !object(values)) return false
        const snapshot = guard()
        verifyValues(snapshot, values, epoch)
        return true
      } catch { return false }
    },
    async inspect() {
      if (inFlight || cancelling || finalized) return false
      const expected = epoch
      begin()
      try {
        await readQueue(expected)
        guard(expected)
        if (uncertain || cancelBlocked) return deny('附件结果或本地清理待核对，不能开始新的创建。')
        queueBlocked = false
        if (![...owned.values()].some(entry => !receipt(entry))) text = ''
        changed(); return true
      } catch (error) {
        try { guard(expected) } catch { /* genuine loss stays permanent */ }
        if (expected === epoch || disposed) {
          queueBlocked = true
          text = disposed ? '附件创建授权已失效，请重新读取表单。' : error instanceof Error ? error.message : '附件队列暂不可读，请核对恢复。'
          changed()
        }
        return false
      } finally { end() }
    },
    async cancel() {
      if (cancelling || finalized) return false
      try { guard() } catch (error) {
        text = error instanceof Error ? error.message : '附件授权已失效，不能清理。'; changed(); return false
      }
      const pending = settled
      cancelling = true; cancelBlocked = true; asserted = false; epoch++
      const expected = epoch
      text = '正在取消并核对本会话附件。'; changed()
      try {
        await pending
        guard(expected)
        if (uncertain || [...owned.values()].some(entry => entry.ambiguous)) return deny('附件结果不明，请先核对恢复；未清空当前记录。')
        await readQueue(expected)
        guard(expected)
        // Validate every task before deleting any, so a foreign or ambiguous
        // sibling cannot be hidden by partial successful cleanup.
        if ([...owned.values()].some(entry => !entry.cleanup || JSON.stringify(entry.task) !== entry.cleanup)) return deny('附件结果尚未确证，请核对恢复；未清空当前记录。')
        for (const [taskId] of owned) {
          guard(expected)
          const result = await input.queue.discard(taskId)
          guard(expected)
          if (result.state !== 'succeeded') return deny('本地附件清理未完成，请核对恢复；未重置创建。')
          owned.delete(taskId); changed()
        }
        await readQueue(expected)
        guard(expected)
        queueBlocked = false; cancelBlocked = false; text = ''; changed()
        return true
      } catch (error) {
        try { guard(expected) } catch { /* no cleanup under a new actor/page */ }
        text = disposed ? '附件创建授权已失效；旧附件须在原授权下核对恢复。' : error instanceof Error ? error.message : '取消清理未完成，请核对恢复。'
        changed(); return false
      } finally { cancelling = false; changed() }
    },
    pick: (fieldId, values) => mutation(fieldId, values, async (expected, selected) => {
      if ([...owned.values()].filter(entry => entry.task.scope.fieldId === fieldId).length >= selected.max) return deny('已达到附件数量上限。')
      guard(expected)
      const picked = await input.picker.pick()
      guard(expected)
      if (picked.state === 'cancelled') return
      if (picked.state !== 'granted' || !picked.value?.length) return deny('未能读取所选附件。')
      if (picked.value.length + [...owned.values()].filter(entry => entry.task.scope.fieldId === fieldId).length > selected.max) return deny('所选附件超过数量上限。')
      if (new Set(picked.value.map(media => media.ref)).size !== picked.value.length || picked.value.some(media => !validId(media.ref) || !mime(media.mimeType) || !isR1NormalImageMedia(media)
        || !(typeof mode==='object'?(mode.allowedSources??['library']).includes(media.source):mode==='survey'?media.source==='library':['camera', 'library', 'file'].includes(media.source)) || !validId(media.localPath)
        || (media.size !== undefined && (!Number.isSafeInteger(media.size) || media.size <= 0))
        || [...owned.values()].some(entry => entry.media.ref === media.ref))) return deny('所选附件身份或格式尚未核实。')
      await readQueue(expected)
      for (const selectedMedia of picked.value) {
        field(fieldId, values, expected)
        const media = Object.freeze({ ...selectedMedia })
        guard(expected)
        let added
        try { added = await input.queue.enqueue({ scope: { ...lookup, fieldId, valueKey: selected.key }, media, evidence: { postUploadPolicy: 'none' } }) }
        catch (error) { uncertain = true; throw error }
        const task = added.data
        if (added.state !== 'succeeded' || !task || !isMediaUploadTask(task) || !exactScope(task)
          || task.scope.fieldId !== fieldId || task.scope.valueKey !== selected.key || task.scope.localAssetId !== media.ref
          || task.state !== 'queued' || task.attempts !== 0 || owned.has(task.taskId)) {
          uncertain = true; return deny('附件入队结果待核对，不能自动重发。')
        }
        // Preserve a successful enqueue even if cancel changed the epoch while
        // it was pending. Only the current authorized epoch can process it.
        owned.set(task.taskId, { identity: taskIdentity(task), task: cloneTask(task), media, ambiguous: false, cleanup: JSON.stringify(task) }); changed()
        guard(expected)
        field(fieldId, values, expected)
        await uploadResult(task.taskId, expected, false)
        field(fieldId, values, expected)
      }
    }),
    retry: (fieldId, values) => mutation(fieldId, values, async expected => {
      const tasks = [...owned.values()].filter(entry => entry.task.scope.fieldId === fieldId && entry.task.state !== 'uploaded')
      if (!tasks.length || tasks.some(entry => entry.ambiguous || entry.task.state !== 'failed_retryable' || !entry.task.lastError?.retryable
        || ['ambiguous_upload', 'ambiguous_postprocess'].includes(entry.task.lastError.code ?? ''))) return deny('附件结果待核对或不可重试，禁止重发。')
      for (const entry of tasks) {
        field(fieldId, values, expected)
        await uploadResult(entry.task.taskId, expected, true)
        field(fieldId, values, expected)
      }
    }),
    remove: (fieldId, index, values) => mutation(fieldId, values, async expected => {
      const tasks = [...owned.values()].filter(entry => entry.task.scope.fieldId === fieldId && receipt(entry))
      if (!Number.isSafeInteger(index) || index < 0 || !tasks[index]) return deny('待移除附件身份尚未核实。')
      const entry = tasks[index]!
      guard(expected)
      const removed = await input.queue.discard(entry.task.taskId)
      guard(expected)
      if (removed.state !== 'succeeded') return deny('附件移除未完成。')
      owned.delete(entry.task.taskId); changed()
      await readQueue(expected)
    }),
    discardFailed: (fieldId, values) => mutation(fieldId, values, async expected => {
      const tasks = [...owned.values()].filter(entry => entry.task.scope.fieldId === fieldId && !entry.ambiguous && entry.cleanup
        && ['failed_retryable', 'failed_terminal'].includes(entry.task.state))
      if (!tasks.length) return deny('没有可核对移除的本会话失败附件。')
      for (const entry of tasks) {
        guard(expected)
        const removed = await input.queue.discard(entry.task.taskId)
        guard(expected)
        if (removed.state !== 'succeeded') return deny('失败附件移除未完成。')
        owned.delete(entry.task.taskId); changed()
      }
      await readQueue(expected)
    }),
    async assertValues(snapshot, normalizedValues) {
      if (inFlight || cancelling || uncertain || queueBlocked || cancelBlocked || !object(normalizedValues)) return deny('附件操作尚未完成。')
      asserted = false
      const expected = epoch
      const submittedBytes = JSON.stringify(normalizedValues)
      begin()
      try {
        if (guard(expected) !== snapshot) return deny('附件提交快照已失效。')
        await readQueue(expected)
        if (guard(expected) !== snapshot) return deny('附件提交快照已失效。')
        if (JSON.stringify(normalizedValues) !== submittedBytes) return deny('附件提交内容在核对期间已变化。')
        verifyValues(snapshot, normalizedValues, expected)
        asserted = true
      } catch (error) {
        guard(expected)
        throw error
      } finally { end() }
    },
    async finalize() {
      if (inFlight || cancelling || uncertain || queueBlocked || cancelBlocked || !asserted) return deny('附件尚不能清理。')
      const expected = epoch
      begin()
      try {
        await readQueue(expected, true)
        if ([...owned.values()].some(entry => !receipt(entry))) return deny('尚有未完成附件，不能完成清理。')
        for (const entry of owned.values()) {
          guard(expected, true)
          const done = await input.queue.finalizeAfterSave(entry.task.taskId)
          guard(expected, true)
          if (done.state !== 'succeeded') return deny('保存后的附件本地清理未完成。')
          owned.delete(entry.task.taskId)
        }
        finalized = true; epoch++; text = ''; changed()
      } catch (error) {
        try { guard(expected, true) } catch { /* no further cleanup after revocation */ }
        text = '记录已保存，附件本地清理未完成，请核对。'; changed()
        throw error
      } finally { end() }
    },
    dispose() { revoke() },
  }
  return session
}

/** Keep generic/type0 behavior and its caller authorization unchanged. */
export const createR1NormalFormFileSession=(input:Parameters<typeof createBoundFormFileSession>[0])=>createBoundFormFileSession(input,'generic')
/** Same owned queue lifecycle; distinct typed source/grant is required by its action provider. */
export const createR1SurveyFormFileSession=(input:Parameters<typeof createBoundFormFileSession>[0])=>createBoundFormFileSession(input,'survey')

/** Bound caller chooses only schema/surface strategy; queue ownership, strict
 * MIME/URL, cancellation, epochs and receipt checks remain this single engine. */
export const createR1ConfiguredFormFileSession=(input:Parameters<typeof createBoundFormFileSession>[0],strategy:Extract<Parameters<typeof createBoundFormFileSession>[1],object>)=>createBoundFormFileSession(input,strategy)
