import { isDevMockJourneyEnabled } from '@adapters/api/mock/journey'
import { createMaterialFulfillmentWorkflow } from '@features/work-orders/downstream/material-fulfillment-workflow'
import { isProductionReadOnlyRuntime } from '@shared/config'
import { mockJourneyRoleId, mockJourneyUserId } from '@shared/mock-journey-identity'
import type { SessionSnapshot } from '@shared/ports'
import { materialFulfillmentMockWorkOrderId } from './dev-material-fulfillment-read'

function devMaterialWorkflowEnabled(): boolean {
  return isDevMockJourneyEnabled() && import.meta.env.VITE_XLINK_ENVIRONMENT === 'dev'
    && import.meta.env.VITE_XLINK_MOCK === 'true' && !isProductionReadOnlyRuntime()
}

export function isDevMaterialWorkflowActor(session: SessionSnapshot | null): boolean {
  return devMaterialWorkflowEnabled()
    && session?.sessionRef === 'local-mock-only-session'
    && session.user.id === mockJourneyUserId && session.currentRole?.id === mockJourneyRoleId
    && session.roleVersion === 'local-dev-role-version-1'
}

export const bindDevMaterialWorkflow = createMaterialFulfillmentWorkflow(
  materialFulfillmentMockWorkOrderId, devMaterialWorkflowEnabled,
)
