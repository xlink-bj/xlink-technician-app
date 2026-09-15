import { defineStore } from 'pinia'
import { ref } from 'vue'

import type {
  AppointmentFormRead,
  PhonePort,
  SessionSnapshot,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
  WorkOrderDetail,
} from '@shared/ports'
import {
  asOpaqueId,
  createCapabilityResult,
  createOperationError,
  type CapabilityResult,
  type CapabilityState,
  type ErrorCategory,
  type OperationError,
  type OperationSnapshot,
  type OperationState,
  type WorkOrderId,
  type WorkflowNodeRuntimeId,
} from '@shared/types'

export const workOrderDetailRoute = '/pages/work-orders/detail' as const

export function workOrderDetailRouteFor(id: WorkOrderId): string {
  return `${workOrderDetailRoute}?id=${encodeURIComponent(String(id))}`
}

export function parseWorkOrderId(value: unknown): WorkOrderId | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return asOpaqueId<'WorkOrderId'>(value.trim())
}

export type WorkOrderDetailLoadState = Extract<
  OperationState,
  'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'
>

export type SessionInvalidation = () => Promise<unknown>

export type AppointmentOperationState = Extract<
  OperationState,
  'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'
> | 'ready' | 'submitting'

function failure<T>(category: ErrorCategory, message: string): OperationSnapshot<T> {
  return {
    state: 'failed_terminal',
    error: createOperationError(category, message),
  }
}

function failureFromDetail(result: OperationSnapshot<WorkOrderDetail>): OperationSnapshot<void> {
  return result.state === 'succeeded'
    ? failure('server_terminal', 'Work Order detail reread was incomplete')
    : { state: result.state, ...(result.error ? { error: result.error } : {}) }
}

function capabilityFailure(
  state: CapabilityState,
  reason: string,
): CapabilityResult<void> {
  return createCapabilityResult<void>('phone', state, undefined, reason)
}

