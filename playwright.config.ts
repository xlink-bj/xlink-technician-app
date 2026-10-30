import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: './tests/h5-review',
  testMatch: ['**/design-system.spec.ts', '**/g4e-survey.spec.ts'],
  outputDir: 'test-results/h5-review/attachments',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  webServer: {
    command: 'pnpm run dev:h5-review',
    url: `${baseURL}/tools/review/harness/g4e-survey.html?scenario=survey-overview`,
    cwd: process.cwd(),
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
