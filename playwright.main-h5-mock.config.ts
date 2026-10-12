import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:5174'

/**
 * REAL uni-app main pages + normal application composition, but a DEV-only,
 * entirely local session fixture. Never read local real-user credentials.
 * This environment has an inert business API, no auth override and a strict
 * no-network browser guard in every test.
 */
export default defineConfig({
  testDir: './tests/h5-main-mock',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  outputDir: 'test-results/main-h5-mock/attachments',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/main-h5-mock/results.json' }],
    ['html', { outputFolder: 'test-results/main-h5-mock/html', open: 'never' }],
  ],
  webServer: {
    command: 'pnpm run dev:h5',
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      VITE_XLINK_H5_MOCK_E2E: 'true',
      VITE_XLINK_H5_OFFLINE_SMOKE: 'false',
      VITE_XLINK_ENVIRONMENT: 'dev',
      VITE_XLINK_PLATFORM: 'mp-weixin',
      VITE_XLINK_API_BASE_URL: 'https://example.invalid',
      VITE_XLINK_AUTH_API_BASE_URL: '',
      VITE_XLINK_AUTH_TENANT: 'synthetic-qa-tenant',
      VITE_XLINK_AUTH_METHOD: 'phone',
      VITE_XLINK_MOCK: 'true',
      VITE_XLINK_ENABLE_REAL_WRITES: 'false',
      VITE_XLINK_QUICK_LOGIN_PHONE: '',
      VITE_XLINK_QUICK_LOGIN_CODE: '',
    },
  },
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
})
