import { surveyLeakageCauseReadKey } from '@features/work-orders/survey-leakage-cause-read'
import { resolveAStageDynamicFormMockWorkspace } from './a-stage-dynamic-form-mock-ui'
import { createR1NormalFormDraftProvider } from './r1-normal-form-drafts'
import { r1NormalFormDraftsKey } from '@features/work-orders/r1-normal-form-drafts'
import { createHistoricalFormsReader } from './r1-historical-forms-read'
import { historicalFormsReaderKey } from '@features/work-orders/r1-historical-forms-read'
import { createNormalQuotationPartsReader } from './r1-quotation-parts-read'
import { createNormalQuotationUnitDisplay } from './r1-quotation-unit-display'
import { localUnitDisplayKey } from '@features/work-orders/quotation/local-unit-display'
import { createNormalNodeFormsReader } from './r1-node-forms-read'
import { r1NodeFormsReaderKey } from '@features/work-orders/r1-node-forms-read'
import { createNormalNodeFormActionProvider } from './r1-forms-authorization'
import { r1RepeatActionsKey } from '@features/work-orders/r1-repeat-actions-port'
import { createLocalSigningReadAuthority } from './local-signing-read-authority'
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
  QuotationOrderCommandPort,
  QuotationOrderReadPort,
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
import { useQuotationOrderBrowseStore } from '@features/work-orders/quotation/order-browse-store'
import { useSigningReviewReadStore } from '@features/work-orders/signing/signing-review-read-store'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { useR1LocalFormDraftStore } from '@features/work-orders/r1-local-form-drafts'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { useLocalDraftDiagnosticsStore } from '@features/home/draft-diagnostics'
import { useSessionStore } from '@shared/state'
import { isBusinessMockDeveloperModeAvailable, isBusinessMockMode, isDevSyntheticContractReadPreviewEnabled } from './business-mock'

