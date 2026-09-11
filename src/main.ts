import { createApplication } from '@app/bootstrap'

const application = createApplication()
application.app.mount('#app')

export function createApp() {
  return application
}
