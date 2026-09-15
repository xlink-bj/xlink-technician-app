import { describe, expect, it, vi } from 'vitest'

import {
  reloadBusinessReadStores,
  switchBusinessDataSource,
} from '@features/home/business-data-source'

function stores() {
  const events: string[] = []
  return {
    events,
    list: {
      clear: vi.fn(() => events.push('list.clear')),
      refresh: vi.fn(async () => {
        events.push('list.refresh')
        return { state: 'succeeded' as const }
      }),
    },
    detail: {
      clear: vi.fn(() => events.push('detail.clear')),
    },
  }
}

describe('business data source orchestration', () => {
  it('switches OFF to the real source and clears before reloading', async () => {
    const next = stores()
    const setMockMode = vi.fn()

    await switchBusinessDataSource('real', setMockMode, next)

    expect(setMockMode).toHaveBeenCalledWith('off')
    expect(next.events).toEqual(['list.clear', 'detail.clear', 'list.refresh'])
  })

  it('switches ON through the existing Mock Runtime and reloads only after clearing', async () => {
    const next = stores()
    const setMockMode = vi.fn()

    await switchBusinessDataSource('mock', setMockMode, next)

    expect(setMockMode).toHaveBeenCalledWith('data')
    expect(next.events).toEqual(['list.clear', 'detail.clear', 'list.refresh'])
  })

  it('reloads both business read stores for Mock scenario changes', async () => {
    const next = stores()

    await reloadBusinessReadStores(next)

    expect(next.events).toEqual(['list.clear', 'detail.clear', 'list.refresh'])
  })
})
