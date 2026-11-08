import { computed, shallowRef, watch } from 'vue'
import type { QuotationOrderSubmissionSnapshot } from './order-submission'

export interface QuotationSuccessContext {
  /** Includes the authenticated actor, role version and current route/node. */
  readonly scope: string | null
  readonly action: object | null
  readonly workOrderId: string
  readonly result: QuotationOrderSubmissionSnapshot
}

export function quotationSuccessRouteMatches(routeAction: string | undefined, actionIntent: string): boolean {
  return actionIntent === 'place_order' && (routeAction === undefined || routeAction === actionIntent)
}

/** Only a submission observed in this mounted, unchanged scope can hand off. */
export function useQuotationSuccessHandoff(context: () => QuotationSuccessContext) {
  const owner = shallowRef<{ scope: string; action: object } | null>(null)
  let previousState = ''
  let opened = false
  watch(() => {
    const current = context()
    return [current.scope, current.action, current.result.state] as const
  }, ([scope, action, state]) => {
    if (owner.value && (owner.value.scope !== scope || owner.value.action !== action)) owner.value = null
    if (state === 'submitting' && previousState !== 'submitting') {
      owner.value = scope && action ? { scope, action } : null
      opened = false
    }
    previousState = state
  }, { immediate: true, flush: 'sync' })
  const order = computed(() => {
    const current = context()
    const result = current.result
    return owner.value && current.scope === owner.value.scope && current.action === owner.value.action
      && result.state === 'succeeded' && result.order?.id.trim() && result.order.type === 1
      && result.order.serviceAppointmentId === current.workOrderId ? result.order : null
  })
  return {
    order,
    reset() { owner.value = null },
    open(navigate: () => void): boolean {
      if (opened || !order.value) return false
      opened = true
      navigate()
      return true
    },
  }
}
