import { defineConfig } from '@playwright/test'
import base from './configured-file-create.config'
import { rootPath } from '../paths'

const oldGrant = process.env.XLINK_CONFIGURED_READ_GRANT === 'old'
const tag = oldGrant ? 'old-grant' : 'no-grant'
const server = base.webServer as { command: string; url: string; cwd: string; reuseExistingServer: boolean; timeout: number; env: Record<string, string> }
export default defineConfig({ ...base,
  outputDir: rootPath(`test-results/configured-file-readonly-${tag}/attachments`),
  reporter: [['list'], ['json', { outputFile: rootPath(`test-results/configured-file-readonly-${tag}/results.json`) }]],
  webServer: { ...server, env: { ...server.env,
    UNI_OUTPUT_DIR: rootPath(`unpackage/configured-file-readonly-${tag}-h5`),
    VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false',
    VITE_XLINK_R1_REPEAT_ACTIONS: oldGrant ? 'true' : 'false',
    VITE_XLINK_R1_REPEAT_GRANT: oldGrant ? server.env.VITE_XLINK_R1_REPEAT_GRANT : '',
  } },
})
