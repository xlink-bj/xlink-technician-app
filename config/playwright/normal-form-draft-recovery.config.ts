import { defineConfig } from '@playwright/test'
import base from './forms-choice-create.config'
import { rootPath } from '../paths'

const server = base.webServer as { command: string; url: string; cwd: string; reuseExistingServer: boolean; timeout: number; env: Record<string, string> }
const origin = 'http://127.0.0.1:5189'
const existing = process.env.XLINK_DRAFT_EXISTING_EDIT === 'true'
const mode = existing ? 'existing2' : 'normal10'
const results = `test-results/normal-form-draft-recovery/${mode}`
const existingTitle = /old first-create discard/

export default defineConfig({
  ...base,
  testMatch: 'normal-form-draft-recovery.spec.ts',
  metadata: { ...base.metadata, normalFormDraftRecovery: true },
  ...(existing ? { grep: existingTitle, grepInvert: undefined } : { grep: undefined, grepInvert: existingTitle }),
  outputDir: rootPath(`${results}/attachments`),
  reporter: [['list'], ['json', { outputFile: rootPath(`${results}/results.json`) }]],
  use: {
    ...base.use,
    ...(process.env.XLINK_DRAFT_CHROME === 'true' ? { channel: 'chrome' as const } : {}),
    serviceWorkers: 'block',
    baseURL: origin,
  },
  webServer: {
    ...server,
    url: origin,
    env: {
      ...server.env,
      UNI_OUTPUT_DIR: rootPath(`unpackage/normal-form-draft-recovery-${mode}-h5`),
      VITE_XLINK_API_BASE_URL: `${origin}/xlink/wm`,
      ...(existing ? { VITE_XLINK_R1_FORMS_GRANT: JSON.stringify({ version: 2, scope: { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: 'e' }, fieldIds: ['memo'], operations: ['create', 'append', 'edit'], recordIds: ['existing'], expiresAt: '2099-01-01T00:00:00Z' }) } : {}),
      VITE_XLINK_R1_REPEAT_ACTIONS: 'true',
      VITE_XLINK_R1_REPEAT_GRANT: JSON.stringify({ version: 1, scope: { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: 'e' }, fieldIds: ['checks', 'multi', 'memo'], operations: ['create', 'complete'], expiresAt: '2099-01-01T00:00:00Z' }),
    },
  },
})
