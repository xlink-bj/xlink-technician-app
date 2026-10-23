/**
 * Read-only, reactive Action Workspace projections.
 *
 * Appointment, dynamic form, Survey leakage and media readiness are all
 * projections; no draft persistence, role switching, Workflow Complete,
 * upload dispatch or Order mutation belongs here.
 *
 * Extraction is behavior-preserving: every computed formula below is copied
 * from the C1 Action Workspace, with dependencies made explicit.
 */
import { computed, type Ref } from 'vue'
import type { ActionBusinessResult, ActionDescriptor, ActionLifecycle } from '@runtimes/action'
import type { AppointmentFormRead, DynamicFormRead, FormFieldValue, SurveyLeakageCauseRow } from '@shared/ports'
import { isMediaValueRef, type MediaUploadTask } from '@shared/types'
import { createOperationError, type OperationSnapshot } from '@shared/types'
import {
  appointmentFieldRolesFor,
  appointmentDatetimeApplicableFor,
  appointmentRuntimeFieldsFor,
  appointmentVisitIntentFor,
  type AppointmentVisitIntent,
  type AppointmentRuntimeField,
} from './appointment-form-runtime'
import {
  dynamicActionFieldsFor,
  dynamicActionUnsupportedFieldsFor,
  isDeferredSurveyField,
  normalizeDynamicForm,
  type DynamicActionField,
} from './dynamic-form-action'
import {
  surveyLeakageCauseCurrentPart as currentPartForLeakageCause,
  surveyLeakageCauseExperienceFor,
  surveyLeakageCauseFieldIdsFor,
  surveyLeakageCauseGroups,
  surveyLeakageCauseLabels,
  surveyLeakageCausePartLabelsFor,
  surveyLeakageCauseFieldStateFor,
  surveyLeakageCausePersistedIds,
} from './survey-leakage-cause'
import type { ActionWorkspaceLoadState } from './action-workspace'

export interface ActionWorkspaceReadModelSources {
  readonly appointmentForm: Ref<AppointmentFormRead | null>
  readonly dynamicForm: Ref<DynamicFormRead | null>
  readonly descriptor: Ref<ActionDescriptor | null>
  readonly surveyLeakageCauseRows: Ref<readonly SurveyLeakageCauseRow[]>
  readonly mediaTasksByField: Ref<Readonly<Record<string, readonly MediaUploadTask[]>>>
  readonly mediaInFlightField: Ref<string | null>
  readonly loadState: Ref<ActionWorkspaceLoadState>
  readonly lifecycle: Ref<ActionLifecycle>
  readonly businessResult: Ref<ActionBusinessResult>
  readonly dynamicFormSaveState: Ref<'not_saved' | 'saving' | 'saved' | 'failed'>
  readonly completionReconciled: Ref<boolean>
}

function failure<T>(): OperationSnapshot<T> {
  return { state: 'failed_terminal', error: createOperationError('validation', 'Action content is not ready') }
}

