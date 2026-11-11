import { defineConfig } from '@playwright/test'
import base from './work-order-authority-revocation.config'
import { rootPath } from '../paths'

const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer
if (!server) throw Error('Normal list navigation requires the normal App server')
const origin = 'http://127.0.0.1:5338'
export default defineConfig({
  ...base,
  testMatch: 'work-order-refresh-navigation.spec.ts',
  outputDir: rootPath('test-results/work-order-refresh-navigation/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/work-order-refresh-navigation/results.json') }]],
  use: { ...base.use, baseURL: origin },
  webServer: { ...server, url: origin,
    command: './node_modules/.bin/uni -p h5 --host 127.0.0.1 --port 5338 --strictPort',
    env: { ...server.env, UNI_OUTPUT_DIR: rootPath('unpackage/work-order-refresh-navigation-h5'), VITE_XLINK_API_BASE_URL: origin + '/xlink/wm' } },
})
