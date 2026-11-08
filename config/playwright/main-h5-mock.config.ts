import { defineConfig, devices } from '@playwright/test'
import { repositoryRoot, rootPath } from '../paths'

const baseURL = 'http://localhost:5174'

// Forward only the explicit, synthetic QA switches used by opt-in H5 suites.
// Do not inherit the caller's full environment into the local App server.
const optInFixtureFlags = [
  'VITE_XLINK_R1_MP_UX_FIXTURES',
  'VITE_XLINK_R1_SPECIAL_MEDIA',
  'VITE_XLINK_R1_BUSINESS_FIELDS',
  'VITE_XLINK_R1_DEEP_CASCADE',
  'VITE_XLINK_R1_STAGE2D_FIELDS',
  'VITE_XLINK_R1_STAGE2C_ARRAYS',
  'VITE_XLINK_R1_STAGE2B_FIELDS',
  'VITE_XLINK_DYNAMIC_SCALAR_QA',
  'VITE_XLINK_R1_CATALOG_SCALE',
] as const

const enabledOptInFixtureEnv = Object.fromEntries(
  optInFixtureFlags
    .filter((name) => process.env[name] === 'true')
    .map((name) => [name, 'true']),
)

/**
 * REAL uni-app main pages + normal application composition, but a DEV-only,
 * entirely local session fixture. Never read local real-user credentials.
 * This environment has an inert business API, no auth override and a strict
 * no-network browser guard in every test.
 */
export default defineConfig({
  testDir: rootPath('tests/h5-main-mock'),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  outputDir: rootPath('test-results/main-h5-mock/attachments'),
  reporter: [
    ['list'],
    ['json', { outputFile: rootPath('test-results/main-h5-mock/results.json') }],
    ['html', { outputFolder: rootPath('test-results/main-h5-mock/html'), open: 'never' }],
  ],
  webServer: {
    // Use the already installed workspace executable. Invoking pnpm can
    // unexpectedly reinstall dependencies during a browser verification run.
    command: './node_modules/.bin/uni -p h5',
    url: baseURL,
    cwd: repositoryRoot,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // This isolated E2E server bypasses `pnpm dev:h5`; opt into QA pages explicitly.
      UNI_CUSTOM_CONTEXT: '{"XLINK_DEV_QA":true}',
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
      ...enabledOptInFixtureEnv,
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
