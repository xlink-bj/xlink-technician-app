import { isAbsolute } from 'node:path'
import { defineConfig } from '@playwright/test'
import mainH5Mock from './main-h5-mock.config'
import { rootPath } from '../paths'

const chromeBinary = process.env.XLINK_G15_CHROME_BINARY
if (chromeBinary && !isAbsolute(chromeBinary)) throw new Error('XLINK_G15_CHROME_BINARY must be an absolute local path')

export default defineConfig({
  ...mainH5Mock,
  testMatch: '**/g15-g16-attachments.spec.ts',
  outputDir: rootPath('test-results/g15-g16-attachments'),
  reporter: [['list'], ['json', { outputFile: rootPath('test-results/g15-g16-attachments/results.json') }]],
  use: {
    ...mainH5Mock.use,
    viewport: { width: 430, height: 932 },
    ...(chromeBinary ? { launchOptions: { executablePath: chromeBinary } } : {}),
  },
})
