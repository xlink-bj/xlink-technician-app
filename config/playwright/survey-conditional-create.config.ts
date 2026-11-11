import { defineConfig } from '@playwright/test'
import base from './survey-part-create.config'
import { rootPath } from '../paths'
export default defineConfig({
  ...base,
  testMatch: 'survey-conditional-create.spec.ts',
  outputDir: rootPath('test-results/survey-conditional-create/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/survey-conditional-create/results.json') }]],
  webServer: (Array.isArray(base.webServer) ? base.webServer : [base.webServer!]).map(server => ({
    ...server,
    env: { ...server.env, UNI_OUTPUT_DIR: rootPath('unpackage/survey-conditional-create-h5'), VITE_XLINK_R1_REPEAT_GRANT: JSON.stringify({
      version: 1,
      scope: { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: '7971040108398070730' },
      expiresAt: '2099-01-01T00:00:00Z',
      fieldIds: ['part', 'length', 'width', 'planeArea', 'memo', 'height'],
      operations: ['create', 'complete'],
    }) },
  })),
})
