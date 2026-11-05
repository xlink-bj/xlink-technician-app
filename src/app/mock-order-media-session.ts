import { withScopedDraftLock } from '@adapters/storage/scoped-draft-lock'
/** Order-only scope over the shared durable queue. No fabricated FormDef ID,
 * no real transport; the composition injects the source-only Mock upload port. */
import type { MediaUploadQueuePort, MediaFilePickerPort } from '@shared/ports'
import { asOpaqueId, type MediaUploadTask, type MediaUploadTaskId } from '@shared/types'
import type { OrderFieldDraft, OrderMediaSession } from '@features/work-orders/quotation/order-field-session'
import { encodeOrderMedia } from '@features/work-orders/quotation/order-extfield-wire'
export function createMockOrderMediaSession(input: {
  lockKey: string; queue: MediaUploadQueuePort; picker: MediaFilePickerPort; userId: string; workOrderId: string; nodeId: string;
  authorized(): boolean; canSave(): Promise<boolean>; draft(): OrderFieldDraft | null;
  savedExts(): Promise<Readonly<Record<string, unknown>> | null>;
}): OrderMediaSession {
  const scope = { userId: asOpaqueId<'UserId'>(input.userId), workOrderId: asOpaqueId<'WorkOrderId'>(input.workOrderId), workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(input.nodeId) }
  const known = (fieldId: string, key: string) => input.draft()?.input.rows.some(row => row.type === 'file' && row.rowId === fieldId && row.valueKey === key)
  async function list(): Promise<readonly MediaUploadTask[]> {
    if (!input.authorized()) throw new Error('附件身份已变化。')
    const result = await input.queue.listForAction(scope)
    if (!input.authorized() || result.state !== 'succeeded' || !result.data) throw new Error('附件队列暂不可读。')
    return result.data.filter(task => !task.scope.formDefinitionId && !task.scope.formDataId && known(task.scope.fieldId, task.scope.valueKey))
  }
  async function editable() { if (!input.authorized() || !await input.canSave()) throw new Error('下单资料已冻结，请只读核对。') }
  const actions: OrderMediaSession = {
    list,
    async pick(fieldId, valueKey) {
      await editable()
      if (!known(fieldId, valueKey)) throw new Error('附件字段未核验。')
      const previous = (await list()).filter(task => task.scope.fieldId === fieldId)
      const values = input.draft()?.input.values[valueKey]
      const count = Array.isArray(values) ? values.length : 0
      if (count + previous.filter(task => task.state !== 'uploaded').length >= 10) throw new Error('最多添加十份附件。')
      const picked = await input.picker.pick()
      await editable()
      if (picked.state === 'cancelled') return
      if (picked.state !== 'granted' || !picked.value?.length || picked.value.length + count + previous.filter(task => task.state !== 'uploaded').length > 10) throw new Error('未能安全读取附件或超过数量上限。')
      for (const media of picked.value) {
        await editable()
        const added = await input.queue.enqueue({ scope: { ...scope, fieldId, valueKey }, media, evidence: { postUploadPolicy: 'none' } })
        if (added.state !== 'succeeded' || !added.data) throw new Error('附件未能保存到本机队列。')
        const done = await input.queue.process(added.data.taskId)
        if (!input.authorized() || done.state !== 'succeeded') throw new Error('附件尚未上传完成，请手动检查或重试。')
      }
    },
    async retry(taskId) {
      await editable()
      const task = (await list()).find(task => task.taskId === taskId)
      if (!task || task.state !== 'failed_retryable' || task.lastError?.code === 'ambiguous_postprocess') throw new Error('附件结果待核对，不能重发。')
      const done = await input.queue.retry(taskId)
      if (!input.authorized() || done.state !== 'succeeded') throw new Error('附件重试未完成。')
    },
    async discard(taskId: MediaUploadTaskId) {
      await editable()
      if (!(await list()).some(task => task.taskId === taskId)) throw new Error('附件归属未核对。')
      const done = await input.queue.discard(taskId)
      if (!input.authorized() || done.state !== 'succeeded') throw new Error('移除失败，原附件已保留。')
    },
    async finalize() {
      try {
        const tasks = await list()
        if (tasks.some(task => task.state !== 'uploaded')) return false
        for (const task of tasks) if ((await input.queue.finalizeAfterSave(task.taskId)).state !== 'succeeded') return false
        return input.authorized()
      } catch { return false }
    },
    async verify(values) {
      try {
        const tasks = await list()
        if (tasks.some(task => task.state !== 'uploaded')) return false
        // An uploaded task not yet merged into this revision must not vanish
        // from a concurrent editor's Order snapshot or be finalized as an orphan.
        for (const task of tasks) {
          const value = values[task.scope.valueKey]
          if (!task.uploadedRef || !Array.isArray(value) || !value.some(file => file?.url?.split('?')[0] === task.uploadedRef!.url.split('?')[0])) return false
        }
        const saved = await input.savedExts()
        if (!input.authorized()) return false
        for (const row of input.draft()?.input.rows ?? []) {
          if (row.type !== 'file' || typeof row.valueKey !== 'string') continue
          const value = values[row.valueKey]
          if (value === undefined) continue
          const encoded = encodeOrderMedia(value)
          if (encoded === null) return false
          const acknowledged = new Set(typeof saved?.[row.valueKey] === 'string' ? (saved[row.valueKey] as string).split(',') : [])
          for (const task of tasks.filter(task => task.scope.fieldId === row.rowId && task.uploadedRef)) acknowledged.add(task.uploadedRef!.url.split('?')[0])
          if (encoded && encoded.split(',').some(url => !acknowledged.has(url))) return false
        }
        return true
      } catch { return false }
    },
  }
  async function mutate(action: () => Promise<void>): Promise<void> {
    const outcome = await withScopedDraftLock(input.lockKey, async () => {
      try { await action(); return { state: 'succeeded' as const } }
      catch (error) { return { state: 'failed' as const, error } }
    })
    if (!outcome) throw new Error('当前环境无法安全锁定附件操作。')
    if (outcome.state === 'failed') throw outcome.error ?? new Error('附件操作未完成。')
  }
  return { ...actions, pick: (id, key) => mutate(() => actions.pick(id, key)),
    retry: id => mutate(() => actions.retry(id)), discard: id => mutate(() => actions.discard(id)) }

}
