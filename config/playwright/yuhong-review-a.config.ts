import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { rootPath } from '../paths'
const brand = process.env.VITE_XLINK_BRAND || 'yuhong'
const phase = process.env.REVIEW_PHASE || 'after'
const port = brand === 'yuhong' ? 5186 : 5187
const baseURL = `http://localhost:${port}`
const server = base.webServer as { env: Record<string, string> }
export default defineConfig({
  ...base,
  testMatch: ['yuhong-review-a.spec.ts', 'brand-signing-read.spec.ts', 'brand-signing-read-feedback.spec.ts'],
  outputDir: rootPath(`test-results/review-a/${brand}-${phase}`),
  reporter: [['list'], ['json', { outputFile: rootPath(`.review/雨虹UIUX优化-20261116/A订单与签约/${brand}-${phase}/results.json`) }]],
  webServer: { ...base.webServer, command: `./node_modules/.bin/uni -p h5 --port ${port}`, url: baseURL,
    env: { ...server.env, VITE_XLINK_BRAND: brand, UNI_OUTPUT_DIR: rootPath(`unpackage/review-a-${brand}`) } },
  use: { ...base.use, baseURL, channel: 'chrome', viewport: { width: 430, height: 932 } },
})
