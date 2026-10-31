import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { rootPath, sourceAliases } from '../paths'

/** Credential-free mount of the actual Production repeat panel. */
export default defineConfig({
  root: rootPath('tests/fixtures/r1-main-repeat-ui'),
  plugins: [vue()],
  envPrefix: ['VITE_R1_REPEAT_FIXTURE_'],
  resolve: {
    alias: {
      '@shared': sourceAliases['@shared'],
      '@features': sourceAliases['@features'],
    },
  },
  server: { host: '127.0.0.1', port: 5176, strictPort: true },
})
