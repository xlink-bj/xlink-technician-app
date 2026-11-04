# R1 session authorization identity

This is the shared method for binding authenticated read results and in-memory authorization caches to the current R1 login in DEV, Test and Production.

## Canonical identity

Use `sessionAuthorizationFingerprint()` from `src/shared/session-authorization.ts` with the values from the current `AuthSessionPort.getCurrentSession()`:

```ts
sessionAuthorizationFingerprint({
  sessionRef: session.sessionRef,
  userId: session.user.id,
  roleId: session.currentRole?.id,
  roleVersion: session.roleVersion,
})
```

The result is an in-memory identity tuple:

```text
[sessionRef, userId, currentRoleId, roleVersion-or-null]
```

R1 does not return `roleVersion` on every supported login. In that case, the tuple carries `null`. Do not synthesize a permission revision from role `updateTime`, menu data or another field. If session, user or role is missing or malformed, the helper returns `null` and the read remains denied.

## Security behavior

- This fingerprint identifies which login owns an in-flight read or cached role-listed resource. It is not an authorization grant.
- Keep endpoint allowlists, current-role provenance, resource ownership checks, server-side authorization and Production write guards in force.
- Recheck the identity after asynchronous reads. A changed session, user, role or supplied role version discards the result and clears identity-scoped caches.
- Use `versionedSessionAuthorizationFingerprint()` for flows that require a proven permission revision, including signing review, price-bearing catalog reads without a role-listed WorkOrder proof, and staged writes. It returns `null` when R1 did not supply a real role version.
- DEV Mock and Production may share this identity method while retaining their separate transport routes, mock fixtures and write policies.
- Never persist or log this tuple, session tokens, raw login responses or business identifiers.

## Regression coverage

`tests/engineering/session-authorization-fingerprint.test.ts`, `tests/engineering/r1-catalog-price-identity-fence.test.ts` and `tests/g4f/p0-order-raw-transport-fence.test.ts` cover absent `roleVersion`, incomplete identity, identity rotation and the strict versioned signing gate.
