import type { OperationSnapshot } from '@shared/types'

export type StorageNamespace = 'session' | 'draft' | 'cache'

export interface StorageKey {
  readonly namespace: StorageNamespace
  readonly key: string
}

export interface StorageListQuery {
  readonly namespace: StorageNamespace
  readonly prefix?: string
}

export interface StoragePort {
  read<T>(key: StorageKey): Promise<OperationSnapshot<T | null>>
  write<T>(key: StorageKey, value: T): Promise<OperationSnapshot<void>>
  remove(key: StorageKey): Promise<OperationSnapshot<void>>
  listKeys(query: StorageListQuery): Promise<OperationSnapshot<readonly string[]>>
}
