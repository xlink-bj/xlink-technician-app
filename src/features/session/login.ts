import type { AuthStartRequest, SessionSnapshot } from '@shared/ports'
import { createOperationError, type OperationSnapshot } from '@shared/types'

export interface LoginFormInput {
  readonly phoneNumber: string
  readonly verificationCode: string
}

export interface LoginSubmissionState {
  inFlight: boolean
}

export function validateLoginInput(input: LoginFormInput): string | undefined {
  if (input.phoneNumber.trim().length === 0) return 'Phone number is required'
  if (input.verificationCode.trim().length === 0) return 'Verification code is required'
  return undefined
}

function validationFailure(message: string): OperationSnapshot<SessionSnapshot> {
  return {
    state: 'failed_terminal',
    error: createOperationError('validation', message),
  }
}

export async function submitLogin(
  input: LoginFormInput,
  state: LoginSubmissionState,
  startSession: (request: AuthStartRequest) => Promise<OperationSnapshot<SessionSnapshot>>,
): Promise<OperationSnapshot<SessionSnapshot>> {
  if (state.inFlight) return validationFailure('Login is already in progress')
  const validation = validateLoginInput(input)
  if (validation) return validationFailure(validation)

  state.inFlight = true
  try {
    return await startSession({
      phoneNumber: input.phoneNumber.trim(),
      verificationCode: input.verificationCode.trim(),
    })
  } finally {
    state.inFlight = false
  }
}
