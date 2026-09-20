import { ref } from 'vue'

import type { MediaTaskLookupScope, MediaUploadQueuePort } from '@shared/ports'
import {
  asOpaqueId,
  createOperationError,
  type FormDataId,
  type FormDefinitionId,
  type MediaUploadTask,
  type MediaUploadTaskId,
  type MediaTaskScope,
  type LocalMedia,
  type OperationSnapshot,
  type UploadedMediaRef,
  type UserId,
  type WorkOrderId,
  type WorkflowNodeRuntimeId,
} from '@shared/types'

export const reviewWorkOrderId = asOpaqueId<'WorkOrderId'>('mock-work-order-017-survey-success')
export const reviewWorkflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-017-inspection')
export const reviewFormDefinitionId = asOpaqueId<'FormDefinitionId'>('mock-form-definition-survey')
export const reviewUserId = asOpaqueId<'UserId'>('mock-review-user')

export const reviewScenarioKeys = [
  'survey-overview',
  'required-fields',
  'part-dependent-fields',
  'leakage-cause',
  'required-media-empty',
  'media-local-pending',
  'media-uploading',
  'media-retryable-failure',
  'media-ambiguous',
  'media-uploaded',
  'validation-error',
  'unsaved',
  'saved-ready-to-complete',
  'deferred-fields-absent',
] as const

export type ReviewScenarioKey = typeof reviewScenarioKeys[number]

export interface ReviewScenarioMeta {
  readonly key: ReviewScenarioKey
  readonly label: string
  readonly description: string
}

export const reviewScenarioCatalog: readonly ReviewScenarioMeta[] = [
  { key: 'survey-overview', label: 'Survey 概览', description: '初始动态表单与信息层级' },
  { key: 'required-fields', label: '必填字段', description: '必填标记与未完成状态' },
  { key: 'part-dependent-fields', label: '部位联动', description: '维修部位与条件显示字段' },
  { key: 'leakage-cause', label: '渗漏原因', description: '受控多组选择体验' },
  { key: 'required-media-empty', label: '媒体为空', description: '必填媒体初始状态' },
  { key: 'media-local-pending', label: '本地待上传', description: '本地证据等待上传' },
  { key: 'media-uploading', label: '上传中', description: '媒体上传进行中' },
  { key: 'media-retryable-failure', label: '可重试失败', description: '失败与继续处理入口' },
  { key: 'media-ambiguous', label: '结果待核查', description: '禁止盲目重复提交' },
  { key: 'media-uploaded', label: '已上传', description: '确认的远端媒体' },
  { key: 'validation-error', label: '校验错误', description: '缺少必填内容时保存' },
  { key: 'unsaved', label: '未保存', description: '已编辑但尚未显式保存' },
  { key: 'saved-ready-to-complete', label: '已保存可完成', description: '保存与完成的边界' },
  { key: 'deferred-fields-absent', label: '延期字段隐藏', description: 'serviceGoods / surveyDrawing 不出现' },
]

function scenarioFromLocation(): ReviewScenarioKey {
  if (typeof window === 'undefined') return 'survey-overview'
  const value = new URLSearchParams(window.location.search).get('scenario')
  return reviewScenarioKeys.includes(value as ReviewScenarioKey)
    ? value as ReviewScenarioKey
    : 'survey-overview'
}

export const reviewScenario = ref<ReviewScenarioKey>(scenarioFromLocation())

export function setReviewScenario(next: ReviewScenarioKey): void {
  reviewScenario.value = next
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    url.searchParams.set('scenario', next)
    window.history.replaceState({}, '', url)
  }
}

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function taskScope(fieldId: string, valueKey: string, formDataId?: FormDataId): MediaTaskScope {
  return {
    userId: reviewUserId,
    workOrderId: reviewWorkOrderId,
    workflowNodeId: reviewWorkflowNodeId,
    formDefinitionId: reviewFormDefinitionId,
    ...(formDataId ? { formDataId } : {}),
    fieldId,
    valueKey,
    localAssetId: asOpaqueId<'LocalMediaRef'>(`review-local-${valueKey}`),
  }
}

function uploadedRef(valueKey: string): UploadedMediaRef {
  return {
    url: `https://mock-upload.invalid/review/${valueKey}.jpg`,
    key: `review/${valueKey}.jpg`,
    fileName: `${valueKey}.jpg`,
    extension: 'jpg',
    mimeType: 'image/jpeg',
    source: 'library',
    uploadState: 'uploaded',
  }
}

function errorFor(scenario: ReviewScenarioKey) {
  return scenario === 'media-ambiguous'
    ? createOperationError(
        'network_retryable',
        '处理结果待核查，请勿重复提交',
        { code: 'ambiguous_postprocess' },
      )
    : createOperationError('network_retryable', '上传失败，可点击重试')
}

function seededTask(
  fieldId: string,
  valueKey: string,
  state: MediaUploadTask['state'],
  scenario: ReviewScenarioKey,
): MediaUploadTask {
  const timestamp = '2026-09-20T09:00:00.000Z'
  const taskId = asOpaqueId<'MediaUploadTaskId'>(`review-media-task-${valueKey}`)
  const remote = uploadedRef(valueKey)
  return {
    schemaVersion: 1,
    taskId,
    scope: taskScope(fieldId, valueKey),
    state,
    attempts: state === 'failed_retryable' ? 1 : 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(state === 'uploaded' ? { uploadedRef: remote } : {}),
    ...(state === 'failed_retryable' ? { lastError: errorFor(scenario) } : {}),
  }
}

