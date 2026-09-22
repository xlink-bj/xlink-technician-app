import { createSSRApp } from 'vue'

import { createApplication } from '@app/bootstrap'
import { setBusinessMockMode } from '@app/business-mock'
import type { AuthSessionPort, SessionSnapshot } from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'
import App from './App.vue'
import { createG4fReviewStorage, reviewScenarioFromLocation, seedG4fReviewDraft } from './quotation-scenarios'

const reviewSession: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('g4f-mock-review-session'),
  user: { id: asOpaqueId<'UserId'>('g4f-mock-review-user'), displayName: '演示技师' },
  currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role'), name: '技术员' },
  capabilityNames: ['work-order.read', 'work-order.action'],
}

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

const authSession: AuthSessionPort = {
  startSession: async () => succeeded(reviewSession),
  restoreSession: async () => succeeded(reviewSession),
  getCurrentSession: () => reviewSession,
  endSession: async () => succeeded(undefined),
}

export function createApp() {
  // This root is development-only and hard-selects the existing bounded Mock
  // runtime. The synthetic session is local; it contains no credentials.
  setBusinessMockMode('data')
  const storage = createG4fReviewStorage()
  seedG4fReviewDraft(storage, reviewScenarioFromLocation())
  const application = createApplication({ authSession, storage })
  const app = createSSRApp(App)
  app.use(application.pinia)
  return { app }
}
