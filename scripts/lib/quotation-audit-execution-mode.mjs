/**
 * The Production-shape audit must never perform network I/O by default.
 * This pure gate is intentionally independent of Vite, credentials, and app code.
 */
export function resolveAuditExecutionMode(args) {
  const authorizeRead = args.includes('--authorize-bounded-prod-read')
  const preflightOnly = args.includes('--preflight-only')

  if (authorizeRead && preflightOnly) return 'invalid_arguments'
  if (authorizeRead) return 'authorized_bounded_read'
  if (preflightOnly) return 'preflight_only'
  return 'no_network'
}
