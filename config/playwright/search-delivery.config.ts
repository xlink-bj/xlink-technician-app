import { defineConfig } from '@playwright/test'
import isolated from './catalog-scale.config'
import { rootPath } from '../paths'

// Same canonical App and isolated generated output/cache; no M08 fixture flag.
export default defineConfig({
  ...isolated,
  testMatch: 'search-delivery.spec.ts',
  outputDir: rootPath('test-results/search-delivery/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/search-delivery/results.json') }]],
})
