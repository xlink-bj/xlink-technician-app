import type { OperationSnapshot } from '@shared/types'
import type { StorageKey, StoragePort } from '@shared/ports'
import { createOperationError } from '@shared/types'

import { adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'

export interface KeyValueStorageDriver {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

function storageKey(key: StorageKey): string {
  return `${key.namespace}:${key.key}`
}

export class SemanticStorageAdapter implements StoragePort {
  constructor(private readonly driver: KeyValueStorageDriver) {}

  async read<T>(key: StorageKey): Promise<OperationSnapshot<T | null>> {
    try {
      const serialized = await this.driver.get(storageKey(key))
      if (serialized === null) return succeeded(null)
      return succeeded(JSON.parse(serialized) as T)
    } catch (error) {
      return adapterFailure('server_terminal', unknownErrorMessage(error, 'Stored value is invalid'))
    }
  }

  async write<T>(key: StorageKey, value: T): Promise<OperationSnapshot<void>> {
    try {
      await this.driver.set(storageKey(key), JSON.stringify(value))
      return succeeded(undefined)
    } catch (error) {
      return adapterFailure('server_terminal', unknownErrorMessage(error, 'Storage write failed'))
    }
  }

  async remove(key: StorageKey): Promise<OperationSnapshot<void>> {
    try {
      await this.driver.remove(storageKey(key))
      return succeeded(undefined)
    } catch (error) {
      return {
        state: 'failed_retryable',
        error: createOperationError('network_retryable', unknownErrorMessage(error, 'Storage remove failed')),
      }
    }
  }
}

export function createSemanticStorageAdapter(driver: KeyValueStorageDriver): StoragePort {
  return new SemanticStorageAdapter(driver)
}
