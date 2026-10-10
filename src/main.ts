import { createApplication } from '@app/bootstrap'

// Each uni platform asks for the app instance through this factory.
// Historical MP runtime requires an explicit root mount before page events;
// H5 uses the separate guarded bootstrap below; never mount its app twice.
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

// #ifdef H5
// Uni's H5 Vite entry currently imports main.ts but does not invoke the
// aliased factory. Explicitly initialize the real App for the browser.
// This is a distinct entry path from the MP factory mount above.
const h5Application = createTechnicianApplication()
h5Application.app.mount('#app')
// #endif
