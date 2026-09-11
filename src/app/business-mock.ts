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
