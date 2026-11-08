import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { rootPath } from '../paths'

const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer
if (!server) throw new Error('M08 requires the existing isolated main-App Mock server')

// Same canonical application source, separate generated output. In particular,
// do not replace a concurrently running readonly H5 build at dist/dev/h5.
export default defineConfig({
  ...base,
  testMatch: 'catalog-scale.spec.ts',
  use: { ...base.use, ...(process.env.XLINK_M08_BROWSER_CHANNEL === 'chrome' ? { channel: 'chrome' } : {}) },
  outputDir: rootPath('test-results/m08-catalog-scale/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/m08-catalog-scale/results.json') }]],
  webServer: {
    ...server,
    command: './node_modules/.bin/uni -p h5 -c config/vite/catalog-scale.config.ts',
    env: { ...server.env, UNI_OUTPUT_DIR: rootPath('unpackage/m08-catalog-h5') },
  },
})
