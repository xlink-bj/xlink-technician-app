import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { AuthSessionPort, AuthStartRequest, SessionSnapshot } from '@shared/ports'
import {
  createOperationError,
  type OperationError,
  type OperationSnapshot,
} from '@shared/types'

export type SessionStatus = 'unknown' | 'unauthenticated' | 'authenticating' | 'authenticated' | 'error'

function failure<T>(category: OperationError['category'], message: string): OperationSnapshot<T> {
  const error = createOperationError(category, message)
  return { state: 'failed_terminal', error }
}

export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>('unknown')
  const session = ref<SessionSnapshot | null>(null)
  const error = ref<OperationError | null>(null)
  const bootstrapInProgress = ref(false)
  let authSession: AuthSessionPort | null = null

  function configureAuth(port: AuthSessionPort): void {
    authSession = port
  }

  async function bootstrap(): Promise<OperationSnapshot<SessionSnapshot | null>> {
    if (bootstrapInProgress.value || status.value === 'authenticating') {
      return failure('initialization_in_progress', 'Session initialization is already in progress')
    }

    bootstrapInProgress.value = true
    error.value = null
    status.value = 'unknown'
    session.value = null

    try {
      if (!authSession) {
        const result = failure<SessionSnapshot | null>('server_terminal', 'Authentication service is not configured')
        status.value = 'error'
        error.value = result.error ?? null
        return result
      }

      const result = await authSession.restoreSession()
      if (result.state === 'succeeded') {
        session.value = result.data ?? null
        status.value = result.data ? 'authenticated' : 'unauthenticated'
        return result
      }

      session.value = null
      if (result.error?.category === 'session_invalid') {
        status.value = 'unauthenticated'
        error.value = result.error
      } else {
        status.value = 'error'
        error.value = result.error ?? null
      }
      return result
    } catch {
      const result = failure<SessionSnapshot | null>('network_retryable', 'Session bootstrap failed')
      status.value = 'error'
      error.value = result.error ?? null
      return result
    } finally {
      bootstrapInProgress.value = false
    }
  }

  async function login(request: AuthStartRequest): Promise<OperationSnapshot<SessionSnapshot>> {
    if (bootstrapInProgress.value || status.value === 'unknown') {
      return failure('initialization_in_progress', 'Session bootstrap is still in progress')
    }
    if (status.value === 'authenticating') return failure('validation', 'Login is already in progress')
    if (!authSession) return failure('server_terminal', 'Authentication service is not configured')
    if (request.phoneNumber.trim().length === 0) return failure('validation', 'Phone number is required')
    if (request.verificationCode.trim().length === 0) {
      return failure('validation', 'Verification code is required')
    }

    status.value = 'authenticating'
    session.value = null
    error.value = null
    const result = await authSession.startSession({
      phoneNumber: request.phoneNumber.trim(),
      verificationCode: request.verificationCode.trim(),
    })
    if (result.state === 'succeeded' && result.data) {
      session.value = result.data
      status.value = 'authenticated'
      return result
    }

    status.value = 'error'
    error.value = result.error ?? null
    return result
  }

  async function endSession(): Promise<OperationSnapshot<void>> {
    if (!authSession) {
      status.value = 'unauthenticated'
      session.value = null
      return failure('server_terminal', 'Authentication service is not configured')
    }

    const result = await authSession.endSession()
    if (result.state === 'succeeded') {
      status.value = 'unauthenticated'
      session.value = null
      error.value = null
    } else {
      status.value = 'error'
      error.value = result.error ?? null
    }
    return result
  }

  function clearError(): void {
    error.value = null
  }

  return {
    status,
    bootstrapInProgress,
    session,
    error,
    configureAuth,
    bootstrap,
    login,
    endSession,
    clearError,
  }
})
