import { describe, expect, it } from 'vitest'
import { evaluateQuotationSubmitGuard as decide } from '@features/work-orders/quotation/quotation-submit-guard'

const baseline = () => ({
  modeBlocked: false, contentReady: true, workspaceReady: true,
  quantityErrors: {} as Readonly<Record<string, string>>, orderState: 'idle',
})

describe('M1 I5 quotation confirmation remains revision/quantity safe', () => {
  it('opens only when all local gate conditions are satisfied', () => {
    expect(decide(baseline())).toBe('ready')
    expect(decide({ ...baseline(), workspaceReady: false })).toBe('workspace_unverified')
    expect(decide({ ...baseline(), contentReady: false })).toBe('content_unavailable')
    expect(decide({ ...baseline(), modeBlocked: true })).toBe('mode_blocked')
  })
  it('fails closed on an invalid input without changing business pricing', () => {
    expect(decide({ ...baseline(), quantityErrors: { 'selection-a': '数量错误' } }))
      .toBe('invalid_quantity')
    expect(decide({ ...baseline(), quantityErrors: { 'selection-a': '' } })).toBe('ready')
  })
  it.each(['submitting', 'write_succeeded_readback_pending',
    'failed_ambiguous_after_dispatch', 'succeeded'])(
    'blocks repeat confirmation in %s', state => {
      expect(decide({ ...baseline(), orderState: state })).toBe('already_dispatched')
    })
  it('does not invent authority when the workspace is not ready', () => {
    expect(decide({ ...baseline(), workspaceReady: false,
      orderState: 'failed_retryable_before_write' })).toBe('workspace_unverified')
  })
})
