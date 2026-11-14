import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Launch-time diagnostics only. Runtime permissions and integration grants stay
// in their existing owners. Never include environment values in an error.
export const remoteProfileKeys = [
  'VITE_XLINK_ENVIRONMENT', 'VITE_XLINK_API_BASE_URL', 'VITE_XLINK_MOCK',
  'VITE_XLINK_AUTH_API_BASE_URL', 'VITE_XLINK_AUTH_TENANT', 'VITE_XLINK_AUTH_METHOD',
  'VITE_XLINK_QUICK_LOGIN_PHONE', 'VITE_XLINK_QUICK_LOGIN_CODE',
  'VITE_XLINK_ENABLE_REAL_WRITES', 'VITE_XLINK_ENABLE_R1_SPECIAL_WRITES',
] as const

export function declaredModeKeys(root: string, mode: string): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const name of [`.env.${mode}`, `.env.${mode}.local`]) {
    const path = resolve(root, name)
    if (!existsSync(path)) continue
    for (const match of readFileSync(path, 'utf8').matchAll(/^\s*(?:export\s+)?(VITE_[A-Za-z0-9_]+)\s*=/gm)) keys.add(match[1])
  }
  return keys
}

export function assertDevProfile(profile: string | undefined, mode: string, env: Readonly<Record<string, unknown>>,
  declared: ReadonlySet<string>, shell: Readonly<Record<string, unknown>> = process.env): void {
  if (!profile) return // Existing explicit integration/test launchers are unchanged.
  const known = ['local', 'beta', 'prod-readonly'].includes(profile)
  const fail = (reason: string): never => { throw new Error(`Development profile ${known ? profile : 'unknown'}: ${reason}`) }
  if (!known) fail('unknown profile')
  const url = (key: string): URL => {
    try {
      const value = new URL(String(env[key] ?? ''))
      if (!['http:', 'https:'].includes(value.protocol) || value.username || value.password || value.search || value.hash) throw Error()
      return value
    } catch { return fail(`${key} is not a valid API base URL`) }
  }
  const api = url('VITE_XLINK_API_BASE_URL')
  if (env.VITE_XLINK_MOCK !== 'false') fail('VITE_XLINK_MOCK must be false; use the explicit Mock entry for synthetic data')
  if (['VITE_XLINK_H5_MOCK_E2E', 'VITE_XLINK_H5_OFFLINE_SMOKE', 'VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS']
    .some(key => env[key] === 'true')) fail('inherited Mock fixture flags must be cleared')
  if (profile === 'local') {
    if (env.VITE_XLINK_ENVIRONMENT !== 'dev' || api.origin !== 'http://127.0.0.1:5189'
      || api.pathname.replace(/\/$/, '') !== '/xlink/wm') fail('default local startup requires dev and http://127.0.0.1:5189/xlink/wm; migrate the private local profile first')
  } else {
    const expectedMode = profile === 'beta' ? 'beta' : 'prod'
    if (mode !== expectedMode) fail(`use --mode ${expectedMode}`)
    const missing = remoteProfileKeys.filter(key => !declared.has(key))
    if (missing.length) fail(`declare or explicitly blank these keys in .env.${expectedMode}.local: ${missing.join(', ')}`)
    const shellKeys = ['VITE_XLINK_AUTH_API_BASE_URL', 'VITE_XLINK_AUTH_TENANT', 'VITE_XLINK_QUICK_LOGIN_PHONE', 'VITE_XLINK_QUICK_LOGIN_CODE']
      .filter(key => typeof shell[key] === 'string' && String(shell[key]).trim())
    if (shellKeys.length) fail(`clear shell credential overrides before selecting a remote profile: ${shellKeys.join(', ')}`)
    const hostname = profile === 'beta' ? 'xlinkbeta.fsgo365.cn' : 'xlink.fsgo365.cn'
    const environment = profile === 'beta' ? 'test' : 'prod'
    if (env.VITE_XLINK_ENVIRONMENT !== environment || api.protocol !== 'https:' || api.hostname !== hostname) fail('environment and API target do not match the selected profile')
    if (env.VITE_XLINK_ENABLE_REAL_WRITES !== 'false' || env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES !== 'false') fail('remote startup requires both existing write flags to be false')
    const localKeys = Object.keys(env).filter(key => (/^VITE_XLINK_.*_GRANT$/.test(key)
      || ['VITE_XLINK_LOCAL_SESSION_RESTORE', 'VITE_XLINK_LOCAL_SIGNING_READ'].includes(key)) && env[key])
    if (localKeys.length) fail(`explicitly clear inherited local integration settings: ${localKeys.join(', ')}`)
  }
  if (env.VITE_XLINK_AUTH_API_BASE_URL) {
    if (url('VITE_XLINK_AUTH_API_BASE_URL').href.replace(/\/$/, '') !== api.href.replace(/\/$/, '')) fail('VITE_XLINK_AUTH_API_BASE_URL must be blank or match this profile API')
  }
}

export const localH5Server = {
  host: '127.0.0.1', port: 5189, strictPort: true,
  proxy: { '/xlink': { target: 'http://127.0.0.1:18080', changeOrigin: false } },
} as const
