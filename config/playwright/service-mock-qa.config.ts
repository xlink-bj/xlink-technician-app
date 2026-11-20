import { defineConfig } from '@playwright/test'
import { rootPath } from '../paths'
import base from './main-h5-mock.config'

const port = 5182
const url = `http://localhost:${port}`
const switches = [
  'VITE_XLINK_SERVICE_REVIEW',
  'VITE_XLINK_SERVICE_REVIEW_MISS_RECEIPT',
  'VITE_XLINK_SERVICE_REVIEW_LOCATION_DENIED',
] as const
const optIn = Object.fromEntries(switches.map(name => [name, process.env[name] === 'true' ? 'true' : 'false']))
const h5 = base.webServer as { command: string; env?: Record<string, string> }

export default defineConfig({
  ...base,
  testDir: rootPath('tests/h5-service-mock-qa'),
  testMatch: '*.spec.ts',
  testIgnore: [],
  timeout: 45000,
  expect: { timeout: 12000 },
  outputDir: rootPath('test-results/service-mock-qa/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/service-mock-qa/results.json') }]],
  use: {
    ...base.use,
    baseURL: url,
    viewport: { width: 430, height: 932 },
    serviceWorkers: 'block',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost', '--disable-background-networking'],
    },
  },
  webServer: {
    ...h5,
    url,
    command: `./node_modules/.bin/uni -p h5 --host localhost --port ${port} --strictPort`,
    env: { ...h5.env, ...optIn, UNI_OUTPUT_DIR: rootPath('unpackage/service-mock-qa') },
  },
})
