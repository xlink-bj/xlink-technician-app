import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { selectBrand } from '../vite/brand-profile'
import { rootPath } from '../paths'
const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const server = base.webServer as { env: Record<string, string> }
export default defineConfig({ ...base, testMatch: 'brand-node-workspace.spec.ts', timeout: 120000,
  outputDir: rootPath(`test-results/雨虹动态节点/${brand}/attachments`),
  reporter: [['list'], ['json', { outputFile: rootPath(`test-results/雨虹动态节点/${brand}/results.json`) }]],
  webServer: { ...base.webServer, env: { ...server.env, VITE_XLINK_BRAND: brand, VITE_XLINK_R1_MP_UX_FIXTURES: 'true', UNI_OUTPUT_DIR: rootPath(`unpackage/node-workspace-h5-${brand}`) } },
  use: { ...base.use, viewport: { width: 430, height: 932 }, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
})
