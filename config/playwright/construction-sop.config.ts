import { defineConfig } from '@playwright/test'
import { rootPath } from '../paths'
import baseline from './main-h5-mock.config'

const server = baseline.webServer
if (!server || Array.isArray(server)) throw new Error('Expected one main App H5 server')
const baseURL = 'http://127.0.0.1:5197'

export default defineConfig({
  ...baseline,
  testDir: rootPath('tests/h5-construction-sop'),
  testMatch: '**/*.spec.ts',
  testIgnore: [],
  outputDir: rootPath('test-results/construction-sop/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/construction-sop/results.json') }]],
  webServer: {
    ...server,
    command: './node_modules/.bin/uni -p h5 --host 127.0.0.1 --port 5197 --strictPort',
    url: baseURL,
    env: { ...server.env, VITE_XLINK_DEV_CONSTRUCTION_SOP: 'true' },
  },
  use: { ...baseline.use, baseURL, viewport: { width: 430, height: 932 } },
})
