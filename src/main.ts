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
// The pinned uni H5 compiler injects `__plugin` from @dcloudio/uni-h5 in
// the transformed entry. Its router/components must be installed BEFORE
// mounting the real app, just as the compiler's own createApp wrapper does.
// This ambient declaration is erased by TypeScript; H5 receives the real
// binding from uni, not an invented router or a synthetic Login session.
declare const __plugin: import('vue').Plugin
void import('@app/bootstrap').then(({ createApplication: initialize }) => {
  const application = initialize()
  application.app.use(__plugin)
  application.app.mount('#app')
})
// #endif
