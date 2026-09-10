import type { ErrorCategory, OperationError, OperationSnapshot } from '@shared/types'
import { createOperationError } from '@shared/types'

export class AdapterMappingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdapterMappingError'
  }
}

export function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

export function failed<T>(error: OperationError): OperationSnapshot<T> {
  return {
    state: error.retryable ? 'failed_retryable' : 'failed_terminal',
    error,
  }
}

export function adapterFailure<T>(
  category: ErrorCategory,
  message: string,
  reason?: string,
): OperationSnapshot<T> {
  return failed(createOperationError(category, message, reason ? { reason } : {}))
}

export function transportFailure<T>(message = 'Injected transport failed'): OperationSnapshot<T> {
  return adapterFailure('network_retryable', message)
}

export function unknownErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback
}
