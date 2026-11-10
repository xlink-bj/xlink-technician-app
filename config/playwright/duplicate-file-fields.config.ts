import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { rootPath } from '../paths'
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer
if (!server) throw new Error('Duplicate file regression requires the real App server')
const baseURL = 'http://127.0.0.1:5321'
export default defineConfig({
  ...base, testMatch: 'duplicate-file-fields.spec.ts',
  outputDir: rootPath('test-results/duplicate-file-fields/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/duplicate-file-fields/results.json') }]],
  use: { ...base.use, baseURL, viewport: { width: 430, height: 932 }, trace: 'on' },
  webServer: { ...server, url: baseURL,
    command: './node_modules/.bin/uni -p h5 --host 127.0.0.1 --port 5321 --strictPort',
    env: { ...server.env, VITE_XLINK_R1_MP_UX_FIXTURES: 'true', VITE_XLINK_R1_SPECIAL_MEDIA: 'true',
      VITE_XLINK_R1_DUPLICATE_FILE_FIELDS: 'true',
      VITE_XLINK_R1_DUPLICATE_FILE_REVERSE: process.env.XLINK_DUPLICATE_REVERSE === 'true' ? 'true' : 'false' } },
})
