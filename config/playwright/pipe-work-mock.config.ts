import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { rootPath } from '../paths'

const origin = 'http://127.0.0.1:5298'
const server = base.webServer as { env: Record<string, string> }
const executablePath = process.env.PW_CHROMIUM_PATH
const enabled = process.env.XLINK_PIPE_WORK_DISABLED !== 'true'
const results = `test-results/pipe-work-mock/${enabled ? 'on' : 'off'}`

export default defineConfig({
  ...base,
  testDir: rootPath('tests/h5-pipe-work'),
  testMatch: 'pipe-work-mock.spec.ts',
  outputDir: rootPath(`${results}/attachments`),
  reporter: [['list'], ['json', { outputFile: rootPath(`${results}/results.json`) }]],
  use: {
    ...base.use,
    baseURL: origin,
    actionTimeout: 10000,
    viewport: { width: 430, height: 932 },
    serviceWorkers: 'block',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    ...base.webServer,
    command: './node_modules/.bin/uni -p h5 --host 127.0.0.1 --port 5298 --strictPort',
    url: origin,
    env: {
      ...server.env,
      VITE_XLINK_BRAND: 'yuhong',
      VITE_XLINK_DEV_PIPE_WORK_MOCK: String(enabled),
      VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false',
      VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS: 'false',
    },
  },
})
