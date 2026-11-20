import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { repositoryRoot, rootPath } from '../paths'

const baseURL = 'http://localhost:5182'
const server = base.webServer as { env: Record<string, string> }
const brand = process.env.VITE_XLINK_BRAND === 'yuhong' ? 'yuhong' : 'xlink'
const optOut = process.env.XLINK_PIPE_MOCK_OPT_OUT === 'true'
const output = rootPath(`test-results/pipe-verification-mock/${brand}${optOut ? '-opt-out' : ''}`)

export default defineConfig({
  ...base,
  testDir: rootPath('tests/h5-pipe-verification'),
  testMatch: ['pipe-verification.spec.ts'],
  testIgnore: [],
  outputDir: `${output}/attachments`,
  reporter: [['list'], ['json', { outputFile: `${output}/results.json` }]],
  webServer: {
    ...base.webServer,
    command: './node_modules/.bin/uni -p h5 --port 5182 --strictPort',
    cwd: repositoryRoot,
    url: baseURL,
    env: {
      ...server.env,
      UNI_OUTPUT_DIR: rootPath('unpackage/pipe-verification-mock'),
      VITE_XLINK_BRAND: brand,
      VITE_XLINK_PIPE_VERIFICATION_MOCK: optOut ? 'false' : 'true',
    },
  },
  use: {
    ...base.use,
    baseURL,
    actionTimeout: 15_000,
    viewport: { width: 430, height: 932 },
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
})
