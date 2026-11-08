import { defineConfig } from '@playwright/test'
import isolated from './catalog-scale.config'
import { rootPath } from '../paths'

export default defineConfig({
  ...isolated,
  testMatch: 'work-order-categories.spec.ts',
  outputDir: rootPath('test-results/work-order-categories/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/work-order-categories/results.json') }]],
})
