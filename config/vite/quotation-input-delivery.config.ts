import { defineConfig } from 'vite'
import appConfig from './app.config'
import { rootPath } from '../paths'

// Isolate generated output/cache while testing the canonical normal App.
export default defineConfig(async env => {
  const base = await (typeof appConfig === 'function' ? appConfig(env) : appConfig)
  return {
    ...base,
    cacheDir: rootPath('unpackage/quotation-input-vite-cache'),
    build: { ...base.build, outDir: rootPath('unpackage/quotation-input-h5') },
    server: { ...base.server, watch: { ...base.server?.watch,
      ignored: ['**/.review/**', '**/test-results/**', '**/unpackage/**'],
    } },
  }
})
