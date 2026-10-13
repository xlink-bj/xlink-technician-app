import { defineStore } from 'pinia'
import { ref, watch, type WatchStopHandle } from 'vue'
import { workOrderReadScopeKey } from './read-identity-scope'
import { isProductionReadOnlyRuntime } from '@shared/config'

import type {
  AcceptOrderInput,
  NavigationPort,
  PhonePort,
  ReadPage,
  SessionSnapshot,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
  WorkOrderSummary,
} from '@shared/ports'
import {
  createCapabilityResult,
  createOperationError,
  type CapabilityResult,
  type CapabilityState,
  type ErrorCategory,
  type OperationError,
  type OperationSnapshot,
  type OperationState,
} from '@shared/types'

export type WorkOrderListState = Extract<
  OperationState,
  'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'
>

export interface WorkOrderListLoadOptions {
  readonly refresh?: boolean
  readonly append?: boolean
}

export type SessionInvalidation = () => Promise<unknown>

function failure<T>(category: ErrorCategory, message: string): OperationSnapshot<T> {
  return {
    state: 'failed_terminal',
    error: createOperationError(category, message),
  }
}

export const useWorkOrderListStore = defineStore('workOrderList', () => {
  const loadState = ref<WorkOrderListState>('idle')
  const items = ref<readonly WorkOrderSummary[]>([])
  const page = ref(1)
  const pageSize = ref(20)
  const searchText = ref('')
  const totalCount = ref<number | undefined>(undefined)
  const hasMore = ref<boolean | undefined>(undefined)
  const error = ref<OperationError | null>(null)
  const contactState = ref<CapabilityState>('not_requested')
  const contactInFlightId = ref<WorkOrderSummary['id'] | null>(null)
  let api: TechnicianApiReadPort | null = null
  let getSession: () => SessionSnapshot | null = () => null
  let invalidateSession: SessionInvalidation | null = null
  let phone: PhonePort | null = null
  let navigation: NavigationPort | null = null
  let commandApi: TechnicianApiCommandPort | null = null
  let onAcceptSuccess: ((workOrderId: WorkOrderSummary['id']) => void) | null = null
  const acceptInFlightId = ref<WorkOrderSummary['id'] | null>(null)
  const acceptError = ref<OperationError | null>(null)
  let lastLoadWasAppend = false
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

  function configureCommandApi(
    nextApi: TechnicianApiCommandPort,
    accepted?: (workOrderId: WorkOrderSummary['id']) => void,
  ): void {
    commandApi = nextApi
    onAcceptSuccess = accepted ?? null
  }

  function contactFailure(state: CapabilityState, reason: string): CapabilityResult<void> {
    return createCapabilityResult<void>('phone', state, undefined, reason)
  }

  async function dialContact(item: WorkOrderSummary): Promise<CapabilityResult<void>> {
    if (isProductionReadOnlyRuntime()) {
      const result = contactFailure('unavailable', 'Production read-only mode disables customer contact actions')
      contactState.value = result.state
      return result
    }
    const current = renderedScope && renderedScope === workOrderReadScopeKey(getSession())
      ? items.value.find(row => row === item && row.id === item.id) : undefined
    const contact = current?.contact
    if (!contact?.normalizedPhone) {
      const result = contactFailure('unavailable', 'A direct customer phone contact is not available')
      contactState.value = result.state
      return result
    }
    if (!phone) {
      const result = contactFailure('unsupported_platform', 'Phone contact is not configured')
      contactState.value = result.state
      return result
    }
    if (contactInFlightId.value) {
      const result = contactFailure('unavailable', 'Phone contact is already in progress')
      contactState.value = result.state
      return result
    }

    contactInFlightId.value = item.id
    try {
      const result = await phone.dial({
        normalizedPhone: contact.normalizedPhone,
        ...(contact.contactRef ? { contactRef: contact.contactRef } : {}),
      })
      contactState.value = result.state
      return result
    } finally {
      contactInFlightId.value = null
    }
  }

  function clearList(): void {
    loadVersion += 1
    items.value = []
    renderedScope = null
    page.value = 1
    totalCount.value = undefined
    hasMore.value = undefined
  }

  async function acceptOrder(
    input: AcceptOrderInput,
    confirmed = false,
  ): Promise<OperationSnapshot<void> | { readonly state: 'confirmation_required' }> {
    if (isProductionReadOnlyRuntime()) return failure('unsupported_capability', 'Production read-only mode disables Work Order mutations')
    if (!commandApi) return failure('server_terminal', 'Work Order command API is not configured')
    if (acceptInFlightId.value) return failure('validation', 'Accept order is already in progress')

    acceptInFlightId.value = input.workOrderId
    acceptError.value = null
    try {
      const inspection = await commandApi.inspectAcceptOrder(input)
      if (inspection.state !== 'succeeded') {
        acceptError.value = inspection.error ?? null
        return inspection.state === 'failed_retryable' || inspection.state === 'failed_terminal'
          ? { state: inspection.state, ...(inspection.error ? { error: inspection.error } : {}) }
          : failure('server_terminal', 'Accept order precheck was incomplete')
      }
      if (inspection.data?.requiresConfirmation && !confirmed) {
        return { state: 'confirmation_required' }
      }

      const result = await commandApi.acceptOrder(input)
      if (result.state === 'succeeded') {
        onAcceptSuccess?.(input.workOrderId)
        clearList()
        loadState.value = 'idle'
        await load({ refresh: true })
      } else {
        acceptError.value = result.error ?? null
      }
      return result
    } finally {
      acceptInFlightId.value = null
    }
  }

  function clear(): void {
    clearList()
    lastLoadWasAppend = false
    contactState.value = 'not_requested'
    contactInFlightId.value = null
    acceptInFlightId.value = null
    acceptError.value = null
    loadState.value = 'idle'
    error.value = null
  }

  async function setFailure(
    result: OperationSnapshot<ReadPage<WorkOrderSummary>>,
  ): Promise<OperationSnapshot<ReadPage<WorkOrderSummary>>> {
    if (!result.error) {
      const fallback = failure<ReadPage<WorkOrderSummary>>(
        'server_terminal',
        'Work Order list response was incomplete',
      )
      loadState.value = fallback.state
      error.value = fallback.error ?? null
      return fallback
    }

    const normalizedError: OperationError = result.error
    const normalized: OperationSnapshot<ReadPage<WorkOrderSummary>> = {
      state: result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal',
      error: normalizedError,
    }
    loadState.value = normalized.state
    error.value = normalizedError
    if (normalizedError.category === 'session_invalid') {
      clearList()
      if (invalidateSession) await invalidateSession()
    }
    return normalized
  }

  async function load(
    options: WorkOrderListLoadOptions = {},
  ): Promise<OperationSnapshot<ReadPage<WorkOrderSummary>>> {
    if (loadState.value === 'loading') {
      return failure('validation', 'Work Order list request is already in progress')
    }

    const scopeAtStart = workOrderReadScopeKey(getSession())
    if (!scopeAtStart) {
      clearList()
      const result = failure<ReadPage<WorkOrderSummary>>(
        'session_invalid',
        'An authenticated session is required to load work orders',
      )
      loadState.value = result.state
      error.value = result.error ?? null
      return result
    }

    if (!api) {
      const result = failure<ReadPage<WorkOrderSummary>>('server_terminal', 'Work Order API is not configured')
      loadState.value = result.state
      error.value = result.error ?? null
      return result
    }

    const refresh = options.refresh === true
    const append = options.append === true
    const requestedPage = refresh ? 1 : append ? page.value + 1 : page.value
    const requestVersion = ++loadVersion
    lastLoadWasAppend = append
    loadState.value = 'loading'
    error.value = null

    const normalizedSearchText = searchText.value.trim()
    const result = await api.listWorkOrders({
      page: requestedPage,
      pageSize: pageSize.value,
      ...(normalizedSearchText ? { searchText: normalizedSearchText } : {}),
    })
    if (requestVersion !== loadVersion || scopeAtStart !== workOrderReadScopeKey(getSession())) {
      if (requestVersion === loadVersion) clear()
      return failure('authorization_denied', 'Work Order list read belongs to a changed identity/role')
    }
    if (result.state === 'succeeded' && result.data) {
      const responsePage = result.data.page ?? requestedPage
      const responsePageSize = result.data.pageSize ?? pageSize.value
      const nextItems = append ? [...items.value, ...result.data.items] : [...result.data.items]
      items.value = nextItems
      renderedScope = scopeAtStart
      page.value = responsePage
      pageSize.value = responsePageSize
      totalCount.value = result.data.totalCount
      hasMore.value =
        result.data.totalCount === undefined ? undefined : nextItems.length < result.data.totalCount
      loadState.value = 'succeeded'
      error.value = null
      return result
    }

    return setFailure(result)
  }

  function refresh(): Promise<OperationSnapshot<ReadPage<WorkOrderSummary>>> {
    return load({ refresh: true })
  }

  function search(value: string): Promise<OperationSnapshot<ReadPage<WorkOrderSummary>>> {
    searchText.value = value.trim()
    return load({ refresh: true })
  }

  function retry(): Promise<OperationSnapshot<ReadPage<WorkOrderSummary>>> {
    return load({ append: lastLoadWasAppend })
  }

  function loadMore(): Promise<OperationSnapshot<ReadPage<WorkOrderSummary>>> {
    if (hasMore.value !== true) {
      return Promise.resolve(failure('validation', 'No more work orders are available'))
    }
    return load({ append: true })
  }

  return {
    loadState,
    items,
    page,
    pageSize,
    searchText,
    totalCount,
    hasMore,
    error,
    contactState,
    contactInFlightId,
    acceptInFlightId,
    acceptError,
    configureApi,
    configurePhone,
    configureNavigation,
    navigateTo,
    configureCommandApi,
    acceptOrder,
    dialContact,
    load,
    refresh,
    search,
    retry,
    loadMore,
    clear,
  }
})
