import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { isProductionReadOnlyRuntime } from '@shared/config'

import { detailWorkflowProjectionFor } from './detail-workflow'
import {
  appointmentValue,
  draftRecordFor,
  dynamicDraftRecordFor,
  formValueContainsUploadedRef,
  mediaTaskMatchesDynamicForm,
} from './action-workspace-draft-utils'
import {
  actionContentKindForIntent,
  actionDraftIdentityFor,
  actionDraftIdentityMatches,
  actionExecutionForWorkflowDecision,
  type ActionBusinessResult,
  type ActionDescriptor,
  type ActionDraftIdentity,
  type ActionDraftFinalizationStatus,
  type ActionDraftRecord,
  type ActionDraftStatus,
  type ActionLifecycle,
  type ActionRefreshStatus,
  type ActionDraftRepository,
} from '@runtimes/action'
import type {
  AppointmentFieldValue,
  AppointmentFormRead,
  DynamicFormRead,
  FormFieldValue,
  MediaCapturePort,
  MediaFilePickerPort,
  MediaUploadQueuePort,
  LocationPort,
  NavigationPort,
  StoragePort,
  QuotationCatalogReadPort,
  QuotationOrderCommandPort,
  QuotationOrderReadPort,
  QuotationCatalogItemRead,
  QuotationPackageDetailRead,
  QuotationPackageRead,
  SessionSnapshot,
  SurveyLeakageCauseProviderPort,
  SurveyLeakageCauseRow,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
  UploadPort,
  WorkOrderDetail,
} from '@shared/ports'
import {
  createOperationError,
  type ErrorCategory,
  type FormDefinitionId,
  type FormDataId,
  type OperationError,
  type OperationSnapshot,
  type OperationState,
  type UserId,
  type WorkOrderId,
  type WorkflowNodeRuntimeId,
  isMediaValueRef,
  mediaValueRefFromUpload,
  type MediaEvidenceContext,
  type MediaUploadTask,
  type MediaValueRef,
  type UploadedMediaRef,
} from '@shared/types'
import {
  appointmentFieldRolesFor,
  appointmentDatetimeApplicableFor,
  appointmentRuntimeFieldsFor,
  normalizeAppointmentFieldValue,
  normalizeAppointmentFieldValueForForm,
  normalizeAppointmentForm,
  appointmentVisitIntentFor,
  type AppointmentVisitIntent,
  type AppointmentRuntimeField,
} from './appointment-form-runtime'
import {
  dynamicActionFieldsFor,
  dynamicActionUnsupportedFieldsFor,
  isDeferredSurveyField,
  normalizeDynamicFieldValue,
  normalizeDynamicForm,
  type DynamicActionField,
} from './dynamic-form-action'
import { surveyMediaDescriptorFor, surveyMediaPostUploadPolicyFor } from './survey-media'
import { useQuotationCompositionStore } from './quotation/composition-store'
import { useQuotationCatalogBrowserStore } from './quotation/catalog-browser-store'
import { useQuotationEngineStore } from './quotation/engine-store'
import { createQuotationCatalogSelectionBridge } from './quotation/catalog-selection-bridge'
import { submitQuotationOrder, retryQuotationOrderReadback, restoreQuotationOrderSubmissionState, type QuotationOrderSubmissionSnapshot } from './quotation/order-submission'
import { hydrateQuotationDraft } from './quotation/hydration'
import { reconstructQuotationOrder, quotationOrderEditBlockers } from './quotation/order-reconstruction'
import { isDirectQuotationCatalogKind, type QuotationLineKind } from './quotation/model'
import type { QuotationPackageMaterialChoice } from './quotation/package-configuration'
import {
  normalizeSurveyLeakageCauseSelection,
  surveyLeakageCauseCurrentPart as currentPartForLeakageCause,
  surveyLeakageCauseExperienceFor,
  surveyLeakageCauseFieldIdsFor,
  surveyLeakageCauseGroups,
  surveyLeakageCauseLabels,
  surveyLeakageCausePartLabelsFor,
  surveyLeakageCausePartChangePolicy,
  surveyLeakageCauseFieldStateFor,
  surveyLeakageCausePersistedIds,
} from './survey-leakage-cause'

export const actionWorkspaceRoute = '/pages/work-orders/action-workspace' as const
export const actionWorkspaceTimeRoute = '/pages/work-orders/action-time' as const
export const actionWorkspaceConfirmationRoute = '/pages/work-orders/action-confirmation' as const

function actionRouteFor(
  route: string,
  workOrderId: WorkOrderId,
  workflowNodeId: WorkflowNodeRuntimeId,
  actionIntent: string,
): string {
  return `${route}?id=${encodeURIComponent(String(workOrderId))}&node=${encodeURIComponent(String(workflowNodeId))}&action=${encodeURIComponent(actionIntent)}`
}

export function actionWorkspaceRouteFor(
  workOrderId: WorkOrderId,
  workflowNodeId: WorkflowNodeRuntimeId,
  actionIntent: string,
): string {
  return actionRouteFor(actionWorkspaceRoute, workOrderId, workflowNodeId, actionIntent)
}

export function actionWorkspaceTimeRouteFor(
  workOrderId: WorkOrderId,
  workflowNodeId: WorkflowNodeRuntimeId,
  actionIntent: string,
): string {
  return actionRouteFor(actionWorkspaceTimeRoute, workOrderId, workflowNodeId, actionIntent)
}

export function actionWorkspaceConfirmationRouteFor(
  workOrderId: WorkOrderId,
  workflowNodeId: WorkflowNodeRuntimeId,
  actionIntent: string,
): string {
  return actionRouteFor(actionWorkspaceConfirmationRoute, workOrderId, workflowNodeId, actionIntent)
}

export function parseActionWorkspaceId(value: unknown): WorkOrderId | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return value.trim() as WorkOrderId
}

export function parseActionWorkspaceNodeId(value: unknown): WorkflowNodeRuntimeId | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return value.trim() as WorkflowNodeRuntimeId
}

export type ActionWorkspaceLoadState = Extract<
  OperationState,
  'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'
> | 'blocked'

function failure<T>(category: ErrorCategory, message: string): OperationSnapshot<T> {
  return { state: 'failed_terminal', error: createOperationError(category, message) }
}

function failureFrom<T, U>(result: OperationSnapshot<T>): OperationSnapshot<U> {
  return result.state === 'succeeded'
    ? failure('server_terminal', 'Action Workspace read was incomplete')
    : { state: result.state, ...(result.error ? { error: result.error } : {}) }
}

function lifecycleForFailure(state: OperationState): Extract<ActionLifecycle, 'failed_retryable' | 'failed_terminal'> {
  return state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal'
}

// Explicitly isolated pure draft/identity/media helpers. Store remains the
// sole owner of side effects, workflow transitions and persistence.
export interface ActionWorkspaceDependencies {
  readonly apiRead: TechnicianApiReadPort
  readonly commandApi: TechnicianApiCommandPort
  readonly quotationOrderCommand?: QuotationOrderCommandPort
  readonly quotationOrderRead?: QuotationOrderReadPort
  readonly draftRepository: ActionDraftRepository
  readonly storage?: StoragePort
  readonly quotationCatalogRead?: QuotationCatalogReadPort
  readonly navigation: NavigationPort
  readonly getSession: () => SessionSnapshot | null
  readonly mediaCapture?: MediaCapturePort
  readonly mediaFilePicker?: MediaFilePickerPort
  readonly location?: LocationPort
  readonly upload?: UploadPort
  readonly mediaUploadQueue?: MediaUploadQueuePort
  readonly surveyLeakageCauseProvider?: SurveyLeakageCauseProviderPort
  readonly debounceMs?: number
  readonly now?: () => string
}

