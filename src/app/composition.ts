import type {
  AuthSessionPort,
  NavigationPort,
  PhonePort,
  StoragePort,
  TechnicianApiCommandPort,
  QuotationOrderCommandPort,
  QuotationOrderReadPort,
  TechnicianApiReadPort,
  QuotationCatalogReadPort,
  MediaCapturePort,
  MediaFilePickerPort,
  MediaPostUploadProcessorPort,
  MediaUploadQueuePort,
  LocationPort,
  UploadPort,
  SurveyLeakageCauseProviderPort,
} from '@shared/ports'
import { createOperationError, type OperationSnapshot } from '@shared/types'

import { createQuotationCatalogReadAdapter } from '@adapters/api/quotation-catalog-api'
import { createRoleScopedTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { createTechnicianApiCommandAdapter } from '@adapters/api/technician-api-commands'
import { createQuotationOrderCommandAdapter } from '@adapters/api/quotation-order-commands'
import { createQuotationOrderReadAdapter } from '@adapters/api/quotation-order-api'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { createAuthSessionAdapter } from '@adapters/auth/auth-session-adapter'
import { createUniAuthBackendDriver } from '@adapters/auth/uni-auth-backend'
import { createSemanticStorageAdapter } from '@adapters/storage/storage-adapter'
import { createUniStorageDriver } from '@adapters/storage/uni-storage-driver'
import { createPlatformAdapters } from '@adapters/platform/platform-adapters'
import { createUniPhoneDriver } from '@adapters/platform/uni-phone-driver'
import { createUniNavigationDriver } from '@adapters/platform/uni-navigation-driver'
import { createUniMediaCaptureDriver, createUniMediaFilePickerDriver } from '@adapters/platform/uni-media-drivers'
import { createUniLocationDriver } from '@adapters/platform/uni-location-driver'
import { createUniUploadPort } from '@adapters/upload/uni-upload-port'
import { createUniDurableMediaStore } from '@adapters/storage/uni-durable-media-store'
import { createMediaQueueRepository, createMediaUploadQueue } from '@runtimes/media'
import { createMockMediaPostUploadProcessor } from '@runtimes/media'
import { createDisabledRealMediaPostUploadProcessor } from '@adapters/upload/uni-media-post-upload-processor'
import { createSurveyLeakageCauseProvider } from '@adapters/api/survey-leakage-cause'

import { loadApplicationRuntimeConfig } from './runtime-config'
import { isBusinessMockMode } from './business-mock'

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

export function createDefaultStoragePort(): StoragePort {
  return createSemanticStorageAdapter(createUniStorageDriver())
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
      getQuotationActionContent: async () => blocked(),
      getCodeOptions: async () => blocked(),
      getCascadeCodeOptions: async () => blocked(),
    }
  }

  const transport = createUniApiReadTransport({
    apiBaseUrl: config.value.environment.apiBaseUrl,
    getSessionRef: () => authSession.getCurrentSession()?.sessionRef ?? null,
    getMockActor: () => {
      const session = authSession.getCurrentSession()
      return session
        ? {
            userId: session.user.id,
            ...(session.currentRole ? { roleId: session.currentRole.id } : {}),
          }
        : null
    },
  })

  return createRoleScopedTechnicianApiReadAdapter(
    transport,
    () => authSession.getCurrentSession()?.currentRole?.id ?? null,
    {
      cascadeTenantId: config.value.authWireConfig.tenant,
      codeTenantId: config.value.authWireConfig.tenant,
      getReadAuthorizationScope: () => {
        const session = authSession.getCurrentSession()
        if (!session) return null
        return {
          sessionRef: session.sessionRef,
          userId: session.user.id,
          roleId: session.currentRole?.id ?? null,
          roleVersion: session.roleVersion ?? null,
        }
      },
    },
  )
}

export function createDefaultQuotationCatalogReadPort(authSession: AuthSessionPort): QuotationCatalogReadPort {
  const config = loadApplicationRuntimeConfig()
  if (!config.ok) {
    const blocked = async <T>(): Promise<OperationSnapshot<T>> =>
      configurationFailure(`Quotation catalog configuration is unavailable: ${config.issues.join('; ')}`)
    return {
      listPackages: async () => blocked(),
      getPackageDetail: async () => blocked(),
      listProcedures: async () => blocked(),
      listMaterials: async () => blocked(),
      listMeasures: async () => blocked(),
    }
  }

  const transport = createUniApiReadTransport({
    apiBaseUrl: config.value.environment.apiBaseUrl,
    getSessionRef: () => authSession.getCurrentSession()?.sessionRef ?? null,
    getMockActor: () => {
      const session = authSession.getCurrentSession()
      return session
        ? {
            userId: session.user.id,
            ...(session.currentRole ? { roleId: session.currentRole.id } : {}),
          }
        : null
    },
  })
  return createQuotationCatalogReadAdapter(
    transport,
    () => authSession.getCurrentSession()?.sessionRef ?? null,
  )
}

