import { computed, inject, watch, type InjectionKey } from 'vue'
import { useSessionStore } from '@shared/state'

/** Rendering only: never put these labels into catalogue, draft, or Order data. */
export interface LocalUnitDisplay {
  load(workOrderId: string): Promise<boolean>
  isVerifiedScope(workOrderId: string): boolean
  displayLabel(workOrderId: string, wireUnit: string | undefined): string
}

export const localUnitDisplayKey: InjectionKey<LocalUnitDisplay> = Symbol('local-unit-display')

export function useLocalUnitDisplay(workOrderId: () => string): (wireUnit: string | undefined) => string {
  const provider = inject(localUnitDisplayKey, null)
  const session = useSessionStore()
  if (provider) {
    watch(
      [workOrderId, () => JSON.stringify([session.session?.sessionRef, session.session?.user.id,
        session.session?.currentRole?.id, session.session?.roleVersion])],
      () => { void provider.load(workOrderId()) },
      { immediate: true },
    )
  }
  return wireUnit => provider?.displayLabel(workOrderId(), wireUnit) ?? wireUnit ?? ''
}

export function useVerifiedLocalQuotationDisplay(workOrderId: () => string) {
  const provider = inject(localUnitDisplayKey, null)
  return computed(() => provider?.isVerifiedScope(workOrderId()) === true)
}
