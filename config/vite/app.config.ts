import { createRequire } from 'node:module'
import { uniH5PickerLifecycle } from './uni-h5-picker-lifecycle'

import { defineConfig, loadEnv } from 'vite'
import { repositoryRoot, sourceAliases } from '../paths'
import { assertDevProfile, declaredModeKeys, localH5Server } from './dev-profile'

const require = createRequire(import.meta.url)
const uni = require('@dcloudio/vite-plugin-uni').default

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, repositoryRoot, 'VITE_')
  // MP watch uses Vite's build command too; the explicit launch marker owns this check.
  const profile = process.env.XLINK_DEV_PROFILE
  assertDevProfile(profile, mode, env, profile ? declaredModeKeys(repositoryRoot, mode) : new Set())
  const productionProfile = mode === 'prod' || env.VITE_XLINK_ENVIRONMENT === 'prod'
  const redactProductionQuickLogin = productionProfile && command === 'build'

  return {
    // The credential-free browser smoke must own its origin. If 5173 is
    // occupied, fail instead of silently using 5174 or attaching to an old
    // dev server (which otherwise looks like a blank/unrelated login page).
    ...(process.env.VITE_XLINK_H5_MOCK_E2E === 'true'
      ? { server: { host: 'localhost', port: 5174, strictPort: true } }
      : process.env.VITE_XLINK_H5_OFFLINE_SMOKE === 'true'
        ? { server: { host: 'localhost', port: 5173, strictPort: true } }
        : profile === 'local' && process.env.UNI_PLATFORM === 'h5'
          ? { server: localH5Server } : {}),
    plugins: [uniH5PickerLifecycle(), uni()],
    resolve: { alias: sourceAliases },
    ...(redactProductionQuickLogin ? {
      // Local dev may use the ignored Production profile for an authorized
      // read-only inspection. Never embed its quick-login values in a bundle.
      define: {
        'import.meta.env.VITE_XLINK_QUICK_LOGIN_PHONE': JSON.stringify(''),
        'import.meta.env.VITE_XLINK_QUICK_LOGIN_CODE': JSON.stringify(''),
      },
    } : {}),
  }
})