export const useWorkOrderDetailStore = defineStore('workOrderDetail', () => {
  const loadState = ref<WorkOrderDetailLoadState>('idle')
  const currentWorkOrderId = ref<WorkOrderId | null>(null)
  const detail = ref<WorkOrderDetail | null>(null)
  const error = ref<OperationError | null>(null)
  const contactState = ref<CapabilityState>('not_requested')
  const contactReason = ref<string | undefined>(undefined)
  const contactInFlight = ref(false)
  const appointmentState = ref<AppointmentOperationState>('idle')
  const appointmentForm = ref<AppointmentFormRead | null>(null)
  const appointmentError = ref<OperationError | null>(null)
  const appointmentNodeId = ref<WorkflowNodeRuntimeId | null>(null)

  let api: TechnicianApiReadPort | null = null
  let getSession: () => SessionSnapshot | null = () => null
  let invalidateSession: SessionInvalidation | null = null
  let phone: PhonePort | null = null
  let commandApi: TechnicianApiCommandPort | null = null
  let lastWorkOrderId: WorkOrderId | null = null
  let loadVersion = 0

  function configureApi(
    nextApi: TechnicianApiReadPort,
    sessionProvider: () => SessionSnapshot | null,
    sessionInvalidation?: SessionInvalidation,
  ): void {
    api = nextApi
    getSession = sessionProvider
    invalidateSession = sessionInvalidation ?? null
  }

  function configurePhone(nextPhone: PhonePort): void {
    phone = nextPhone
  }

  function configureCommandApi(nextApi: TechnicianApiCommandPort): void {
    commandApi = nextApi
  }

  function clearContactState(): void {
    contactState.value = 'not_requested'
    contactReason.value = undefined
    contactInFlight.value = false
  }

  function clearAppointmentState(): void {
    appointmentState.value = 'idle'
    appointmentForm.value = null
    appointmentError.value = null
    appointmentNodeId.value = null
  }

  function clearDetailData(): void {
    currentWorkOrderId.value = null
    detail.value = null
    clearContactState()
    clearAppointmentState()
  }

  function clear(): void {
    loadVersion += 1
    lastWorkOrderId = null
    clearDetailData()
    loadState.value = 'idle'
    error.value = null
  }

  async function setFailure(
    result: OperationSnapshot<WorkOrderDetail>,
    requestVersion: number,
  ): Promise<OperationSnapshot<WorkOrderDetail>> {
    if (requestVersion !== loadVersion) return result

    const normalized: OperationSnapshot<WorkOrderDetail> = result.error
      ? {
          state: result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal',
          error: result.error,
        }
      : failure('server_terminal', 'Work Order detail response was incomplete')

    loadState.value = normalized.state
    error.value = normalized.error ?? null
    if (normalized.error?.category === 'session_invalid') {
      lastWorkOrderId = null
      clearDetailData()
      if (invalidateSession) await invalidateSession()
    }
    return normalized
  }

  async function load(id: WorkOrderId): Promise<OperationSnapshot<WorkOrderDetail>> {
    if (loadState.value === 'loading') {
      return failure('validation', 'Work Order detail request is already in progress')
    }

    const sessionAtStart = getSession()
    if (!sessionAtStart) {
      clearDetailData()
      const result = failure<WorkOrderDetail>(
        'session_invalid',
        'An authenticated session is required to load Work Order detail',
      )
      loadState.value = result.state
      error.value = result.error ?? null
      return result
    }

    if (!api) {
      const result = failure<WorkOrderDetail>('server_terminal', 'Work Order API is not configured')
      loadState.value = result.state
      error.value = result.error ?? null
      return result
    }

    const requestVersion = ++loadVersion
    lastWorkOrderId = id
    currentWorkOrderId.value = id
    detail.value = null
    clearContactState()
    clearAppointmentState()
    loadState.value = 'loading'
    error.value = null

    const result = await api.getWorkOrderDetail(id)
    if (requestVersion !== loadVersion) return result

    const currentSession = getSession()
    if (result.state === 'succeeded' && result.data) {
      if (!currentSession) {
        lastWorkOrderId = null
        clearDetailData()
        const invalid = failure<WorkOrderDetail>(
          'session_invalid',
          'The Work Order detail session is no longer available',
        )
        loadState.value = invalid.state
        error.value = invalid.error ?? null
        return invalid
      }

      if (currentSession.sessionRef !== sessionAtStart.sessionRef) {
        clearDetailData()
        const stale = failure<WorkOrderDetail>(
          'validation',
          'The Work Order detail response belongs to an earlier session',
        )
        loadState.value = stale.state
        error.value = stale.error ?? null
        return stale
      }

      detail.value = result.data
      loadState.value = 'succeeded'
      error.value = null
      return result
    }

    return setFailure(result, requestVersion)
  }

  function loadFromRoute(value: unknown): Promise<OperationSnapshot<WorkOrderDetail>> {
    const id = parseWorkOrderId(value)
    if (id) return load(id)

    loadVersion += 1
    lastWorkOrderId = null
    clearDetailData()
    const result = failure<WorkOrderDetail>('validation', 'A valid Work Order id is required')
    loadState.value = result.state
    error.value = result.error ?? null
    return Promise.resolve(result)
  }

  function retry(): Promise<OperationSnapshot<WorkOrderDetail>> {
    return lastWorkOrderId
      ? load(lastWorkOrderId)
      : Promise.resolve(failure('validation', 'No Work Order detail is available to retry'))
  }

  async function openAppointment(nodeId: WorkflowNodeRuntimeId): Promise<OperationSnapshot<AppointmentFormRead>> {
    if (!commandApi) return failure('server_terminal', 'Work Order command API is not configured')
    const node = detail.value?.workflowNodes?.find((candidate) => candidate.id === nodeId)
    if (!node || node.formPurpose !== 'appointment') {
      return failure('unsupported_capability', 'Appointment form is not available for this task')
    }

    appointmentState.value = 'loading'
    appointmentError.value = null
    const result = await commandApi.readAppointmentForm(
      node.formDataId ? { formDataId: node.formDataId } : {},
    )
    if (result.state === 'succeeded' && result.data) {
      appointmentNodeId.value = nodeId
      appointmentForm.value = result.data
      appointmentState.value = 'ready'
      return result
    }

    appointmentState.value = result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal'
    appointmentError.value = result.error ?? null
    return result
  }

  function setAppointmentField(key: string, value: string | number | boolean | null): void {
    if (!appointmentForm.value) return
    appointmentForm.value = {
      ...appointmentForm.value,
      values: { ...appointmentForm.value.values, [key]: value },
    }
  }

  async function submitAppointment(): Promise<OperationSnapshot<void>> {
    if (!commandApi) return failure('server_terminal', 'Work Order command API is not configured')
    if (!detail.value || !appointmentForm.value || !appointmentNodeId.value) {
      return failure('validation', 'Appointment form is not ready')
    }
    if (appointmentState.value === 'submitting') {
      return failure('validation', 'Appointment form is already being submitted')
    }

    const workOrderId = lastWorkOrderId
    if (!workOrderId) return failure('validation', 'Work Order detail is not available')
    appointmentState.value = 'submitting'
    appointmentError.value = null
    const result = await commandApi.submitAppointment({
      workOrderId,
      workflowNodeId: appointmentNodeId.value,
      ...(detail.value.workflowRunId ? { workflowRunId: detail.value.workflowRunId } : {}),
      ...(appointmentForm.value.dataId ? { formDataId: appointmentForm.value.dataId } : {}),
      values: appointmentForm.value.values,
    })
    if (result.state !== 'succeeded') {
      appointmentState.value = result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal'
      appointmentError.value = result.error ?? null
      return result
    }

    clearAppointmentState()
    const reread = await load(workOrderId)
    if (reread.state !== 'succeeded') return failureFromDetail(reread)
    return result
  }

  async function dialContact(): Promise<CapabilityResult<void>> {
    const contact = detail.value?.contact
    if (!contact?.normalizedPhone) {
      const result = capabilityFailure(
        'unavailable',
        'A direct customer phone contact is not available for this Work Order',
      )
      contactState.value = result.state
      contactReason.value = result.reason
      return result
    }
    if (!phone) {
      const result = capabilityFailure('unsupported_platform', 'Phone contact is not configured')
      contactState.value = result.state
      contactReason.value = result.reason
      return result
    }
    if (contactInFlight.value) {
      const result = capabilityFailure('unavailable', 'Phone contact is already in progress')
      contactState.value = result.state
      contactReason.value = result.reason
      return result
    }

    contactInFlight.value = true
    try {
      const result = await phone.dial({
        normalizedPhone: contact.normalizedPhone,
        ...(contact.contactRef ? { contactRef: contact.contactRef } : {}),
      })
      contactState.value = result.state
      contactReason.value = result.reason
      return result
    } finally {
      contactInFlight.value = false
    }
  }

  return {
    loadState,
    currentWorkOrderId,
    detail,
    error,
    contactState,
    contactReason,
    contactInFlight,
    appointmentState,
    appointmentForm,
    appointmentError,
    appointmentNodeId,
    configureApi,
    configurePhone,
    configureCommandApi,
    clear,
    load,
    loadFromRoute,
    retry,
    dialContact,
    openAppointment,
    setAppointmentField,
    submitAppointment,
  }
})
