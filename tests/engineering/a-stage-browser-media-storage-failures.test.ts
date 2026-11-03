import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserDurableMediaStore } from '@adapters/storage/browser-durable-media-store'
import { asOpaqueId } from '@shared/types'

afterEach(() => vi.unstubAllGlobals())

describe('A-stage durable browser media storage failures', () => {
  it('does not cache a failed IndexedDB open forever after storage becomes available', async () => {
    let opens = 0
    const database = {
      transaction: () => ({
        objectStore: () => ({
          get: () => {
            const request: { result?: unknown; onsuccess?: (event: Event) => void } = {}
            queueMicrotask(() => {
              request.result = undefined
              request.onsuccess?.({} as Event)
            })
            return request
          },
        }),
      }),
    }
    const open = vi.fn(() => {
      const request: {
        error?: Error
        result?: unknown
        onerror?: (event: Event) => void
        onsuccess?: (event: Event) => void
      } = {}
      queueMicrotask(() => {
        if (++opens === 1) {
          request.error = new Error('IndexedDB temporarily unavailable')
          request.onerror?.({} as Event)
        } else {
          request.result = database
          request.onsuccess?.({} as Event)
        }
      })
      return request
    })
    vi.stubGlobal('indexedDB', { open })
    const media = new BrowserDurableMediaStore()
    const id = asOpaqueId<'LocalMediaRef'>('persisted-media-on-retry')

    expect((await media.resolve(id)).state).toBe('failed_terminal')
    // Explicit subsequent retry can reopen storage; no fabricated local asset.
    expect(await media.resolve(id)).toEqual({ state: 'succeeded', data: null })
    expect(open).toHaveBeenCalledTimes(2)
  })
})
