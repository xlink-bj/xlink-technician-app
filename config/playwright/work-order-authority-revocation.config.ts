import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { rootPath } from '../paths'

const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer
if (!server) throw new Error('Authority regression requires the normal App server')
const baseURL = 'http://127.0.0.1:5323'
export default defineConfig({
  ...base, testMatch: 'work-order-authority-revocation.spec.ts',
  outputDir: rootPath('test-results/work-order-authority-revocation/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/work-order-authority-revocation/results.json') }]],
  use: { ...base.use, baseURL, viewport: { width: 430, height: 932 }, trace: 'on', screenshot: 'on' },
  webServer: { ...server, url: baseURL,
    command: './node_modules/.bin/uni -p h5 --host 127.0.0.1 --port 5323 --strictPort',
    // Exercise the existing read-only authority branch against browser fixtures,
    // not a Production endpoint. No inherited credentials or Mock router flags.
    env: { UNI_CUSTOM_CONTEXT: '{"XLINK_DEV_QA":true}', VITE_XLINK_ENVIRONMENT: 'prod',
      VITE_XLINK_PLATFORM: 'mp-weixin', VITE_XLINK_API_BASE_URL: baseURL + '/xlink/wm',
      VITE_XLINK_AUTH_API_BASE_URL: '', VITE_XLINK_AUTH_TENANT: 'synthetic-authority',
      VITE_XLINK_AUTH_METHOD: 'phone', VITE_XLINK_QUICK_LOGIN_PHONE: '00000000000',
      VITE_XLINK_QUICK_LOGIN_CODE: '000000', VITE_XLINK_MOCK: 'false',
      VITE_XLINK_H5_MOCK_E2E: 'false', VITE_XLINK_ENABLE_REAL_WRITES: 'false',
      VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false', VITE_XLINK_R1_FORMS_ACTIONS: 'false',
      VITE_XLINK_R1_REPEAT_ACTIONS: 'false', VITE_XLINK_R1_NODE_FORM_READ: 'false' } },
})
