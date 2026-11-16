import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLocalNoticeStore } from '@app/notices/local-notices'
import { useSessionStore } from '@shared/state'
import { asOpaqueId, createOperationError } from '@shared/types'
import type { AuthSessionPort, SessionSnapshot } from '@shared/ports'

function identity(user: string): SessionSnapshot {
  return {
    sessionRef: asOpaqueId<'SessionRef'>(`synthetic-session-${user}`),
    user: { id: asOpaqueId<'UserId'>(user) },
    currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role') },
    roleVersion: 'v1', capabilityNames: ['work-order.read'],
  }
}

describe('local notice read scope', () => {
  beforeEach(() => setActivePinia(createPinia()))

  for (const failedLogout of [false, true]) {
    it(`clears read state on ${failedLogout ? 'failed' : 'successful'} logout before same-account login`, async () => {
      const session = useSessionStore()
      const notices = useLocalNoticeStore()
      const actor = identity('synthetic-user-a')
      const port: AuthSessionPort = {
        startSession: async () => ({ state: 'succeeded', data: actor }),
        restoreSession: async () => ({ state: 'succeeded', data: null }),
        getCurrentSession: () => null,
        endSession: async () => failedLogout
          ? { state: 'failed_terminal', error: createOperationError('server_terminal', 'Synthetic logout failure') }
          : { state: 'succeeded' },
      }
      session.configureAuth(port)
      await session.bootstrap()
      await session.login({ phoneNumber: 'synthetic', verificationCode: '123456' })
      notices.markRead('mock-notice-work-1', session.session)
      expect(notices.readIds).toEqual(['mock-notice-work-1'])

      await session.endSession()
      expect(notices.readIds).toEqual([])
      expect(session.status).toBe(failedLogout ? 'error' : 'unauthenticated')
      await session.login({ phoneNumber: 'synthetic', verificationCode: '123456' })
      expect(notices.readIds).toEqual([])
    })
  }

  it('clears read state when identity changes or the session becomes invalid', async () => {
    const session = useSessionStore()
    const notices = useLocalNoticeStore()
    let current = identity('synthetic-user-a')
    session.configureAuth({
      startSession: async () => ({ state: 'succeeded', data: current }),
      restoreSession: async () => ({ state: 'succeeded', data: null }),
      getCurrentSession: () => current,
      endSession: async () => ({ state: 'succeeded' }),
    })
    await session.bootstrap()
    await session.login({ phoneNumber: 'synthetic', verificationCode: '123456' })
    notices.markRead('mock-notice-work-1', session.session)
    current = identity('synthetic-user-b')
    session.session = current
    expect(notices.readIds).toEqual([])
    notices.markRead('mock-notice-service-1', session.session)
    session.status = 'unauthenticated'
    session.session = null
    expect(notices.readIds).toEqual([])
  })
})
