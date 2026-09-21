import { describe, expect, it } from 'vitest'

import { verifiedMediaMaxFor } from '@features/work-orders/media-presentation'

describe('G4-E media presentation metadata', () => {
  it('preserves a verified max of zero as present', () => {
    expect(verifiedMediaMaxFor({ presentation: { max: 0 } })).toBe(0)
  })

  it('does not invent or accept invalid media maxima', () => {
    expect(verifiedMediaMaxFor({})).toBeUndefined()
    expect(verifiedMediaMaxFor({ presentation: { max: -1 } })).toBeUndefined()
    expect(verifiedMediaMaxFor({ presentation: { max: Number.NaN } })).toBeUndefined()
  })
})
