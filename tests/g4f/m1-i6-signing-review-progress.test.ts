import { describe, expect, it } from 'vitest'
import { signingReviewProgress as progress } from '@features/work-orders/signing/signing-review-progress'
import type { SigningReadStage } from '@features/work-orders/signing/r1-signing-read-reconciliation'

const sample = (stage: SigningReadStage = 'contract_not_checked') => ({
  orderVerified: true, contractState: 'succeeded' as const,
  stage, handlerState: 'idle' as const,
})

describe('M1 I6 read-only signing state progression', () => {
  it('never treats an unknown Order as legally signable', () => {
    const result = progress({ ...sample(), orderVerified: false })
    expect(result.title).toContain('正式订单待核验')
    expect(result.executable).toBe(false)
  })
  it.each(['idle', 'loading', 'failed_retryable', 'failed_terminal'] as const)(
    'distinguishes Contract read state %s', state => {
      const result = progress({ ...sample(), contractState: state })
      expect(result.title).toContain('步骤 2/3')
      expect(result.executable).toBe(false)
    })
  it('does not confuse processing status or recorded signature with legal proof', () => {
    expect(progress(sample('signing_in_progress')).nextStep).toContain('禁止')
    const signed = progress(sample('record_signed'))
    expect(signed.nextStep).toContain('真实性')
    expect(signed.executable).toBe(false)
  })
  it.each(['signing_exception', 'conflicting_records', 'contract_status_unknown'] as const)(
    '%s demands manual review and no blind retry', stage => {
      const result = progress(sample(stage))
      expect(result.title).toContain('人工核查')
      expect(result.executable).toBe(false)
    })
  it('node evidence is DEV-only and not a command permission', () => {
    const result = progress({ ...sample(), handlerState: 'verified' })
    expect(result.title).toContain('仅 DEV')
    expect(result.executable).toBe(false)
  })
})
