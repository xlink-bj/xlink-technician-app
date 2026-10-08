import type { QuotationDraftLocalState } from './composition-store'

export type QuotationContentState = 'loading' | 'ready' | 'blocked' | 'failed_retryable' | 'failed_terminal'
export type QuotationEditState = 'none' | 'loading' | 'ready' | 'blocked'

/** Only a successfully initialized, brand-new local draft is the first-use empty state. */
export function isInitialQuotationWorkbenchEmpty(input: {
  readonly contentState: QuotationContentState
  readonly editState: QuotationEditState
  readonly draftState: QuotationDraftLocalState
  readonly groupCount: number
  readonly catalogOpen: boolean
}): boolean {
  return input.contentState === 'ready'
    && input.editState === 'none'
    && input.draftState === 'fresh'
    && input.groupCount === 0
    && !input.catalogOpen
}
