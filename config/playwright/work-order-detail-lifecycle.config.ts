import { defineConfig } from '@playwright/test'
import authority from './work-order-authority-revocation.config'
import { rootPath } from '../paths'

const server = Array.isArray(authority.webServer) ? authority.webServer[0] : authority.webServer
if (!server) throw Error('Normal detail lifecycle requires the normal App server')
const baseURL = 'http://127.0.0.1:5336'
export default defineConfig({
  ...authority, testMatch: 'work-order-detail-load-lifecycle.spec.ts',
  outputDir: rootPath('test-results/work-order-detail-lifecycle/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/work-order-detail-lifecycle/results.json') }]],
  use: { ...authority.use, baseURL, viewport: { width: 430, height: 932 }, trace: 'on', screenshot: 'on' },
  webServer: { ...server, url: baseURL,
    command: './node_modules/.bin/uni -p h5 --host 127.0.0.1 --port 5336 --strictPort',
    env: { ...server.env, UNI_OUTPUT_DIR: rootPath('unpackage/work-order-detail-lifecycle-h5'),
      VITE_XLINK_API_BASE_URL: baseURL + '/xlink/wm' } },
})
