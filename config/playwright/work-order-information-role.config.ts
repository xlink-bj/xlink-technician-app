import { defineConfig } from '@playwright/test'
import base from './work-order-information.config'
import { rootPath } from '../paths'
export default defineConfig({ ...base, testMatch: 'work-order-information-role.spec.ts', metadata: { informationRole: true },
  outputDir: rootPath('test-results/work-order-information-role/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/work-order-information-role/results.json') }]],
  use: { ...base.use, launchOptions: { executablePath: process.env.XLINK_REPEAT_APPOINTMENT_CHROMIUM || undefined } },
})
