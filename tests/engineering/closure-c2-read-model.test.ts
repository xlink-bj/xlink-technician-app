import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import { asOpaqueId } from '@shared/types'
import type { ActionBusinessResult, ActionDescriptor, ActionLifecycle } from '@runtimes/action'
import type { AppointmentFormRead, DynamicFormRead, SurveyLeakageCauseRow } from '@shared/ports'
import type { MediaUploadTask } from '@shared/types'
import { createActionWorkspaceReadModel } from '@features/work-orders/action-workspace-read-model'
import type { ActionWorkspaceLoadState } from '@features/work-orders/action-workspace'

const need = {
  fieldId: 'need', valueKey: 'need', type: 'radio', label: '上门',
  required: true, readOnly: false,
  options: [{ value: '1', label: '需要' }, { value: '0', label: '延后' }],
} as const
const datetime = {
  fieldId: 'datetime', valueKey: 'datetime', type: 'datetime', label: '预约时间',
  required: true, readOnly: false,
} as const

function fixture() {
  const appointmentForm = shallowRef<AppointmentFormRead | null>(null)
  const dynamicForm = shallowRef<DynamicFormRead | null>(null)
  const descriptor = shallowRef<ActionDescriptor | null>(null)
  const surveyLeakageCauseRows = shallowRef<readonly SurveyLeakageCauseRow[]>([])
  const mediaTasksByField = shallowRef<Readonly<Record<string, readonly MediaUploadTask[]>>>({})
  const mediaInFlightField = shallowRef<string | null>(null)
  const loadState = shallowRef<ActionWorkspaceLoadState>('idle')
  const lifecycle = shallowRef<ActionLifecycle>('available')
  const businessResult = shallowRef<ActionBusinessResult>('not_started')
  const dynamicFormSaveState = shallowRef<'not_saved'|'saving'|'saved'|'failed'>('not_saved')
  const completionReconciled = shallowRef(false)
  const model = createActionWorkspaceReadModel({
    appointmentForm, dynamicForm, descriptor, surveyLeakageCauseRows,
    mediaTasksByField, mediaInFlightField, loadState, lifecycle,
    businessResult, dynamicFormSaveState, completionReconciled,
  })
  return {
    model, appointmentForm, dynamicForm, descriptor,
    surveyLeakageCauseRows, mediaTasksByField, mediaInFlightField,
    loadState, lifecycle, businessResult, dynamicFormSaveState, completionReconciled,
  }
}

const dynamicDescriptor: ActionDescriptor = {
  userId: asOpaqueId<'UserId'>('synthetic-user'),
  workOrderId: asOpaqueId<'WorkOrderId'>('synthetic-work-order'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-node'),
  actionIntent: 'interact_with_form',
  contentKind: 'dynamic_form',
  title: 'Synthetic Dynamic Form',
  execution: 'enabled',
}

describe('Closure C2 — single reactive read model with no command transport', () => {
  it('starts empty and fails closed rather than making not-yet-loaded forms submit-ready', () => {
    const f = fixture()
    expect(f.model.appointmentFields.value).toEqual([])
    expect(f.model.dynamicFields.value).toEqual([])
    expect(f.model.dynamicValidation.value.state).toBe('failed_terminal')
    expect(f.model.canSubmit.value).toBe(false)
    expect(f.model.surveyLeakageCauseCanOpen.value).toBe(false)
    expect(f.model.dynamicMediaUploading.value).toBe(false)
  })

  it('reactively reflects appointment visit intent, roles and datetime applicability without a command', () => {
    const f = fixture()
    f.appointmentForm.value = { fields: [need, datetime], values: { need: '0' } }
    expect(f.model.appointmentChoiceField.value?.fieldId).toBe('need')
    expect(f.model.appointmentTimeField.value?.fieldId).toBe('datetime')
    expect(f.model.appointmentDatetimeApplicable.value).toBe(false)
    expect(f.model.appointmentTimeValue.value).toBeUndefined()
    f.appointmentForm.value = { fields: [need, datetime], values: { need: '1', datetime: '2026-11-21T12:00:00' } }
    expect(f.model.appointmentDatetimeApplicable.value).toBe(true)
    expect(f.model.appointmentTimeValue.value).toBe('2026-11-21T12:00:00')
    f.loadState.value = 'succeeded'
    f.descriptor.value = { ...dynamicDescriptor, actionIntent: 'set_appointment' }
    expect(f.model.canSubmit.value).toBe(true)
    f.lifecycle.value = 'submitting'
    expect(f.model.canSubmit.value).toBe(false)
  })

  it('gates generic Workflow Complete on saved authoritative FormData and reconciliation', () => {
    const f = fixture()
    f.descriptor.value = dynamicDescriptor
    f.loadState.value = 'succeeded'
    f.dynamicForm.value = {
      dataId: asOpaqueId<'FormDataId'>('server-form-data'),
      fields: [{
        fieldId: 'note', valueKey: 'note', type: 'text', label: '备注',
        required: true, readOnly: false,
      }],
      values: { note: 'Validated' },
    }
    expect(f.model.dynamicValidation.value).toMatchObject({ state: 'succeeded', data: { note: 'Validated' } })
    expect(f.model.canSubmit.value).toBe(false)
    f.dynamicFormSaveState.value = 'saved'
    expect(f.model.canSubmit.value).toBe(false)
    f.completionReconciled.value = true
    expect(f.model.canSubmit.value).toBe(true)
    f.mediaInFlightField.value = 'photo'
    expect(f.model.canSubmit.value).toBe(false)
    f.mediaInFlightField.value = null
    expect(f.model.canSubmit.value).toBe(true)
    f.businessResult.value = 'succeeded'
    expect(f.model.canSubmit.value).toBe(false)
  })

  it('blocks unsupported required dynamic fields without relaxing their visibility contract', () => {
    const f = fixture()
    f.descriptor.value = dynamicDescriptor
    f.loadState.value = 'succeeded'
    f.dynamicForm.value = {
      dataId: asOpaqueId<'FormDataId'>('server-form-data'),
      fields: [{
        fieldId: 'unverified', valueKey: 'unverified', type: 'text', label: '未支持',
        required: true, readOnly: false, unsupportedReason: 'not verified by R1',
      }],
      values: {},
    }
    f.dynamicFormSaveState.value = 'saved'
    f.completionReconciled.value = true
    expect(f.model.dynamicUnsupportedFields.value.length).toBeGreaterThan(0)
    expect(f.model.canSubmit.value).toBe(false)
  })
})
