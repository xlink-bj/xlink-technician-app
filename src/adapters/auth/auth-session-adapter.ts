import type { AuthSessionPort, AuthStartRequest, SessionSnapshot, StoragePort } from '@shared/ports'
import type { OperationSnapshot, SessionRef } from '@shared/types'
import { asOpaqueId } from '@shared/types'

import { adapterFailure, succeeded, unknownErrorMessage } from '../common/operations'
import {
  asRecord,
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

function isSessionInvalid(raw: unknown): boolean {
  const record = asRecord(raw, 'session response')
  if (record.valid === false || record.success === false) return true
  const data = nestedRecord(record, ['data'])
  return data?.valid === false || data?.success === false
}

export class AuthSessionAdapter implements AuthSessionPort {
  private current: SessionSnapshot | null = null

  constructor(
    private readonly backend: AuthBackendDriver,
    private readonly storage: StoragePort,
    private readonly wireConfig: AuthWireConfig,
  ) {}

  async startSession(request: AuthStartRequest): Promise<OperationSnapshot<SessionSnapshot>> {
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
      const session = sessionFromBackend(raw)
      const stored = await this.storage.write(sessionStorageKey, session)
      if (stored.state !== 'succeeded') {
        return stored.error
          ? { state: stored.state, error: stored.error }
          : adapterFailure('server_terminal', 'Session storage failed')
      }
      this.current = session
      return succeeded(session)
    } catch (error) {
      return authFailure(error, 'Authentication failed')
    }
  }

  async restoreSession(): Promise<OperationSnapshot<SessionSnapshot | null>> {
    const stored = await this.storage.read<SessionSnapshot>(sessionStorageKey)
    if (stored.state !== 'succeeded') return stored
    const storedSession = stored.data
    if (!storedSession) {
      this.current = null
      return succeeded(null)
    }

    try {
      if (isSessionInvalid(await this.backend.restore(storedSession.sessionRef))) {
        await this.storage.remove(sessionStorageKey)
        this.current = null
        return adapterFailure('session_invalid', 'Stored session is no longer valid')
      }
      this.current = storedSession
      return succeeded(storedSession)
    } catch (error) {
      return authFailure(error, 'Session restore failed')
    }
  }

  getCurrentSession(): SessionSnapshot | null {
    return this.current
  }

  async endSession(): Promise<OperationSnapshot<void>> {
    const session = this.current
    try {
      if (session) await this.backend.logout(session.sessionRef)
      const removed = await this.storage.remove(sessionStorageKey)
      this.current = null
      return removed
    } catch (error) {
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
