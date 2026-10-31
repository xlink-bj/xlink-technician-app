import { defineConfig } from '@playwright/test'
import original from './main-h5-mock.config'
import { rootPath } from '../paths'

export default defineConfig({
  ...original,
  testDir: rootPath('tests/ds02a-main'),
  testMatch: '**/*.spec.ts',
  snapshotPathTemplate: '{testDir}/snapshots/{arg}{ext}',
  outputDir: rootPath('test-results/ds02a-main'),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  expect: {
    timeout: 20_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.004,
      threshold: 0.16,
    },
  },
  use: {
    ...original.use,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
})
