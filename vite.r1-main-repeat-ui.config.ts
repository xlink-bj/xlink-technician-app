import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/** Credential-free mount of the actual Production repeat panel. */
export default defineConfig({
  root: fileURLToPath(new URL('./tests/fixtures/r1-main-repeat-ui', import.meta.url)),
  plugins: [vue()],
  envPrefix: ['VITE_R1_REPEAT_FIXTURE_'],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
    },
  },
  server: { host: '127.0.0.1', port: 5176, strictPort: true },
})
