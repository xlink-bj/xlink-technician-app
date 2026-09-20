import { createApp } from 'vue'

import './g4e-review-runtime'
import './review-platform-shim'
import '../src/shared/ui/design-system.scss'

if (import.meta.env.PROD) {
  document.body.textContent = 'G4-E H5 review harness is development-only.'
} else {
  const [{ createApplication }, composition, { default: ReviewHarness }] = await Promise.all([
    import('@app/bootstrap'),
    import('@app/composition'),
    import('./g4e-survey-harness.vue'),
  ])
  const { createDefaultTechnicianApiReadPort, createDefaultTechnicianApiCommandPort, createDefaultSurveyLeakageCauseProvider, createDefaultUploadPort } = composition
  const { createReviewMediaUploadQueue, reviewUserId } = await import('./g4e-review-runtime')
  const { createReviewAuthSession, createReviewMemoryStorage, createReviewNavigation, createReviewMediaCapture, createReviewMediaPicker, createReviewLocation } = await import('./review-platform-shim')

  const authSession = createReviewAuthSession()
  const apiRead = createDefaultTechnicianApiReadPort(authSession)
  const apiCommand = createDefaultTechnicianApiCommandPort(authSession, apiRead)
  const application = createApplication({
    authSession,
    apiRead,
    apiCommand,
    storage: createReviewMemoryStorage(),
    navigation: createReviewNavigation(),
    mediaCapture: createReviewMediaCapture(),
    mediaFilePicker: createReviewMediaPicker(),
    location: createReviewLocation(),
    upload: createDefaultUploadPort(authSession),
    mediaUploadQueue: createReviewMediaUploadQueue(),
    surveyLeakageCauseProvider: createDefaultSurveyLeakageCauseProvider(authSession),
  })

  const app = createApp(ReviewHarness)
  app.use(application.pinia)
  app.provide('g4e-review-user', reviewUserId)
  app.mount('#app')
}
