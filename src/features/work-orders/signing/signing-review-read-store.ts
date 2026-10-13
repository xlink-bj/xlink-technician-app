import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import type { QuotationOrderReadPort, ScopedSigningOrderReviewRead, SessionSnapshot } from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'
import { createOperationError } from '@shared/types'
import {
  createSigningReviewReadWorkspace,
  type SigningReviewSnapshot,
} from './signing-review-read-workspace'

/**
 * Phase 1 engineering — the actual main App signing read-side state.
 * Nothing in this store grants Contract visibility, Signing commands,
 * QR/PDF access, or a way to promote a local quotation draft to an Order.
 */
export const useSigningReviewReadStore = defineStore('signingReviewRead', () => {
  const snapshot = ref<SigningReviewSnapshot>({ state: 'idle' })
  const contractSnapshot = ref<{
    readonly state: 'idle' | 'loading' | 'succeeded' | 'failed_retryable' | 'failed_terminal'
    readonly items: readonly import('@shared/ports').R1ScopedContractSummary[]
  }>({ state: 'idle', items: [] })
  let contractAttempt = 0
  let contractPort: QuotationOrderReadPort | null = null
  let workspace: ReturnType<typeof createSigningReviewReadWorkspace> | null = null
  let getSession: () => SessionSnapshot | null = () => null
  let stopWatch: (() => void) | null = null
  let stopMembershipWatch: (() => void) | null = null
  let isCurrentWorkOrderListed: (id: string) => boolean = () => false
  // The active WorkOrder is a reactive dependency: changes to the actual
  // role-visible list/detail can revoke an ALREADY-rendered Order review.
  const activeWorkOrderId = ref<string | null>(null)
  let generation = 0

  function scopeKey(): string {
    const session = getSession()
    if (!session?.currentRole?.id || !session.roleVersion) return ''
    return JSON.stringify([
      session.sessionRef, session.user.id, session.currentRole.id, session.roleVersion,
    ])
  }

  function clear(): void {
    generation += 1
    contractAttempt += 1
    contractSnapshot.value = { state: 'idle', items: [] }
    workspace?.clear()
    activeWorkOrderId.value = null
    snapshot.value = { state: 'idle' }
  }

  function safeListed(id: string): boolean {
    try { return isCurrentWorkOrderListed(id) === true } catch { return false }
  }

  function configure(
    port: QuotationOrderReadPort,
    sessionProvider: () => SessionSnapshot | null,
    isCurrentWorkOrderListedForSession: (id: string) => boolean,
  ): void {
    stopWatch?.()
    stopMembershipWatch?.()
    clear()
    getSession = sessionProvider
    contractPort = port
    isCurrentWorkOrderListed = isCurrentWorkOrderListedForSession
    workspace = createSigningReviewReadWorkspace({
      port,
      getSession: sessionProvider,
      isCurrentWorkOrderListed: safeListed,
    })
    stopWatch = watch(scopeKey, (next, old) => {
      if (next !== old) clear()
    }, { immediate: true, flush: 'sync' })
    // Keep reactive guard ACTIVE after successful reads, not only when the
    // server responds. Clearing work-order detail or the role-visible list
    // immediately removes previously rendered Order data.
    stopMembershipWatch = watch(
      () => activeWorkOrderId.value === null || safeListed(activeWorkOrderId.value),
      (listed) => { if (!listed) clear() },
      { flush: 'sync' },
    )
  }

  async function load(
    workOrderId: string,
    orderId: string,
  ): Promise<OperationSnapshot<ScopedSigningOrderReviewRead>> {
    const attempt = ++generation
    contractAttempt += 1
    contractSnapshot.value = { state: 'idle', items: [] }
    // Fail closed if bootstrap has not finished wiring the read-only port.
    const active = workspace
    if (!active || !scopeKey()) {
      snapshot.value = { state: 'failed_terminal' }
      return {
        state: 'failed_terminal',
        error: createOperationError('authorization_denied', '签约只读权限尚未准备完成。'),
      }
    }
    if (!safeListed(workOrderId)) {
      snapshot.value = { state: 'failed_terminal' }
      return {
        state: 'failed_terminal',
        error: createOperationError('authorization_denied', '当前工单不在已验证的可见列表中。'),
      }
    }
    activeWorkOrderId.value = workOrderId
    snapshot.value = { state: 'loading' }
    const result = await active.load(workOrderId, orderId)
    if (attempt === generation && workspace === active) {
      snapshot.value = active.snapshot()
    }
    return result
  }


  /**
   * Explicit user-triggered source-accurate R1 Contract read. This is not
   * automatically performed on Order load; the Production transport still
   * blocks the Contract route until separately approved.
   */
  async function loadContracts(): Promise<void> {
    const attempt = ++contractAttempt
    const selected = snapshot.value
    const key = scopeKey()
    if (selected.state !== 'ready' || !selected.workOrderId || !selected.orderId
      || !key || !safeListed(selected.workOrderId)
      || !contractPort?.listR1ContractsForSigningReview) {
      contractSnapshot.value = { state: 'failed_terminal', items: [] }
      return
    }
    contractSnapshot.value = { state: 'loading', items: [] }
    try {
      const result = await contractPort.listR1ContractsForSigningReview(selected.workOrderId, selected.orderId)
      if (attempt !== contractAttempt || key !== scopeKey()
        || !safeListed(selected.workOrderId) || snapshot.value.state !== 'ready'
        || snapshot.value.workOrderId !== selected.workOrderId
        || snapshot.value.orderId !== selected.orderId) {
        if (attempt === contractAttempt) contractSnapshot.value = { state: 'idle', items: [] }
        return
      }
      if (result.state === 'succeeded' && result.data
        && result.data.completeness === 'bounded_unverified'
        && Array.isArray(result.data.items)
        && result.data.items.length <= 3
        && result.data.items.every(item =>
          item.orderId === selected.orderId && item.serviceAppointmentId === selected.workOrderId)) {
        contractSnapshot.value = { state: 'succeeded', items: [...result.data.items] }
      } else {
        contractSnapshot.value = {
          state: result.state === 'failed_retryable' ? 'failed_retryable' : 'failed_terminal',
          items: [],
        }
      }
    } catch {
      if (attempt === contractAttempt) {
        contractSnapshot.value = { state: 'failed_retryable', items: [] }
      }
    }
  }

  return { snapshot, contractSnapshot, configure, load, loadContracts, clear }
})
