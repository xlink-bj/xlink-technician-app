import { defineConfig } from '@playwright/test'
import base from './survey-59-read.config'
import { rootPath } from '../paths'
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer
if (!server) throw Error('Normal readonly App server is required')
export default defineConfig({ ...base, testMatch: 'role-field-visibility.spec.ts', metadata: { roleFieldVisibility: true },
  outputDir: rootPath('test-results/role-field-visibility/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/role-field-visibility/results.json') }]],
  use: { ...base.use, launchOptions: { executablePath: process.env.XLINK_REPEAT_APPOINTMENT_CHROMIUM || undefined } },
  webServer: { ...server, env: { ...server.env, UNI_OUTPUT_DIR: rootPath('unpackage/role-field-visibility-h5') } },
})
