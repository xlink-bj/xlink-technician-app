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

/**
 * The focused first-part editor is a presentation for one valid, editable
 * local group before any catalog item has been selected. Keep restored local
 * drafts eligible, while excluding server-order edit and blocked states.
 */
export function isFirstQuotationRepairPartStep(input: {
  readonly contentState: QuotationContentState
  readonly editState: QuotationEditState
  readonly draftState: QuotationDraftLocalState
  readonly groupCount: number
  readonly selectionCount: number
  readonly catalogOpen: boolean
}): boolean {
  const editableDraftStates: readonly QuotationDraftLocalState[] = [
    'fresh', 'restored', 'dirty', 'saving', 'saved_local', 'save_failed',
  ]

  return input.contentState === 'ready'
    && input.editState === 'none'
    && editableDraftStates.includes(input.draftState)
    && input.groupCount === 1
    && input.selectionCount === 0
    && !input.catalogOpen
}
