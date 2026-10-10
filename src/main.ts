import { createApplication } from '@app/bootstrap'

// uni-app owns application mounting on H5, MP and App.
// Construct one application per platform bootstrap invocation; do not
// mount it eagerly at module import time or bypass uni-app's page router.
export function createApp() {
  return createApplication()
}
