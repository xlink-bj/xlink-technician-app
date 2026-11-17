import { describe, expect, it } from 'vitest'
import { isSigningReadOrderCandidate, unavailableSigningReadReason } from '@shared/signing-order-read-policy'

describe('M3-P0-C source-verified Order lifecycle for signing read', () => {
  it('allows only a type-one order in R1 state 0 or 1', () => {
    expect(isSigningReadOrderCandidate({ type: 1, state: 0 })).toBe(true)
    expect(isSigningReadOrderCandidate({ type: 1, state: 1 })).toBe(true)
    for (const state of [-1, undefined, 2, 4]) {
      expect(isSigningReadOrderCandidate({ type: 1, state })).toBe(false)
    }
    expect(isSigningReadOrderCandidate({ type: 0 as 1, state: 1 })).toBe(false)
    expect(isSigningReadOrderCandidate(null)).toBe(false)
  })

  it('gives an honest business reason without pretending a contract does not exist', () => {
    expect(unavailableSigningReadReason(-1)).toContain('已取消')
    expect(unavailableSigningReadReason(undefined)).toContain('待核验')
    expect(unavailableSigningReadReason(2)).not.toContain('不存在')
  })
})
