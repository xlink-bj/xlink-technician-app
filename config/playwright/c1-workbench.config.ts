import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { rootPath } from '../paths'
const brand = process.env.VITE_XLINK_BRAND === 'yuhong' ? 'yuhong' : 'xlink'
const port = brand === 'yuhong' ? 5190 : 5191
const baseURL = `http://localhost:${port}`
const server = base.webServer as { env: Record<string, string> }
export default defineConfig({
  ...base,
  testMatch: ['c1-workbench.spec.ts', 'brand-home.spec.ts', 'main-shell.spec.ts', 'b-appointment-review.spec.ts'],
  outputDir: rootPath(`test-results/c1-${brand}`),
  reporter: [['list'], ['json', { outputFile: rootPath(`test-results/c1-${brand}/results.json`) }]],
  webServer: { ...base.webServer, command: `./node_modules/.bin/uni -p h5 --port ${port}`, url: baseURL,
    env: { ...server.env, VITE_XLINK_BRAND: brand, UNI_OUTPUT_DIR: rootPath(`unpackage/c1-${brand}`) } },
  use: { ...base.use, baseURL, viewport: { width: 430, height: 932 },
    ...(process.env.PW_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH } } : {}) },
})
