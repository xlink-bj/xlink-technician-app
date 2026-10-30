import type { DynamicFormRead } from '@shared/ports'
import type { ActionBusinessResult, ActionLifecycle } from '@runtimes/action'
import type { MediaUploadTask } from '@shared/types'
import type { DynamicActionField } from './dynamic-form-action'
import { surveyMediaDescriptorFor } from './survey-media'

/** Pure view projections. No queue, persistence, native API or role mutation. */
const MEDIA_STATE_PRIORITY = [
  'failed_terminal', 'failed_retryable', 'uploading', 'preprocessing',
  'ready_to_upload', 'queued', 'postprocessing', 'source_uploaded', 'uploaded',
] as const satisfies readonly MediaUploadTask['state'][]

export type ActionWorkspaceMediaTaskState = typeof MEDIA_STATE_PRIORITY[number] | 'idle'

export function taskStateForField(tasks: readonly MediaUploadTask[]): ActionWorkspaceMediaTaskState {
  if (tasks.length === 0) return 'idle'
  return MEDIA_STATE_PRIORITY.find(state => tasks.some(task => task.state === state)) ?? 'idle'
}

export function isDynamicMediaPickerAllowed(input: {
  readonly field?: DynamicActionField
  readonly lifecycle: ActionLifecycle
  readonly businessResult: ActionBusinessResult
}): boolean {
  const { field } = input
  return Boolean(
    input.lifecycle !== 'submitting'
    && input.businessResult !== 'succeeded'
    && field
    && (field.type === 'image' || field.type === 'file')
    && field.runtime.capability !== 'UNSUPPORTED'
    && field.runtime.visible
    && !field.runtime.readOnly
  )
}

export function isDynamicMediaRetryAvailable(tasks: readonly MediaUploadTask[]): boolean {
  return tasks.some(task => task.state === 'source_uploaded'
    || (task.state === 'failed_retryable' && task.lastError?.code !== 'ambiguous_postprocess'))
}

export function dynamicMediaDisplayHint(input: {
  readonly field?: DynamicActionField
  readonly formPurpose?: DynamicFormRead['purpose']
  readonly taskState?: ActionWorkspaceMediaTaskState | 'picking'
  readonly tasks: readonly MediaUploadTask[]
  readonly uploadedCount: number
}): string | undefined {
  const { field, taskState } = input
  if (!field) return undefined
  const descriptor = surveyMediaDescriptorFor(input.formPurpose, field)
  if (descriptor?.selectionMode === 'special_tool') return descriptor.blocker
  if (field.runtime.capability === 'UNSUPPORTED') return field.runtime.reason
  if (!field.runtime.visible) return '当前字段不适用于本页面'
  if (field.runtime.readOnly) return '当前字段仅可查看'
  if (taskState === 'queued') return '本地已保存，等待上传'
  if (taskState === 'preprocessing' || taskState === 'ready_to_upload') return '正在准备上传…'
  if (taskState === 'uploading') return '正在上传…'
  if (taskState === 'source_uploaded' || taskState === 'postprocessing') return '正在生成水印照片…'
  const hasAmbiguousPostprocess = input.tasks.some(task => task.lastError?.code === 'ambiguous_postprocess')
  if (taskState === 'failed_retryable' && hasAmbiguousPostprocess) return '处理结果待核查，请勿重复提交'
  if (taskState === 'failed_retryable') return '上传失败，可点击重试'
  if (taskState === 'failed_terminal') return '上传失败，请重新选择'
  if (taskState === 'uploaded' || input.uploadedCount > 0) return '已上传'
  return undefined
}
