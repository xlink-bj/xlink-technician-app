import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnv } from 'vite'
import { assertDevProfile, declaredModeKeys, localH5Server, remoteProfileKeys } from '../../config/vite/dev-profile'
import { betaProfileEnvironment } from '../../scripts/beta-api-client.mjs'

const beta = () => ({ VITE_XLINK_ENVIRONMENT: 'test', VITE_XLINK_API_BASE_URL: 'https://xlinkbeta.fsgo365.cn/fsgo/wm/',
  VITE_XLINK_MOCK: 'false', VITE_XLINK_AUTH_API_BASE_URL: '', VITE_XLINK_AUTH_TENANT: 'synthetic-beta-tenant',
  VITE_XLINK_AUTH_METHOD: 'phone', VITE_XLINK_QUICK_LOGIN_PHONE: '', VITE_XLINK_QUICK_LOGIN_CODE: '',
  VITE_XLINK_ENABLE_REAL_WRITES: 'false', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'false' })
const keys = new Set(remoteProfileKeys)
const roots: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('explicit dev launch profiles, no HTTP or runtime authority', () => {
  it('keeps existing bare integration launches unchanged and local grants under their current owner', () => {
    expect(() => assertDevProfile(undefined, 'development', {}, new Set(), {})).not.toThrow()
    expect(() => assertDevProfile('local', 'development', { ...beta(), VITE_XLINK_ENVIRONMENT: 'dev',
      VITE_XLINK_API_BASE_URL: 'http://127.0.0.1:5189/xlink/wm', VITE_XLINK_ENABLE_REAL_WRITES: 'true' }, new Set(), {})).not.toThrow()
    expect(localH5Server).toEqual({ host: '127.0.0.1', port: 5189, strictPort: true,
      proxy: { '/xlink': { target: 'http://127.0.0.1:18080', changeOrigin: false } } })
  })
  it('refuses the old Beta default and a local API with an inherited remote auth API', () => {
    expect(() => assertDevProfile('local', 'development', beta(), keys, {})).toThrow('default local startup')
    expect(() => assertDevProfile('local', 'development', { ...beta(), VITE_XLINK_ENVIRONMENT: 'dev',
      VITE_XLINK_API_BASE_URL: 'http://127.0.0.1:5189/xlink/wm', VITE_XLINK_AUTH_API_BASE_URL: 'https://xlinkbeta.fsgo365.cn/fsgo/wm' }, keys, {})).toThrow('AUTH_API_BASE_URL')
  })
  it('accepts explicitly selected Beta and production readonly profiles', () => {
    expect(() => assertDevProfile('beta', 'beta', beta(), keys, {})).not.toThrow()
    expect(() => assertDevProfile('prod-readonly', 'prod', { ...beta(), VITE_XLINK_ENVIRONMENT: 'prod',
      VITE_XLINK_API_BASE_URL: 'https://xlink.fsgo365.cn/fsgo/wm' }, keys, {})).not.toThrow()
  })
  it.each([
    { mode: 'development' }, { VITE_XLINK_ENVIRONMENT: 'dev' },
    { VITE_XLINK_API_BASE_URL: 'http://127.0.0.1:5189/xlink/wm' },
    { VITE_XLINK_ENABLE_REAL_WRITES: 'true' }, { VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true' },
    { VITE_XLINK_MOCK: 'true' }, { VITE_XLINK_R1_REPEAT_GRANT: 'do-not-log-this-value' },
    { VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS: 'true' },
    { VITE_XLINK_LOCAL_SIGNING_READ: 'normal-order-readonly-v1' },
  ])('rejects mismatched or inherited remote settings %j', change => {
    const { mode, ...env } = change
    expect(() => assertDevProfile('beta', mode ?? 'beta', { ...beta(), ...env }, keys, {})).toThrow()
  })
  it('does not echo shell credentials or malformed URL values in errors', () => {
    for (const call of [
      () => assertDevProfile('PRIVATE_SENTINEL', 'beta', beta(), keys, {}),
      () => assertDevProfile('beta', 'beta', beta(), keys, { VITE_XLINK_QUICK_LOGIN_CODE: 'PRIVATE_SENTINEL' }),
      () => assertDevProfile('beta', 'beta', { ...beta(), VITE_XLINK_API_BASE_URL: 'PRIVATE_SENTINEL' }, keys, {}),
    ]) {
      expect(call).toThrow()
      try { call() } catch (error) { expect(String(error)).not.toContain('PRIVATE_SENTINEL') }
    }
  })
  it('detects actual Vite dotenv inheritance instead of silently borrowing local tenant and login values', () => {
    const root = mkdtempSync(join(tmpdir(), 'xlink-profile-')); roots.push(root)
    for (const key of remoteProfileKeys) vi.stubEnv(key, undefined)
    writeFileSync(join(root, '.env.local'), 'VITE_XLINK_AUTH_TENANT=local-only\nVITE_XLINK_QUICK_LOGIN_PHONE=LOCAL_PRIVATE_SENTINEL\n')
    writeFileSync(join(root, '.env.beta.local'), 'VITE_XLINK_ENVIRONMENT=test\nVITE_XLINK_API_BASE_URL=https://xlinkbeta.fsgo365.cn/fsgo/wm\nVITE_XLINK_MOCK=false\n')
    const inherited = loadEnv('beta', root, 'VITE_')
    expect(inherited.VITE_XLINK_AUTH_TENANT).toBe('local-only')
    expect(() => assertDevProfile('beta', 'beta', inherited, declaredModeKeys(root, 'beta'), {})).toThrow('declare or explicitly blank')
    writeFileSync(join(root, '.env.beta.local'), Object.entries(beta()).map(([key, value]) => `${key}=${value}`).join('\n'))
    const explicit = loadEnv('beta', root, 'VITE_')
    expect(explicit.VITE_XLINK_QUICK_LOGIN_PHONE).toBe('')
    expect(() => assertDevProfile('beta', 'beta', explicit, declaredModeKeys(root, 'beta'), {})).not.toThrow()
    expect(betaProfileEnvironment(root, {}).VITE_XLINK_QUICK_LOGIN_PHONE).toBe('')
    rmSync(join(root, '.env.beta.local'))
    expect(betaProfileEnvironment(root, {})).not.toHaveProperty('VITE_XLINK_QUICK_LOGIN_PHONE')
  })
})
