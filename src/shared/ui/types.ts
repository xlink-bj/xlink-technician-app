/** Presentation-only contracts shared by UI primitives. */
export interface AppChoiceOption {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean
}

/** Presentation lifecycle values accepted by the reusable Action Workspace shell. */
export type AppActionLifecycle =
  | 'available'
  | 'in_progress'
  | 'draft_local'
  | 'submitting'
  | 'succeeded'
  | 'failed_retryable'
  | 'failed_terminal'
  | 'blocked'

export type AppActionDraftStatus =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'saved_local'
  | 'restore_available'
  | 'save_failed'
