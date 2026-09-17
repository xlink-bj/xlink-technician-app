import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { detailWorkflowProjectionFor } from './detail-workflow'
import {
  actionContentKindForIntent,
  actionDraftIdentityFor,
  actionDraftIdentityMatches,
  actionDraftStorageKey,
  actionExecutionForWorkflowDecision,
  type ActionBusinessResult,
  type ActionDescriptor,
  type ActionDraftIdentity,
  type ActionDraftFinalizationStatus,
  type ActionDraftRecord,
  type ActionDraftStatus,
  type ActionLifecycle,
  type ActionRefreshStatus,
} from '@runtimes/action'
import type {
  AppointmentFieldValue,
  AppointmentFormRead,
  NavigationPort,
  SessionSnapshot,
  StoragePort,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
  WorkOrderDetail,
} from '@shared/ports'
import {
  createOperationError,
  type ErrorCategory,
  type OperationError,
  type OperationSnapshot,
  type OperationState,
  type UserId,
  type WorkOrderId,
  type WorkflowNodeRuntimeId,
} from '@shared/types'
import {
  appointmentFieldRolesFor,
  appointmentRuntimeFieldsFor,
  normalizeAppointmentFieldValue,
  normalizeAppointmentForm,
  type AppointmentRuntimeField,
} from './appointment-form-runtime'

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

