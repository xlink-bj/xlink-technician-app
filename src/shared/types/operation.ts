export type OperationState =
  | 'idle'
  | 'loading'
  | 'succeeded'
  | 'failed_retryable'
  | 'failed_terminal'

export type ErrorCategory =
  | 'initialization_in_progress'
  | 'session_invalid'
  | 'authorization_denied'
  | 'validation'
  | 'unsupported_capability'
  | 'network_retryable'
  | 'server_terminal'
  | 'cancelled'

export interface OperationError {
  readonly category: ErrorCategory
  readonly message: string
  readonly retryable: boolean
  readonly code?: string
  readonly reason?: string
}

export interface OperationSnapshot<T> {
  readonly state: OperationState
  readonly data?: T
  readonly error?: OperationError
}

export function isRetryableCategory(category: ErrorCategory): boolean {
  return category === 'network_retryable'
}

export function createOperationError(
  category: ErrorCategory,
  message: string,
  details: Pick<OperationError, 'code' | 'reason'> = {},
): OperationError {
  return {
    category,
    message,
    retryable: isRetryableCategory(category),
    ...details,
  }
}

export function operationStateForError(error: OperationError): Extract<
  OperationState,
  'failed_retryable' | 'failed_terminal'
> {
  return error.retryable ? 'failed_retryable' : 'failed_terminal'
}
