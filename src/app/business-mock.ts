import { loadApplicationRuntimeConfig } from './runtime-config'
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
