import { createApplication } from '@app/bootstrap'

// Each uni platform asks for the app instance through this factory.
// Historical MP runtime requires an explicit root mount before page events;
// H5's uni runtime performs its own mount and must not be mounted twice.
function createTechnicianApplication() {
  const application = createApplication()
  // #ifdef MP-WEIXIN
  application.app.mount('#app')
  // #endif
  return application
}

// Keep the uni-app entry contract while avoiding a local declaration named
// "createApp", which the pinned H5 compiler injects during transformation.
export { createTechnicianApplication as createApp }
