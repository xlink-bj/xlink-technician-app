import type { RoleRef, SessionRef, UserRef } from '@shared/types'
import type { OperationSnapshot } from '@shared/types'

export interface SessionSnapshot {
  readonly sessionRef: SessionRef
  readonly user: UserRef
  readonly currentRole?: RoleRef
  readonly roleVersion?: string
  readonly capabilityNames: readonly string[]
}

export interface AuthStartRequest {
  readonly method: string
  readonly parameters: Readonly<Record<string, string>>
}

export interface AuthSessionPort {
  startSession(request: AuthStartRequest): Promise<OperationSnapshot<SessionSnapshot>>
  restoreSession(): Promise<OperationSnapshot<SessionSnapshot | null>>
  getCurrentSession(): SessionSnapshot | null
  endSession(): Promise<OperationSnapshot<void>>
}