export function createActionWorkspaceReadModel(sources: ActionWorkspaceReadModelSources) {
  const {
    appointmentForm, dynamicForm, descriptor, surveyLeakageCauseRows,
    mediaTasksByField, mediaInFlightField, loadState, lifecycle,
    businessResult, dynamicFormSaveState, completionReconciled,
  } = sources
  const appointmentFields = computed<readonly AppointmentRuntimeField[]>(() =>
    appointmentForm.value ? appointmentRuntimeFieldsFor(appointmentForm.value) : [],
  )
  const appointmentFieldRoles = computed(() =>
    appointmentForm.value
      ? appointmentFieldRolesFor(appointmentForm.value)
      : { extras: [] },
  )
  const appointmentVisitIntent = computed<AppointmentVisitIntent>(() =>
    appointmentForm.value ? appointmentVisitIntentFor(appointmentForm.value) : 'unknown',
  )
  const appointmentChoiceField = computed(() => appointmentFieldRoles.value.need)
  const appointmentTimeField = computed(() => appointmentFieldRoles.value.datetime)
  const appointmentDatetimeApplicable = computed(() =>
    appointmentForm.value ? appointmentDatetimeApplicableFor(appointmentForm.value) : false,
  )
  const appointmentNoteField = computed(() => appointmentFieldRoles.value.note)
  const appointmentExtraFields = computed(() => appointmentFieldRoles.value.extras)
  const appointmentTimeValue = computed(() => {
    const valueKey = appointmentTimeField.value?.valueKey
    return appointmentDatetimeApplicable.value && valueKey ? appointmentForm.value?.values[valueKey] : undefined
  })
  const dynamicFields = computed<readonly DynamicActionField[]>(() =>
    dynamicForm.value ? dynamicActionFieldsFor(dynamicForm.value) : [],
  )
  const dynamicUnsupportedFields = computed<readonly DynamicActionField[]>(() =>
    dynamicForm.value ? dynamicActionUnsupportedFieldsFor(dynamicForm.value) : [],
  )
  const dynamicValidation = computed(() =>
    dynamicForm.value
      ? normalizeDynamicForm(dynamicForm.value)
      : failure<Readonly<Record<string, FormFieldValue>>>(),
  )
  const surveyLeakageCauseExperience = computed(() =>
    dynamicForm.value ? surveyLeakageCauseExperienceFor(dynamicForm.value) : undefined,
  )
  const surveyLeakageCauseFieldIds = computed(() =>
    dynamicForm.value ? surveyLeakageCauseFieldIdsFor(dynamicForm.value) : [],
  )
  const surveyLeakageCauseCurrentPart = computed(() =>
    dynamicForm.value ? currentPartForLeakageCause(dynamicForm.value.values.part) : undefined,
  )
  const surveyLeakageCausePartLabels = computed(() =>
    dynamicForm.value ? surveyLeakageCausePartLabelsFor(dynamicForm.value) : new Map<string, string>(),
  )
  const surveyLeakageCauseSelectedIds = computed<readonly string[]>(() => {
    const experience = surveyLeakageCauseExperience.value
    if (!dynamicForm.value || !experience) return []
    return surveyLeakageCausePersistedIds(dynamicForm.value.values[experience.valueField.valueKey]) ?? []
  })
  const surveyLeakageCauseLabelsValue = computed(() =>
    surveyLeakageCauseLabels(surveyLeakageCauseSelectedIds.value, surveyLeakageCauseRows.value),
  )
  const surveyLeakageCauseOptions = computed(() =>
    surveyLeakageCauseGroups(
      surveyLeakageCauseRows.value,
      surveyLeakageCauseCurrentPart.value,
      surveyLeakageCausePartLabels.value,
    ),
  )
  const surveyLeakageCauseReadOnly = computed(() => {
    const experience = surveyLeakageCauseExperience.value
    if (!dynamicForm.value || !experience) return false
    return surveyLeakageCauseFieldStateFor(dynamicForm.value, experience.valueField)?.readOnly ?? false
  })
  const surveyLeakageCauseVisible = computed(() => {
    const experience = surveyLeakageCauseExperience.value
    if (!dynamicForm.value || !experience) return false
    return surveyLeakageCauseFieldStateFor(dynamicForm.value, experience.valueField)?.visible ?? false
  })
  const surveyLeakageCauseCanOpen = computed(() => Boolean(
    surveyLeakageCauseExperience.value
    && surveyLeakageCauseCurrentPart.value
    && !surveyLeakageCauseReadOnly.value,
  ))
  const isDynamicFormAction = computed(() => descriptor.value?.actionIntent === 'interact_with_form')
  const dynamicRequiredMediaPending = computed(() => dynamicFields.value.some((field) => {
    if (isDeferredSurveyField(dynamicForm.value?.purpose, field)) return false
    if (!field.runtime.visible || !field.runtime.required || (field.type !== 'image' && field.type !== 'file')) return false
    const value = dynamicForm.value?.values[field.valueKey]
    const hasAuthoritativeRemoteValue = Array.isArray(value)
      ? value.length > 0
      : isMediaValueRef(value) || Boolean(value)
    if (hasAuthoritativeRemoteValue) return false
    const tasks = mediaTasksByField.value[field.fieldId] ?? []
    return tasks.some((task) => task.state !== 'uploaded')
  }))
  const dynamicMediaUploading = computed(() => mediaInFlightField.value !== null || Object.values(mediaTasksByField.value).some((tasks) =>
    tasks.some((task) => ['queued', 'preprocessing', 'ready_to_upload', 'uploading'].includes(task.state)),
  ))
  const canSubmit = computed(() => isDynamicFormAction.value
    ? loadState.value === 'succeeded' &&
      lifecycle.value !== 'submitting' &&
      businessResult.value !== 'succeeded' &&
      descriptor.value?.execution === 'enabled' &&
      dynamicForm.value !== null &&
      dynamicFormSaveState.value === 'saved' &&
      Boolean(dynamicForm.value.dataId) &&
      dynamicUnsupportedFields.value.length === 0 &&
      dynamicValidation.value.state === 'succeeded' &&
      !dynamicRequiredMediaPending.value &&
      !dynamicMediaUploading.value &&
      completionReconciled.value
    : loadState.value === 'succeeded' &&
      lifecycle.value !== 'submitting' &&
      businessResult.value !== 'succeeded' &&
      descriptor.value?.execution === 'enabled' &&
      appointmentForm.value !== null)

  return {
    appointmentFields,
    appointmentFieldRoles,
    appointmentVisitIntent,
    appointmentChoiceField,
    appointmentTimeField,
    appointmentDatetimeApplicable,
    appointmentNoteField,
    appointmentExtraFields,
    appointmentTimeValue,
    dynamicFields,
    dynamicUnsupportedFields,
    dynamicValidation,
    surveyLeakageCauseExperience,
    surveyLeakageCauseFieldIds,
    surveyLeakageCauseCurrentPart,
    surveyLeakageCausePartLabels,
    surveyLeakageCauseSelectedIds,
    surveyLeakageCauseLabelsValue,
    surveyLeakageCauseOptions,
    surveyLeakageCauseReadOnly,
    surveyLeakageCauseVisible,
    surveyLeakageCauseCanOpen,
    isDynamicFormAction,
    dynamicRequiredMediaPending,
    dynamicMediaUploading,
    canSubmit,
  }
}
