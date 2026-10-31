import { defineConfig } from '@playwright/test'
import original from './uni-h5-review.config'
import { rootPath } from '../paths'

export default defineConfig({
  ...original,
  testDir: rootPath('tests/ds02a-gallery'),
  testMatch: '**/*.spec.ts',
  snapshotPathTemplate: '{testDir}/snapshots/{arg}{ext}',
  outputDir: rootPath('test-results/ds02a-gallery'),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  expect: {
    timeout: 25_000,
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
