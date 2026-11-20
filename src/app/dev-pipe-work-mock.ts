import { isDevMockJourneyEnabled } from '@adapters/api/mock/journey'
import { mockJourneyRoleId, mockJourneyUserId } from '@shared/mock-journey-identity'

export { withScopedDraftLock as withPipeDraftLock } from '@adapters/storage/scoped-draft-lock'

const route = '/pages/work-orders/pipe-work-mock'

export function devPipeWorkAvailable(userId?: string, roleId?: string): boolean {
  const env = import.meta.env
  return env.DEV === true && env.PROD !== true && env.VITE_XLINK_ENVIRONMENT === 'dev'
    && env.VITE_XLINK_DEV_PIPE_WORK_MOCK === 'true'
    && env.VITE_XLINK_MOCK === 'true' && env.VITE_XLINK_ENABLE_REAL_WRITES === 'false'
    && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES !== 'true'
    && env.VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS !== 'true'
    && !env.VITE_XLINK_AUTH_API_BASE_URL && env.VITE_XLINK_API_BASE_URL === 'https://example.invalid'
    && env.VITE_XLINK_AUTH_TENANT === 'synthetic-qa-tenant'
    && typeof window !== 'undefined' && window.location.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    && isDevMockJourneyEnabled() && userId === mockJourneyUserId && roleId === mockJourneyRoleId
}

export function devPipeWorkUrl(view?: 'order' | 'pressure', id?: string): string {
  if (!view) return route
  return `${route}?view=${view}${id ? '&id=' + encodeURIComponent(id) : ''}`
}
