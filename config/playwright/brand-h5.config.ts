import { defineConfig } from '@playwright/test'
import base from './main-h5-mock.config'
import { selectBrand } from '../vite/brand-profile'
import { rootPath } from '../paths'

const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const server = base.webServer as { env: Record<string, string> }

export default defineConfig({
  ...base,
  testMatch: ['brand-foundation.spec.ts', 'brand-detail.spec.ts', 'brand-quotation.spec.ts', 'brand-list.spec.ts'],
  reporter: [
    ['list'],
    ['json', { outputFile: rootPath(`test-results/brand-h5/${brand}/results.json`) }],
  ],
  webServer: {
    ...base.webServer,
    env: { ...server.env, VITE_XLINK_BRAND: brand },
  },
  use: {
    ...base.use,
    viewport: { width: 430, height: 932 },
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
})
