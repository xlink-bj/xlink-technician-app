/** Isolated local quotation draft persistence for the dev-only product preview.
 * No shared app drafts, session credentials or cache are ever stored here.
 */
import type { StorageKey, StoragePort } from '@shared/ports'
import { createOperationError, type OperationSnapshot } from '@shared/types'

const physicalPrefix = 'g4f-product-review:v1:draft:'
const prefixFor = (key: StorageKey): string | null =>
  key.namespace === 'draft' && typeof key.key === 'string' && key.key.trim()
    ? physicalPrefix + key.key
    : null

function unavailable<T>(): OperationSnapshot<T> {
  return {
    state: 'failed_terminal',
    error: createOperationError('server_terminal', 'isolated product preview draft storage unavailable'),
  }
}
function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

export interface BrowserReviewStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

/** Explicit dependency permits deterministic non-browser test coverage. */
export function createProductReviewDraftStorage(
  readBrowserStorage: () => BrowserReviewStorage | null = () => typeof window === 'undefined' ? null : window.localStorage,
): StoragePort {
  return {
    async read<T>(key) {
      const physical = prefixFor(key)
      if (!physical) return unavailable<T | null>()
      try {
        const store = readBrowserStorage()
        if (!store) return unavailable<T | null>()
        const raw = store.getItem(physical)
        if (raw === null) return succeeded(null)
        try {
          return succeeded(JSON.parse(raw) as T)
        } catch {
          // Keep corrupt records untouched for the existing V3 decoder to reject.
          return succeeded(raw as T)
        }
      } catch {
        return unavailable<T | null>()
      }
    },
    async write<T>(key, value: T) {
      const physical = prefixFor(key)
      if (!physical) return unavailable<void>()
      try {
        const store = readBrowserStorage()
        if (!store) return unavailable<void>()
        store.setItem(physical, JSON.stringify(value))
        return succeeded(undefined)
      } catch {
        return unavailable<void>()
      }
    },
    async remove(key) {
      const physical = prefixFor(key)
      if (!physical) return unavailable<void>()
      try {
        const store = readBrowserStorage()
        if (!store) return unavailable<void>()
        store.removeItem(physical)
        return succeeded(undefined)
      } catch {
        return unavailable<void>()
      }
    },
    async listKeys({ namespace, prefix }) {
      if (namespace !== 'draft') return unavailable<readonly string[]>()
      try {
        const store = readBrowserStorage()
        if (!store) return unavailable<readonly string[]>()
        const values: string[] = []
        for (let index = 0; index < store.length; index += 1) {
          const physical = store.key(index)
          if (!physical?.startsWith(physicalPrefix)) continue
          const logical = physical.slice(physicalPrefix.length)
          if (prefix !== undefined && !logical.startsWith(prefix)) continue
          values.push(logical)
        }
        return succeeded(values)
      } catch {
        return unavailable<readonly string[]>()
      }
    },
  }
}
