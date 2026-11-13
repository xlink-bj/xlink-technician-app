import { defineConfig } from '@playwright/test'
import base from './forms-scalar-subset.config'
import { rootPath } from '../paths'
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer
if (!server) throw Error('Normal App server is required')
export default defineConfig({ ...base, testMatch: 'identity-submission.spec.ts', metadata: { identitySubmission: true },
  outputDir: rootPath('test-results/identity-submission/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/identity-submission/results.json') }]],
  use: { ...base.use, viewport: { width: 430, height: 932 },
    launchOptions: { executablePath: process.env.XLINK_REPEAT_APPOINTMENT_CHROMIUM || undefined } },
  webServer: { ...server, env: { ...server.env, UNI_OUTPUT_DIR: rootPath('unpackage/identity-submission-h5'),
    VITE_XLINK_R1_FORMS_GRANT: JSON.stringify({ version: 2,
      scope: { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: 'e' },
      expiresAt: '2099-01-01T00:00:00Z', fieldIds: ['identity-field'], recordIds: ['a'], operations: ['edit', 'save_finish'] }) } },
})
