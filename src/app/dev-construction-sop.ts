/** Composition for the isolated construction mock. It does not provide a real transport. */
import { createConstructionSopAdapter } from '@adapters/api/mock/construction-sop'
import type { SessionSnapshot } from '@shared/ports'
import type {
  ConstructionSopFault, ConstructionSopOperation, ConstructionSopPort,
} from '@shared/construction-sop-mock-contract'
import { mockJourneyRoleId, mockJourneyUserId } from '@shared/mock-journey-identity'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'

import { isBusinessMockMode } from './business-mock'
import { createDefaultStoragePort } from './composition'
import { loadApplicationRuntimeConfig } from './runtime-config'

const faults = new Map<ConstructionSopOperation, ConstructionSopFault>()
const sampleHostId = 'mock-work-order-002'
const sampleTenantId = 'synthetic-qa-tenant'

function enabled(): boolean {
  const runtime = loadApplicationRuntimeConfig()
  return import.meta.env.VITE_XLINK_DEV_CONSTRUCTION_SOP === 'true'
    && import.meta.env.DEV === true
    && runtime.ok && runtime.value.devMockUxSession && runtime.value.authOnlyMockBusiness
    && runtime.value.authWireConfig.tenant === sampleTenantId && isBusinessMockMode() === 'data'
}

function actorKey(session: SessionSnapshot | null): string | null {
  if (session?.sessionRef !== 'local-mock-only-session' || session.user.id !== mockJourneyUserId
    || session.currentRole?.id !== mockJourneyRoleId) return null
  return sessionAuthorizationFingerprint({
    sessionRef: session.sessionRef, userId: session.user.id,
    roleId: session.currentRole.id, roleVersion: session.roleVersion,
  })
}

export function constructionSopMockFor(
  workOrderId: string,
  getSession: () => SessionSnapshot | null,
  isCurrentHost: () => boolean,
): ConstructionSopPort | undefined {
  if (!enabled() || workOrderId !== sampleHostId || !isCurrentHost()) return undefined
  const actor = actorKey(getSession())
  if (!actor) return undefined
  return createConstructionSopAdapter({
    storage: createDefaultStoragePort(),
    userId: mockJourneyUserId,
    isCurrent: () => enabled() && isCurrentHost() && actorKey(getSession()) === actor,
    takeFault(operation) {
      const fault = faults.get(operation)
      faults.delete(operation)
      return fault
    },
  })
}

/** One-shot failure injection for the Playwright fixture. No user-visible fault controls. */
export function setConstructionSopFixtureFault(operation: ConstructionSopOperation, fault: ConstructionSopFault): void {
  if (enabled()) faults.set(operation, fault)
}
