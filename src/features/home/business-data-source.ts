export type BusinessDataSource = 'mock' | 'real'

export interface BusinessReadStorePort {
  clear(): void
  refresh(): Promise<unknown>
}

export interface BusinessDetailReadStorePort {
  clear(): void
}

export interface BusinessReadStores {
  readonly list: BusinessReadStorePort
  readonly detail: BusinessDetailReadStorePort
}

/**
 * Clears every in-memory business read store before the next source is read.
 * The auth/session store is intentionally not part of this orchestration.
 */
export async function reloadBusinessReadStores(stores: BusinessReadStores): Promise<unknown> {
  stores.list.clear()
  stores.detail.clear()
  return stores.list.refresh()
}

export async function switchBusinessDataSource(
  source: BusinessDataSource,
  setMockMode: (mode: 'data' | 'off') => void,
  stores: BusinessReadStores,
): Promise<unknown> {
  setMockMode(source === 'mock' ? 'data' : 'off')
  return reloadBusinessReadStores(stores)
}
