import { ApiReadTransportError } from './technician-api'

/** HTTP 2xx (or a matched Mock route) is not business success. Reject an
 * explicit failure before a mapper can construct a record from requested ID.
 * Only the existing synthetic RETRYABLE code asserts retryability. Unknown
 * server codes remain terminal; no auth/permission semantics are invented.
 */
export function assertSuccessfulReadResponse(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const envelope = value as Record<string, unknown>
  if (envelope.success !== false) return
  throw new ApiReadTransportError('API read returned an explicit failure',
    envelope.code === 'RETRYABLE' ? 'network_retryable' : 'server_terminal')
}
