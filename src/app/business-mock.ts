import {
  isBusinessMockDeveloperModeAvailable,
  isBusinessMockMode,
  mockCommandScenarioIds,
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
    && workOrderId === mockCommandScenarioIds.quotationFoundation
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
