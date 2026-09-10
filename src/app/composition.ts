import type { AuthSessionPort } from '@shared/ports'
import { createOperationError, type OperationSnapshot } from '@shared/types'

import { createAuthSessionAdapter } from '@adapters/auth/auth-session-adapter'
import { createUniAuthBackendDriver } from '@adapters/auth/uni-auth-backend'
import { createSemanticStorageAdapter } from '@adapters/storage/storage-adapter'
import { createUniStorageDriver } from '@adapters/storage/uni-storage-driver'

import { loadApplicationRuntimeConfig } from './runtime-config'

function configurationFailure(message: string): OperationSnapshot<never> {
  return { state: 'failed_terminal', error: createOperationError('server_terminal', message) }
}

export function createConfigurationBlockedAuthSession(issues: readonly string[]): AuthSessionPort {
  const message = `Authentication configuration is unavailable: ${issues.join('; ')}`
  return {
    startSession: async () => configurationFailure(message),
    restoreSession: async () => configurationFailure(message),
    getCurrentSession: () => null,
    endSession: async () => ({ state: 'succeeded' }),
  }
}

export function createDefaultAuthSessionPort(): AuthSessionPort {
  const config = loadApplicationRuntimeConfig()
  if (!config.ok) return createConfigurationBlockedAuthSession(config.issues)

  const storage = createSemanticStorageAdapter(createUniStorageDriver())
  const backend = createUniAuthBackendDriver({
    apiBaseUrl: config.value.environment.apiBaseUrl,
  })
  return createAuthSessionAdapter(backend, storage, config.value.authWireConfig)
}
