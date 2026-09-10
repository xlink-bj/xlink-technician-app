export const foundationConfig = {
  appName: 'xlink-technician-app',
  architecture: 'g2-accepted'
} as const

export {
  environmentNames,
  parseEnvironmentConfig,
  targetPlatforms,
} from './environment'
export type {
  EnvironmentConfig,
  EnvironmentConfigResult,
  EnvironmentName,
  TargetPlatform,
} from './environment'
export {
  getActiveCompatibilityEntry,
  isCompatibilityEntryActive,
  validateCompatibilityEntry,
} from './compatibility'
export type {
  CompatibilityActivation,
  CompatibilityConfidence,
  CompatibilityEntry,
  CompatibilityProvenance,
  CompatibilityRegistry,
  CompatibilityScope,
  CompatibilityWireReference,
} from './compatibility'
