import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import { repositoryRoot, rootPath, sourceAliases } from '../paths'

const require = createRequire(import.meta.url)
const reviewInputDir = rootPath('tools/review/quotation-demo')
const reviewOutputDir = rootPath('unpackage/g4f-phase1a-uni-h5')

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
  cacheDir: rootPath('.cache/vite-g4f-quotation-review'),
  plugins: [uni()],
  resolve: { alias: sourceAliases },
  define: {
    'import.meta.env.VITE_XLINK_ENVIRONMENT': JSON.stringify('dev'),
    'import.meta.env.VITE_XLINK_PLATFORM': JSON.stringify('mp-weixin'),
    'import.meta.env.VITE_XLINK_API_BASE_URL': JSON.stringify('https://mock-review.invalid'),
    // R1 i/code/selectCode.do uses this fixed Code dictionary tenant. The
    // review server keeps the business API host inert, so matching the wire
    // tenant exercises the real adapter contract without live network access.
    'import.meta.env.VITE_XLINK_AUTH_TENANT': JSON.stringify('1340835581184723420'),
    'import.meta.env.VITE_XLINK_AUTH_METHOD': JSON.stringify('mock-review-phone'),
    'import.meta.env.VITE_XLINK_MOCK': JSON.stringify('true'),
    'import.meta.env.VITE_XLINK_ENABLE_REAL_WRITES': JSON.stringify('false'),
  },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  build: { outDir: reviewOutputDir, emptyOutDir: true },
})
