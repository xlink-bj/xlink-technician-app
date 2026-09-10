import { describe, expect, it } from 'vitest'

import { createFoundationState } from '@shared/state'

describe('application foundation', () => {
  it('loads the shared state boundary', () => {
    expect(createFoundationState()).toEqual({ initialized: true })
  })
})
