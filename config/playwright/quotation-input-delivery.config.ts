import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { rootPath } from '../paths'

const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer
if (!server) throw new Error('Quotation delivery requires the isolated main-App Mock server')
const baseURL = 'http://127.0.0.1:5319'
export default defineConfig({
  ...base,
  testMatch: 'quotation-input-delivery.spec.ts',
  outputDir: rootPath('test-results/quotation-input-delivery/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/quotation-input-delivery/results.json') }]],
  use: { ...base.use, baseURL, viewport: { width: 430, height: 932 }, trace: 'on', screenshot: 'on' },
  webServer: {
    ...server,
    command: './node_modules/.bin/uni -p h5 -c config/vite/quotation-input-delivery.config.ts --host 127.0.0.1 --port 5319 --strictPort',
    url: baseURL,
    env: { ...server.env, UNI_OUTPUT_DIR: rootPath('unpackage/quotation-input-h5') },
  },
})
