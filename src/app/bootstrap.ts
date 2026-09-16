import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/App.vue'
import type {
  AuthSessionPort,
  NavigationPort,
  PhonePort,
  StoragePort,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
} from '@shared/ports'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { useSessionStore } from '@shared/state'

import {
  createDefaultAuthSessionPort,
  createDefaultTechnicianApiCommandPort,
  createDefaultPhonePort,
  createDefaultNavigationPort,
  createDefaultStoragePort,
  createDefaultTechnicianApiReadPort,
} from './composition'

export interface ApplicationDependencies {
  readonly authSession?: AuthSessionPort
  readonly apiRead?: TechnicianApiReadPort
  readonly apiCommand?: TechnicianApiCommandPort
  readonly phone?: PhonePort
  readonly navigation?: NavigationPort
  readonly storage?: StoragePort
}

export function createApplication(dependencies: ApplicationDependencies = {}) {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  const sessionStore = useSessionStore(pinia)
  const authSession = dependencies.authSession ?? createDefaultAuthSessionPort()
  const apiRead = dependencies.apiRead ?? createDefaultTechnicianApiReadPort(authSession)
  const apiCommand = dependencies.apiCommand ?? createDefaultTechnicianApiCommandPort(authSession, apiRead)
  const phone = dependencies.phone ?? createDefaultPhonePort()
  const navigation = dependencies.navigation ?? createDefaultNavigationPort()
  const storage = dependencies.storage ?? createDefaultStoragePort()
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
    storage,
    navigation,
    getSession: () => sessionStore.session,
  })
  void sessionStore.bootstrap()
  return { app, pinia, sessionStore, workOrderListStore, workOrderDetailStore, actionWorkspaceStore }
}
