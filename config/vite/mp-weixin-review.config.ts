import { createRequire } from 'node:module'

import { defineConfig } from 'vite'
import { repositoryRoot, rootPath } from '../paths'

const require = createRequire(import.meta.url)
const defaultProductionInputDir = rootPath('src')
const reviewInputDir = rootPath('.review-input')
const reviewSourceDir = rootPath('.review-input/src')
const reviewOutputDir = rootPath('unpackage/design-system-mp-weixin')

// Keep the MP calibration build on the same review-only input root as H5.
// The uni CLI selects the target platform with -p mp-weixin; this config only
// isolates input/output and never changes production src/pages.json.
// The uni CLI preloads the repository src directory before evaluating a
// custom config. Accept that one official bootstrap value, but reject any
// unrelated caller-provided input root.
if (process.env.UNI_INPUT_DIR && ![defaultProductionInputDir, reviewInputDir].includes(process.env.UNI_INPUT_DIR)) {
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
    // Keep the canonical Gallery's review-root symlink identity so the MP
    // compiler emits valid page-relative chunk names without copying it.
    preserveSymlinks: true,
    alias: {
      '@': reviewSourceDir,
      '@app': `${reviewSourceDir}/app`,
      '@shared': `${reviewSourceDir}/shared`,
      '@adapters': `${reviewSourceDir}/adapters`,
      '@runtimes': `${reviewSourceDir}/runtimes`,
      '@features': `${reviewSourceDir}/features`,
    },
  },
  build: {
    outDir: reviewOutputDir,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // The MP compiler otherwise derives a relative chunk name from the
        // canonical Gallery file outside the isolated Review App input (for
        // example ../harness/design-system-gallery.js), which Rollup rejects.
        entryFileNames: 'app.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
