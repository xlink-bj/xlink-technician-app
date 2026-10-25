import { describe, expect, it } from 'vitest'
import { quotationSubmissionDisplayCopy } from '../../src/features/work-orders/quotation/submission-display-copy'

describe('Stage A native Mock order copy provenance', () => {
  it('describes exact local Mock readback without implying a server write', () => {
    const message = quotationSubmissionDisplayCopy({ state: 'succeeded',
      message: '订单已提交并完成服务器核对。', aStageMockOrder: true })
    expect(message).toContain('本机 Mock')
    expect(message).toContain('未提交真实业务后台')
    expect(message).not.toContain('服务器核对')
  })

  it('preserves the actual server-verified submission wording', () => {
    const message = '订单已提交并完成服务器核对。'
    expect(quotationSubmissionDisplayCopy({ state: 'succeeded', message, aStageMockOrder: false }))
      .toBe(message)
  })

  it('never suppresses ambiguous or failed submission warnings in Mock', () => {
    for (const state of ['failed_ambiguous_after_dispatch', 'failed_terminal',
      'write_succeeded_readback_pending'] as const) {
      const message = `安全状态：${state}`
      expect(quotationSubmissionDisplayCopy({ state, message, aStageMockOrder: true })).toBe(message)
    }
  })
})
