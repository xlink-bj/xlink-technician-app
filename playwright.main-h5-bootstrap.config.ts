import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:5173'

// No credentials, no Production authentication and no business network.
// The H5 startup test must prove the REAL uni-app page renders; the isolated
// synthetic-session review app would hide precisely this startup regression.
export default defineConfig({
  testDir: './tests/h5-main-app',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  webServer: {
    command: 'pnpm run dev:h5',
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      VITE_XLINK_ENVIRONMENT: 'dev',
      VITE_XLINK_PLATFORM: 'mp-weixin',
      VITE_XLINK_API_BASE_URL: 'https://example.invalid',
      VITE_XLINK_AUTH_TENANT: 'synthetic-no-login',
      VITE_XLINK_AUTH_METHOD: 'phone',
      VITE_XLINK_MOCK: 'true',
      VITE_XLINK_ENABLE_REAL_WRITES: 'false',
      // Intentionally fictitious data. CI intercepts/aborts every external
      // request before sending; this is only a browser intent smoke test.
      VITE_XLINK_AUTH_API_BASE_URL: 'https://xlink.fsgo365.cn',
      VITE_XLINK_QUICK_LOGIN_PHONE: '00000000000',
      VITE_XLINK_QUICK_LOGIN_CODE: '999999',
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
