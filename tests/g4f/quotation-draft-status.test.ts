import { describe, expect, it } from 'vitest'
import { quotationDraftStatus } from '../../src/features/work-orders/quotation/quotation-draft-status'
describe('combined quotation draft feedback', () => {
  it('preserves existing workspace feedback when field drafts are absent', () => {
    expect(quotationDraftStatus('dirty')).toBe('dirty')
  })
  it('cannot show saved while either independent draft failed or is saving', () => {
    expect(quotationDraftStatus('saved_local', 'save_failed')).toBe('save_failed')
    expect(quotationDraftStatus('save_failed', 'saved_local')).toBe('save_failed')
    expect(quotationDraftStatus('saved_local', 'saving')).toBe('saving')
    expect(quotationDraftStatus('saving', 'saved_local')).toBe('saving')
  })
  it('keeps restoration distinct from a new successful local save', () => {
    expect(quotationDraftStatus('restore_available', 'saved_local')).toBe('restore_available')
    expect(quotationDraftStatus('clean', 'saved_local')).toBe('saved_local')
  })
})
