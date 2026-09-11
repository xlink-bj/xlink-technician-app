import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { AuthSessionPort, AuthStartRequest, SessionSnapshot } from '@shared/ports'
import { createOperationError, asOpaqueId } from '@shared/types'
import { loadApplicationRuntimeConfig } from '@app/runtime-config'
import { useSessionStore } from '@shared/state'
import {
  submitLogin,
  validateLoginInput,
  type LoginSubmissionState,
} from '@features/session/login'
import type { OperationSnapshot } from '@shared/types'

const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('sanitized-session-token'),
  user: {
    id: asOpaqueId<'UserId'>('sanitized-user-id'),
    displayName: 'Sanitized Technician',
  },
  currentRole: {
    id: asOpaqueId<'RoleId'>('sanitized-role-id'),
    name: 'Technician',
  },
  capabilityNames: ['work-order.read'],
}

function success<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function createAuthSession(overrides: Partial<AuthSessionPort> = {}): AuthSessionPort {
  return {
    startSession: async () => success(session),
    restoreSession: async () => success(null),
    getCurrentSession: () => null,
    endSession: async () => ({ state: 'succeeded' }),
    ...overrides,
  }
}

describe('G4-A login form boundary', () => {
  it('validates only the bounded phone and verification-code intent', () => {
    expect(validateLoginInput({ phoneNumber: ' ', verificationCode: '123456' })).toBe('Phone number is required')
    expect(validateLoginInput({ phoneNumber: 'test-phone', verificationCode: ' ' })).toBe(
      'Verification code is required',
    )
    expect(validateLoginInput({ phoneNumber: 'test-phone', verificationCode: '123456' })).toBeUndefined()
  })

  it('prevents double submit while the first login is pending', async () => {
    const state: LoginSubmissionState = { inFlight: false }
    let resolvePending!: (result: OperationSnapshot<SessionSnapshot>) => void
    const pending = new Promise<OperationSnapshot<SessionSnapshot>>((resolve) => {
      resolvePending = resolve
    })
    const startSession = vi.fn((_request: AuthStartRequest) => pending)
    const input = { phoneNumber: 'test-phone', verificationCode: 'test-code' }

    const first = submitLogin(input, state, startSession)
    expect(state.inFlight).toBe(true)

    const second = await submitLogin(input, state, startSession)
    expect(second.state).toBe('failed_terminal')
    expect(second.error?.category).toBe('validation')
    expect(startSession).toHaveBeenCalledTimes(1)

    resolvePending(success(session))
    expect((await first).state).toBe('succeeded')
    expect(state.inFlight).toBe(false)
  })
})

describe('G4-A session store and runtime configuration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps runtime wire configuration outside the shared semantic login input', () => {
    const configured = loadApplicationRuntimeConfig({
      VITE_XLINK_ENVIRONMENT: 'test',
      VITE_XLINK_PLATFORM: 'mp-weixin',
      VITE_XLINK_API_BASE_URL: 'https://beta.example.invalid',
      VITE_XLINK_AUTH_TENANT: 'sanitized-tenant',
      VITE_XLINK_AUTH_METHOD: 'sanitized-phone-login-method',
    })
    expect(configured.ok).toBe(true)
    expect(loadApplicationRuntimeConfig({}).ok).toBe(false)
  })

  it('bootstraps no session, authenticates normalized session, and stores no login input', async () => {
    const store = useSessionStore()
    const startSession = vi.fn(async (request: AuthStartRequest) => {
      expect(request).toEqual({ phoneNumber: 'test-phone', verificationCode: 'test-code' })
      return success(session)
    })
    store.configureAuth(createAuthSession({ startSession }))

    expect((await store.bootstrap()).data).toBeNull()
    expect(store.status).toBe('unauthenticated')

    expect((await store.login({ phoneNumber: 'test-phone', verificationCode: 'test-code' })).state).toBe('succeeded')
    expect(store.status).toBe('authenticated')
    expect(store.session?.sessionRef).toBe('sanitized-session-token')
    expect(JSON.stringify(store.$state)).not.toContain('test-phone')
    expect(JSON.stringify(store.$state)).not.toContain('test-code')
  })

  it('blocks login during bootstrap and prevents a stale restore from overwriting login state', async () => {
    const store = useSessionStore()
    let resolveRestore!: (result: OperationSnapshot<SessionSnapshot | null>) => void
    const restorePending = new Promise<OperationSnapshot<SessionSnapshot | null>>((resolve) => {
      resolveRestore = resolve
    })
    const startSession = vi.fn(async () => success(session))
    store.configureAuth(
      createAuthSession({
        restoreSession: async () => restorePending,
        startSession,
      }),
    )

    const bootstrap = store.bootstrap()
    expect(store.status).toBe('unknown')
    expect(store.bootstrapInProgress).toBe(true)

    const blocked = await store.login({ phoneNumber: 'test-phone', verificationCode: 'test-code' })
    expect(blocked.state).toBe('failed_terminal')
    expect(blocked.error?.category).toBe('validation')
    expect(startSession).not.toHaveBeenCalled()

    resolveRestore(success(null))
    expect((await bootstrap).data).toBeNull()
    expect(store.status).toBe('unauthenticated')
    expect(store.bootstrapInProgress).toBe(false)

    expect((await store.login({ phoneNumber: 'test-phone', verificationCode: 'test-code' })).state).toBe('succeeded')
    expect(startSession).toHaveBeenCalledTimes(1)
    expect(store.status).toBe('authenticated')
  })

  it('routes a normalized persisted session to the authenticated shell', async () => {
    const store = useSessionStore()
    store.configureAuth(createAuthSession({ restoreSession: async () => success(session) }))

    const result = await store.bootstrap()
    expect(result.data?.user.id).toBe('sanitized-user-id')
    expect(store.status).toBe('authenticated')
  })

  it('routes session-invalid to login and preserves retryable versus terminal errors', async () => {
    const invalidStore = useSessionStore()
    invalidStore.configureAuth(
      createAuthSession({
        restoreSession: async () => ({
          state: 'failed_terminal',
          error: createOperationError('session_invalid', 'Stored session is invalid'),
        }),
      }),
    )
    await invalidStore.bootstrap()
    expect(invalidStore.status).toBe('unauthenticated')
    expect(invalidStore.error?.category).toBe('session_invalid')

    const retryableStore = useSessionStore()
    retryableStore.configureAuth(
      createAuthSession({
        startSession: async () => ({
          state: 'failed_retryable',
          error: createOperationError('network_retryable', 'Temporary network failure'),
        }),
      }),
    )
    await retryableStore.login({ phoneNumber: 'test-phone', verificationCode: 'test-code' })
    expect(retryableStore.status).toBe('error')
    expect(retryableStore.error?.category).toBe('network_retryable')

    const terminalStore = useSessionStore()
    terminalStore.configureAuth(
      createAuthSession({
        startSession: async () => ({
          state: 'failed_terminal',
          error: createOperationError('server_terminal', 'Invalid login response'),
        }),
      }),
    )
    await terminalStore.login({ phoneNumber: 'test-phone', verificationCode: 'test-code' })
    expect(terminalStore.status).toBe('error')
    expect(terminalStore.error?.category).toBe('server_terminal')
  })
})
