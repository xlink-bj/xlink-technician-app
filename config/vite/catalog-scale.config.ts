import { defineConfig } from 'vite'
import appConfig from './app.config'
import { rootPath } from '../paths'

// Keep dependency optimization as well as generated output away from an
// independently running real-read H5 compiler in this canonical checkout.
export default defineConfig(async env => {
  const base = await (typeof appConfig === 'function' ? appConfig(env) : appConfig)
  return {
    ...base,
    cacheDir: rootPath('unpackage/m08-vite-cache'),
    build: { ...base.build, outDir: rootPath('unpackage/m08-catalog-h5') },
    server: { ...base.server, watch: { ...base.server?.watch,
      ignored: ['**/.review/**', '**/test-results/**', '**/unpackage/**'],
    } },
  }
})
