import type { ActionDescriptor } from '@runtimes/action'
import type { DynamicFormRead, MediaUploadQueuePort } from '@shared/ports'
import {
  createOperationError, type FormDefinitionId, type MediaUploadTask,
  type UploadedMediaRef, type OperationError, type OperationSnapshot,
} from '@shared/types'
import { mediaTaskMatchesDynamicForm } from './action-workspace-draft-utils'

/** An isolated media queue coordination boundary, without Pinia or UI mutations.
 * The caller supplies a current-scope guard and owns all form/draft updates. */
export async function restoreActionMediaQueue(input: {
  readonly queue: MediaUploadQueuePort
  readonly descriptor: ActionDescriptor
  readonly getForm: () => DynamicFormRead | null
  readonly stillCurrent: () => boolean
  readonly onReadFailure: (error: OperationError | null) => void
  readonly onTask: (task: MediaUploadTask) => void
  readonly onUploaded: (fieldId: string, uploaded: UploadedMediaRef) => boolean
}): Promise<boolean> {
  const form = input.getForm()
  if (!form) return false
  const listed = await input.queue.listForAction({
    userId: input.descriptor.userId,
    workOrderId: input.descriptor.workOrderId,
    workflowNodeId: input.descriptor.workflowNodeId,
    ...(input.descriptor.contentIdentity
      ? { formDefinitionId: String(input.descriptor.contentIdentity) as FormDefinitionId } : {}),
    ...(form.dataId ? { formDataId: form.dataId } : {}),
  })
  if (!input.stillCurrent()) return false
  if (listed.state !== 'succeeded' || !listed.data) {
    input.onReadFailure(listed.error ?? null)
    return false
  }
  const currentForm = input.getForm()
  if (!currentForm) return false
  let changed = false
  for (const listedTask of listed.data.filter(task =>
    mediaTaskMatchesDynamicForm(task, input.descriptor, currentForm))) {
    if (!input.stillCurrent()) return false
    // Existing read-only recovery behavior: resume only postprocessing,
    // never re-upload a possibly dispatched source or unknown watermark.
    const task = listedTask.state === 'postprocessing'
      ? (await input.queue.process(listedTask.taskId)).data ?? listedTask
      : listedTask
    if (!input.stillCurrent()) return false
    input.onTask(task)
    if (task.state === 'uploaded' && task.uploadedRef) {
      changed = input.onUploaded(task.scope.fieldId, task.uploadedRef) || changed
    }
  }
  return changed
}

/** A possibly dispatched / ambiguous postprocess is not safe for auto retry. */
export function resumableActionMediaTasks(tasks: readonly MediaUploadTask[]): readonly MediaUploadTask[] {
  return tasks.filter(task => task.state === 'source_uploaded'
    || (task.state === 'failed_retryable' && task.lastError?.code !== 'ambiguous_postprocess'))
}

export type RetryActionMediaQueueResult =
  | { readonly state: 'succeeded'; readonly uploaded: readonly UploadedMediaRef[] }
  | { readonly state: 'stale' }
  | { readonly state: 'failed'; readonly error: OperationError; readonly result: OperationSnapshot<void> }

/** Called only after explicit user retry authorization in the Store. */
export async function retryActionMediaQueue(input: {
  readonly queue: MediaUploadQueuePort
  readonly tasks: readonly MediaUploadTask[]
  readonly stillCurrent: () => boolean
  readonly onTask: (task: MediaUploadTask) => void
}): Promise<RetryActionMediaQueueResult> {
  // Re-check the allowlist at the queue boundary: a future caller must not
  // bypass the Store's explicit retry filter for ambiguous postprocessing.
  if (resumableActionMediaTasks(input.tasks).length !== input.tasks.length) {
    const error = createOperationError('validation', '水印处理结果待核查，不能重复提交')
    return { state: 'failed', error, result: { state: 'failed_terminal', error } }
  }
  const uploaded: UploadedMediaRef[] = []
  for (const task of input.tasks) {
    if (!input.stillCurrent()) return { state: 'stale' }
    const result = task.state === 'source_uploaded'
      ? await input.queue.process(task.taskId)
      : await input.queue.retry(task.taskId)
    if (!input.stillCurrent()) return { state: 'stale' }
    if (result.data) input.onTask(result.data)
    if (result.state !== 'succeeded' || !result.data?.uploadedRef) {
      const error = result.error ?? createOperationError('network_retryable', 'Media upload failed')
      return { state: 'failed', error, result: result.state === 'succeeded'
        ? { state: 'failed_terminal', error }
        : result as OperationSnapshot<void> }
    }
    uploaded.push(result.data.uploadedRef)
  }
  return { state: 'succeeded', uploaded }
}
