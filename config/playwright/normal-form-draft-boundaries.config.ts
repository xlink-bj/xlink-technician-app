import { defineConfig } from '@playwright/test'
import base from './normal-form-draft-recovery.config'
import { rootPath } from '../paths'
const server = base.webServer as { env: Record<string,string> }
export default defineConfig({
  ...base,
  testMatch: 'normal-form-draft-boundaries.spec.ts',
  grep: undefined, grepInvert: undefined,
  metadata: { ...base.metadata, normalFormDraftBoundaries: true },
  outputDir: rootPath('test-results/normal-form-draft-boundaries/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/normal-form-draft-boundaries/results.json') }]],
  webServer: { ...base.webServer as object, env: { ...server.env,
    UNI_OUTPUT_DIR: rootPath('unpackage/normal-form-draft-boundaries-h5'),
  } },
})
