import type { LocalMedia, MediaUploadTask } from '@shared/types'

/** Presentation only: never changes queue identity, authority or wire values. */
export function safeAttachmentName(name?: string): string | undefined {
  const value = name?.trim()
  return value && value.length <= 160 && !/[\\/:\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e]/.test(value) ? value : undefined
}
export function attachmentTaskStatus(task: MediaUploadTask, ambiguous = false): string {
  if (ambiguous || ['ambiguous_upload', 'ambiguous_postprocess'].includes(task.lastError?.code ?? '')) return '结果待核对，请勿重复上传'
  switch (task.state) {
    case 'uploaded': return '已上传'
    case 'failed_retryable': return '上传失败，可重试'
    case 'failed_terminal': return '上传失败，请核对后重新选择'
    case 'queued': case 'ready_to_upload': return '等待上传'
    case 'uploading': return '正在上传'
    default: return '正在处理'
  }
}
/** Stable within this editor: removing/retrying a sibling never renumbers a task.
 * Retained references have a separate URL-bound label registry (URL is never rendered).
 * Both registries retain deleted slots until this editor closes; no sibling renumbering.
 * Restored tasks are registered in queue order; no internal id/path is rendered. */
export function createAttachmentLabels() {
  const ordinals = new Map<string, number>(), counts = new Map<string, number>()
  const retained = new Map<string, number>()
  function retainedLabel(url: string, name?: string): string {
    if (!retained.has(url)) retained.set(url, retained.size + 1)
    const visibleName = safeAttachmentName(name)
    return `原有附件 ${retained.get(url)}${visibleName ? ` · ${visibleName}` : ''}`
  }
  function register(tasks: readonly MediaUploadTask[]) {
    for (const task of tasks) if (!ordinals.has(task.taskId)) {
      const group = JSON.stringify([task.scope.workOrderId, task.scope.workflowNodeId, task.scope.formDefinitionId, task.scope.formDataId, task.scope.fieldId])
      const number = (counts.get(group) ?? 0) + 1
      counts.set(group, number); ordinals.set(task.taskId, number)
    }
  }
  return { register, retainedLabel, label(task: MediaUploadTask, media?: Pick<LocalMedia, 'name' | 'mimeType'>): string {
    register([task])
    const name = safeAttachmentName(media?.name) ?? safeAttachmentName(task.uploadedRef?.fileName)
    const type = media?.mimeType?.startsWith('image/') ? '图片' : undefined
    return `本次附件 ${ordinals.get(task.taskId)}${name || type ? ` · ${name ?? type}` : ''}`
  } }
}
