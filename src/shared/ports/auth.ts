import type { RoleRef, SessionRef, UserRef } from '@shared/types'
import type { OperationSnapshot } from '@shared/types'

export interface SessionSnapshot {
  readonly sessionRef: SessionRef
  readonly user: UserRef
  readonly currentRole?: RoleRef
  readonly roleVersion?: string
  readonly capabilityNames: readonly string[]
}

/** Ephemeral V1 phone-login input; implementations must not persist it. */
export interface AuthStartRequest {
  readonly phoneNumber: string
  readonly verificationCode: string
}

export interface AuthSessionPort {
  startSession(request: AuthStartRequest): Promise<OperationSnapshot<SessionSnapshot>>
  restoreSession(): Promise<OperationSnapshot<SessionSnapshot | null>>
  getCurrentSession(): SessionSnapshot | null
  endSession(): Promise<OperationSnapshot<void>>
}
