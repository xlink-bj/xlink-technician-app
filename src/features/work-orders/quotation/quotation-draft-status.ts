import type { AppActionDraftStatus } from '@shared/ui/types'
/** Shell-owned feedback aggregates independent product and Order-field drafts. */
export function quotationDraftStatus(base: AppActionDraftStatus, fields?: AppActionDraftStatus): AppActionDraftStatus {
  if (fields === undefined) return base
  const states = [base, fields]
  if (states.includes('save_failed')) return 'save_failed'
  if (states.includes('saving') || states.includes('dirty')) return 'saving'
  if (states.includes('restore_available')) return 'restore_available'
  if (states.includes('saved_local')) return 'saved_local'
  return base
}
