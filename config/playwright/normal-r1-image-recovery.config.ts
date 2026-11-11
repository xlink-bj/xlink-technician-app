import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { rootPath } from '../paths'

const origin = 'http://127.0.0.1:5189'
export default defineConfig({
  ...base,
  testMatch: 'normal-r1-image-recovery.spec.ts',
  outputDir: rootPath('test-results/normal-r1-image-recovery/attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/normal-r1-image-recovery/results.json') }]],
  use: { ...base.use, baseURL: origin, viewport: { width: 430, height: 932 }, trace: 'on', screenshot: 'on',
    ...(process.env.XLINK_NORMAL_FILE_CHROMIUM ? { launchOptions: { executablePath: process.env.XLINK_NORMAL_FILE_CHROMIUM } } : {}) },
  webServer: [{ command: 'node tests/support/normal-r1-image-receiver.mjs normal-r1-image-recovery', url: 'http://127.0.0.1:5334/health',
    cwd: rootPath(), reuseExistingServer: false, timeout: 15_000 },
  { command: './node_modules/.bin/uni -p h5 --host 127.0.0.1 --port 5189 --strictPort', url: origin,
    cwd: rootPath(), reuseExistingServer: false, timeout: 120_000,
    env: { UNI_CUSTOM_CONTEXT: '{"XLINK_DEV_QA":true}', UNI_OUTPUT_DIR: rootPath('unpackage/normal-r1-image-recovery-h5'),
      VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_PLATFORM: 'mp-weixin',
      VITE_XLINK_API_BASE_URL: origin + '/xlink/wm', VITE_XLINK_AUTH_API_BASE_URL: '',
      VITE_XLINK_AUTH_TENANT: 'synthetic-media-tenant', VITE_XLINK_AUTH_METHOD: 'phone',
      VITE_XLINK_QUICK_LOGIN_PHONE: '00000000000', VITE_XLINK_QUICK_LOGIN_CODE: '000000',
      VITE_XLINK_MOCK: 'false', VITE_XLINK_H5_MOCK_E2E: 'false', VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS: 'false',
      VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true',
      VITE_XLINK_R1_NODE_FORM_READ: 'true', VITE_XLINK_R1_FORMS_ACTIONS: 'true', VITE_XLINK_R1_REPEAT_ACTIONS: 'false',
      VITE_XLINK_R1_FORMS_GRANT: '{"version":1,"scope":{"tenantId":"synthetic-media-tenant","userId":"synthetic-media-user","roleId":"synthetic-media-role","workOrderId":"synthetic-media-work","workflowRunId":"synthetic-media-run","runtimeNodeId":"synthetic-media-node","formDefinitionId":"synthetic-media-def"},"expiresAt":"2099-01-01T00:00:00Z","fieldIds":["photo"],"operations":["create"]}', VITE_XLINK_R1_REPEAT_GRANT: '',
      VITE_XLINK_MEDIA_DOWNLOAD_BASE_URL: 'https://synthetic-normal-r1-file.invalid/objects' } }],
})