function appointmentValue(value: unknown): AppointmentFieldValue | undefined {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function draftRecordFor(
  value: unknown,
  identity: ActionDraftIdentity,
  form: AppointmentFormRead,
): ActionDraftRecord<Readonly<Record<string, AppointmentFieldValue>>> | null {
  const input = record(value)
  const rawIdentity = record(input?.identity)
  const rawValues = record(input?.values)
  if (
    input?.version !== 1 ||
    input.status !== 'unfinished' ||
    typeof input.updatedAt !== 'string' ||
    !rawIdentity ||
    !rawValues
  ) return null

  const storedIdentity: ActionDraftIdentity = {
    version: 1,
    userId: rawIdentity.userId as UserId,
    workOrderId: rawIdentity.workOrderId as WorkOrderId,
    workflowNodeId: rawIdentity.workflowNodeId as WorkflowNodeRuntimeId,
    actionIntent: rawIdentity.actionIntent as ActionDraftIdentity['actionIntent'],
    contentKind: rawIdentity.contentKind as ActionDraftIdentity['contentKind'],
    ...(typeof rawIdentity.contentIdentity === 'string' ? { contentIdentity: rawIdentity.contentIdentity } : {}),
  }
  if (!actionDraftIdentityMatches(storedIdentity, identity)) return null

  const fields = new Map(form.fields.map((field) => [field.key, field]))
  const values: Record<string, AppointmentFieldValue> = {}
  for (const [key, rawValue] of Object.entries(rawValues)) {
    const field = fields.get(key)
    const normalized = appointmentValue(rawValue)
    if (!field || normalized === undefined) return null
    if (field.readOnly) {
      if (form.values[key] !== normalized) return null
      values[key] = normalized
      continue
    }
    const result = normalizeAppointmentFieldValue(field, normalized, { ...form.values, ...values })
    if (result.state !== 'succeeded' || result.data === undefined) return null
    values[key] = result.data
  }

  return {
    version: 1,
    identity,
    values,
    updatedAt: input.updatedAt,
    status: 'unfinished',
  }
}

export interface ActionWorkspaceDependencies {
  readonly apiRead: TechnicianApiReadPort
  readonly commandApi: TechnicianApiCommandPort
  readonly storage: StoragePort
  readonly navigation: NavigationPort
  readonly getSession: () => SessionSnapshot | null
  readonly debounceMs?: number
  readonly now?: () => string
}

export const useActionWorkspaceStore = defineStore('actionWorkspace', () => {
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
  const error = ref<OperationError | null>(null)
  const appointmentFields = computed<readonly AppointmentRuntimeField[]>(() =>
    appointmentForm.value ? appointmentRuntimeFieldsFor(appointmentForm.value) : [],
  )
  const appointmentFieldRoles = computed(() =>
    appointmentForm.value
      ? appointmentFieldRolesFor(appointmentForm.value)
      : { extras: [] },
  )
  const appointmentChoiceField = computed(() => appointmentFieldRoles.value.need)
  const appointmentTimeField = computed(() => appointmentFieldRoles.value.datetime)
  const appointmentNoteField = computed(() => appointmentFieldRoles.value.note)
  const appointmentExtraFields = computed(() => appointmentFieldRoles.value.extras)
  const appointmentTimeValue = computed(() => {
    const key = appointmentTimeField.value?.key
    return key ? appointmentForm.value?.values[key] : undefined
  })
  const canSubmit = computed(() =>
    loadState.value === 'succeeded' &&
    lifecycle.value !== 'submitting' &&
    businessResult.value !== 'succeeded' &&
    descriptor.value?.execution === 'enabled' &&
    appointmentForm.value !== null,
  )

  let dependencies: ActionWorkspaceDependencies | null = null
  let identity: ActionDraftIdentity | null = null
  let draftTimer: ReturnType<typeof setTimeout> | undefined
  let draftWriteInFlight: Promise<OperationSnapshot<void>> | null = null
  let draftRevision = 0
  let loadVersion = 0

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
    loadVersion += 1
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
    error.value = null
  }

  async function restoreDraft(
    nextIdentity: ActionDraftIdentity,
    form: AppointmentFormRead,
  ): Promise<void> {
    const configured = dependencies
    if (!configured) return
    const stored = await configured.storage.read<unknown>({
      namespace: 'draft',
      key: actionDraftStorageKey(nextIdentity),
    })
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

    clearDraftTimer()
    if (draftWriteInFlight) await draftWriteInFlight
    const requestVersion = ++loadVersion
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
    error.value = null

    const read = await configured.apiRead.getWorkOrderDetail(input.workOrderId)
    if (requestVersion !== loadVersion) return failure('cancelled', 'Action Workspace load was superseded')
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
    if (contentKind !== 'dynamic_form' || currentTask.actionIntent !== 'set_appointment') {
      detail.value = read.data
      loadState.value = 'blocked'
      lifecycle.value = 'blocked'
      error.value = createOperationError('unsupported_capability', 'This Action content is not supported')
      return failure('unsupported_capability', 'This Action content is not supported')
    }

    const form = await configured.commandApi.readAppointmentForm(
      node.formDataId ? { formDataId: node.formDataId } : {},
    )
    if (requestVersion !== loadVersion) return failure('cancelled', 'Action Workspace load was superseded')
    if (form.state !== 'succeeded' || !form.data) {
      detail.value = read.data
      loadState.value = form.state
      lifecycle.value = lifecycleForFailure(form.state)
      error.value = form.error ?? null
      return failureFrom<AppointmentFormRead, ActionDescriptor>(form)
    }

    const nextDescriptor: ActionDescriptor = {
      userId: session.user.id,
      workOrderId: read.data.id,
      workflowNodeId: currentTask.nodeId,
      actionIntent: currentTask.actionIntent,
      contentKind,
      title: currentTask.title,
      execution: actionExecutionForWorkflowDecision(currentTask.execution),
      ...(form.data.definitionId ? { contentIdentity: form.data.definitionId } : {}),
    }
    const nextIdentity = actionDraftIdentityFor(nextDescriptor)
    detail.value = read.data
    descriptor.value = nextDescriptor
    appointmentForm.value = form.data
    identity = nextIdentity
    loadState.value = 'succeeded'
    lifecycle.value = 'available'
    error.value = null
    await restoreDraft(nextIdentity, form.data)
    return { state: 'succeeded', data: nextDescriptor }
  }

  async function ensureLoaded(input: {
    readonly workOrderId: WorkOrderId
    readonly workflowNodeId: WorkflowNodeRuntimeId
    readonly actionIntent?: string
  }): Promise<OperationSnapshot<ActionDescriptor>> {
    const configured = dependencies
    const session = configured?.getSession()
    const current = descriptor.value
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

  function setField(key: string, value: AppointmentFieldValue): OperationSnapshot<void> {
    const form = appointmentForm.value
    if (!form) return failure('validation', 'Action content is not ready')
    const field = form.fields.find((candidate) => candidate.key === key)
    if (!field) return failure('validation', 'Action field is not supported')
    const normalized = normalizeAppointmentFieldValue(field, value, form.values)
    if (normalized.state !== 'succeeded') {
      error.value = normalized.error ?? null
      return { state: normalized.state, ...(normalized.error ? { error: normalized.error } : {}) }
    }

    appointmentForm.value = {
      ...form,
      values: { ...form.values, [key]: normalized.data! },
    }
    draftRevision += 1
    error.value = null
    lifecycle.value = 'in_progress'
    draftStatus.value = 'dirty'
    scheduleDraftSave()
    return { state: 'succeeded', data: undefined }
  }

  function setAppointmentTime(value: string): OperationSnapshot<void> {
    const field = appointmentTimeField.value
    if (!field) return failure('unsupported_capability', 'Appointment time field is unavailable')
    return setField(field.key, value)
  }

  async function openAppointmentTimeSelection(): Promise<OperationSnapshot<void>> {
    const currentDescriptor = descriptor.value
    if (!currentDescriptor || !appointmentTimeField.value) {
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
    const form = appointmentForm.value
    if (!configured || !currentIdentity || !form || draftStatus.value === 'clean') {
      return { state: 'succeeded', data: undefined }
    }
    if (draftWriteInFlight) return draftWriteInFlight

    const writeRevision = draftRevision
    const record: ActionDraftRecord<Readonly<Record<string, AppointmentFieldValue>>> = {
      version: 1,
      identity: currentIdentity,
      values: form.values,
      updatedAt: configured.now?.() ?? new Date().toISOString(),
      status: 'unfinished',
    }
    const writeVersion = loadVersion
    draftStatus.value = 'saving'
    draftWriteInFlight = configured.storage.write(
      { namespace: 'draft', key: actionDraftStorageKey(currentIdentity) },
      record,
    ).then((result) => {
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
    if (draftWriteInFlight) {
      const inFlight = await draftWriteInFlight
      if (draftStatus.value === 'dirty') return saveDraft()
      return inFlight
    }
    if (draftStatus.value === 'dirty' || draftStatus.value === 'save_failed') return saveDraft()
    return { state: 'succeeded', data: undefined }
  }

  async function clearPersistedDraft(): Promise<OperationSnapshot<void>> {
    const configured = dependencies
    const currentIdentity = identity
    if (!configured || !currentIdentity) return { state: 'succeeded', data: undefined }
    const key = { namespace: 'draft' as const, key: actionDraftStorageKey(currentIdentity) }
    const result = await configured.storage.remove(key)
    if (result.state === 'succeeded') {
      draftStatus.value = 'clean'
      return result
    }

    // A completed tombstone prevents an unfinished record from being restored
    // if a platform storage remove operation is temporarily unavailable.
    const form = appointmentForm.value
    if (form) {
      const tombstone: ActionDraftRecord<Readonly<Record<string, AppointmentFieldValue>>> = {
        version: 1,
        identity: currentIdentity,
        values: form.values,
        updatedAt: configured.now?.() ?? new Date().toISOString(),
        status: 'completed',
      }
      const markedCompleted = await configured.storage.write(key, tombstone)
      if (markedCompleted.state === 'succeeded') {
        draftStatus.value = 'clean'
        return markedCompleted
      }
    }
    return result
  }

  async function submit(): Promise<OperationSnapshot<void>> {
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
    lifecycle.value = 'submitting'
    error.value = null
    const commandResult = await configured.commandApi.submitAppointment({
      workOrderId: currentDescriptor.workOrderId,
      workflowNodeId: currentDescriptor.workflowNodeId,
      ...(detail.value?.workflowRunId ? { workflowRunId: detail.value.workflowRunId } : {}),
      ...(form.dataId ? { formDataId: form.dataId } : {}),
      values: validation.data ?? {},
    })
    if (commandResult.state !== 'succeeded') {
      businessResult.value = 'failed'
      lifecycle.value = lifecycleForFailure(commandResult.state)
      error.value = commandResult.error ?? null
      return commandResult
    }

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
      postSuccessError.value = reread.error ?? createOperationError('server_terminal', 'Authoritative Action state could not be refreshed')
      error.value = postSuccessError.value
      return { state: 'succeeded', data: undefined }
    }

    detail.value = reread.data
    refreshStatus.value = 'refreshed'
    if (!postSuccessError.value) error.value = null
    else error.value = postSuccessError.value
    return { state: 'succeeded', data: undefined }
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
    appointmentFields,
    appointmentFieldRoles,
    appointmentChoiceField,
    appointmentTimeField,
    appointmentNoteField,
    appointmentExtraFields,
    appointmentTimeValue,
    appointmentError: error,
    error,
    canSubmit,
    configure,
    clear,
    load,
    ensureLoaded,
    setField,
    setAppointmentTime,
    openAppointmentTimeSelection,
    continueToConfirmation,
    openConfirmation,
    backToAppointmentWorkspace,
    navigateToDetail,
    navigateToList,
    saveDraft,
    flushDraft,
    submit,
    exit,
  }
})
