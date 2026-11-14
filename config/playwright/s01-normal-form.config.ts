import { defineConfig } from '@playwright/test'
import base from './normal-action-workspace.config'
import { rootPath } from '../paths'

// Same real App and exact synthetic transport/grant as the normal Workspace
// regression. Local Chrome is opt-in through the inherited XLINK_DRAFT_CHROME;
// CI uses its version-matched Playwright Chromium.
export default defineConfig({
  ...base,
  testMatch: 's01-normal-form.spec.ts',
  outputDir: rootPath('test-results/s01/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/s01/mock-results.json') }]],
  use: { ...base.use, viewport: { width: 430, height: 932 }, trace: 'off' },
})