function seededTasksForScenario(scenario: ReviewScenarioKey): readonly MediaUploadTask[] {
  if (scenario === 'media-local-pending') {
    return [seededTask('survey-field-030', 'images1', 'queued', scenario)]
  }
  if (scenario === 'media-uploading') {
    return [seededTask('survey-field-030', 'images1', 'uploading', scenario)]
  }
  if (scenario === 'media-retryable-failure' || scenario === 'media-ambiguous') {
    return [seededTask('survey-field-030', 'images1', 'failed_retryable', scenario)]
  }
  if (scenario === 'media-uploaded') {
    return [seededTask('survey-field-030', 'images1', 'uploaded', scenario)]
  }
  if (scenario === 'saved-ready-to-complete') {
    return [
      seededTask('survey-field-030', 'images1', 'uploaded', scenario),
      seededTask('survey-field-031', 'images2', 'uploaded', scenario),
    ]
  }
  return []
}

function localMediaFor(input: LocalMedia): LocalMedia {
  return {
    ...input,
    ref: input.ref ?? asOpaqueId<'LocalMediaRef'>('review-picked-media'),
    localPath: input.localPath ?? '/__review/synthetic-photo.jpg',
    name: input.name ?? 'synthetic-photo.jpg',
  }
}

/**
 * Review-only queue fixture. The Action Workspace still owns all media state
 * transitions and copy; this adapter only supplies deterministic task records
 * so the real Runtime can render each state without a network or file system.
 */
export function createReviewMediaUploadQueue(): MediaUploadQueuePort {
  const tasks = new Map<string, MediaUploadTask>()
  let seededForScenario: ReviewScenarioKey | undefined
  let fixtureLoaded = false

  function ensureScenarioFixture(): void {
    if (fixtureLoaded && seededForScenario === reviewScenario.value) return
    tasks.clear()
    for (const task of seededTasksForScenario(reviewScenario.value)) tasks.set(String(task.taskId), task)
    seededForScenario = reviewScenario.value
    fixtureLoaded = true
  }

  function currentTask(taskId: MediaUploadTaskId): MediaUploadTask | undefined {
    return tasks.get(String(taskId))
  }

  function updateTask(task: MediaUploadTask, patch: Partial<MediaUploadTask>): MediaUploadTask {
    const next = { ...task, ...patch, updatedAt: new Date().toISOString() }
    tasks.set(String(next.taskId), next)
    return next
  }

  function completeTask(task: MediaUploadTask): MediaUploadTask {
    return updateTask(task, {
      state: 'uploaded',
      uploadedRef: uploadedRef(task.scope.valueKey),
      lastError: undefined,
    })
  }

  return {
    async enqueue(input) {
      ensureScenarioFixture()
      const media = localMediaFor(input.media)
      const taskId = asOpaqueId<'MediaUploadTaskId'>(`review-media-task-${String(media.ref)}`)
      const timestamp = new Date().toISOString()
      const task: MediaUploadTask = {
        schemaVersion: 1,
        taskId,
        scope: { ...input.scope, localAssetId: media.ref },
        state: 'queued',
        attempts: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(input.evidence ? { evidence: input.evidence } : {}),
      }
      tasks.set(String(taskId), task)
      return succeeded(task)
    },
    async process(taskId) {
      const task = currentTask(taskId)
      if (!task) return { state: 'failed_terminal', error: createOperationError('validation', 'Review media task is unavailable') }
      if (task.state === 'failed_terminal') return { state: 'failed_terminal', data: task, error: task.lastError }
      return succeeded(completeTask(task))
    },
    async retry(taskId) {
      const task = currentTask(taskId)
      if (!task) return { state: 'failed_terminal', error: createOperationError('validation', 'Review media task is unavailable') }
      if (task.lastError?.code === 'ambiguous_postprocess') {
        return { state: 'failed_retryable', data: task, error: task.lastError }
      }
      return succeeded(completeTask(task))
    },
    async discard(taskId) {
      tasks.delete(String(taskId))
      return succeeded(undefined)
    },
    async finalizeAfterSave(taskId) {
      tasks.delete(String(taskId))
      return succeeded(undefined)
    },
    async listForAction(scope: MediaTaskLookupScope) {
      // A scenario switch starts a new visual fixture. Keep user interactions
      // within one scenario, but never let a previous scenario's task leak into
      // the next Action Workspace reload.
      ensureScenarioFixture()
      const listed = [...tasks.values()].filter((task) =>
        String(task.scope.userId) === String(scope.userId)
        && String(task.scope.workOrderId) === String(scope.workOrderId)
        && String(task.scope.workflowNodeId) === String(scope.workflowNodeId)
        && (scope.formDefinitionId === undefined || String(task.scope.formDefinitionId) === String(scope.formDefinitionId))
        && (scope.formDataId === undefined || task.scope.formDataId === undefined || String(task.scope.formDataId) === String(scope.formDataId)),
      )
      return succeeded(listed)
    },
  }
}
