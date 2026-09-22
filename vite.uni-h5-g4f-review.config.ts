import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('.', import.meta.url))
const reviewInputDir = fileURLToPath(new URL('./review-app-g4f', import.meta.url))
const reviewOutputDir = fileURLToPath(new URL('./unpackage/g4f-phase1a-uni-h5', import.meta.url))

if (process.env.UNI_INPUT_DIR && process.env.UNI_INPUT_DIR !== reviewInputDir) {
  throw new Error(`UNI_INPUT_DIR must point to the isolated G4-F review app: ${reviewInputDir}`)
}
process.env.UNI_INPUT_DIR = reviewInputDir
process.env.UNI_CLI_CONTEXT = repositoryRoot
process.env.VITE_ROOT_DIR = reviewInputDir
process.env.UNI_OUTPUT_DIR = reviewOutputDir

const uni = require('@dcloudio/vite-plugin-uni').default

export default defineConfig({
  root: reviewInputDir,
  plugins: [uni()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@adapters': fileURLToPath(new URL('./src/adapters', import.meta.url)),
      '@runtimes': fileURLToPath(new URL('./src/runtimes', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
    },
  },
  define: {
    'import.meta.env.VITE_XLINK_ENVIRONMENT': JSON.stringify('dev'),
    'import.meta.env.VITE_XLINK_PLATFORM': JSON.stringify('mp-weixin'),
    'import.meta.env.VITE_XLINK_API_BASE_URL': JSON.stringify('https://mock-review.invalid'),
    'import.meta.env.VITE_XLINK_AUTH_TENANT': JSON.stringify('mock-review-tenant'),
    'import.meta.env.VITE_XLINK_AUTH_METHOD': JSON.stringify('mock-review-phone'),
    'import.meta.env.VITE_XLINK_MOCK': JSON.stringify('true'),
    'import.meta.env.VITE_XLINK_ENABLE_REAL_WRITES': JSON.stringify('false'),
  },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  build: { outDir: reviewOutputDir, emptyOutDir: true },
})
