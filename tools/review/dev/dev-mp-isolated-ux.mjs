import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Opt-in WeChat DEV simulator fixture, never a build/release profile.
 * Same inert business host and synthetic role as the H5 six-stage smoke.
 * Parent environment values must not be able to override these safeguards.
 */
export function isolatedMpUxEnvironment(parent = process.env) {
  return {
    ...parent,
    CI: 'true',
    VITE_XLINK_H5_MOCK_E2E: 'true',
    VITE_XLINK_H5_OFFLINE_SMOKE: 'false',
    VITE_XLINK_ENVIRONMENT: 'dev',
    VITE_XLINK_PLATFORM: 'mp-weixin',
    VITE_XLINK_API_BASE_URL: 'https://example.invalid',
    VITE_XLINK_AUTH_API_BASE_URL: '',
    VITE_XLINK_AUTH_TENANT: 'synthetic-qa-tenant',
    VITE_XLINK_AUTH_METHOD: 'phone',
    VITE_XLINK_MOCK: 'true',
    VITE_XLINK_ENABLE_REAL_WRITES: 'false',
    VITE_XLINK_QUICK_LOGIN_PHONE: '',
    VITE_XLINK_QUICK_LOGIN_CODE: '',
  }
}

export function launchIsolatedMpUx() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  const executable = resolve(root, 'node_modules/.bin/uni')
  const child = spawn(executable, ['-p', 'mp-weixin'], {
    cwd: root,
    env: isolatedMpUxEnvironment(),
    stdio: 'inherit',
    shell: false,
  })
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal))
  }
  child.once('error', error => {
    process.stderr.write(`Unable to launch isolated MP QA: ${error.message}\n`)
    process.exitCode = 1
  })
  child.once('exit', (code, signal) => {
    if (signal && signal !== 'SIGINT' && signal !== 'SIGTERM') process.exitCode = 1
    else process.exitCode = code ?? 0
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launchIsolatedMpUx()
}
