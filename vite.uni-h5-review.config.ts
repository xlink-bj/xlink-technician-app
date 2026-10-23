import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'

import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('.', import.meta.url))
const reviewInputDir = fileURLToPath(new URL('./review-app', import.meta.url))
const reviewOutputDir = fileURLToPath(new URL('./unpackage/design-system-uni-h5', import.meta.url))

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
