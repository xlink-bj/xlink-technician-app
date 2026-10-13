import { isDevMockJourneyEnabled, mockJourneyStage, mockJourneyWorkOrderId } from '@adapters/api/mock/journey'
import { loadApplicationRuntimeConfig } from './runtime-config'
import {
  isBusinessMockDeveloperModeAvailable,
  isBusinessMockMode,
  mockCommandScenarioIds,
  mockWorkOrderIds,
} from '@adapters/api/mock'

/**
 * Only the bounded synthetic quotation Work Order may use the DEV-only
 * product-preview submission guard in the normal authenticated App.
 * Ordinary real Work Orders keep their existing action semantics.
 */
export function isBusinessMockQuotationPreview(workOrderId: string | null | undefined): boolean {
  return import.meta.env.DEV
    && isBusinessMockDeveloperModeAvailable()
    && isBusinessMockMode() === 'data'
    && (workOrderId === mockCommandScenarioIds.quotationFoundation
      || (isDevMockJourneyEnabled() && workOrderId === mockJourneyWorkOrderId && mockJourneyStage() === 'quotation'))
}

/** Whether the local App uses Production for LOGIN only, with no business API network fallback. */
export function isProductionAuthBusinessMockIsolation(): boolean {
  const config = loadApplicationRuntimeConfig()
  return config.ok && config.value.authOnlyMockBusiness
}

/** Application-facing developer control; raw fixtures and routing stay in adapter infrastructure. */
export {
  isBusinessMockDeveloperModeAvailable,
  isBusinessMockEnabled,
  isBusinessMockMode,
  resetBusinessMockCache,
  setBusinessMockEnabled,
  setBusinessMockMode,
} from '@adapters/api/mock'
export type { BusinessMockMode } from '@adapters/api/mock'

/**
 * I6 Contract read is permitted ONLY against a fixed offline DEV fixture.
 * A staging/Beta backend, a production login, or a real WorkOrder is NEVER
 * sufficient authorization. The adapter repeats this test independently.
 */
export function isDevSyntheticContractReadPreviewEnabled(workOrderId: string | null | undefined): boolean {
  return import.meta.env.DEV === true
    && import.meta.env.VITE_XLINK_H5_MOCK_E2E === 'true'
    && isBusinessMockDeveloperModeAvailable()
    && isBusinessMockMode() === 'data'
    && workOrderId === mockWorkOrderIds[1]
}
