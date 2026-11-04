import { describe, expect, it } from 'vitest'
import {
  sessionAuthorizationFingerprint,
  versionedSessionAuthorizationFingerprint,
} from '@shared/session-authorization'

const identity = {
  sessionRef: 'session-a',
  userId: 'user-a',
  roleId: 'role-a',
}

describe('shared R1 session authorization identity', () => {
  it('uses the real session, user, role and an explicit null for R1 logins without roleVersion', () => {
    const key = sessionAuthorizationFingerprint(identity)

    expect(key).toBe(JSON.stringify(['session-a', 'user-a', 'role-a', null]))
    expect(versionedSessionAuthorizationFingerprint(identity)).toBeNull()
  })

  it('keeps a supplied roleVersion in the identity and requires it for signing review', () => {
    const versioned = { ...identity, roleVersion: 'permission-revision-4' }

    expect(sessionAuthorizationFingerprint(versioned)).toBe(
      JSON.stringify(['session-a', 'user-a', 'role-a', 'permission-revision-4']),
    )
    expect(versionedSessionAuthorizationFingerprint(versioned)).toBe(
      sessionAuthorizationFingerprint(versioned),
    )
  })

  it.each([
    ['sessionRef', { ...identity, sessionRef: null }],
    ['userId', { ...identity, userId: '' }],
    ['roleId', { ...identity, roleId: ' role-a' }],
  ])('fails closed when the authenticated %s is missing or malformed', (_field, parts) => {
    expect(sessionAuthorizationFingerprint(parts)).toBeNull()
  })

  it('does not silently normalize a malformed supplied roleVersion', () => {
    expect(sessionAuthorizationFingerprint({ ...identity, roleVersion: ' revision-4 ' })).toBeNull()
  })
})
