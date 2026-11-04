/**
 * Session identity used for in-memory read/cache invalidation. This is not an
 * authorization grant: role-listed resource provenance and the R1 server's
 * own permissions remain mandatory at every read boundary.
 */
export interface SessionAuthorizationIdentityParts {
  readonly sessionRef: string | null | undefined
  readonly userId: string | null | undefined
  readonly roleId: string | null | undefined
  /** R1 does not issue this on every login; absence is represented as null. */
  readonly roleVersion?: string | null
}

function validIdentityPart(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

/**
 * Builds a stable identity key from the actual authenticated session, user,
 * and role. The optional R1 role version is included when supplied and is an
 * explicit null otherwise; no version is fabricated from another field.
 */
export function sessionAuthorizationFingerprint(
  parts: SessionAuthorizationIdentityParts | null | undefined,
): string | null {
  if (!parts || !validIdentityPart(parts.sessionRef)
    || !validIdentityPart(parts.userId) || !validIdentityPart(parts.roleId)) return null
  const roleVersion = typeof parts.roleVersion === 'string' && parts.roleVersion.trim().length > 0
    ? parts.roleVersion.trim() === parts.roleVersion ? parts.roleVersion : null
    : null
  if (typeof parts.roleVersion === 'string' && parts.roleVersion.trim().length > 0 && roleVersion === null) return null
  return JSON.stringify([parts.sessionRef, parts.userId, parts.roleId, roleVersion])
}

/** Returns null unless a sensitive scoped flow has a real R1 role version. */
export function versionedSessionAuthorizationFingerprint(
  parts: SessionAuthorizationIdentityParts | null | undefined,
): string | null {
  if (!parts || !validIdentityPart(parts.roleVersion)) return null
  return sessionAuthorizationFingerprint(parts)
}