export function createDefaultSurveyLeakageCauseProvider(authSession: AuthSessionPort): SurveyLeakageCauseProviderPort {
  const config = loadApplicationRuntimeConfig()
  if (!config.ok) {
    return {
      query: async () => configurationFailure(`Survey leakage-cause provider configuration is unavailable: ${config.issues.join('; ')}`),
    }
  }
  return createSurveyLeakageCauseProvider(createUniApiReadTransport({
    apiBaseUrl: config.value.environment.apiBaseUrl,
    getSessionRef: () => authSession.getCurrentSession()?.sessionRef ?? null,
    getMockActor: () => {
      const session = authSession.getCurrentSession()
      return session
        ? {
            userId: session.user.id,
            ...(session.currentRole ? { roleId: session.currentRole.id } : {}),
          }
        : null
    },
  }))
}

export function createDefaultTechnicianApiCommandPort(
  authSession: AuthSessionPort,
  apiRead: TechnicianApiReadPort,
): TechnicianApiCommandPort {
  const config = loadApplicationRuntimeConfig()
  if (!config.ok) {
    const message = `Technician API configuration is unavailable: ${config.issues.join('; ')}`
    const blocked = async <T>(): Promise<OperationSnapshot<T>> => configurationFailure<T>(message)
    return {
      inspectAcceptOrder: async () => blocked(),
      acceptOrder: async () => blocked(),
      readAppointmentForm: async () => blocked(),
      readDynamicForm: async () => blocked(),
      saveDynamicForm: async () => blocked(),
      completeWorkflowNode: async () => blocked(),
      submitAppointment: async () => blocked(),
    }
  }

  const transport = createUniApiCommandTransport({
    apiBaseUrl: config.value.environment.apiBaseUrl,
    getSessionRef: () => authSession.getCurrentSession()?.sessionRef ?? null,
  })
  return createTechnicianApiCommandAdapter(transport, apiRead)
}

export function createDefaultQuotationOrderCommandPort(authSession: AuthSessionPort): QuotationOrderCommandPort {
  const config = loadApplicationRuntimeConfig()
  if (!config.ok) {
    const blocked = async <T>(): Promise<OperationSnapshot<T>> =>
      configurationFailure(`Quotation Order command configuration is unavailable: ${config.issues.join('; ')}`)
    return { startOrderWorkflow: async () => blocked(), upsertOfficialOrder: async () => blocked() }
  }
  const transport = createUniApiCommandTransport({
    apiBaseUrl: config.value.environment.apiBaseUrl,
    getSessionRef: () => authSession.getCurrentSession()?.sessionRef ?? null,
  })
  return createQuotationOrderCommandAdapter(transport)
}

export function createDefaultQuotationOrderReadPort(
  authSession: AuthSessionPort,
  isWorkOrderListedForCurrentSession: (id: string) => boolean,
): QuotationOrderReadPort {
  const config = loadApplicationRuntimeConfig()
  if (!config.ok) {
    return {
      getQuotationOrderById: async () => configurationFailure(`Quotation Order read configuration is unavailable: ${config.issues.join('; ')}`),
      listTypeOneOrdersForWorkOrder: async () => configurationFailure(`Quotation Order read configuration is unavailable: ${config.issues.join('; ')}`),
    }
  }
  const transport = createUniApiReadTransport({
    apiBaseUrl: config.value.environment.apiBaseUrl,
    getSessionRef: () => authSession.getCurrentSession()?.sessionRef ?? null,
    getMockActor: () => {
      const session = authSession.getCurrentSession()
      return session ? { userId: session.user.id, ...(session.currentRole ? { roleId: session.currentRole.id } : {}) } : null
    },
  })
  return createQuotationOrderReadAdapter(transport, isWorkOrderListedForCurrentSession)
}

export function createDefaultPhonePort(): PhonePort {
  return createPlatformAdapters({ phone: createUniPhoneDriver() }).phone
}

export function createDefaultMediaCapturePort(): MediaCapturePort {
  return createPlatformAdapters({ mediaCapture: createUniMediaCaptureDriver() }).mediaCapture
}

export function createDefaultMediaFilePickerPort(): MediaFilePickerPort {
  return createPlatformAdapters({ mediaFilePicker: createUniMediaFilePickerDriver() }).mediaFilePicker
}

export function createDefaultLocationPort(): LocationPort {
  return createPlatformAdapters({ location: createUniLocationDriver() }).location
}

export function createDefaultUploadPort(authSession: AuthSessionPort): UploadPort {
  const config = loadApplicationRuntimeConfig()
  if (!config.ok) {
    return {
      upload: async () => configurationFailure('Upload configuration is unavailable'),
    }
  }
  return createUniUploadPort(createUniApiCommandTransport({
    apiBaseUrl: config.value.environment.apiBaseUrl,
    getSessionRef: () => authSession.getCurrentSession()?.sessionRef ?? null,
  }))
}

export function createDefaultMediaPostUploadProcessor(): MediaPostUploadProcessorPort {
  return isBusinessMockMode() !== 'off'
    ? createMockMediaPostUploadProcessor()
    : createDisabledRealMediaPostUploadProcessor()
}

export function createDefaultMediaUploadQueue(
  storage: StoragePort,
  upload: UploadPort,
  postUploadProcessor: MediaPostUploadProcessorPort = createDefaultMediaPostUploadProcessor(),
): MediaUploadQueuePort {
  return createMediaUploadQueue(
    createUniDurableMediaStore(storage),
    createMediaQueueRepository(storage),
    upload,
    { postUploadProcessor },
  )
}

export function createDefaultNavigationPort(): NavigationPort {
  return createPlatformAdapters({ navigation: createUniNavigationDriver() }).navigation
}
