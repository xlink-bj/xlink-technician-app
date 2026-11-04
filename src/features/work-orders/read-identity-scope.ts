import type { SessionSnapshot } from '@shared/ports'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'

/** Ephemeral read-identity key; never saved, logged or sent to the backend. */
export function workOrderReadScopeKey(session: SessionSnapshot | null): string | null {
  return sessionAuthorizationFingerprint(session ? {
    sessionRef: session.sessionRef,
    userId: session.user?.id,
    roleId: session.currentRole?.id,
    roleVersion: session.roleVersion,
  } : null)
}
