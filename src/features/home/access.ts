import type { SessionSnapshot } from '@shared/ports'
import type { SessionStatus } from '@shared/state'

export const workOrdersRoute = '/pages/work-orders/work-orders' as const

export function hasAuthenticatedSession(
  status: SessionStatus,
  session: SessionSnapshot | null,
): boolean {
  return status === 'authenticated' && session !== null
}
