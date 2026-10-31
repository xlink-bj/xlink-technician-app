import { defineConfig, devices } from '@playwright/test'
import { repositoryRoot, rootPath } from '../paths'

const baseURL = 'http://127.0.0.1:5175'

export default defineConfig({
  testDir: rootPath('tests/h5-review'),
  testMatch: '**/g4f-quotation*.spec.ts',
  outputDir: rootPath('test-results/uni-h5-g4f-review/attachments'),
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  webServer: {
    command: 'pnpm run dev:uni-h5-g4f-review',
    url: baseURL,
    cwd: repositoryRoot,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
})
