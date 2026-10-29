import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:5174'

export default defineConfig({
  testDir: './tests/h5-review',
  testMatch: '**/design-system-uni-h5.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  webServer: {
    command: 'pnpm run dev:uni-h5-review',
    url: `${baseURL}/`,
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
