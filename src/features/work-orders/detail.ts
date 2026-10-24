import { defineStore } from 'pinia'
import { ref, watch, type WatchStopHandle } from 'vue'
import { workOrderReadScopeKey } from './read-identity-scope'
import { detailWorkflowUiProjectionFor } from './detail-workflow'
import { isProductionReadOnlyRuntime } from '@shared/config'

import type {
  NavigationPort,
  PhonePort,
  SessionSnapshot,
  TechnicianApiReadPort,
  WorkOrderDetail,
  WorkflowNodeRead,
  R1NodeFormReference,
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
  type FormDefinitionId,
  type WorkflowRunId,
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

export interface R1RepeatRecordsReadState {
  readonly state: WorkOrderDetailLoadState
  readonly entries: readonly R1NodeFormReference[]
  readonly hasMore: boolean
  readonly error?: OperationError
}

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
  // Read-only Production child nodes are never part of the editable action workspace.
  const childReadState = ref<WorkOrderDetailLoadState>('idle')
  const childReadParentId = ref<string | null>(null)
  const childReadNodes = ref<readonly WorkflowNodeRead[]>([])
  const childReadError = ref<OperationError | null>(null)
  const repeatReadByNode = ref<Readonly<Record<string, R1RepeatRecordsReadState>>>({})
  const mainRepeatRead = ref<R1RepeatRecordsReadState>({ state: 'idle', entries: [], hasMore: false })
  let childReadVersion = 0
  let mainRepeatReadVersion = 0

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
    clearChildRead()
    clearMainRepeatRead()
    currentWorkOrderId.value = null
    detail.value = null
    clearContactState()
  }

  function clearChildRead(): void {
    childReadVersion += 1
    childReadState.value = 'idle'
    childReadParentId.value = null
    childReadNodes.value = []
    childReadError.value = null
    repeatReadByNode.value = {}
  }

  function clearMainRepeatRead(): void {
    mainRepeatReadVersion += 1
    mainRepeatRead.value = { state: 'idle', entries: [], hasMore: false }
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
    clearChildRead()
    clearMainRepeatRead()
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

  async function loadChildWorkflowForms(parentNodeId: string): Promise<OperationSnapshot<readonly WorkflowNodeRead[]>> {
    const scopeAtStart = workOrderReadScopeKey(getSession())
    const parent = detail.value?.workflowNodes?.find((node) =>
      String(node.id) === parentNodeId && node.category === 'subworkflow'
      && ['subflows', 'subflow', 'subworkflow'].includes(node.sourceNodeType ?? ''),
    )
    if (!isProductionReadOnlyRuntime() || !api || !parent || !scopeAtStart
      || renderedScope !== scopeAtStart || loadState.value !== 'succeeded') {
      return failure('authorization_denied', 'Current role and Work Order detail do not authorize this child view')
    }
    const version = ++childReadVersion
    const workOrderId = String(detail.value!.id)
    childReadParentId.value = parentNodeId
    childReadNodes.value = []
    childReadError.value = null
    repeatReadByNode.value = {}
    childReadState.value = 'loading'
    const result = await api.getChildWorkflowNodes(parentNodeId as WorkflowNodeRuntimeId)
    if (version !== childReadVersion || renderedScope !== scopeAtStart
      || scopeAtStart !== workOrderReadScopeKey(getSession())
      || String(detail.value?.id ?? '') !== workOrderId
      || !detail.value?.workflowNodes?.some((node) => node.id === parent.id)) {
      return failure('authorization_denied', 'Child view authority changed during read')
    }
    if (result.state !== 'succeeded' || !result.data) {
      childReadState.value = result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal'
      childReadError.value = result.error ?? null
      return result
    }
    const ids = result.data.map((node) => String(node.id))
    if (ids.length > 50 || new Set(ids).size !== ids.length) {
      const invalid = failure<readonly WorkflowNodeRead[]>('server_terminal', 'Child Workflow returned invalid node identities')
      childReadState.value = 'failed_terminal'
      childReadError.value = invalid.error ?? null
      return invalid
    }
    // R1's real child runs use type=node and have no nodeType; filtering only
    // forms/repeat erased every legitimate node. Preserve their read-only
    // identities, including cancelled nodes, but never enable commands.
    childReadNodes.value = result.data
    childReadState.value = 'succeeded'
    return result
  }

  async function loadChildRepeatRecords(nodeId: string): Promise<void> {
    const scopeAtStart = workOrderReadScopeKey(getSession())
    const node = childReadNodes.value.find((candidate) => String(candidate.id) === nodeId
      && candidate.sourceNodeType === 'repeat' && candidate.runId && candidate.formDefinitionId)
    if (!isProductionReadOnlyRuntime() || !api?.listRepeatFormReferences || !node || !scopeAtStart
      || renderedScope !== scopeAtStart || childReadState.value !== 'succeeded') return
    const version = childReadVersion
    const workOrderId = String(detail.value?.id ?? '')
    repeatReadByNode.value = {
      ...repeatReadByNode.value,
      [nodeId]: { state: 'loading', entries: [], hasMore: false },
    }
    const result = await api.listRepeatFormReferences({
      definitionId: node.formDefinitionId as FormDefinitionId,
      workflowRunId: node.runId as WorkflowRunId,
      page: 1,
      pageSize: 20,
    })
    if (version !== childReadVersion || renderedScope !== scopeAtStart
      || workOrderId !== String(detail.value?.id ?? '')
      || scopeAtStart !== workOrderReadScopeKey(getSession())
      || !childReadNodes.value.some((candidate) => candidate.id === node.id)) return
    const snapshot: R1RepeatRecordsReadState = result.state === 'succeeded' && result.data
      ? {
          state: 'succeeded', entries: result.data.items,
          // A full first page without totalCount is not proof of completeness.
          hasMore: result.data.totalCount === undefined
            ? result.data.items.length >= 20
            : result.data.totalCount > result.data.items.length,
        }
      : {
          state: result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal',
          entries: [], hasMore: false,
          ...(result.error ? { error: result.error } : {}),
        }
    repeatReadByNode.value = { ...repeatReadByNode.value, [nodeId]: snapshot }
  }

  function currentMainRepeat(nodeId: string, scope: string | null): WorkflowNodeRead | null {
    const current = detail.value
    if (!isProductionReadOnlyRuntime() || !api?.listRepeatFormReferences
      || !api.isWorkOrderListedForCurrentSession || !api.isRepeatFormContextAuthorizedForCurrentSession
      || !scope || renderedScope !== scope || loadState.value !== 'succeeded' || !current
      || !api.isWorkOrderListedForCurrentSession(String(current.id))) return null
    const task = detailWorkflowUiProjectionFor(current, getSession()).currentTask
    if (task?.nodeId !== nodeId || task.sourceNodeType !== 'repeat') return null
    const node = current.workflowNodes?.find((candidate) => String(candidate.id) === nodeId
      && candidate.category === 'repeat' && candidate.sourceNodeType === 'repeat'
      && candidate.runId && candidate.formDefinitionId)
    if (!node?.runId || !node.formDefinitionId || !current.workflowRunId
      || String(node.runId) !== String(current.workflowRunId)
      || !api.isRepeatFormContextAuthorizedForCurrentSession(
        String(node.formDefinitionId), String(node.runId))) return null
    return node
  }

  async function loadMainRepeatRecords(nodeId: string): Promise<void> {
    if (mainRepeatRead.value.state === 'loading') return
    const scopeAtStart = workOrderReadScopeKey(getSession())
    const node = currentMainRepeat(nodeId, scopeAtStart)
    if (!node || !api?.listRepeatFormReferences) {
      mainRepeatRead.value = {
        state: 'failed_terminal', entries: [], hasMore: false,
        error: createOperationError('authorization_denied', 'Current role and repeat node do not authorize this read'),
      }
      return
    }
    const version = ++mainRepeatReadVersion
    const detailVersion = loadVersion
    const workOrderId = String(detail.value!.id)
    const definitionId = node.formDefinitionId!
    const workflowRunId = node.runId!
    mainRepeatRead.value = { state: 'loading', entries: [], hasMore: false }
    let result: Awaited<ReturnType<NonNullable<TechnicianApiReadPort['listRepeatFormReferences']>>>
    try {
      result = await api.listRepeatFormReferences({ definitionId, workflowRunId, page: 1, pageSize: 20 })
    } catch {
      if (version === mainRepeatReadVersion) {
        mainRepeatRead.value = {
          state: 'failed_retryable', entries: [], hasMore: false,
          error: createOperationError('network_retryable', 'Repeat record read did not complete'),
        }
      }
      return
    }
    const currentNode = currentMainRepeat(nodeId, workOrderReadScopeKey(getSession()))
    if (version !== mainRepeatReadVersion || detailVersion !== loadVersion
      || scopeAtStart !== workOrderReadScopeKey(getSession())
      || String(detail.value?.id ?? '') !== workOrderId
      || currentNode?.formDefinitionId !== definitionId || currentNode?.runId !== workflowRunId) {
      if (version === mainRepeatReadVersion) {
        mainRepeatRead.value = {
          state: 'failed_terminal', entries: [], hasMore: false,
          error: createOperationError('authorization_denied', 'Repeat read authority changed during request'),
        }
      }
      return
    }
    mainRepeatRead.value = result.state === 'succeeded' && result.data
      ? {
          state: 'succeeded', entries: result.data.items,
          hasMore: result.data.totalCount === undefined
            ? result.data.items.length >= 20 : result.data.totalCount > result.data.items.length,
        }
      : {
          state: result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal',
          entries: [], hasMore: false,
          ...(result.error ? { error: result.error } : {}),
        }
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
    childReadState,
    childReadParentId,
    childReadNodes,
    childReadError,
    repeatReadByNode,
    mainRepeatRead,
    configureApi,
    configurePhone,
    configureNavigation,
    navigateTo,
    clear,
    load,
    loadFromRoute,
    retry,
    loadChildWorkflowForms,
    loadChildRepeatRecords,
    loadMainRepeatRecords,
    dialContact,
  }
})
