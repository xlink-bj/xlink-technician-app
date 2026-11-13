import { defineConfig } from '@playwright/test'
import base from './work-order-authority-revocation.config'
import { rootPath } from '../paths'
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer
if (!server) throw Error('Information verification requires the normal App server')
const baseURL = 'http://127.0.0.1:5347'
export default defineConfig({
  ...base, testMatch: 'work-order-information.spec.ts',
  outputDir: rootPath('test-results/work-order-information/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/work-order-information/results.json') }]],
  use: { ...base.use, baseURL, viewport: { width: 430, height: 932 }, trace: 'on', screenshot: 'on' },
  webServer: { ...server, url: baseURL,
    command: './node_modules/.bin/uni -p h5 --host 127.0.0.1 --port 5347 --strictPort',
    env: { ...server.env, VITE_XLINK_ENVIRONMENT: 'dev', UNI_OUTPUT_DIR: rootPath('unpackage/work-order-information-h5'),
      VITE_XLINK_API_BASE_URL: baseURL + '/xlink/wm' } },
})