import {
  createDefaultAuthSessionPort,
  createDefaultTechnicianApiCommandPort,
  createDefaultQuotationOrderCommandPort,
  createDefaultQuotationOrderReadPort,
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
  readonly quotationOrderCommand?: QuotationOrderCommandPort
  readonly quotationOrderRead?: QuotationOrderReadPort
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
  const quotationCatalogRead = dependencies.quotationCatalogRead ?? createDefaultQuotationCatalogReadPort(
    authSession,
    id => apiRead.isWorkOrderListedForCurrentSession?.(id) === true,
  )
  const normalQuotationPartsRead = createNormalQuotationPartsReader({ auth: authSession, read: apiRead,
    env: import.meta.env, origin: typeof window === 'undefined' ? '' : window.location.origin })
  const normalUnitDisplay = createNormalQuotationUnitDisplay({ auth: authSession, read: apiRead,
    env: import.meta.env, origin: typeof window === 'undefined' ? '' : window.location.origin })
  app.provide(localUnitDisplayKey, normalUnitDisplay)
  const normalNodeFormsReader = createNormalNodeFormsReader({ auth: authSession, read: apiRead,
    tenantId: String(import.meta.env.VITE_XLINK_AUTH_TENANT ?? ''), env: import.meta.env,
    origin: typeof window === 'undefined' ? '' : window.location.origin })
  app.provide(r1NodeFormsReaderKey, normalNodeFormsReader)
  app.provide(historicalFormsReaderKey, () => createHistoricalFormsReader({ auth: authSession, read: apiRead,
    tenantId: String(import.meta.env.VITE_XLINK_AUTH_TENANT ?? ''), env: import.meta.env,
    origin: typeof window === 'undefined' ? '' : window.location.origin }))
  const apiCommand = dependencies.apiCommand ?? createDefaultTechnicianApiCommandPort(authSession, apiRead)
  const quotationOrderCommand = dependencies.quotationOrderCommand ?? createDefaultQuotationOrderCommandPort(authSession)
  const isQuotationOrderReadScopeValid = (workOrderId: string) =>
    apiRead.isWorkOrderListedForCurrentSession?.(workOrderId) === true
    || isDevSyntheticContractReadPreviewEnabled(workOrderId)
  const quotationOrderRead = dependencies.quotationOrderRead ?? createDefaultQuotationOrderReadPort(
    authSession,
    isQuotationOrderReadScopeValid,
  )
  const phone = dependencies.phone ?? createDefaultPhonePort()
  const navigation = dependencies.navigation ?? createDefaultNavigationPort()
  const storage = dependencies.storage ?? createDefaultStoragePort()
  const draftRepository = dependencies.draftRepository ?? createActionDraftRepository(storage)
  app.provide(r1NormalFormDraftsKey, createR1NormalFormDraftProvider({ auth: authSession, reader: normalNodeFormsReader,
    tenantId: String(import.meta.env.VITE_XLINK_AUTH_TENANT ?? ''), repository: draftRepository }))
  const r1LocalFormDraftStore = useR1LocalFormDraftStore(pinia)
  r1LocalFormDraftStore.configure(storage, apiRead, {
    trustedDefaultMockReader: !dependencies.apiRead,
    isSyntheticMockDataModeEnabled: () => isBusinessMockDeveloperModeAvailable() && isBusinessMockMode() === 'data',
  })
  const mediaCapture = dependencies.mediaCapture ?? createDefaultMediaCapturePort()
  const mediaFilePicker = dependencies.mediaFilePicker ?? createDefaultMediaFilePickerPort()
  const location = dependencies.location ?? createDefaultLocationPort()
  const upload = dependencies.upload ?? createDefaultUploadPort(authSession)
  const mediaUploadQueue = dependencies.mediaUploadQueue ?? createDefaultMediaUploadQueue(storage, upload)
  app.provide(r1RepeatActionsKey, createNormalNodeFormActionProvider({ auth: authSession, reader: normalNodeFormsReader,
    env: import.meta.env, origin: typeof window === 'undefined' ? '' : window.location.origin,
    media:{picker:mediaFilePicker,queue:mediaUploadQueue} }))
  const surveyLeakageCauseProvider = dependencies.surveyLeakageCauseProvider ?? createDefaultSurveyLeakageCauseProvider(authSession)
  app.provide(surveyLeakageCauseReadKey, { provider: surveyLeakageCauseProvider, tenantId: String(import.meta.env.VITE_XLINK_AUTH_TENANT ?? '') })
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
  const quotationOrderBrowseStore = useQuotationOrderBrowseStore(pinia)
  quotationOrderBrowseStore.configure(quotationOrderRead, () => sessionStore.session)
  const localSigningRead = createLocalSigningReadAuthority({ auth: authSession, read: apiRead })
  const signingReviewReadStore = useSigningReviewReadStore(pinia)
  signingReviewReadStore.configure(
    localSigningRead.enabled() ? localSigningRead.port : quotationOrderRead,
    () => sessionStore.session,
    (id) => localSigningRead.enabled()
      ? apiRead.isWorkOrderListedForCurrentSession?.(id) === true
      : isDevSyntheticContractReadPreviewEnabled(id)
      || (workOrderDetailStore.loadState === 'succeeded'
        && String(workOrderDetailStore.detail?.id ?? '') === id
        && workOrderListStore.items.some((item) => String(item.id) === id)),
    apiRead,
    isDevSyntheticContractReadPreviewEnabled,
    localSigningRead.enabled() ? localSigningRead : undefined,
  )
  const actionWorkspaceStore = useActionWorkspaceStore(pinia)
  actionWorkspaceStore.configure({
    normalFormContentEnabled: () => normalNodeFormsReader.enabled(),
    devMockDynamicFormResolver: resolveAStageDynamicFormMockWorkspace,
    apiRead,
    localQuotationRepairPartsRead: normalQuotationPartsRead,
    quotationCatalogRead,
    commandApi: apiCommand,
    quotationOrderCommand,
    quotationOrderRead,
    draftRepository,
    navigation,
    storage,
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
    quotationOrderBrowseStore,
    signingReviewReadStore,
    actionWorkspaceStore,
    quotationCatalogRead,
    quotationOrderRead,
    localDraftDiagnosticsStore,
  }
}