export const useActionWorkspaceStore = defineStore('actionWorkspace', () => {
  const quotationComposition = useQuotationCompositionStore()
  const quotationCatalogBrowser = useQuotationCatalogBrowserStore()
  const quotationEngine = useQuotationEngineStore()
  const quotationOrderState = ref<QuotationOrderSubmissionSnapshot>({ state: 'idle' })
  const quotationEditState = ref<{ readonly state: 'none' | 'loading' | 'ready' | 'blocked'; readonly message?: string }>({ state: 'none' })
  const quotationExistingOrderId = ref<string | null>(null)
  let quotationOrderInFlight: Promise<QuotationOrderSubmissionSnapshot> | null = null
  const canSubmitQuotation = computed(() => Boolean(
    !isProductionReadOnlyRuntime()
      && descriptor.value?.contentKind === 'quotation'
      && descriptor.value.actionIntent === 'place_order'
      && descriptor.value.execution === 'enabled'
      && quotationEngine.result?.state === 'ready'
      && quotationComposition.draft
      && quotationEngine.result.draftVersion === quotationComposition.draft.draftVersion
      && quotationEditState.value.state !== 'loading'
      && quotationEditState.value.state !== 'blocked'
      && !['submitting', 'write_succeeded_readback_pending', 'failed_ambiguous_after_dispatch', 'succeeded'].includes(quotationOrderState.value.state),
  ))
  const loadState = ref<ActionWorkspaceLoadState>('idle')
  const lifecycle = ref<ActionLifecycle>('available')
  const businessResult = ref<ActionBusinessResult>('not_started')
  const draftFinalization = ref<ActionDraftFinalizationStatus>('not_started')
  const refreshStatus = ref<ActionRefreshStatus>('not_started')
  const postSuccessError = ref<OperationError | null>(null)
  const draftStatus = ref<ActionDraftStatus>('clean')
  const detail = ref<WorkOrderDetail | null>(null)
  const descriptor = ref<ActionDescriptor | null>(null)
  const appointmentForm = ref<AppointmentFormRead | null>(null)
  const dynamicForm = ref<DynamicFormRead | null>(null)
  const quotationContentState = ref<'idle' | 'loading' | 'ready' | 'blocked' | 'failed_retryable' | 'failed_terminal'>('idle')
  const dynamicFormSaveState = ref<'not_saved' | 'saving' | 'saved' | 'failed'>('not_saved')
  const surveyLeakageCauseRows = ref<readonly SurveyLeakageCauseRow[]>([])
  const surveyLeakageCauseProviderState = ref<'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'>('idle')
  const surveyLeakageCauseProviderError = ref<OperationError | null>(null)
  const mediaByField = ref<Readonly<Record<string, readonly UploadedMediaRef[]>>>({})
  const mediaInFlightField = ref<string | null>(null)
  const mediaStateByField = ref<Readonly<Record<string, 'idle' | 'picking' | 'queued' | 'preprocessing' | 'ready_to_upload' | 'uploading' | 'source_uploaded' | 'postprocessing' | 'uploaded' | 'failed_retryable' | 'failed_terminal'>>>({})
  const mediaTasksByField = ref<Readonly<Record<string, readonly MediaUploadTask[]>>>({})
  const completionReconciled = ref(false)
  const error = ref<OperationError | null>(null)
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
      : failure<Readonly<Record<string, FormFieldValue>>>('validation', 'Action content is not ready'),
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

  let dependencies: ActionWorkspaceDependencies | null = null
  let identity: ActionDraftIdentity | null = null
  let draftTimer: ReturnType<typeof setTimeout> | undefined
  let draftWriteInFlight: Promise<OperationSnapshot<void>> | null = null
  let draftRevision = 0
  let loadVersion = 0
  // A save may continue after a local edit changes its presentation state.
  // Keep a separate per-generation in-flight lease to reject duplicate writes.
  let dynamicSaveInFlightVersion: number | null = null
  // The unscoped v4 draft key is not proof of cross-role ownership.
  // At minimum, never serve a cached action or finish a pending read under
  // a different authenticated session/role than the one that began it.
  let loadedSessionScope: string | null = null

  function sessionScopeKey(session: SessionSnapshot): string {
    return JSON.stringify([
      String(session.sessionRef),
      String(session.user.id),
      session.currentRole ? String(session.currentRole.id) : null,
      session.roleVersion ?? null,
    ])
  }

  /** Mandatory at command dispatch, not just on route re-entry: an existing
   * mounted workspace may outlive the user's active role/session.
   */
  function commandSessionScopeCurrent(): boolean {
    const session = dependencies?.getSession()
    return Boolean(session && loadedSessionScope && sessionScopeKey(session) === loadedSessionScope)
  }

  function actionCommandScopeCurrent(version: number, target: ActionDescriptor): boolean {
    return version === loadVersion && descriptor.value === target && commandSessionScopeCurrent()
  }
  let surveyLeakageCauseProviderInFlight: Promise<OperationSnapshot<readonly SurveyLeakageCauseRow[]>> | null = null

  function clearDraftTimer(): void {
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = undefined
  }

  function configure(next: ActionWorkspaceDependencies): void {
    dependencies = next
  }

  async function navigateTo(url: string, replace = false): Promise<void> {
    const configured = dependencies
    if (!configured) throw new Error('Action Workspace is not configured')
    const transition = replace
      ? configured.navigation.replace ?? configured.navigation.navigate
      : configured.navigation.navigate
    await transition(url)
  }

  async function resetTo(url: string): Promise<void> {
    const configured = dependencies
    if (!configured) throw new Error('Action Workspace is not configured')
    const transition = configured.navigation.reset
      ?? configured.navigation.replace
      ?? configured.navigation.navigate
    await transition(url)
  }

  async function returnTo(url: string): Promise<void> {
    const configured = dependencies
    if (!configured) throw new Error('Action Workspace is not configured')
    if (configured.navigation.replace) {
      await configured.navigation.replace(url)
      return
    }
    if (configured.navigation.reset) {
      await configured.navigation.reset(url)
      return
    }
    await configured.navigation.navigate(url)
  }

  function clear(): void {
    if (descriptor.value?.contentKind === 'quotation') void quotationComposition.flushDraft()
    quotationComposition.clear()
    quotationCatalogBrowser.clear()
    quotationEngine.clear()
    quotationOrderState.value = { state: 'idle' }
    quotationEditState.value = { state: 'none' }
    quotationExistingOrderId.value = null
    loadVersion += 1
    loadedSessionScope = null
    clearDraftTimer()
    draftRevision += 1
    identity = null
    loadState.value = 'idle'
    lifecycle.value = 'available'
    businessResult.value = 'not_started'
    draftFinalization.value = 'not_started'
    refreshStatus.value = 'not_started'
    postSuccessError.value = null
    draftStatus.value = 'clean'
    detail.value = null
    descriptor.value = null
    appointmentForm.value = null
    dynamicForm.value = null
    quotationContentState.value = 'idle'
    dynamicFormSaveState.value = 'not_saved'
    surveyLeakageCauseRows.value = []
    surveyLeakageCauseProviderState.value = 'idle'
    surveyLeakageCauseProviderError.value = null
    mediaByField.value = {}
    mediaTasksByField.value = {}
    mediaInFlightField.value = null
    mediaStateByField.value = {}
    completionReconciled.value = true
    error.value = null
  }

  /** Read-only cross-stage context for the same authenticated user and WorkOrder.
   * The caller supplies explicit node/action/content identities. This cannot
   * write a draft or turn local values into authoritative workflow data. */
  async function readSiblingActionDraft(
    requested: Omit<ActionDraftIdentity, 'userId' | 'version'>,
  ): Promise<OperationSnapshot<ActionDraftRecord<Readonly<Record<string, unknown>>> | null>> {
    const configured = dependencies
    const current = descriptor.value
    const session = configured?.getSession()
    if (!configured || !session || !current
      || String(current.userId) !== String(session.user.id)
      || String(current.workOrderId) !== String(requested.workOrderId)) {
      return failure('unsupported_capability', 'Cross-stage draft does not belong to the active Work Order and user')
    }
    const identity: ActionDraftIdentity = {
      ...requested,
      version: 1,
      userId: session.user.id,
    }
    return configured.draftRepository.read<Readonly<Record<string, unknown>>>(identity)
  }

  async function restoreDraft(
    nextIdentity: ActionDraftIdentity,
    form: AppointmentFormRead,
  ): Promise<void> {
    const configured = dependencies
    if (!configured) return
    const stored = await configured.draftRepository.read<Readonly<Record<string, AppointmentFieldValue>>>(nextIdentity)
    if (stored.state !== 'succeeded' || !stored.data) return
    const draft = draftRecordFor(stored.data, nextIdentity, form)
    if (!draft) return

    appointmentForm.value = {
      ...form,
      values: { ...form.values, ...draft.values },
    }
    draftStatus.value = 'restore_available'
    lifecycle.value = 'draft_local'
  }

  async function restoreDynamicDraft(
    nextIdentity: ActionDraftIdentity,
    form: DynamicFormRead,
  ): Promise<void> {
    const configured = dependencies
    if (!configured) return
    const stored = await configured.draftRepository.read<Readonly<Record<string, FormFieldValue>>>(nextIdentity)
    if (stored.state !== 'succeeded' || !stored.data) return
    const draft = dynamicDraftRecordFor(stored.data, nextIdentity, form)
    if (!draft) return

    dynamicForm.value = {
      ...form,
      values: { ...form.values, ...draft.values },
    }
    dynamicFormSaveState.value = 'not_saved'
    draftStatus.value = 'restore_available'
    lifecycle.value = 'draft_local'
  }

  function taskStateForField(tasks: readonly MediaUploadTask[]): typeof mediaStateByField.value[string] {
    if (tasks.length === 0) return 'idle'
    const priority: readonly MediaUploadTask['state'][] = [
      'failed_terminal',
      'failed_retryable',
      'uploading',
      'preprocessing',
      'ready_to_upload',
      'queued',
      'postprocessing',
      'source_uploaded',
      'uploaded',
    ]
    return priority.find((state) => tasks.some((task) => task.state === state)) ?? 'idle'
  }

  function rememberMediaTask(task: MediaUploadTask): void {
    const fieldId = task.scope.fieldId
    const current = mediaTasksByField.value[fieldId] ?? []
    const next = [...current.filter((candidate) => String(candidate.taskId) !== String(task.taskId)), task]
    mediaTasksByField.value = { ...mediaTasksByField.value, [fieldId]: next }
    mediaStateByField.value = {
      ...mediaStateByField.value,
      [fieldId]: taskStateForField(next),
    }
  }

  function applyUploadedMedia(fieldId: string, uploaded: readonly UploadedMediaRef[]): boolean {
    const form = dynamicForm.value
    const field = form?.fields.find((candidate) => candidate.fieldId === fieldId)
    if (!form || !field || uploaded.length === 0) return false
    const descriptor = surveyMediaDescriptorFor(form.purpose, field)
    const existing = form.values[field.valueKey]
    const existingItems = Array.isArray(existing) ? [...existing] : existing === undefined || existing === null || existing === '' ? [] : [existing]
    const existingUrls = new Set(existingItems.flatMap((item) => {
      if (isMediaValueRef(item)) return [item.url]
      return typeof item === 'string' ? [item] : []
    }))
    const additions = uploaded
      .filter((item) => !existingUrls.has(item.url))
      .map((item) => descriptor ? mediaValueRefFromUpload(item) : item.url)
    if (additions.length === 0) return false
    const mergedItems = [...existingItems, ...additions]
    const nextValue: FormFieldValue = descriptor || Array.isArray(existing) || mergedItems.length !== 1
      ? mergedItems as FormFieldValue
      : mergedItems[0] as FormFieldValue
    const normalized = normalizeDynamicFieldValue(form, field, nextValue)
    if (normalized.state !== 'succeeded' || normalized.data === undefined) {
      error.value = normalized.error ?? createOperationError('unsupported_capability', 'Uploaded media cannot be applied to this field')
      return false
    }
    dynamicForm.value = { ...form, values: { ...form.values, [field.valueKey]: normalized.data } }
    dynamicFormSaveState.value = 'not_saved'
    return true
  }

  async function restoreMediaTasks(nextDescriptor: ActionDescriptor): Promise<void> {
    const configured = dependencies
    if (!configured?.mediaUploadQueue || !dynamicForm.value) return
    const listed = await configured.mediaUploadQueue.listForAction({
      userId: nextDescriptor.userId,
      workOrderId: nextDescriptor.workOrderId,
      workflowNodeId: nextDescriptor.workflowNodeId,
      ...(nextDescriptor.contentIdentity ? { formDefinitionId: String(nextDescriptor.contentIdentity) as FormDefinitionId } : {}),
      ...(dynamicForm.value.dataId ? { formDataId: dynamicForm.value.dataId } : {}),
    })
    if (listed.state !== 'succeeded' || !listed.data) {
      // Queue metadata is auxiliary to the business read. Keep the form usable
      // while retaining the error for diagnostics instead of inventing values.
      error.value = listed.error ?? null
      return
    }

    let restoredBusinessValue = false
    for (const listedTask of listed.data.filter((candidate) => mediaTaskMatchesDynamicForm(candidate, nextDescriptor, dynamicForm.value!))) {
      const task = listedTask.state === 'postprocessing'
        ? (await configured.mediaUploadQueue.process(listedTask.taskId)).data ?? listedTask
        : listedTask
      rememberMediaTask(task)
      if (task.state === 'uploaded' && task.uploadedRef) {
        const fieldUploaded = mediaByField.value[task.scope.fieldId] ?? []
        if (!fieldUploaded.some((item) => item.url === task.uploadedRef?.url)) {
          mediaByField.value = {
            ...mediaByField.value,
            [task.scope.fieldId]: [...fieldUploaded, task.uploadedRef],
          }
        }
        restoredBusinessValue = applyUploadedMedia(task.scope.fieldId, [task.uploadedRef]) || restoredBusinessValue
      }
    }
    if (restoredBusinessValue) {
      draftRevision += 1
      draftStatus.value = 'dirty'
      lifecycle.value = 'draft_local'
      scheduleDraftSave()
    }
  }

  async function load(input: {
    readonly workOrderId: WorkOrderId
    readonly workflowNodeId: WorkflowNodeRuntimeId
    readonly actionIntent?: string
  }): Promise<OperationSnapshot<ActionDescriptor>> {
    const configured = dependencies
    if (!configured) return failure('server_terminal', 'Action Workspace is not configured')
    if (loadState.value === 'loading') return failure('validation', 'Action Workspace is already loading')
    const session = configured.getSession()
    if (!session) return failure('session_invalid', 'An authenticated session is required')
    const requestedSessionScope = sessionScopeKey(session)
    const scopeUnchanged = (): boolean => {
      const activeSession = configured.getSession()
      return activeSession !== null && sessionScopeKey(activeSession) === requestedSessionScope
    }
    const blockStaleScope = (): OperationSnapshot<ActionDescriptor> => {
      clear()
      return failure('session_invalid', '账号或角色已变化，请重新进入当前工作台。')
    }

    clearDraftTimer()
    if (descriptor.value?.contentKind === 'quotation') {
      const flushed = await quotationComposition.flushDraft()
      if (flushed.state !== 'succeeded') {
        return { state: flushed.state, ...(flushed.error ? { error: flushed.error } : {}) }
      }
    }
    if (draftWriteInFlight) await draftWriteInFlight
    if (!scopeUnchanged()) return blockStaleScope()
    quotationComposition.clear()
    quotationCatalogBrowser.clear()
    quotationEngine.clear()
    const requestVersion = ++loadVersion
    loadedSessionScope = null
    loadState.value = 'loading'
    lifecycle.value = 'available'
    businessResult.value = 'not_started'
    draftFinalization.value = 'not_started'
    refreshStatus.value = 'not_started'
    postSuccessError.value = null
    draftStatus.value = 'clean'
    identity = null
    detail.value = null
    descriptor.value = null
    appointmentForm.value = null
    dynamicForm.value = null
    quotationContentState.value = 'idle'
    dynamicFormSaveState.value = 'not_saved'
    surveyLeakageCauseRows.value = []
    surveyLeakageCauseProviderState.value = 'idle'
    surveyLeakageCauseProviderError.value = null
    surveyLeakageCauseProviderInFlight = null
    mediaByField.value = {}
    mediaTasksByField.value = {}
    mediaInFlightField.value = null
    mediaStateByField.value = {}
    completionReconciled.value = true
    error.value = null

    const read = await configured.apiRead.getWorkOrderDetail(input.workOrderId)
    if (requestVersion !== loadVersion) return failure('cancelled', 'Action Workspace load was superseded')
    if (!scopeUnchanged()) return blockStaleScope()
    if (read.state !== 'succeeded' || !read.data) {
      loadState.value = read.state
      lifecycle.value = lifecycleForFailure(read.state)
      error.value = read.error ?? null
      return failureFrom<WorkOrderDetail, ActionDescriptor>(read)
    }

    const projection = detailWorkflowProjectionFor(read.data, session)
    const currentTask = projection.currentTask
    const node = read.data.workflowNodes?.find((candidate) => candidate.id === input.workflowNodeId)
    if (
      !currentTask ||
      !node ||
      String(currentTask.nodeId) !== String(input.workflowNodeId) ||
      (input.actionIntent && currentTask.actionIntent !== input.actionIntent) ||
      currentTask.execution !== 'enabled'
    ) {
      detail.value = read.data
      loadState.value = 'blocked'
      lifecycle.value = 'blocked'
      error.value = createOperationError('unsupported_capability', 'This Action is not executable')
      return failure('unsupported_capability', 'This Action is not executable')
    }

    const contentKind = actionContentKindForIntent(currentTask.actionIntent)
    const isAppointmentAction = currentTask.actionIntent === 'set_appointment'
    const isDynamicAction = currentTask.actionIntent === 'interact_with_form'
    const isQuotationAction = currentTask.actionIntent === 'place_order' && contentKind === 'quotation'
    if (!isAppointmentAction && !isDynamicAction && !isQuotationAction) {
      detail.value = read.data
      loadState.value = 'blocked'
      lifecycle.value = 'blocked'
      error.value = createOperationError('unsupported_capability', 'This Action content is not supported')
      return failure('unsupported_capability', 'This Action content is not supported')
    }

    if (isDynamicAction && !node.formDefinitionId) {
      detail.value = read.data
      loadState.value = 'blocked'
      lifecycle.value = 'blocked'
      error.value = createOperationError('unsupported_capability', 'Dynamic form definition is unavailable')
      return failure('unsupported_capability', 'Dynamic form definition is unavailable')
    }

    if (isQuotationAction) {
      // A quotation draft must have an authenticated role provenance. Without
      // one, do not fall back to the unscoped pre-v3 storage key.
      if (!session.currentRole?.id) {
        loadState.value = 'blocked'
        lifecycle.value = 'blocked'
        error.value = createOperationError('session_invalid', '当前角色不可用，禁止恢复无角色归属的报价草稿。')
        return failure('session_invalid', '当前角色不可用，禁止恢复无角色归属的报价草稿。')
      }
      const nextDescriptor: ActionDescriptor = {
        userId: session.user.id,
        workOrderId: read.data.id,
        workflowNodeId: currentTask.nodeId,
        actionIntent: currentTask.actionIntent,
        contentKind,
        title: currentTask.title,
        execution: actionExecutionForWorkflowDecision(currentTask.execution),
      }
      detail.value = read.data
      descriptor.value = nextDescriptor
      quotationContentState.value = 'loading'
      quotationCatalogBrowser.configure({
        readPort: configured.quotationCatalogRead ?? null,
        catalogContext: read.data.quotationCatalogContext,
      })
      identity = actionDraftIdentityFor(nextDescriptor, session.currentRole.id)
      const repairPartsRead = await configured.apiRead.getCascadeCodeOptions({ codeType: 'repairParts' })
      if (requestVersion !== loadVersion) return failure('cancelled', 'Action Workspace load was superseded')
      if (!scopeUnchanged()) return blockStaleScope()
      await quotationComposition.initialize({
        identity,
        repository: configured.draftRepository,
        repairPartOptions: repairPartsRead.state === 'succeeded' ? repairPartsRead.data?.items ?? [] : [],
        ...(configured.now ? { now: configured.now } : {}),
        ...(configured.debounceMs !== undefined ? { debounceMs: configured.debounceMs } : {}),
      })
      if (requestVersion !== loadVersion) return failure('cancelled', 'Action Workspace load was superseded')
      if (!scopeUnchanged()) return blockStaleScope()
      quotationOrderState.value = configured.storage
        ? await restoreQuotationOrderSubmissionState({
            userId: session.user.id,
            workOrderId: read.data.id,
            workflowNodeId: currentTask.nodeId,
            storage: configured.storage,
          })
        : { state: 'failed_terminal', message: '本地订单防重记录不可用，暂不能安全提交。' }
      if (!scopeUnchanged()) return blockStaleScope()
      loadedSessionScope = requestedSessionScope
      quotationContentState.value = 'ready'
      loadState.value = 'succeeded'
      lifecycle.value = 'available'
      error.value = null
      return { state: 'succeeded', data: nextDescriptor }
    }

    const form = isAppointmentAction
      ? await configured.commandApi.readAppointmentForm(
          node.formDataId ? { formDataId: node.formDataId } : {},
        )
      : configured.commandApi.readDynamicForm
        ? await configured.commandApi.readDynamicForm({
            definitionId: node.formDefinitionId!,
            ...(node.formDataId ? { formDataId: node.formDataId } : {}),
            ...(read.data.workflowRunId ? { expectedWorkflowRunId: read.data.workflowRunId } : {}),
            ...(currentTask.formFieldIdsReadOnly ? { workflowReadOnlyFieldIds: currentTask.formFieldIdsReadOnly } : {}),
          })
        : failure<DynamicFormRead>('unsupported_capability', 'Dynamic form content is unavailable')
    if (requestVersion !== loadVersion) return failure('cancelled', 'Action Workspace load was superseded')
    if (!scopeUnchanged()) return blockStaleScope()
    if (form.state !== 'succeeded' || !form.data) {
      detail.value = read.data
      loadState.value = form.state
      lifecycle.value = lifecycleForFailure(form.state)
      error.value = form.error ?? null
      return failureFrom<AppointmentFormRead | DynamicFormRead, ActionDescriptor>(form)
    }

    const formPurpose = isAppointmentAction
      ? 'appointment' as const
      : (form.data as DynamicFormRead).purpose ?? currentTask.formPurpose
    if (currentTask.formPurpose && formPurpose && currentTask.formPurpose !== formPurpose) {
      detail.value = read.data
      loadState.value = 'blocked'
      lifecycle.value = 'blocked'
      error.value = createOperationError('unsupported_capability', 'Dynamic form semantic identity is inconsistent')
      return failure('unsupported_capability', 'Dynamic form semantic identity is inconsistent')
    }

    const nextDescriptor: ActionDescriptor = {
      userId: session.user.id,
      workOrderId: read.data.id,
      workflowNodeId: currentTask.nodeId,
      actionIntent: currentTask.actionIntent,
      contentKind,
      title: currentTask.title,
      execution: actionExecutionForWorkflowDecision(currentTask.execution),
      ...(formPurpose ? { formPurpose } : {}),
      ...(form.data.definitionId ? { contentIdentity: form.data.definitionId } : {}),
    }
    const nextIdentity = actionDraftIdentityFor(nextDescriptor)
    detail.value = read.data
    descriptor.value = nextDescriptor
    appointmentForm.value = isAppointmentAction ? form.data as AppointmentFormRead : null
    dynamicForm.value = isDynamicAction ? { ...(form.data as DynamicFormRead), ...(formPurpose ? { purpose: formPurpose } : {}) } : null
    dynamicFormSaveState.value = isDynamicAction && form.data.dataId ? 'saved' : 'not_saved'
    mediaByField.value = {}
    mediaInFlightField.value = null
    completionReconciled.value = true
    identity = nextIdentity
    loadState.value = 'succeeded'
    lifecycle.value = 'available'
    error.value = null
    if (isAppointmentAction) await restoreDraft(nextIdentity, form.data as AppointmentFormRead)
    else await restoreDynamicDraft(nextIdentity, form.data as DynamicFormRead)
    await restoreMediaTasks(nextDescriptor)
    if (requestVersion !== loadVersion) return failure('cancelled', 'Action Workspace load was superseded')
    if (!scopeUnchanged()) return blockStaleScope()
    loadedSessionScope = requestedSessionScope
    return { state: 'succeeded', data: nextDescriptor }
  }

  async function refreshQuotationEngine() {
    const configured = dependencies
    const currentDraft = quotationComposition.draft
    if (!configured || !currentDraft || descriptor.value?.contentKind !== 'quotation') {
      quotationEngine.clear()
      return null
    }
    return quotationEngine.evaluate({
      draft: currentDraft,
      catalogContext: detail.value?.quotationCatalogContext,
      catalogRead: configured.quotationCatalogRead,
      serviceAppointmentNum: detail.value?.displayNumber,
      repairPartOptions: quotationComposition.repairPartOptions,
    })
  }

  async function runQuotationOrderSubmission(): Promise<QuotationOrderSubmissionSnapshot> {
    if (quotationOrderInFlight) return quotationOrderInFlight
    if (isProductionReadOnlyRuntime()) {
      quotationOrderState.value = { state: 'failed_terminal', message: '生产环境仅开放报价只读查看；不会提交或修改订单。' }
      return quotationOrderState.value
    }
    const configured = dependencies
    const currentDescriptor = descriptor.value
    const currentIdentity = identity
    const currentDraft = quotationComposition.draft
    const engine = quotationEngine.result
    const session = configured?.getSession()
    const currentNode = detail.value?.workflowNodes?.find((node) => node.id === currentDescriptor?.workflowNodeId)
    if (!commandSessionScopeCurrent()) {
      quotationOrderState.value = { state: 'failed_terminal', message: '账号或角色已变化，禁止提交旧报价，请重新进入工单。' }
      return quotationOrderState.value
    }
    if (!configured?.quotationOrderCommand || !configured.quotationOrderRead || !configured.storage
      || !currentDescriptor || currentDescriptor.contentKind !== 'quotation' || currentDescriptor.actionIntent !== 'place_order'
      || currentDescriptor.execution !== 'enabled' || !currentIdentity || !currentDraft || !session) {
      quotationOrderState.value = { state: 'failed_terminal', message: '当前报价动作尚未具备安全提交条件。' }
      return quotationOrderState.value
    }
    const flushed = await quotationComposition.flushDraft()
    if (!commandSessionScopeCurrent()) {
      quotationOrderState.value = { state: 'failed_terminal', message: '保存草稿期间账号或角色已变化，禁止提交旧报价。' }
      return quotationOrderState.value
    }
    if (flushed.state !== 'succeeded') {
      quotationOrderState.value = { state: 'failed_retryable_before_write', message: '本机报价草稿尚未保存完成，暂不能提交。' }
      return quotationOrderState.value
    }
    if (!engine || engine.state !== 'ready' || !engine.payload
      || engine.draftVersion !== currentDraft.draftVersion
      || engine.draftVersion !== quotationComposition.draft?.draftVersion) {
      quotationOrderState.value = { state: 'failed_terminal', message: '报价校验结果已过期，请等待重新核对后再提交。' }
      return quotationOrderState.value
    }
    const input = {
      userId: session.user.id,
      workOrderId: currentDescriptor.workOrderId,
      workflowNodeId: currentDescriptor.workflowNodeId,
      ...(currentNode?.childWorkflowDefinitionId ? { workflowDefinitionId: currentNode.childWorkflowDefinitionId } : {}),
      expectedDraftVersion: currentDraft.draftVersion,
      evaluatedDraftVersion: engine.draftVersion,
      engineReady: true,
      payload: engine.payload,
      ...(quotationExistingOrderId.value ? { existingOrderId: quotationExistingOrderId.value } : {}),
      command: configured.quotationOrderCommand,
      readApi: configured.quotationOrderRead,
      storage: configured.storage,
      finalizeDraft: async () => {
        const removed = await configured.draftRepository.remove(currentIdentity)
        if (removed.state === 'succeeded') {
          quotationComposition.clear()
          draftStatus.value = 'clean'
        }
        return removed
      },
    }
    quotationOrderState.value = { state: 'submitting', message: '正在提交订单…' }
    quotationOrderInFlight = submitQuotationOrder(input).then((result) => {
      quotationOrderState.value = result
      return result
    }).finally(() => { quotationOrderInFlight = null })
    return quotationOrderInFlight
  }

  async function loadQuotationOrderForEdit(orderId: string): Promise<OperationSnapshot<void>> {
    if (isProductionReadOnlyRuntime()) {
      const message = '生产环境中的服务器报价只读，不能加载到可编辑草稿。'
      quotationEditState.value = { state: 'blocked', message }
      return failure('unsupported_capability', message)
    }
    const configured = dependencies
    const currentDescriptor = descriptor.value
    if (!configured || !orderId.trim() || !currentDescriptor || currentDescriptor.contentKind !== 'quotation'
      || !configured.quotationOrderRead || !configured.quotationCatalogRead) {
      quotationEditState.value = { state: 'blocked', message: '当前无法安全读取待编辑订单。' }
      return failure('unsupported_capability', '当前无法安全读取待编辑订单。')
    }
    quotationEditState.value = { state: 'loading' }
    const orderRead = await configured.quotationOrderRead.getQuotationOrderById(orderId)
    if (orderRead.state !== 'succeeded' || !orderRead.data
      || orderRead.data.id !== orderId
      || orderRead.data.type !== 1
      || orderRead.data.serviceAppointmentId !== currentDescriptor.workOrderId) {
      const message = '待编辑订单无法权威读取或不属于当前工单。'
      quotationEditState.value = { state: 'blocked', message }
      return failure('unsupported_capability', message)
    }
    const blockers = quotationOrderEditBlockers(orderRead.data)
    if (blockers.length > 0) {
      quotationEditState.value = { state: 'blocked', message: blockers[0] }
      return failure('unsupported_capability', blockers[0])
    }
    const reconstructed = reconstructQuotationOrder(orderRead.data, String(currentDescriptor.workflowNodeId))
    if (reconstructed.state !== 'ready') {
      quotationEditState.value = { state: 'blocked', message: reconstructed.reason }
      return failure('unsupported_capability', reconstructed.reason)
    }
    const currentIdentity = identity
    const userSession = configured.getSession()
    const stored = currentIdentity
      ? await configured.draftRepository.read<Readonly<Record<string, unknown>>>(currentIdentity)
      : failure<import('@runtimes/action').ActionDraftRecord<Readonly<Record<string, unknown>>> | null>('unsupported_capability', 'Action draft identity is unavailable')
    if (!userSession || stored.state !== 'succeeded' || stored.data !== null || quotationComposition.localState !== 'fresh') {
      const message = '当前存在未处理的本地报价草稿；服务器订单不会覆盖它。'
      quotationEditState.value = { state: 'blocked', message }
      return failure('unsupported_capability', message)
    }
    const currentDraft = { ...reconstructed.draft, workOrderId: String(currentDescriptor.workOrderId) }
    const hydrated = await hydrateQuotationDraft({
      draft: currentDraft,
      context: detail.value?.quotationCatalogContext,
      port: configured.quotationCatalogRead,
    })
    if (hydrated.state !== 'succeeded') {
      const message = '服务器订单中的目录身份或套餐组成与当前目录不一致；订单保持只读。'
      quotationEditState.value = { state: 'blocked', message }
      return failure('unsupported_capability', message)
    }
    const restored = await quotationComposition.restoreServerOrderDraft(currentDraft)
    if (restored.state !== 'succeeded') {
      const message = restored.error?.message ?? '服务器订单未能安全恢复到本地编辑器。'
      quotationEditState.value = { state: 'blocked', message }
      return restored
    }
    quotationExistingOrderId.value = orderId
    const engine = await refreshQuotationEngine()
    if (!engine || engine.state !== 'ready') {
      const message = '当前目录或价格校验未通过；现有订单保持只读。'
      quotationEditState.value = { state: 'blocked', message }
      return failure('unsupported_capability', message)
    }
    quotationEditState.value = { state: 'ready', message: '已读取并核对现有订单；保存时将更新同一订单身份。' }
    return { state: 'succeeded', data: undefined }
  }

  async function retryQuotationOrderReadbackOnly(): Promise<QuotationOrderSubmissionSnapshot> {
    if (isProductionReadOnlyRuntime()) {
      quotationOrderState.value = { state: 'failed_terminal', message: '生产环境不执行报价提交回读流程。' }
      return quotationOrderState.value
    }
    const configured = dependencies
    const currentDescriptor = descriptor.value
    const currentIdentity = identity
    const currentDraft = quotationComposition.draft
    const session = configured?.getSession()
    const engine = quotationEngine.result
    if (!configured?.quotationOrderCommand || !configured.quotationOrderRead || !configured.storage
      || !currentDescriptor || !currentIdentity || !currentDraft || !session || !engine?.payload) {
      quotationOrderState.value = { state: 'failed_terminal', message: '当前无法安全刷新已提交订单。' }
      return quotationOrderState.value
    }
    const result = await retryQuotationOrderReadback({
      userId: session.user.id,
      workOrderId: currentDescriptor.workOrderId,
      workflowNodeId: currentDescriptor.workflowNodeId,
      expectedDraftVersion: currentDraft.draftVersion,
      evaluatedDraftVersion: engine.draftVersion,
      engineReady: true,
      payload: engine.payload,
      command: configured.quotationOrderCommand,
      readApi: configured.quotationOrderRead,
      storage: configured.storage,
      finalizeDraft: async () => {
        const removed = await configured.draftRepository.remove(currentIdentity)
        if (removed.state === 'succeeded') {
          quotationComposition.clear()
          draftStatus.value = 'clean'
        }
        return removed
      },
    })
    quotationOrderState.value = result
    return result
  }

  async function ensureLoaded(input: {
    readonly workOrderId: WorkOrderId
    readonly workflowNodeId: WorkflowNodeRuntimeId
    readonly actionIntent?: string
  }): Promise<OperationSnapshot<ActionDescriptor>> {
    const configured = dependencies
    const session = configured?.getSession()
    const current = descriptor.value
    if (current && loadedSessionScope && (!session || sessionScopeKey(session) !== loadedSessionScope)) {
      clear()
      return failure('session_invalid', '账号或角色已变化，请重新进入当前工作台。')
    }
    const sameAction = Boolean(
      current
      && session
      && String(current.userId) === String(session.user.id)
      && String(current.workOrderId) === String(input.workOrderId)
      && String(current.workflowNodeId) === String(input.workflowNodeId)
      && (!input.actionIntent || current.actionIntent === input.actionIntent),
    )
    if (sameAction && loadState.value === 'succeeded') {
      return { state: 'succeeded', data: current! }
    }
    return load(input)
  }

  function setField(fieldId: string, value: FormFieldValue): OperationSnapshot<void> {
    if (lifecycle.value === 'submitting' || businessResult.value === 'succeeded') {
      return failure('validation', '当前业务动作正在提交或已完成，禁止修改表单。')
    }
    const dynamic = dynamicForm.value
    if (dynamic) {
      const field = dynamic.fields.find((candidate) => candidate.fieldId === fieldId)
      if (!field) return failure('validation', 'Action field is not supported')
      const normalized = normalizeDynamicFieldValue(dynamic, field, value)
      if (normalized.state !== 'succeeded') {
        error.value = normalized.error ?? null
        return { state: normalized.state, ...(normalized.error ? { error: normalized.error } : {}) }
      }
      const nextValues = { ...dynamic.values, [field.valueKey]: normalized.data! }
      const leakageExperience = surveyLeakageCauseExperienceFor(dynamic)
      const nextDynamicValues = leakageExperience
        && field.valueKey === 'part'
        && surveyLeakageCausePartChangePolicy(dynamic, nextValues) === 'clear_when_hidden'
        ? { ...nextValues, [leakageExperience.valueField.valueKey]: [] }
        : nextValues
      dynamicForm.value = { ...dynamic, values: nextDynamicValues }
      dynamicFormSaveState.value = 'not_saved'
    } else {
      const form = appointmentForm.value
      if (!form) return failure('validation', 'Action content is not ready')
      const field = form.fields.find((candidate) => candidate.fieldId === fieldId)
      if (!field) return failure('validation', 'Action field is not supported')
      const scalar = appointmentValue(value)
      if (scalar === undefined) return failure('validation', 'Appointment field value is not supported')
      const normalized = normalizeAppointmentFieldValueForForm(form, field, scalar)
      if (normalized.state !== 'succeeded') {
        error.value = normalized.error ?? null
        return { state: normalized.state, ...(normalized.error ? { error: normalized.error } : {}) }
      }

      appointmentForm.value = {
        ...form,
        values: { ...form.values, [field.valueKey]: normalized.data! },
      }
    }
    draftRevision += 1
    error.value = null
    lifecycle.value = 'in_progress'
    draftStatus.value = 'dirty'
    scheduleDraftSave()
    return { state: 'succeeded', data: undefined }
  }

  async function loadSurveyLeakageCauseOptions(): Promise<OperationSnapshot<readonly SurveyLeakageCauseRow[]>> {
    const configured = dependencies
    if (!configured?.surveyLeakageCauseProvider) {
      const unavailable = createOperationError('unsupported_capability', 'Leakage-cause provider is unavailable')
      surveyLeakageCauseProviderState.value = 'failed_terminal'
      surveyLeakageCauseProviderError.value = unavailable
      return { state: 'failed_terminal', error: unavailable }
    }
    if (surveyLeakageCauseProviderInFlight) return surveyLeakageCauseProviderInFlight

    surveyLeakageCauseProviderState.value = 'loading'
    surveyLeakageCauseProviderError.value = null
    const providerLoadVersion = loadVersion
    let request: Promise<OperationSnapshot<readonly SurveyLeakageCauseRow[]>>
    request = configured.surveyLeakageCauseProvider.query().then((result) => {
      if (providerLoadVersion !== loadVersion) return result
      if (result.state === 'succeeded' && result.data) {
        surveyLeakageCauseRows.value = result.data
        surveyLeakageCauseProviderState.value = 'succeeded'
        surveyLeakageCauseProviderError.value = null
      } else {
        surveyLeakageCauseProviderState.value = result.state
        surveyLeakageCauseProviderError.value = result.error ?? null
      }
      return result
    }).finally(() => {
      if (surveyLeakageCauseProviderInFlight === request) surveyLeakageCauseProviderInFlight = null
    })
    surveyLeakageCauseProviderInFlight = request
    return request
  }

  function setSurveyLeakageCauseSelection(selectedIds: readonly string[]): OperationSnapshot<void> {
    if (lifecycle.value === 'submitting' || businessResult.value === 'succeeded') {
      return failure('validation', '当前业务动作正在提交或已完成，禁止修改表单。')
    }
    const form = dynamicForm.value
    if (!form || surveyLeakageCauseProviderState.value !== 'succeeded') {
      return failure('network_retryable', 'Leakage-cause options are not available')
    }
    const normalized = normalizeSurveyLeakageCauseSelection(form, selectedIds, surveyLeakageCauseRows.value)
    if (normalized.state !== 'succeeded' || !normalized.data) {
      error.value = normalized.error ?? null
      return { state: normalized.state, ...(normalized.error ? { error: normalized.error } : {}) }
    }
    const experience = surveyLeakageCauseExperienceFor(form)
    if (!experience) return failure('unsupported_capability', 'Leakage-cause experience is unavailable')
    dynamicForm.value = {
      ...form,
      values: { ...form.values, [experience.valueField.valueKey]: normalized.data },
    }
    dynamicFormSaveState.value = 'not_saved'
    draftRevision += 1
    error.value = null
    lifecycle.value = 'in_progress'
    draftStatus.value = 'dirty'
    scheduleDraftSave()
    return { state: 'succeeded', data: undefined }
  }

  function setAppointmentTime(value: string): OperationSnapshot<void> {
    const field = appointmentTimeField.value
    if (!field || !appointmentDatetimeApplicable.value) return failure('validation', 'Appointment time is not applicable to the current visit branch')
    return setField(field.fieldId, value)
  }

  async function openAppointmentTimeSelection(): Promise<OperationSnapshot<void>> {
    const currentDescriptor = descriptor.value
    if (!currentDescriptor || !appointmentTimeField.value || !appointmentDatetimeApplicable.value) {
      return failure('unsupported_capability', 'Appointment time selection is unavailable')
    }
    const flushed = await flushDraft()
    if (flushed.state !== 'succeeded') {
      error.value = flushed.error ?? null
      return flushed
    }
    const configured = dependencies
    if (!configured) return failure('server_terminal', 'Action Workspace is not configured')
    await returnTo(actionWorkspaceTimeRouteFor(
      currentDescriptor.workOrderId,
      currentDescriptor.workflowNodeId,
      currentDescriptor.actionIntent,
    ))
    return { state: 'succeeded', data: undefined }
  }

  async function continueToConfirmation(): Promise<OperationSnapshot<void>> {
    const currentDescriptor = descriptor.value
    const form = appointmentForm.value
    if (!currentDescriptor || !form) return failure('validation', 'Action content is not ready')
    const validation = normalizeAppointmentForm(form)
    if (validation.state !== 'succeeded') {
      error.value = validation.error ?? null
      lifecycle.value = 'in_progress'
      return { state: validation.state, ...(validation.error ? { error: validation.error } : {}) }
    }
    const flushed = await flushDraft()
    if (flushed.state !== 'succeeded') {
      error.value = flushed.error ?? null
      return flushed
    }
    const configured = dependencies
    if (!configured) return failure('server_terminal', 'Action Workspace is not configured')
    await navigateTo(actionWorkspaceConfirmationRouteFor(
      currentDescriptor.workOrderId,
      currentDescriptor.workflowNodeId,
      currentDescriptor.actionIntent,
    ), true)
    return { state: 'succeeded', data: undefined }
  }

  async function openConfirmation(): Promise<OperationSnapshot<void>> {
    const currentDescriptor = descriptor.value
    if (!currentDescriptor || !appointmentForm.value) {
      return failure('validation', 'Action content is not ready')
    }
    const validation = normalizeAppointmentForm(appointmentForm.value)
    if (validation.state !== 'succeeded') {
      error.value = validation.error ?? null
      return { state: validation.state, ...(validation.error ? { error: validation.error } : {}) }
    }
    const flushed = await flushDraft()
    if (flushed.state !== 'succeeded') {
      error.value = flushed.error ?? null
      return flushed
    }
    const configured = dependencies
    if (!configured) return failure('server_terminal', 'Action Workspace is not configured')
    await navigateTo(actionWorkspaceConfirmationRouteFor(
      currentDescriptor.workOrderId,
      currentDescriptor.workflowNodeId,
      currentDescriptor.actionIntent,
    ), true)
    return { state: 'succeeded', data: undefined }
  }

  async function backToAppointmentWorkspace(): Promise<OperationSnapshot<void>> {
    const currentDescriptor = descriptor.value
    const configured = dependencies
    if (!currentDescriptor || !configured) return failure('validation', 'Action content is not ready')
    const flushed = await flushDraft()
    if (flushed.state !== 'succeeded') {
      error.value = flushed.error ?? null
      return flushed
    }
    await returnTo(actionWorkspaceRouteFor(
      currentDescriptor.workOrderId,
      currentDescriptor.workflowNodeId,
      currentDescriptor.actionIntent,
    ))
    return { state: 'succeeded', data: undefined }
  }

  async function navigateToDetail(): Promise<OperationSnapshot<void>> {
    const configured = dependencies
    const currentDetail = detail.value
    if (!configured || !currentDetail) return failure('unsupported_capability', 'Work Order detail is unavailable')
    await resetTo(`/pages/work-orders/detail?id=${encodeURIComponent(String(currentDetail.id))}`)
    return { state: 'succeeded', data: undefined }
  }

  async function navigateToList(): Promise<OperationSnapshot<void>> {
    const configured = dependencies
    if (!configured) return failure('unsupported_capability', 'Work Order list is unavailable')
    await resetTo('/pages/work-orders/work-orders')
    return { state: 'succeeded', data: undefined }
  }

  function scheduleDraftSave(): void {
    clearDraftTimer()
    const delay = dependencies?.debounceMs ?? 360
    draftTimer = setTimeout(() => {
      draftTimer = undefined
      void saveDraft()
    }, delay)
  }

  async function saveDraft(): Promise<OperationSnapshot<void>> {
    const configured = dependencies
    const currentIdentity = identity
    const form = appointmentForm.value ?? dynamicForm.value
    if (!configured || !currentIdentity || !form || draftStatus.value === 'clean') {
      return { state: 'succeeded', data: undefined }
    }
    if (draftWriteInFlight) return draftWriteInFlight

    const writeRevision = draftRevision
    const record: ActionDraftRecord<Readonly<Record<string, FormFieldValue>>> = {
      version: 1,
      identity: currentIdentity,
      values: form.values,
      updatedAt: configured.now?.() ?? new Date().toISOString(),
      status: 'unfinished',
    }
    const writeVersion = loadVersion
    draftStatus.value = 'saving'
    draftWriteInFlight = configured.draftRepository.write(record).then((result) => {
      if (writeVersion !== loadVersion) return result
      if (writeRevision !== draftRevision) {
        draftStatus.value = 'dirty'
        return result
      }
      if (result.state === 'succeeded') {
        draftStatus.value = 'saved_local'
        lifecycle.value = 'draft_local'
      } else {
        draftStatus.value = 'save_failed'
        error.value = result.error ?? null
      }
      return result
    }).finally(() => {
      draftWriteInFlight = null
      if (writeVersion === loadVersion && writeRevision !== draftRevision && draftStatus.value === 'dirty') {
        scheduleDraftSave()
      }
    })
    return draftWriteInFlight
  }

  async function flushDraft(): Promise<OperationSnapshot<void>> {
    clearDraftTimer()
    if (descriptor.value?.contentKind === 'quotation') return quotationComposition.flushDraft()
    if (draftWriteInFlight) {
      const inFlight = await draftWriteInFlight
      if (draftStatus.value === 'dirty') return saveDraft()
      return inFlight
    }
    if (draftStatus.value === 'dirty' || draftStatus.value === 'save_failed') return saveDraft()
    return { state: 'succeeded', data: undefined }
  }

  const {
    addQuotationCatalogSelection,
    validateQuotationPackageConfiguration,
    configureQuotationPackageSelection,
  } = createQuotationCatalogSelectionBridge({
    getWorkspaceState: () => ({
      loadState: loadState.value,
      descriptor: descriptor.value,
      businessResult: businessResult.value,
    }),
    quotationCatalogBrowser,
    quotationComposition,
  })

  async function clearPersistedDraft(): Promise<OperationSnapshot<void>> {
    const configured = dependencies
    const currentIdentity = identity
    if (!configured || !currentIdentity) return { state: 'succeeded', data: undefined }
    const result = await configured.draftRepository.remove(currentIdentity)
    if (result.state === 'succeeded') {
      draftStatus.value = 'clean'
      return result
    }

    // A completed tombstone prevents an unfinished record from being restored
    // if a platform storage remove operation is temporarily unavailable.
    const form = appointmentForm.value ?? dynamicForm.value
    if (form) {
      const tombstone: ActionDraftRecord<Readonly<Record<string, FormFieldValue>>> = {
        version: 1,
        identity: currentIdentity,
        values: form.values,
        updatedAt: configured.now?.() ?? new Date().toISOString(),
        status: 'completed',
      }
      const markedCompleted = await configured.draftRepository.write(tombstone)
      if (markedCompleted.state === 'succeeded') {
        draftStatus.value = 'clean'
        return markedCompleted
      }
    }
    return result
  }

  async function finalizeBusinessSuccess(): Promise<OperationSnapshot<void>> {
    const configured = dependencies
    const currentDescriptor = descriptor.value
    if (!configured || !currentDescriptor) return failure('server_terminal', 'Action Workspace is not configured')

    // The command has already succeeded. Cleanup and reread are deliberately
    // separate states and can never turn the business result back into a
    // submit failure or invite a duplicate mutation.
    businessResult.value = 'succeeded'
    lifecycle.value = 'succeeded'
    loadState.value = 'succeeded'
    draftFinalization.value = 'pending'
    refreshStatus.value = 'pending'
    postSuccessError.value = null

    const draftCleanup = await clearPersistedDraft()
    if (draftCleanup.state === 'succeeded') {
      draftFinalization.value = 'completed'
    } else {
      postSuccessError.value = draftCleanup.error ?? createOperationError('network_retryable', 'Local draft cleanup is pending')
    }
    const reread = await configured.apiRead.getWorkOrderDetail(currentDescriptor.workOrderId)
    if (reread.state !== 'succeeded' || !reread.data) {
      refreshStatus.value = 'pending'
      postSuccessError.value = postSuccessError.value
        ?? reread.error
        ?? createOperationError('server_terminal', 'Authoritative Action state could not be refreshed')
      error.value = postSuccessError.value
      return { state: 'succeeded', data: undefined }
    }

    detail.value = reread.data
    refreshStatus.value = 'refreshed'
    if (!postSuccessError.value) error.value = null
    else error.value = postSuccessError.value
    return { state: 'succeeded', data: undefined }
  }

  async function saveDynamicForm(): Promise<OperationSnapshot<void>> {
    if (!commandSessionScopeCurrent()) return failure('session_invalid', '账号或角色已变化，请重新进入当前表单。')
    const configured = dependencies
    const currentDescriptor = descriptor.value
    const currentIdentity = identity
    const form = dynamicForm.value
    if (!configured || !currentDescriptor || !currentIdentity || !form || !isDynamicFormAction.value) {
      return failure('validation', 'Dynamic form content is not ready')
    }
    if (!configured.commandApi.saveDynamicForm || !currentDescriptor.contentIdentity) {
      return failure('unsupported_capability', 'Dynamic form saving is unavailable')
    }
    const commandVersion = loadVersion
    if (dynamicSaveInFlightVersion === commandVersion) {
      return failure('validation', 'Dynamic form is already saving')
    }
    if (lifecycle.value === 'submitting' || businessResult.value === 'succeeded') {
      return failure('validation', '已完成或正在完成的表单不能再次保存')
    }
    if (dynamicRequiredMediaPending.value || dynamicMediaUploading.value) {
      const mediaError = createOperationError('validation', 'Required media must finish uploading before the form can be saved')
      error.value = mediaError
      lifecycle.value = 'in_progress'
      return { state: 'failed_terminal', error: mediaError }
    }

    const validation = normalizeDynamicForm(form)
    if (validation.state !== 'succeeded' || !validation.data) {
      dynamicFormSaveState.value = 'failed'
      error.value = validation.error ?? null
      lifecycle.value = 'in_progress'
      return { state: validation.state, ...(validation.error ? { error: validation.error } : {}) }
    }

    const savedRevision = draftRevision
    const stillThisAction = () => commandVersion === loadVersion
      && descriptor.value === currentDescriptor
      && identity === currentIdentity
    const staleDraft = () => failure<void>('cancelled', '表单在保存过程中已被修改，请重新保存最新内容。')
    // Reserve before the first await: a second tap cannot dispatch a duplicate
    // FormData mutation while local draft persistence is still pending.
    dynamicSaveInFlightVersion = commandVersion
    dynamicFormSaveState.value = 'saving'
    error.value = null
    try {
      const flushed = await flushDraft()
      if (!stillThisAction()) return failure('cancelled', '已切换工单或表单，忽略旧保存响应。')
      if (!commandSessionScopeCurrent()) {
        dynamicFormSaveState.value = 'not_saved'
        return failure('session_invalid', '保存草稿期间账号或角色已变化，禁止提交旧表单。')
      }
      if (savedRevision !== draftRevision) {
        dynamicFormSaveState.value = 'not_saved'
        return staleDraft()
      }
      if (flushed.state !== 'succeeded') {
        dynamicFormSaveState.value = 'failed'
        error.value = flushed.error ?? null
        return flushed
      }

      const result = await configured.commandApi.saveDynamicForm({
        workOrderId: currentDescriptor.workOrderId,
        workflowNodeId: currentDescriptor.workflowNodeId,
        ...(detail.value?.workflowRunId ? { workflowRunId: detail.value.workflowRunId } : {}),
        definitionId: currentDescriptor.contentIdentity as FormDefinitionId,
        ...(form.purpose ? { purpose: form.purpose } : {}),
        ...(form.dataId ? { formDataId: form.dataId } : {}),
        values: validation.data,
      })
      if (!stillThisAction()) return failure('cancelled', '已切换工单或表单，忽略旧保存响应。')
      if (!commandSessionScopeCurrent()) {
        dynamicFormSaveState.value = 'not_saved'
        return failure('session_invalid', '账号或角色已变化，旧表单保存结果不再授权完成工作流。')
      }
      if (result.state !== 'succeeded' || !result.data) {
        if (savedRevision === draftRevision) {
          dynamicFormSaveState.value = 'failed'
          error.value = result.error ?? createOperationError('server_terminal', 'Dynamic form save did not return a record identity')
        }
        return result.state === 'succeeded'
          ? failure('server_terminal', 'Dynamic form save did not return a record identity')
          : result as OperationSnapshot<void>
      }

      // The server ID is authoritative even if the user edited while awaiting
      // the response: reuse it for a subsequent upsert, but NEVER overwrite
      // newer local values or declare the latest revision saved.
      if (savedRevision !== draftRevision) {
        dynamicForm.value = { ...dynamicForm.value!, dataId: result.data }
        dynamicFormSaveState.value = 'not_saved'
        return staleDraft()
      }
      dynamicForm.value = { ...form, values: validation.data, dataId: result.data }
      dynamicFormSaveState.value = 'saved'
      lifecycle.value = 'in_progress'
      error.value = null
      if (configured.mediaUploadQueue) {
        for (const task of Object.values(mediaTasksByField.value).flat()) {
          if (
            !stillThisAction() || !commandSessionScopeCurrent() || savedRevision !== draftRevision
          ) break
          if (
            task.state !== 'uploaded'
            || !task.uploadedRef
            || !mediaTaskMatchesDynamicForm(task, currentDescriptor, form)
            || !formValueContainsUploadedRef(validation.data[task.scope.valueKey], task.uploadedRef)
          ) continue
          const finalized = await configured.mediaUploadQueue.finalizeAfterSave(task.taskId)
          if (!stillThisAction() || !commandSessionScopeCurrent()) break
          if (finalized.state === 'succeeded') {
            const remaining = (mediaTasksByField.value[task.scope.fieldId] ?? [])
              .filter((candidate) => String(candidate.taskId) !== String(task.taskId))
            mediaTasksByField.value = { ...mediaTasksByField.value, [task.scope.fieldId]: remaining }
            mediaStateByField.value = {
              ...mediaStateByField.value,
              [task.scope.fieldId]: taskStateForField(remaining),
            }
          }
        }
      }
      return { state: 'succeeded', data: undefined }
    } finally {
      if (dynamicSaveInFlightVersion === commandVersion) dynamicSaveInFlightVersion = null
    }
  }

  async function reconcileAfterFailedCompletion(): Promise<void> {
    const configured = dependencies
    const currentDescriptor = descriptor.value
    if (!configured || !currentDescriptor) return
    const reread = await configured.apiRead.getWorkOrderDetail(currentDescriptor.workOrderId)
    if (reread.state === 'succeeded' && reread.data) {
      detail.value = reread.data
      const currentTask = detailWorkflowProjectionFor(reread.data, configured.getSession()).currentTask
      const sameActionStillAvailable = Boolean(
        currentTask
        && String(currentTask.nodeId) === String(currentDescriptor.workflowNodeId)
        && currentTask.actionIntent === currentDescriptor.actionIntent
        && currentTask.execution === 'enabled',
      )
      completionReconciled.value = sameActionStillAvailable
      if (!sameActionStillAvailable) {
        loadState.value = 'blocked'
        lifecycle.value = 'blocked'
        error.value = createOperationError(
          'unsupported_capability',
          'The current Action state changed; return to Work Order detail before continuing',
        )
      }
    } else {
      completionReconciled.value = false
    }
  }

  async function completeDynamicForm(): Promise<OperationSnapshot<void>> {
    if (!commandSessionScopeCurrent()) return failure('session_invalid', '账号或角色已变化，禁止完成旧工作流。')
    const configured = dependencies
    const currentDescriptor = descriptor.value
    const form = dynamicForm.value
    if (!configured || !currentDescriptor || !form || !isDynamicFormAction.value) {
      return failure('validation', 'Dynamic form content is not ready')
    }
    if (!configured.commandApi.completeWorkflowNode || !currentDescriptor.contentIdentity) {
      return failure('unsupported_capability', 'Dynamic form completion is unavailable')
    }
    if (businessResult.value === 'succeeded') return { state: 'succeeded', data: undefined }
    if (currentDescriptor.execution !== 'enabled') return failure('unsupported_capability', 'This Action is read-only')
    if (lifecycle.value === 'submitting') return failure('validation', 'Action is already being submitted')
    if (dynamicFormSaveState.value !== 'saved' || !form.dataId) {
      const unsaved = createOperationError('validation', 'Save the inspection form before completing it')
      error.value = unsaved
      lifecycle.value = 'in_progress'
      return { state: 'failed_terminal', error: unsaved }
    }
    if (!completionReconciled.value) {
      return failure('network_retryable', 'Please refresh the current Action state before retrying')
    }

    const validation = normalizeDynamicForm(form)
    if (validation.state !== 'succeeded') {
      error.value = validation.error ?? null
      lifecycle.value = 'in_progress'
      return { state: validation.state, ...(validation.error ? { error: validation.error } : {}) }
    }
    if (dynamicRequiredMediaPending.value || dynamicMediaUploading.value) {
      const mediaError = createOperationError('validation', 'Required media is not uploaded')
      error.value = mediaError
      lifecycle.value = 'in_progress'
      return { state: 'failed_terminal', error: mediaError }
    }

    const savedForm = dynamicForm.value
    if (!savedForm?.dataId) return failure('server_terminal', 'Dynamic form data identity is unavailable')

    lifecycle.value = 'submitting'
    error.value = null
    const commandResult = await configured.commandApi.completeWorkflowNode({
      workOrderId: currentDescriptor.workOrderId,
      workflowNodeId: currentDescriptor.workflowNodeId,
      ...(detail.value?.workflowRunId ? { workflowRunId: detail.value.workflowRunId } : {}),
      definitionId: currentDescriptor.contentIdentity as FormDefinitionId,
      formDataId: savedForm.dataId,
    })
    if (commandResult.state !== 'succeeded') {
      businessResult.value = 'failed'
      lifecycle.value = lifecycleForFailure(commandResult.state)
      error.value = commandResult.error ?? null
      // Never automatically resend a workflow command. A read reconciliation
      // is the only thing that can make a later manual retry eligible.
      await reconcileAfterFailedCompletion()
      return commandResult
    }

    return finalizeBusinessSuccess()
  }

  async function selectDynamicMedia(fieldId: string, source: 'camera' | 'library'): Promise<OperationSnapshot<void>> {
    const configured = dependencies
    const form = dynamicForm.value
    const field = form?.fields.find((candidate) => candidate.fieldId === fieldId)
    const effective = dynamicFields.value.find((candidate) => candidate.fieldId === fieldId)
    if (!configured || !form || !field || !effective) {
      return failure('unsupported_capability', 'Media is unavailable')
    }
    if (field.type !== 'image' && field.type !== 'file') {
      return failure('unsupported_capability', 'Media is unavailable')
    }
    if (effective.runtime.capability === 'UNSUPPORTED') {
      return failure('unsupported_capability', effective.runtime.reason ?? 'Media is unavailable')
    }
    if (!effective.runtime.visible) return failure('validation', 'This media field is hidden')
    if (effective.runtime.readOnly) return failure('validation', 'This media field is read-only')
    const mediaDescriptor = surveyMediaDescriptorFor(form.purpose, field)
    if (mediaDescriptor?.selectionMode === 'special_tool') {
      return failure('unsupported_capability', mediaDescriptor.blocker ?? 'Survey media tool is unavailable')
    }
    if (source === 'library' && !configured.mediaFilePicker) {
      return failure('unsupported_capability', 'Media upload is unavailable')
    }
    if (source === 'camera' && !configured.mediaCapture) {
      return failure('unsupported_capability', 'Camera capture is unavailable')
    }
    if (!configured.upload && !configured.mediaUploadQueue) {
      return failure('unsupported_capability', 'Media upload is unavailable')
    }
    if (mediaInFlightField.value) return failure('validation', 'Media upload is already in progress')

    mediaInFlightField.value = fieldId
    mediaStateByField.value = { ...mediaStateByField.value, [fieldId]: 'picking' }
    error.value = null
    try {
      const picked = source === 'library'
        ? await configured.mediaFilePicker!.pick()
        : await configured.mediaCapture!.capture().then((result) => result.value ? { ...result, value: [result.value] } : result)
      const selected = picked.state === 'granted' && picked.value
        ? (Array.isArray(picked.value) ? picked.value : [picked.value])
        : []
      if (picked.state !== 'granted' || selected.length === 0) {
        const cancelled = picked.reason ? createOperationError('validation', picked.reason) : null
        mediaStateByField.value = { ...mediaStateByField.value, [fieldId]: 'idle' }
        if (cancelled) error.value = cancelled
        return cancelled ? { state: 'failed_terminal', error: cancelled } : { state: 'succeeded', data: undefined }
      }

      if (mediaDescriptor?.maxCount !== undefined && selected.length > mediaDescriptor.maxCount) {
        const tooMany = createOperationError('validation', `该媒体字段最多选择 ${mediaDescriptor.maxCount} 项`)
        mediaStateByField.value = { ...mediaStateByField.value, [fieldId]: 'failed_terminal' }
        error.value = tooMany
        return { state: 'failed_terminal', error: tooMany }
      }

      const uploaded: UploadedMediaRef[] = []
      const processFailure = (result: OperationSnapshot<MediaUploadTask>): OperationSnapshot<void> => {
        if (result.data) rememberMediaTask(result.data)
        error.value = result.error ?? createOperationError('network_retryable', 'Media upload failed')
        return result.state === 'succeeded'
          ? { state: 'failed_terminal', error: error.value }
          : result as OperationSnapshot<void>
      }
      for (const media of selected) {
        const policy = surveyMediaPostUploadPolicyFor(form.purpose, field, media.source)
        let location: MediaEvidenceContext['location'] | undefined
        if (policy === 'remote_location_watermark' && configured.location) {
          const capturedLocation = await configured.location.captureCurrentLocation()
          if (capturedLocation.state === 'granted' && capturedLocation.value) location = capturedLocation.value
        }
        const evidence: MediaEvidenceContext = {
          ...(media.capturedAt ? { capturedAt: media.capturedAt } : {}),
          postUploadPolicy: policy,
          ...(location ? { location } : {}),
        }

        if (configured.mediaUploadQueue) {
          const queued = await configured.mediaUploadQueue.enqueue({
            scope: {
              userId: configured.getSession()!.user.id,
              workOrderId: descriptor.value!.workOrderId,
              workflowNodeId: descriptor.value!.workflowNodeId,
              ...(descriptor.value!.contentIdentity ? { formDefinitionId: descriptor.value!.contentIdentity as FormDefinitionId } : {}),
              ...(form.dataId ? { formDataId: form.dataId as FormDataId } : {}),
              fieldId,
              valueKey: field.valueKey,
            },
            media,
            evidence,
          })
          if (queued.state !== 'succeeded' || !queued.data) return processFailure(queued)
          rememberMediaTask(queued.data)
          const processed = await configured.mediaUploadQueue.process(queued.data.taskId)
          if (processed.data) rememberMediaTask(processed.data)
          if (processed.state !== 'succeeded' || !processed.data?.uploadedRef) return processFailure(processed)
          uploaded.push(processed.data.uploadedRef)
        } else {
          const result = await configured.upload!.upload(media)
          if (result.state !== 'succeeded' || !result.data) {
            error.value = result.error ?? createOperationError('network_retryable', 'Media upload failed')
            mediaStateByField.value = {
              ...mediaStateByField.value,
              [fieldId]: result.error?.retryable ? 'failed_retryable' : 'failed_terminal',
            }
            return result.state === 'succeeded'
              ? { state: 'failed_terminal', error: error.value }
              : result as OperationSnapshot<void>
          }
          uploaded.push(result.data)
        }
      }

      const previous = mediaByField.value[fieldId] ?? []
      mediaByField.value = {
        ...mediaByField.value,
        [fieldId]: [...previous, ...uploaded.filter((item) => !previous.some((candidate) => candidate.url === item.url))],
      }
      const applied = applyUploadedMedia(fieldId, uploaded)
      mediaStateByField.value = {
        ...mediaStateByField.value,
        [fieldId]: 'uploaded',
      }
      if (applied) {
        draftRevision += 1
        lifecycle.value = 'in_progress'
        draftStatus.value = 'dirty'
        scheduleDraftSave()
      }
      return { state: 'succeeded', data: undefined }
    } finally {
      mediaInFlightField.value = null
    }
  }

  function pickDynamicMedia(fieldId: string): Promise<OperationSnapshot<void>> {
    return selectDynamicMedia(fieldId, 'library')
  }

  function captureDynamicMedia(fieldId: string): Promise<OperationSnapshot<void>> {
    return selectDynamicMedia(fieldId, 'camera')
  }

  async function retryDynamicMedia(fieldId: string): Promise<OperationSnapshot<void>> {
    const configured = dependencies
    const queue = configured?.mediaUploadQueue
    const tasks = mediaTasksByField.value[fieldId] ?? []
    if (!queue || tasks.length === 0) return failure('unsupported_capability', '没有可重试的媒体上传')
    const resumableTasks = tasks.filter((candidate) =>
      candidate.state === 'source_uploaded'
      || (candidate.state === 'failed_retryable' && candidate.lastError?.code !== 'ambiguous_postprocess'),
    )
    if (resumableTasks.length === 0) return failure('validation', '水印处理结果待核查，不能重复提交')
    if (mediaInFlightField.value) return failure('validation', 'Media upload is already in progress')
    mediaInFlightField.value = fieldId
    error.value = null
    try {
      const uploaded: UploadedMediaRef[] = []
      for (const task of resumableTasks) {
        const result = task.state === 'source_uploaded'
          ? await queue.process(task.taskId)
          : await queue.retry(task.taskId)
        if (result.data) rememberMediaTask(result.data)
        if (result.state !== 'succeeded' || !result.data?.uploadedRef) {
          error.value = result.error ?? createOperationError('network_retryable', 'Media upload failed')
          return result.state === 'succeeded'
            ? { state: 'failed_terminal', error: error.value }
            : result as OperationSnapshot<void>
        }
        uploaded.push(result.data.uploadedRef)
      }
      const previous = mediaByField.value[fieldId] ?? []
      mediaByField.value = {
        ...mediaByField.value,
        [fieldId]: [...previous, ...uploaded.filter((item) => !previous.some((candidate) => candidate.url === item.url))],
      }
      const applied = applyUploadedMedia(fieldId, uploaded)
      if (applied) {
        draftRevision += 1
        lifecycle.value = 'in_progress'
        draftStatus.value = 'dirty'
        scheduleDraftSave()
      }
      return { state: 'succeeded', data: undefined }
    } finally {
      mediaInFlightField.value = null
    }
  }

  function canPickDynamicMedia(fieldId: string): boolean {
    const field = dynamicFields.value.find((candidate) => candidate.fieldId === fieldId)
    return Boolean(
      field
      && (field.type === 'image' || field.type === 'file')
      && field.runtime.capability !== 'UNSUPPORTED'
      && field.runtime.visible
      && !field.runtime.readOnly,
    )
  }

  function mediaCanRetryDynamic(fieldId: string): boolean {
    return (mediaTasksByField.value[fieldId] ?? []).some((task) =>
      task.state === 'source_uploaded'
      || (task.state === 'failed_retryable' && task.lastError?.code !== 'ambiguous_postprocess'),
    )
  }

  function dynamicMediaHint(fieldId: string): string | undefined {
    const field = dynamicFields.value.find((candidate) => candidate.fieldId === fieldId)
    if (!field) return undefined
    const descriptor = surveyMediaDescriptorFor(dynamicForm.value?.purpose, field)
    if (descriptor?.selectionMode === 'special_tool') return descriptor.blocker
    if (field.runtime.capability === 'UNSUPPORTED') return field.runtime.reason
    if (!field.runtime.visible) return '当前字段不适用于本页面'
    if (field.runtime.readOnly) return '当前字段仅可查看'
    const taskState = mediaStateByField.value[fieldId]
    if (taskState === 'queued') return '本地已保存，等待上传'
    if (taskState === 'preprocessing' || taskState === 'ready_to_upload') return '正在准备上传…'
    if (taskState === 'uploading') return '正在上传…'
    if (taskState === 'source_uploaded' || taskState === 'postprocessing') return '正在生成水印照片…'
    const hasAmbiguousPostprocess = (mediaTasksByField.value[fieldId] ?? []).some((task) => task.lastError?.code === 'ambiguous_postprocess')
    if (taskState === 'failed_retryable' && hasAmbiguousPostprocess) return '处理结果待核查，请勿重复提交'
    if (taskState === 'failed_retryable') return '上传失败，可点击重试'
    if (taskState === 'failed_terminal') return '上传失败，请重新选择'
    if (taskState === 'uploaded' || (mediaByField.value[fieldId] ?? []).length > 0) return '已上传'
    return undefined
  }

  async function submit(): Promise<OperationSnapshot<void>> {
    if (!commandSessionScopeCurrent()) return failure('session_invalid', '账号或角色已变化，禁止提交旧预约。')
    const configured = dependencies
    const currentDescriptor = descriptor.value
    const form = appointmentForm.value
    const currentIdentity = identity
    if (!configured || !currentDescriptor || !form || !currentIdentity) {
      return failure('validation', 'Action content is not ready')
    }
    if (businessResult.value === 'succeeded') {
      return { state: 'succeeded', data: undefined }
    }
    if (currentDescriptor.execution !== 'enabled') return failure('unsupported_capability', 'This Action is read-only')
    if (lifecycle.value === 'submitting') return failure('validation', 'Action is already being submitted')

    const validation = normalizeAppointmentForm(form)
    if (validation.state !== 'succeeded') {
      error.value = validation.error ?? null
      lifecycle.value = 'in_progress'
      return { state: validation.state, ...(validation.error ? { error: validation.error } : {}) }
    }

    await flushDraft()
    if (!commandSessionScopeCurrent()) return failure('session_invalid', '保存草稿期间账号或角色已变化，禁止提交旧预约。')
    lifecycle.value = 'submitting'
    error.value = null
    const commandResult = await configured.commandApi.submitAppointment({
      workOrderId: currentDescriptor.workOrderId,
      workflowNodeId: currentDescriptor.workflowNodeId,
      ...(detail.value?.workflowRunId ? { workflowRunId: detail.value.workflowRunId } : {}),
      ...(form.dataId ? { formDataId: form.dataId } : {}),
      visitIntent: appointmentVisitIntent.value,
      values: validation.data ?? {},
    })
    if (commandResult.state !== 'succeeded') {
      businessResult.value = 'failed'
      lifecycle.value = lifecycleForFailure(commandResult.state)
      error.value = commandResult.error ?? null
      return commandResult
    }

    return finalizeBusinessSuccess()
  }

  async function exit(): Promise<OperationSnapshot<void>> {
    const flushed = await flushDraft()
    if (flushed.state !== 'succeeded') return flushed
    const configured = dependencies
    if (!configured) return failure('server_terminal', 'Action Workspace is not configured')
    if (detail.value) {
      await resetTo(`/pages/work-orders/detail?id=${encodeURIComponent(String(detail.value.id))}`)
      return { state: 'succeeded', data: undefined }
    }
    if (configured.navigation.back) {
      await configured.navigation.back()
      return { state: 'succeeded', data: undefined }
    }
    return failure('unsupported_capability', 'Navigation is unavailable')
  }

  return {
    loadState,
    lifecycle,
    businessResult,
    draftFinalization,
    refreshStatus,
    postSuccessError,
    draftStatus,
    detail,
    descriptor,
    appointmentForm,
    quotationContentState,
    quotationComposition,
    quotationCatalogBrowser,
    quotationEngine,
    quotationOrderState,
    quotationEditState,
    canSubmitQuotation,
    refreshQuotationEngine,
    submitQuotationOrder: runQuotationOrderSubmission,
    retryQuotationOrderReadback: retryQuotationOrderReadbackOnly,
    loadQuotationOrderForEdit,
    validateQuotationPackageConfiguration,
    configureQuotationPackageSelection,
    appointmentFields,
    appointmentFieldRoles,
    appointmentVisitIntent,
    appointmentDatetimeApplicable,
    appointmentChoiceField,
    appointmentTimeField,
    appointmentNoteField,
    appointmentExtraFields,
    appointmentTimeValue,
    dynamicForm,
    dynamicFields,
    dynamicUnsupportedFields,
    dynamicValidation,
    surveyLeakageCauseExperience,
    surveyLeakageCauseFieldIds,
    surveyLeakageCauseCurrentPart,
    surveyLeakageCauseSelectedIds,
    surveyLeakageCauseLabels: surveyLeakageCauseLabelsValue,
    surveyLeakageCauseOptions,
    surveyLeakageCauseReadOnly,
    surveyLeakageCauseVisible,
    surveyLeakageCauseCanOpen,
    surveyLeakageCauseProviderState,
    surveyLeakageCauseProviderError,
    canPickDynamicMedia,
    mediaCanRetryDynamic,
    dynamicFormSaveState,
    mediaByField,
    mediaTasksByField,
    mediaInFlightField,
    mediaStateByField,
    dynamicMediaHint,
    appointmentError: error,
    error,
    canSubmit,
    configure,
    clear,
    load,
    ensureLoaded,
    setField,
    loadSurveyLeakageCauseOptions,
    setSurveyLeakageCauseSelection,
    setAppointmentTime,
    openAppointmentTimeSelection,
    continueToConfirmation,
    openConfirmation,
    backToAppointmentWorkspace,
    navigateToDetail,
    navigateToList,
    saveDraft,
    flushDraft,
    readSiblingActionDraft,
    addQuotationCatalogSelection,
    saveDynamicForm,
    completeDynamicForm,
    pickDynamicMedia,
    captureDynamicMedia,
    retryDynamicMedia,
    submit,
    exit,
  }
})
