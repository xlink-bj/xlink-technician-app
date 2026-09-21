import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // This is the retained raw semantic/state harness, not the canonical
  // uni-app H5 visual path. Keep it on plain Vue so its DOM remains stable
  // and the manual review shim remains explicitly scoped to this entry.
  plugins: [vue()],
  appType: 'spa',
  // Do not leak the developer shell's VITE_* credentials into the review bundle.
  // The review entry receives only the explicit Mock values below via define.
  envPrefix: ['VITE_REVIEW_'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@adapters': fileURLToPath(new URL('./src/adapters', import.meta.url)),
      '@runtimes': fileURLToPath(new URL('./src/runtimes', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue': fileURLToPath(new URL('./__review/review-uni-icons.vue', import.meta.url)),
    },
  },
  define: {
    'import.meta.env.VITE_XLINK_ENVIRONMENT': JSON.stringify('dev'),
    // H5 is only the browser host; runtime semantics target the reviewed MP build.
    'import.meta.env.VITE_XLINK_PLATFORM': JSON.stringify('mp-weixin'),
    'import.meta.env.VITE_XLINK_API_BASE_URL': JSON.stringify('https://mock-review.invalid'),
    'import.meta.env.VITE_XLINK_AUTH_TENANT': JSON.stringify('mock-review-tenant'),
    'import.meta.env.VITE_XLINK_AUTH_METHOD': JSON.stringify('mock-review-phone'),
    'import.meta.env.VITE_XLINK_MOCK': JSON.stringify('true'),
    'import.meta.env.VITE_XLINK_ENABLE_REAL_WRITES': JSON.stringify('false'),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
