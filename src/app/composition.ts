import type { AuthSessionPort, PhonePort, TechnicianApiReadPort } from '@shared/ports'
import { createOperationError, type OperationSnapshot } from '@shared/types'

import { createRoleScopedTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createAuthSessionAdapter } from '@adapters/auth/auth-session-adapter'
import { createUniAuthBackendDriver } from '@adapters/auth/uni-auth-backend'
import { createSemanticStorageAdapter } from '@adapters/storage/storage-adapter'
import { createUniStorageDriver } from '@adapters/storage/uni-storage-driver'
import { createPlatformAdapters } from '@adapters/platform/platform-adapters'
import { createUniPhoneDriver } from '@adapters/platform/uni-phone-driver'

import { loadApplicationRuntimeConfig } from './runtime-config'

function configurationFailure<T>(message: string): OperationSnapshot<T> {
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

export function createDefaultTechnicianApiReadPort(authSession: AuthSessionPort): TechnicianApiReadPort {
  const config = loadApplicationRuntimeConfig()
  if (!config.ok) {
    const message = `Technician API configuration is unavailable: ${config.issues.join('; ')}`
    const blocked = async <T>(): Promise<OperationSnapshot<T>> => configurationFailure<T>(message)
    return {
      listWorkOrders: async () => blocked(),
      getWorkOrderDetail: async () => blocked(),
      getWorkflowDefinition: async () => blocked(),
      getWorkflowNodes: async () => blocked(),
      getChildWorkflowNodes: async () => blocked(),
      getFormDefinition: async () => blocked(),
      getFormData: async () => blocked(),
      getFormDetail: async () => blocked(),
      getCodeOptions: async () => blocked(),
      getCascadeCodeOptions: async () => blocked(),
    }
  }

  const transport = createUniApiReadTransport({
    apiBaseUrl: config.value.environment.apiBaseUrl,
    getSessionRef: () => authSession.getCurrentSession()?.sessionRef ?? null,
  })

  return createRoleScopedTechnicianApiReadAdapter(
    transport,
    () => authSession.getCurrentSession()?.currentRole?.id ?? null,
    { cascadeTenantId: config.value.authWireConfig.tenant },
  )
}

export function createDefaultPhonePort(): PhonePort {
  return createPlatformAdapters({ phone: createUniPhoneDriver() }).phone
}
