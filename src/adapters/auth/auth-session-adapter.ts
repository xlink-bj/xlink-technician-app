import type { AuthSessionPort, AuthStartRequest, SessionSnapshot, StoragePort } from '@shared/ports'
import type { OperationSnapshot, SessionRef } from '@shared/types'
import { asOpaqueId } from '@shared/types'

import { adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'
import {
  asRecord,
  consistentWireIdentity,
  nestedRecord,
  nestedValue,
  optionalString,
  requiredString,
  type AdapterRecord,
} from '../common/records'

export interface AuthBackendLoginRequest {
  readonly path: 'index/phoneLogin.do'
  readonly body: Readonly<Record<string, string>>
}

/** Adapter-only wire values; never part of shared session or login contracts. */
export interface AuthWireConfig {
  readonly tenant: string
  readonly phoneLoginMethod: string
}

export interface AuthBackendDriver {
  login(request: AuthBackendLoginRequest): Promise<unknown>
  restore(sessionRef: SessionRef): Promise<unknown>
  logout(sessionRef: SessionRef): Promise<unknown>
}

export class AuthTransportError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'AuthTransportError'
  }
}

const sessionStorageKey = { namespace: 'session', key: 'current' } as const

function decodeAuthResponse(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw

  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error('Authentication response is not valid JSON')
  }
}

function authFailure(error: unknown, fallback: string): OperationSnapshot<never> {
  return adapterFailure(
    error instanceof AuthTransportError && error.retryable ? 'network_retryable' : 'server_terminal',
    unknownErrorMessage(error, fallback),
  )
}

function sessionFromBackend(raw: unknown): SessionSnapshot {
  const envelope = asRecord(decodeAuthResponse(raw), 'auth response')
  const data = nestedRecord(envelope, ['data', 'entity']) ?? envelope
  const user = nestedRecord(data, ['user', 'person']) ?? data
  const sessionToken = requiredString(data, ['token', 'sessionRef', 'sessionId'], 'session reference')
  const userId = requiredString(user, ['id', '_id', 'userId'], 'user id')
  const displayName = optionalString(user, ['displayName', 'name', 'realName'])
  const role = nestedRecord(data, ['currentRole', 'role'])
  const roleId = role ? optionalString(role, ['id', '_id', 'roleId']) : undefined
  const roleName = role ? optionalString(role, ['name', 'roleName']) : undefined
  const capabilityNames = nestedValue(data, ['capabilityNames', 'functions', 'functionList'])

  return {
    sessionRef: asOpaqueId<'SessionRef'>(sessionToken),
    user: {
      id: asOpaqueId<'UserId'>(userId),
      ...(displayName ? { displayName } : {}),
    },
    ...(roleId
      ? {
          currentRole: {
            id: asOpaqueId<'RoleId'>(roleId),
            ...(roleName ? { name: roleName } : {}),
          },
        }
      : {}),
    ...(typeof data.roleVersion === 'string' ? { roleVersion: data.roleVersion } : {}),
    capabilityNames: Array.isArray(capabilityNames)
      ? capabilityNames.filter((value): value is string => typeof value === 'string')
      : [],
  }
}

function restoredSession(raw: unknown, stored: SessionSnapshot): SessionSnapshot {
  const envelope = asRecord(decodeAuthResponse(raw), 'session response')
  const data = nestedRecord(envelope, ['data'])
  // A bare valid flag, absent error, or a locally cached identity is not proof.
  if (envelope.valid !== true || envelope.success === false || !data || !nestedRecord(data, ['user'])
    || data.success === false || data.valid === false) throw new Error('Session was not authoritatively verified')
  const user = nestedRecord(data, ['user'])!
  const roles = ['currentRole', 'role'].filter(key => Object.hasOwn(data, key))
    .map(key => data[key] === null ? null : asRecord(data[key], 'restored role'))
  const checks: Array<readonly [AdapterRecord, readonly string[], string]> = [
    [data, ['token', 'sessionRef', 'sessionId'], 'session reference'],
    [user, ['id', '_id', 'userId'], 'user identity'],
  ]
  for (const role of roles) if (role) checks.push([role, ['id', '_id', 'roleId'], 'role identity'])
  for (const [record, keys, label] of checks) {
    for (const key of keys) if (Object.hasOwn(record, key)
      && (typeof record[key] !== 'string' || !record[key] || record[key] !== (record[key] as string).trim())) throw new Error(`Invalid ${label}`)
    if (!consistentWireIdentity(record, keys, label)) throw new Error(`Missing ${label}`)
  }
  if (new Set(roles.map(role => role ? consistentWireIdentity(role, ['id', '_id', 'roleId'], 'role identity') : null)).size > 1) throw new Error('Contradictory current role')
  const fresh = sessionFromBackend(envelope)
  if (fresh.sessionRef !== stored.sessionRef || fresh.user.id !== stored.user.id) {
    throw new Error('Restored session identity does not match the stored reference')
  }
  return fresh
}

