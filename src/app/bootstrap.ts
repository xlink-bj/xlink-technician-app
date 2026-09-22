import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'

import { createActionDraftRepository, type ActionDraftRepository } from '@runtimes/action'
import App from '@/App.vue'
import { mockAppointmentDraftSeeds } from './action-workspace-harness'
import type {
  AuthSessionPort,
  NavigationPort,
  PhonePort,
  StoragePort,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
  QuotationCatalogReadPort,
  MediaCapturePort,
  MediaFilePickerPort,
  MediaUploadQueuePort,
  LocationPort,
  UploadPort,
  SurveyLeakageCauseProviderPort,
} from '@shared/ports'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { useLocalDraftDiagnosticsStore } from '@features/home/draft-diagnostics'
import { useSessionStore } from '@shared/state'
import { isBusinessMockDeveloperModeAvailable, isBusinessMockMode } from './business-mock'

import {
  createDefaultAuthSessionPort,
  createDefaultTechnicianApiCommandPort,
  createDefaultPhonePort,
  createDefaultNavigationPort,
  createDefaultStoragePort,
  createDefaultTechnicianApiReadPort,
  createDefaultQuotationCatalogReadPort,
  createDefaultMediaCapturePort,
  createDefaultMediaFilePickerPort,
  createDefaultLocationPort,
  createDefaultMediaUploadQueue,
  createDefaultUploadPort,
  createDefaultSurveyLeakageCauseProvider,
} from './composition'

export interface ApplicationDependencies {
  readonly authSession?: AuthSessionPort
  readonly apiRead?: TechnicianApiReadPort
  readonly quotationCatalogRead?: QuotationCatalogReadPort
  readonly apiCommand?: TechnicianApiCommandPort
  readonly phone?: PhonePort
  readonly navigation?: NavigationPort
  readonly storage?: StoragePort
  readonly draftRepository?: ActionDraftRepository
  readonly mediaCapture?: MediaCapturePort
  readonly mediaFilePicker?: MediaFilePickerPort
  readonly location?: LocationPort
  readonly upload?: UploadPort
  readonly mediaUploadQueue?: MediaUploadQueuePort
  readonly surveyLeakageCauseProvider?: SurveyLeakageCauseProviderPort
}

export function createApplication(dependencies: ApplicationDependencies = {}) {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  const sessionStore = useSessionStore(pinia)
  const authSession = dependencies.authSession ?? createDefaultAuthSessionPort()
  const apiRead = dependencies.apiRead ?? createDefaultTechnicianApiReadPort(authSession)
  const quotationCatalogRead = dependencies.quotationCatalogRead ?? createDefaultQuotationCatalogReadPort(authSession)
  const apiCommand = dependencies.apiCommand ?? createDefaultTechnicianApiCommandPort(authSession, apiRead)
  const phone = dependencies.phone ?? createDefaultPhonePort()
  const navigation = dependencies.navigation ?? createDefaultNavigationPort()
  const storage = dependencies.storage ?? createDefaultStoragePort()
  const draftRepository = dependencies.draftRepository ?? createActionDraftRepository(storage)
  const mediaCapture = dependencies.mediaCapture ?? createDefaultMediaCapturePort()
  const mediaFilePicker = dependencies.mediaFilePicker ?? createDefaultMediaFilePickerPort()
  const location = dependencies.location ?? createDefaultLocationPort()
  const upload = dependencies.upload ?? createDefaultUploadPort(authSession)
  const mediaUploadQueue = dependencies.mediaUploadQueue ?? createDefaultMediaUploadQueue(storage, upload)
  const surveyLeakageCauseProvider = dependencies.surveyLeakageCauseProvider ?? createDefaultSurveyLeakageCauseProvider(authSession)
  sessionStore.configureAuth(authSession)
  const workOrderListStore = useWorkOrderListStore(pinia)
  const workOrderDetailStore = useWorkOrderDetailStore(pinia)
  workOrderListStore.configureApi(
    apiRead,
    () => sessionStore.session,
    () => sessionStore.endSession().then(() => undefined),
  )
  workOrderListStore.configureCommandApi(apiCommand, () => workOrderDetailStore.clear())
  workOrderListStore.configurePhone(phone)
  workOrderListStore.configureNavigation(navigation)
  workOrderDetailStore.configureApi(
    apiRead,
    () => sessionStore.session,
    () => sessionStore.endSession().then(() => undefined),
  )
  workOrderDetailStore.configurePhone(phone)
  workOrderDetailStore.configureNavigation(navigation)
  const actionWorkspaceStore = useActionWorkspaceStore(pinia)
  actionWorkspaceStore.configure({
    apiRead,
    commandApi: apiCommand,
    draftRepository,
    navigation,
    getSession: () => sessionStore.session,
    mediaCapture,
    mediaFilePicker,
    location,
    upload,
    mediaUploadQueue,
    surveyLeakageCauseProvider,
  })
  const localDraftDiagnosticsStore = useLocalDraftDiagnosticsStore(pinia)
  localDraftDiagnosticsStore.configure({
    repository: draftRepository,
    getSession: () => sessionStore.session,
    isDeveloperModeAvailable: isBusinessMockDeveloperModeAvailable,
    getMockMode: isBusinessMockMode,
    mockDraftSeeds: mockAppointmentDraftSeeds,
  })
  void sessionStore.bootstrap()
  return {
    app,
    pinia,
    sessionStore,
    workOrderListStore,
    workOrderDetailStore,
    actionWorkspaceStore,
    quotationCatalogRead,
    localDraftDiagnosticsStore,
  }
}
