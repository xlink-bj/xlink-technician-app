import { describe, expect, it } from 'vitest'
import {
  r1InitialSigningButtonVisibility,
  r1ContractButtonVisibility,
  r1OrderSigningStageNotice,
} from '@features/work-orders/signing/r1-signing-ui-rules'

describe('M1 I6 R1 signing source parity: display rules, not signing authority', () => {
  const initial = { type: 1, processState: 0, hasExts: true } as const

  it('shows both initial choices only for type1, processState0, not isAgain=1', () => {
    expect(r1InitialSigningButtonVisibility(initial)).toEqual({ electronic: true, offline: true })
    expect(r1InitialSigningButtonVisibility({ ...initial, type: 0 })).toEqual({ electronic: false, offline: false })
    expect(r1InitialSigningButtonVisibility({ ...initial, processState: 4 })).toEqual({ electronic: false, offline: false })
    expect(r1InitialSigningButtonVisibility({ ...initial, isAgain: 1 })).toEqual({ electronic: false, offline: false })
    expect(r1InitialSigningButtonVisibility({ ...initial, isAgain: '1' })).toEqual({ electronic: false, offline: false })
  })

  it('does not claim visibility from unverified extension data or malformed status', () => {
    expect(r1InitialSigningButtonVisibility({ ...initial, hasExts: false })).toEqual({ electronic: false, offline: false })
    expect(r1InitialSigningButtonVisibility({ ...initial, processState: undefined })).toEqual({ electronic: false, offline: false })
    expect(r1InitialSigningButtonVisibility({ ...initial, type: '1e0' })).toEqual({ electronic: false, offline: false })
    expect(r1InitialSigningButtonVisibility({ ...initial, processState: '0' })).toEqual({ electronic: true, offline: true })
  })

  it('distinguishes R1 contract retry, reminder, and cancel UI cases', () => {
    expect(r1ContractButtonVisibility({ state: 1, contractStatus: '-3' })).toEqual({
      cancel: true, tryAgain: true, resendSms: false, viewFile: false,
    })
    expect(r1ContractButtonVisibility({ state: '1', contractStatus: 2 })).toEqual({
      cancel: true, tryAgain: false, resendSms: true, viewFile: false,
    })
    expect(r1ContractButtonVisibility({ state: 1, contractStatus: 10 })).toMatchObject({
      cancel: true, tryAgain: false, resendSms: false,
    })
  })

  it('blocks cancellation after endDate or on non-active contract, without changing independent reminder rules', () => {
    expect(r1ContractButtonVisibility({ state: 1, contractStatus: 2, endDate: '2026-01-02' })).toMatchObject({
      cancel: false, resendSms: true,
    })
    expect(r1ContractButtonVisibility({ state: 0, contractStatus: 2 })).toMatchObject({
      cancel: false, resendSms: true,
    })
    expect(r1ContractButtonVisibility({ state: 1, contractStatus: 0 })).toMatchObject({
      cancel: false, tryAgain: false, resendSms: false,
    })
  })

  it('recognizes only an existing last file URL for R1 view-file UI; it does NOT fetch any file', () => {
    expect(r1ContractButtonVisibility({ fileUrls: ['https://synthetic.invalid/example.pdf'] }).viewFile).toBe(true)
    expect(r1ContractButtonVisibility({ fileUrls: ['https://synthetic.invalid/a.pdf', ''] }).viewFile).toBe(false)
    expect(r1ContractButtonVisibility({ fileUrls: [] }).viewFile).toBe(false)
  })

  it('displays cautious R1 Order phase labels and does not call an endpoint', () => {
    expect(r1OrderSigningStageNotice(0)).toContain('待签约')
    expect(r1OrderSigningStageNotice(0)).toContain('不代表')
    expect(r1OrderSigningStageNotice(4)).toContain('签约处理中')
    expect(r1OrderSigningStageNotice(4)).toContain('勿重复')
    expect(r1OrderSigningStageNotice(1)).toContain('不可据此推断')
    expect(r1OrderSigningStageNotice(undefined)).toContain('不可据此推断')
  })
})