function validStoredSession(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<SessionSnapshot>
  return typeof record.sessionRef === 'string' && record.sessionRef.trim().length > 0
    && typeof record.user?.id === 'string' && record.user.id.trim().length > 0
}

export class AuthSessionAdapter implements AuthSessionPort {
  private current: SessionSnapshot | null = null
  private generation = 0
  private persistence: Promise<void> = Promise.resolve()

  private cancelled<T>(): OperationSnapshot<T> {
    return adapterFailure('cancelled', 'Authentication operation was superseded')
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.persistence.then(operation, operation)
    this.persistence = next.then(() => undefined, () => undefined)
    return next
  }

  private async commit(session: SessionSnapshot, generation: number): Promise<OperationSnapshot<SessionSnapshot>> {
    const stored = await this.enqueue(() => generation === this.generation
      ? this.storage.write(sessionStorageKey, session)
      : Promise.resolve(this.cancelled<void>()))
    if (generation !== this.generation) return this.cancelled()
    if (stored.state !== 'succeeded') return stored.error
      ? { state: stored.state, error: stored.error }
      : adapterFailure('server_terminal', 'Session storage failed')
    this.current = session
    return succeeded(session)
  }

  constructor(
    private readonly backend: AuthBackendDriver,
    private readonly storage: StoragePort,
    private readonly wireConfig: AuthWireConfig,
  ) {}

  async startSession(request: AuthStartRequest): Promise<OperationSnapshot<SessionSnapshot>> {
    const generation = ++this.generation
    this.current = null
    try {
      const raw = await this.backend.login({
        path: 'index/phoneLogin.do',
        body: {
          method: this.wireConfig.phoneLoginMethod,
          phone: request.phoneNumber,
          code: request.verificationCode,
          tenant: this.wireConfig.tenant,
        },
      })
      if (generation !== this.generation) return this.cancelled()
      return await this.commit(sessionFromBackend(raw), generation)
    } catch (error) {
      if (generation !== this.generation) return this.cancelled()
      return authFailure(error, 'Authentication failed')
    }
  }

  async restoreSession(): Promise<OperationSnapshot<SessionSnapshot | null>> {
    const generation = ++this.generation
    this.current = null
    const stored = await this.enqueue(() => this.storage.read<SessionSnapshot>(sessionStorageKey))
    if (generation !== this.generation) return this.cancelled()
    if (stored.state !== 'succeeded') return stored
    if (!stored.data) return succeeded(null)
    const invalidate = async (): Promise<OperationSnapshot<SessionSnapshot | null>> => {
      const removed = await this.enqueue(() => generation === this.generation
        ? this.storage.remove(sessionStorageKey)
        : Promise.resolve(this.cancelled<void>()))
      if (generation !== this.generation) return this.cancelled()
      if (removed.state !== 'succeeded') return { state: removed.state, error: removed.error }
      return adapterFailure('session_invalid', 'Stored session is no longer valid')
    }
    if (!validStoredSession(stored.data)) return invalidate()
    try {
      const raw = await this.backend.restore(stored.data.sessionRef)
      if (generation !== this.generation) return this.cancelled()
      const envelope = asRecord(decodeAuthResponse(raw), 'session response')
      const data = nestedRecord(envelope, ['data'])
      if (envelope.valid === false && data?.valid !== true) return invalidate()
      // Unknown/malformed responses stay unauthenticated, but are not evidence
      // that the server revoked the credential. Preserve it for explicit retry.
      return await this.commit(restoredSession(envelope, stored.data), generation)
    } catch (error) {
      if (generation !== this.generation) return this.cancelled()
      return authFailure(error, 'Session restore failed')
    }
  }

  getCurrentSession(): SessionSnapshot | null {
    return this.current
  }

  async endSession(): Promise<OperationSnapshot<void>> {
    const session = this.current
    const generation = ++this.generation
    this.current = null
    // Reserve logout's clear immediately, before any remote await. Do not skip
    // this queued clear for a later generation: newer writes follow it in FIFO.
    const clearing = this.enqueue(() => this.storage.remove(sessionStorageKey))
    try {
      const removed = await clearing
      if (session) await this.backend.logout(session.sessionRef)
      if (generation !== this.generation) return this.cancelled()
      return removed
    } catch (error) {
      if (generation !== this.generation) return this.cancelled()
      return authFailure(error, 'Session end failed')
    }
  }
}

export function createAuthSessionAdapter(
  backend: AuthBackendDriver,
  storage: StoragePort,
  wireConfig: AuthWireConfig,
): AuthSessionPort {
  return new AuthSessionAdapter(backend, storage, wireConfig)
}
