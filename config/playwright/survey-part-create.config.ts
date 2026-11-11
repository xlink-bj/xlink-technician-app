import { defineConfig } from '@playwright/test'
import base from './repeat-appointment-edit.config'
import { rootPath } from '../paths'
export default defineConfig({
  ...base,
  testMatch: 'survey-part-create.spec.ts',
  outputDir: rootPath('test-results/survey-part-create/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/survey-part-create/results.json') }]],
  webServer: (Array.isArray(base.webServer) ? base.webServer : [base.webServer!]).map(server => ({
    ...server,
    env: { ...server.env,
      UNI_OUTPUT_DIR: rootPath('unpackage/survey-part-create-h5'),
      VITE_XLINK_R1_REPEAT_GRANT: JSON.stringify({
        version: 1,
        scope: { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: '7971040108398070730' },
        expiresAt: '2099-01-01T00:00:00Z',
        fieldIds: ['part', 'length', 'width', 'planeArea', 'memo'],
        operations: ['create', 'complete'],
      }),
    },
  })),
})
