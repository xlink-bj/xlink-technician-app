import { defineConfig } from '@playwright/test'
import { rootPath } from '../paths'

// Test-support DOM contracts only; normal App coverage uses main-h5-mock.config.
export default defineConfig({
  testDir: rootPath('tests/h5-support'),
  testMatch: 'search-mock-work-order.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 10_000,
  expect: { timeout: 400 },
  outputDir: rootPath('test-results/mock-search-support/attachments'),
  reporter: [
    ['list'],
    ['json', { outputFile: rootPath('test-results/mock-search-support/results.json') }],
  ],
  use: { browserName: 'chromium', screenshot: 'off', trace: 'off' },
})
