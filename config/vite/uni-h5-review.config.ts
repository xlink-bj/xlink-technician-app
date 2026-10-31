import { createRequire } from 'node:module'

import { defineConfig } from 'vite'
import { repositoryRoot, rootPath, sourceAliases } from '../paths'

const require = createRequire(import.meta.url)
const reviewInputDir = rootPath('tools/review/uni-gallery')
const reviewOutputDir = rootPath('unpackage/design-system-uni-h5')

// UNI_INPUT_DIR is the installed uni-app toolchain's supported alternate
// input-root mechanism. Keep it explicit and review-only; production builds
// continue to resolve their input from the repository's src directory.
if (process.env.UNI_INPUT_DIR && process.env.UNI_INPUT_DIR !== reviewInputDir) {
  throw new Error(`UNI_INPUT_DIR must point to the review app: ${reviewInputDir}`)
}
process.env.UNI_INPUT_DIR = reviewInputDir
process.env.UNI_CLI_CONTEXT = repositoryRoot
process.env.VITE_ROOT_DIR = reviewInputDir
process.env.UNI_OUTPUT_DIR = reviewOutputDir

const uni = require('@dcloudio/vite-plugin-uni').default

export default defineConfig({
  root: reviewInputDir,
  cacheDir: rootPath('.cache/vite-uni-gallery-review'),
  plugins: [uni()],
  resolve: { alias: sourceAliases },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: reviewOutputDir,
    emptyOutDir: true,
  },
})
