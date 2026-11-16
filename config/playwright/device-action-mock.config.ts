import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { selectBrand } from '../vite/brand-profile'
import { rootPath } from '../paths'

const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const server = base.webServer as { env: Record<string, string> }

export default defineConfig({
  ...base,
  testMatch: ['device-action-mock.spec.ts'],
  reporter: [['list'], ['json', { outputFile: rootPath(`test-results/device-action-mock/${brand}/results.json`) }]],
  webServer: { ...base.webServer, env: { ...server.env, VITE_XLINK_BRAND: brand,
    UNI_OUTPUT_DIR: rootPath(`unpackage/device-action-mock-${brand}`) } },
  use: { ...base.use, viewport: { width: 430, height: 932 },
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}) },
})
