import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/r1-main-repeat-ui',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results/r1-main-repeat-ui/attachments',
  reporter: [['list'], ['html', { outputFolder: 'test-results/r1-main-repeat-ui/html', open: 'never' }]],
  webServer: {
    command: 'pnpm exec vite --config vite.r1-main-repeat-ui.config.ts',
    url: 'http://127.0.0.1:5176',
    timeout: 60_000,
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://127.0.0.1:5176',
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
})
