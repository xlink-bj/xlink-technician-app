import { defineConfig } from '@playwright/test'
import mainAppMock from './playwright.main-h5-mock.config'

/**
 * Focused L2 screenshot runner: actual main uni-app H5, credential-free DEV
 * Mock and the same strict local-only browser environment as L3.
 * S2_FOCUS_SCREEN selects one of Q00/Q01/Q03; never capture all 50 frames.
 */
export default defineConfig({
  ...mainAppMock,
  testDir: './tests/s2-ux-focus',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  outputDir: 'test-results/s2-ux-focus/attachments',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/s2-ux-focus/results.json' }],
  ],
})
