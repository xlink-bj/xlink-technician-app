import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/App.vue'
import type { AuthSessionPort, PhonePort, TechnicianApiReadPort } from '@shared/ports'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { useSessionStore } from '@shared/state'

import {
  createDefaultAuthSessionPort,
  createDefaultPhonePort,
  createDefaultTechnicianApiReadPort,
} from './composition'

export interface ApplicationDependencies {
  readonly authSession?: AuthSessionPort
  readonly apiRead?: TechnicianApiReadPort
  readonly phone?: PhonePort
}

export function createApplication(dependencies: ApplicationDependencies = {}) {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  const sessionStore = useSessionStore(pinia)
  const authSession = dependencies.authSession ?? createDefaultAuthSessionPort()
  const apiRead = dependencies.apiRead ?? createDefaultTechnicianApiReadPort(authSession)
  const phone = dependencies.phone ?? createDefaultPhonePort()
  sessionStore.configureAuth(authSession)
  const workOrderListStore = useWorkOrderListStore(pinia)
  workOrderListStore.configureApi(
    apiRead,
    () => sessionStore.session,
    () => sessionStore.endSession().then(() => undefined),
  )
  const workOrderDetailStore = useWorkOrderDetailStore(pinia)
  workOrderDetailStore.configureApi(
    apiRead,
    () => sessionStore.session,
    () => sessionStore.endSession().then(() => undefined),
  )
  workOrderDetailStore.configurePhone(phone)
  void sessionStore.bootstrap()
  return { app, pinia, sessionStore, workOrderListStore, workOrderDetailStore }
}
