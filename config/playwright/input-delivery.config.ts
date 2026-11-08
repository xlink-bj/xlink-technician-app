import { defineConfig } from '@playwright/test'
import isolated from './catalog-scale.config'
import { rootPath } from '../paths'

// Reuse the canonical-source isolated H5/cache setup, without enabling M08 data.
export default defineConfig({
  ...isolated,
  testMatch: 'input-delivery.spec.ts',
  outputDir: rootPath('test-results/input-delivery/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/input-delivery/results.json') }]],
})
