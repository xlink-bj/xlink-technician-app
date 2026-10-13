import { defineStore } from 'pinia'
import { ref, watch, type WatchStopHandle } from 'vue'
import { workOrderReadScopeKey } from './read-identity-scope'
import { isProductionReadOnlyRuntime } from '@shared/config'

import type {
  NavigationPort,
  PhonePort,
  SessionSnapshot,
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

function failure<T>(category: ErrorCategory, message: string): OperationSnapshot<T> {
  return {
    state: 'failed_terminal',
    error: createOperationError(category, message),
  }
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

  let api: TechnicianApiReadPort | null = null
  let getSession: () => SessionSnapshot | null = () => null
  let invalidateSession: SessionInvalidation | null = null
  let phone: PhonePort | null = null
  let navigation: NavigationPort | null = null
  let lastWorkOrderId: WorkOrderId | null = null
  let loadVersion = 0
  let stopScopeWatch: WatchStopHandle | null = null
  let renderedScope: string | null = null

  function configureApi(
    nextApi: TechnicianApiReadPort,
    sessionProvider: () => SessionSnapshot | null,
    sessionInvalidation?: SessionInvalidation,
  ): void {
    stopScopeWatch?.()
    clear()
    api = nextApi
    getSession = sessionProvider
    invalidateSession = sessionInvalidation ?? null
    stopScopeWatch = watch(
      () => workOrderReadScopeKey(getSession()),
      (next, prev) => { if (next !== prev) clear() },
      { flush: 'sync' },
    )
  }

  function configurePhone(nextPhone: PhonePort): void {
    phone = nextPhone
  }

  function configureNavigation(nextNavigation: NavigationPort): void {
    navigation = nextNavigation
  }

  function navigateTo(url: string): Promise<void> {
    return navigation ? navigation.navigate(url) : Promise.resolve()
  }

  function clearContactState(): void {
    contactState.value = 'not_requested'
    contactReason.value = undefined
    contactInFlight.value = false
  }

  function clearDetailData(): void {
    currentWorkOrderId.value = null
    detail.value = null
    clearContactState()
  }

  function clear(): void {
    loadVersion += 1
    lastWorkOrderId = null
    renderedScope = null
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

    const scopeAtStart = workOrderReadScopeKey(getSession())
    if (!scopeAtStart) {
      clear()
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
    renderedScope = null
    currentWorkOrderId.value = id
    detail.value = null
    clearContactState()
    loadState.value = 'loading'
    error.value = null

    const result = await api.getWorkOrderDetail(id)
    if (requestVersion !== loadVersion || scopeAtStart !== workOrderReadScopeKey(getSession())) {
      if (requestVersion === loadVersion) clear()
      return failure('authorization_denied', 'Work Order detail read belongs to a changed identity/role')
    }
    if (result.state === 'succeeded' && result.data) {
      if (String(result.data.id) !== String(id)) {
        clear()
        return failure('authorization_denied', 'Work Order detail does not match the requested identity')
      }
      renderedScope = scopeAtStart
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
    renderedScope = null
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

  async function dialContact(): Promise<CapabilityResult<void>> {
    if (isProductionReadOnlyRuntime()) {
      const result = capabilityFailure('unavailable', 'Production read-only mode disables customer contact actions')
      contactState.value = result.state
      contactReason.value = result.reason
      return result
    }
    const contact = renderedScope && renderedScope === workOrderReadScopeKey(getSession())
      ? detail.value?.contact : undefined
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
    configureApi,
    configurePhone,
    configureNavigation,
    navigateTo,
    clear,
    load,
    loadFromRoute,
    retry,
    dialContact,
  }
})
