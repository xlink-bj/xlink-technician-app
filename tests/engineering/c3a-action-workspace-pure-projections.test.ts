import { describe, expect, it } from 'vitest'
import type { WorkOrderId, WorkflowNodeRuntimeId, MediaUploadTask } from '@shared/types'
import type { DynamicActionField } from '@features/work-orders/dynamic-form-action'
import {
  actionWorkspaceRouteFor, actionWorkspaceTimeRouteFor,
  actionWorkspaceConfirmationRouteFor, parseActionWorkspaceId, parseActionWorkspaceNodeId,
} from '@features/work-orders/action-workspace'
import {
  taskStateForField, isDynamicMediaPickerAllowed,
  isDynamicMediaRetryAvailable, dynamicMediaDisplayHint,
} from '@features/work-orders/action-workspace-media-projection'

const task = (state: MediaUploadTask['state'], code?: string): MediaUploadTask =>
  ({ state, ...(code ? { lastError: { code } } : {}) }) as MediaUploadTask
const photoField = {
  fieldId: 'photo', valueKey: 'images1', type: 'image',
  runtime: { capability: 'SUPPORTED', visible: true, readOnly: false },
} as unknown as DynamicActionField

describe('C3-A Action Workspace pure route contract', () => {
  it('preserves route names, param order and percent encoding', () => {
    const order = 'wo /1' as WorkOrderId
    const node = 'node/&2' as WorkflowNodeRuntimeId
    const suffix = '?id=wo%20%2F1&node=node%2F%262&action=interact%20with%20form'
    expect(actionWorkspaceRouteFor(order, node, 'interact with form')).toBe('/pages/work-orders/action-workspace' + suffix)
    expect(actionWorkspaceTimeRouteFor(order, node, 'interact with form')).toBe('/pages/work-orders/action-time' + suffix)
    expect(actionWorkspaceConfirmationRouteFor(order, node, 'interact with form'))
      .toBe('/pages/work-orders/action-confirmation' + suffix)
  })
  it('keeps ID parsing reject/trim semantics', () => {
    expect(parseActionWorkspaceId('  wo-a  ')).toBe('wo-a')
    expect(parseActionWorkspaceNodeId(' node-1 ')).toBe('node-1')
    for (const invalid of [undefined, 1, null, {}, '  ']) {
      expect(parseActionWorkspaceId(invalid)).toBeNull()
      expect(parseActionWorkspaceNodeId(invalid)).toBeNull()
    }
  })
})

describe('C3-A Action Workspace pure media read model', () => {
  it('honors failure-over-upload state priority and empty state', () => {
    expect(taskStateForField([])).toBe('idle')
    expect(taskStateForField([task('uploaded'), task('uploading'), task('failed_retryable')])).toBe('failed_retryable')
    expect(taskStateForField([task('source_uploaded'), task('postprocessing')])).toBe('postprocessing')
  })
  it('gates picker based on media capability, visibility, readOnly and terminal lifecycle', () => {
    expect(isDynamicMediaPickerAllowed({ field: photoField, lifecycle: 'available', businessResult: 'not_started' })).toBe(true)
    expect(isDynamicMediaPickerAllowed({ field: undefined, lifecycle: 'available', businessResult: 'not_started' })).toBe(false)
    expect(isDynamicMediaPickerAllowed({ field: photoField, lifecycle: 'submitting', businessResult: 'not_started' })).toBe(false)
    expect(isDynamicMediaPickerAllowed({ field: photoField, lifecycle: 'available', businessResult: 'succeeded' })).toBe(false)
    const locked = { ...photoField, runtime: { ...photoField.runtime, readOnly: true } }
    expect(isDynamicMediaPickerAllowed({ field: locked, lifecycle: 'available', businessResult: 'not_started' })).toBe(false)
  })
  it('prevents ambiguous postprocess retry while preserving safe retries', () => {
    expect(isDynamicMediaRetryAvailable([])).toBe(false)
    expect(isDynamicMediaRetryAvailable([task('source_uploaded')])).toBe(true)
    expect(isDynamicMediaRetryAvailable([task('failed_retryable', 'ambiguous_postprocess')])).toBe(false)
    expect(isDynamicMediaRetryAvailable([task('failed_retryable', 'network')])).toBe(true)
  })
  it('keeps survey hint precedence and ambiguity fail-closed copy', () => {
    const hint = (state: 'failed_retryable' | 'uploaded' | 'queued', tasks: readonly MediaUploadTask[] = [], uploadedCount = 0) =>
      dynamicMediaDisplayHint({field: photoField, formPurpose: 'survey', taskState: state, tasks, uploadedCount})
    expect(hint('queued')).toBe('本地已保存，等待上传')
    expect(hint('failed_retryable', [task('failed_retryable', 'ambiguous_postprocess')]))
      .toBe('处理结果待核查，请勿重复提交')
    expect(hint('failed_retryable', [task('failed_retryable', 'network')]))
      .toBe('上传失败，可点击重试')
    expect(hint('uploaded')).toBe('已上传')
    expect(hint('uploaded', [], 1)).toBe('已上传')
    const drawing = { ...photoField, valueKey: 'surveyDrawing' }
    expect(dynamicMediaDisplayHint({ field: drawing, formPurpose: 'survey', taskState: 'uploaded', tasks: [], uploadedCount: 1 }))
      .toContain('测绘工具尚未接入')
  })
})
