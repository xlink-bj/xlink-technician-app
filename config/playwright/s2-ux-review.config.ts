import { defineConfig } from '@playwright/test'
import mainAppMock from './main-h5-mock.config'
import { rootPath } from '../paths'

/**
 * S2 review always captures the real uni-app main H5 shell, never a detached
 * UI proxy. Inherit the existing credential-free, write-disabled DEV Mock
 * webServer and browser settings; run ONLY the visual capture contract.
 */
export default defineConfig({
  ...mainAppMock,
  testDir: rootPath('tests/s2-ux-review'),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  outputDir: rootPath('test-results/s2-ux-review/attachments'),
  reporter: [
    ['list'],
    ['json', { outputFile: rootPath('test-results/s2-ux-review/results.json') }],
    ['html', { outputFolder: rootPath('test-results/s2-ux-review/html'), open: 'never' }],
  ],
})
