/** UI-only confirmation gate. The existing server-command port remains authoritative. */
export type QuotationSubmitUiState =
  | 'ready' | 'mode_blocked' | 'content_unavailable' | 'invalid_quantity'
  | 'workspace_unverified' | 'already_dispatched'

export function evaluateQuotationSubmitGuard(input: {
  readonly modeBlocked: boolean
  readonly contentReady: boolean
  readonly workspaceReady: boolean
  readonly quantityErrors: Readonly<Record<string, string>>
  readonly orderState: string
}): QuotationSubmitUiState {
  if (input.modeBlocked) return 'mode_blocked'
  if (!input.contentReady) return 'content_unavailable'
  if (Object.values(input.quantityErrors).some(Boolean)) return 'invalid_quantity'
  if (['submitting', 'write_succeeded_readback_pending',
    'failed_ambiguous_after_dispatch', 'succeeded'].includes(input.orderState)) {
    return 'already_dispatched'
  }
  return input.workspaceReady ? 'ready' : 'workspace_unverified'
}
