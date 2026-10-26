import type { AuthSessionPort, SessionSnapshot } from '@shared/ports'
import { asOpaqueId, createOperationError } from '@shared/types'

/**
 * The ordinary main App's credential-free DEV QA identity. No storage, login
 * driver, real credentials, remote session or API request is involved.
 * Caller MUST enable this only through validated isolated DEV Mock config.
 * R1-shaped Work Order / Catalog fixtures still run through normal ports.
 */
export function createDevMockUxSessionPort(): AuthSessionPort {
  const fixture: SessionSnapshot = {
    sessionRef: asOpaqueId<'SessionRef'>('local-mock-only-session'),
    user: {
      id: asOpaqueId<'UserId'>('synthetic-user'),
      displayName: '王师傅',
    },
    currentRole: {
      id: asOpaqueId<'RoleId'>('synthetic-role'),
      name: '现场服务工程师',
    },
    roleVersion: 'local-dev-role-version-1',
    capabilityNames: ['work-order.read'],
  }
  let active: SessionSnapshot | null = fixture
  return {
    restoreSession: async () => {
      active = fixture
      return { state: 'succeeded', data: fixture }
    },
    getCurrentSession: () => active,
    startSession: async () => ({
      state: 'failed_terminal',
      error: createOperationError('unsupported_capability', 'DEV Mock UX does not support real login'),
    }),
    endSession: async () => {
      active = null
      return { state: 'succeeded' }
    },
  }
}
