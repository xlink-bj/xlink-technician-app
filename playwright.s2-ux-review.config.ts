import { defineConfig } from '@playwright/test'
import mainAppMock from './playwright.main-h5-mock.config'

/**
 * S2 review always captures the real uni-app main H5 shell, never a detached
 * UI proxy. Inherit the existing credential-free, write-disabled DEV Mock
 * webServer and browser settings; run ONLY the visual capture contract.
 */
export default defineConfig({
  ...mainAppMock,
  testDir: './tests/s2-ux-review',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  outputDir: 'test-results/s2-ux-review/attachments',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/s2-ux-review/results.json' }],
    ['html', { outputFolder: 'test-results/s2-ux-review/html', open: 'never' }],
  ],
})
