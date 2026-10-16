import { defineConfig } from '@playwright/test'
import original from './playwright.uni-h5-review.config'

export default defineConfig({
  ...original,
  testDir: './tests/ds02a-gallery',
  testMatch: '**/*.spec.ts',
  snapshotPathTemplate: '{testDir}/snapshots/{arg}{ext}',
  outputDir: 'test-results/ds02a-gallery',
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
