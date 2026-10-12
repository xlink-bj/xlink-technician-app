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
  let workspace: ReturnType<typeof createSigningReviewReadWorkspace> | null = null
  let getSession: () => SessionSnapshot | null = () => null
  let stopWatch: (() => void) | null = null
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
    workspace?.clear()
    snapshot.value = { state: 'idle' }
  }

  function configure(
    port: QuotationOrderReadPort,
    sessionProvider: () => SessionSnapshot | null,
    isCurrentWorkOrderListed: (id: string) => boolean,
  ): void {
    stopWatch?.()
    clear()
    getSession = sessionProvider
    workspace = createSigningReviewReadWorkspace({
      port,
      getSession: sessionProvider,
      isCurrentWorkOrderListed,
    })
    stopWatch = watch(scopeKey, (next, old) => {
      if (next !== old) clear()
    }, { immediate: true, flush: 'sync' })
  }

  async function load(
    workOrderId: string,
    orderId: string,
  ): Promise<OperationSnapshot<ScopedSigningOrderReviewRead>> {
    const attempt = ++generation
    // Fail closed if bootstrap has not finished wiring the read-only port.
    const active = workspace
    if (!active || !scopeKey()) {
      snapshot.value = { state: 'failed_terminal' }
      return {
        state: 'failed_terminal',
        error: createOperationError('authorization_denied', '签约只读权限尚未准备完成。'),
      }
    }
    snapshot.value = { state: 'loading' }
    const result = await active.load(workOrderId, orderId)
    if (attempt === generation && workspace === active) {
      snapshot.value = active.snapshot()
    }
    return result
  }

  return { snapshot, configure, load, clear }
})
