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
  'VITE_XLINK_R1_TEMPORAL_RATING_FIELDS',
  'VITE_XLINK_R1_ARRAY_CASCADE_FIELDS',
  'VITE_XLINK_R1_TYPED_PRIMITIVE_FIELDS',
  'VITE_XLINK_DYNAMIC_SCALAR_QA',
  'VITE_XLINK_R1_CATALOG_SCALE',
  'VITE_XLINK_R1_CATEGORY_FIXTURES',
  'VITE_XLINK_G05_REFUSAL',
  'VITE_XLINK_G05_MISS_FIRST_RECEIPT',
] as const

const enabledOptInFixtureEnv = Object.fromEntries(
  optInFixtureFlags
    .filter((name) => process.env[name] === 'true')
    .map((name) => [name, 'true']),
)
const hasSyntheticSpecialMedia = process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true'
  && process.env.VITE_XLINK_R1_SPECIAL_MEDIA === 'true'

// Default collection contains ordinary business flows only. Dedicated configs
// override testMatch with their own explicit files and synthetic grants.
// Runtime test.skip guards remain as a second check when a suite is mis-invoked.
const dedicatedSuites = [
  'brand-node-workspace.spec.ts',
  'configured-file-create.spec.ts',
  'configured-record-edit.spec.ts',
  'dev-mock-dynamic-form-workspace.spec.ts',
  'duplicate-file-fields.spec.ts',
  'forms-cascade-create.spec.ts',
  'forms-choice-create.spec.ts',
  'forms-mixed-create.spec.ts',
  'forms-scalar-subset.spec.ts',
  'generic-map-edit.spec.ts',
  'identity-submission.spec.ts',
  'map-choice-datetime-edit.spec.ts',
  'map-conditional-cascade-edit.spec.ts',
  'map-default-controls-edit.spec.ts',
  'map-remaining-scalars-edit.spec.ts',
  'normal-action-workspace.spec.ts',
  'normal-appointment-experience.spec.ts',
  'normal-form-draft-boundaries.spec.ts',
  'normal-form-fresh-original.spec.ts',
  'normal-r1-file-upload.spec.ts',
  'normal-r1-image-recovery.spec.ts',
  'normal-repeat-workspace.spec.ts',
  'normal-survey-cause-read.spec.ts',
  'ordinary-create-draft.spec.ts',
  'ordinary-create-plan.spec.ts',
  'ordinary-ui-atomicity.spec.ts',
  'p08-normal-file-targets.spec.ts',
  'repeat-appointment-edit.spec.ts',
  'role-field-visibility.spec.ts',
  'survey-59-read.spec.ts',
  'survey-conditional-create.spec.ts',
  'survey-first-media-save.spec.ts',
  'survey-part-create.spec.ts',
  'survey-regions-is-read.spec.ts',
  'switch-rate-create.spec.ts',
  'work-order-authority-revocation.spec.ts',
  'work-order-detail-load-lifecycle.spec.ts',
  'work-order-information-role.spec.ts',
  'work-order-refresh-navigation.spec.ts',
]
const unavailableFixtureSuites = [
  ...(process.env.VITE_XLINK_BRAND === 'yuhong' ? [] : ['brand-disabled-button.spec.ts']),
  ...(process.env.VITE_XLINK_R1_CATALOG_SCALE === 'true' ? [] : ['catalog-scale.spec.ts']),
  ...(process.env.VITE_XLINK_R1_DEEP_CASCADE === 'true' ? [] : ['deep-cascade-record.spec.ts']),
  ...(process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' ? [] : ['dev-mock-forms-repeat-quotation.spec.ts']),
  ...(process.env.VITE_XLINK_R1_SPECIAL_MEDIA === 'true' ? [] : ['dev-mock-special-media-conflict.spec.ts']),
  ...(process.env.VITE_XLINK_DYNAMIC_SCALAR_QA === 'true' ? [] : ['dynamic-form-scalar-closure.spec.ts']),
  ...(process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' ? [] : ['forms-save-process-readback.spec.ts']),
  ...(process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' && process.env.VITE_XLINK_R1_TYPED_PRIMITIVE_FIELDS === 'true' ? [] : ['mock-repeat-query.spec.ts']),
  ...(process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' ? [] : ['normal-survey-mock-reader.spec.ts']),
  ...(process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' && process.env.VITE_XLINK_R1_ARRAY_CASCADE_FIELDS === 'true' ? [] : ['r1-array-cascade-fields.spec.ts']),
  ...(process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' ? [] : ['r1-repeat-read.spec.ts']),
  ...(process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' ? [] : ['r1-source-formdef-multifield.spec.ts']),
  ...(process.env.VITE_XLINK_R1_TEMPORAL_RATING_FIELDS === 'true' ? [] : ['r1-temporal-rating-fields.spec.ts']),
  ...(process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' && process.env.VITE_XLINK_R1_TYPED_PRIMITIVE_FIELDS === 'true' ? [] : ['r1-typed-primitive-fields.spec.ts']),
  ...(process.env.VITE_XLINK_R1_BUSINESS_FIELDS === 'true' ? [] : ['special-business-record.spec.ts']),
]
const defaultBusinessFiles = new RegExp(
  `^(?!.*(?:${[...dedicatedSuites, ...unavailableFixtureSuites].map(name => name.replace(/\./g, '\\.')).join('|')})$).*\\.spec\\.ts$`,
)

/**
 * REAL uni-app main pages + normal application composition, but a DEV-only,
 * entirely local session fixture. Never read local real-user credentials.
 * This environment has an inert business API, no auth override and a strict
 * no-network browser guard in every test.
 */
export default defineConfig({
  testDir: rootPath('tests/h5-main-mock'),
  testMatch: defaultBusinessFiles,
  // Scoped edit suites need their own grants. P07/P08 additionally need both
  // opt-in 020/021 rows and synthetic writable media.
  testIgnore: [
    '**/brand-survey-host.spec.ts', '**/map-bizselect-scalar-edit.spec.ts', '**/existing-image-upload.spec.ts',
    '**/normal-form-draft-recovery.spec.ts', '**/normal-signing-eligibility.spec.ts', '**/retained-attachment-edit.spec.ts',
    '**/s01-normal-form.spec.ts', '**/work-order-information.spec.ts', '**/yuhong-review-a.spec.ts',
    ...(hasSyntheticSpecialMedia ? [] : ['**/p07-node-actions.spec.ts', '**/p08-attachment-targets.spec.ts']),
  ],
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
