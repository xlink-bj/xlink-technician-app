import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/App.vue'
import type { AuthSessionPort } from '@shared/ports'
import { useSessionStore } from '@shared/state'

import { createDefaultAuthSessionPort } from './composition'

export interface ApplicationDependencies {
  readonly authSession?: AuthSessionPort
}

export function createApplication(dependencies: ApplicationDependencies = {}) {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  const sessionStore = useSessionStore(pinia)
  sessionStore.configureAuth(dependencies.authSession ?? createDefaultAuthSessionPort())
  void sessionStore.bootstrap()
  return { app, pinia, sessionStore }
}
