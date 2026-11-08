import { ref, watch } from 'vue'
import type { QuotationDraftLocalState } from './composition-store'

/** Group/selection IDs can repeat in another quotation. Replace native input
 * instances at the actual editor lifecycle boundary, never on each draft edit. */
export function useQuotationInputEpoch(input: {
  readonly descriptor: () => unknown
  readonly localState: () => QuotationDraftLocalState
  readonly editState: () => string
}) {
  const epoch = ref(0)
  watch([input.descriptor, input.localState, input.editState],
    ([descriptor, state, edit], [previousDescriptor, previousState, previousEdit]) => {
      if (descriptor !== previousDescriptor || edit !== previousEdit
        || (state !== previousState && ['idle', 'loading', 'fresh', 'restored'].includes(state))) {
        epoch.value += 1
      }
    }, { flush: 'sync' })
  return epoch
}
