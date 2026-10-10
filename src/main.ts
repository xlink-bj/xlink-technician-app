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
// The pinned uni H5 compiler rewrites src/main.ts and can remove the static
// bootstrap binding. Load the real factory as a distinct H5 module so its
// dependency remains present and boot exactly once from this entry.
void import('@app/bootstrap').then(({ createApplication: initialize }) => {
  const application = initialize()
  application.app.mount('#app')
})
// #endif
