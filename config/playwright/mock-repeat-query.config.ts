import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { rootPath } from '../paths'
const baseURL = 'http://localhost:5183'
const server = base.webServer as Exclude<typeof base.webServer, undefined | unknown[]>
export default defineConfig({
  ...base,
  testMatch: 'mock-repeat-query.spec.ts',
  outputDir: rootPath('test-results/mock-repeat-query/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/mock-repeat-query/results.json') }]],
  webServer: {
    ...server,
    command: './node_modules/.bin/uni -p h5 --host localhost --port 5183 --strictPort',
    url: baseURL,
    env: { ...server.env, VITE_XLINK_R1_MP_UX_FIXTURES: 'true', VITE_XLINK_R1_STAGE2B_FIELDS: 'true' },
  },
  use: { ...base.use, baseURL, viewport: { width: 430, height: 932 }, trace: 'on' },
})
