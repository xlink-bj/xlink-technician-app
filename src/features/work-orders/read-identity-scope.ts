import type { SessionSnapshot } from '@shared/ports'

/** Ephemeral read-identity key; never saved, logged or sent to the backend. */
export function workOrderReadScopeKey(session: SessionSnapshot | null): string | null {
  if (!session?.sessionRef || !session.user?.id) return null
  return JSON.stringify([
    session.sessionRef, session.user.id,
    session.currentRole?.id ?? null, session.roleVersion ?? null,
  ])
}
