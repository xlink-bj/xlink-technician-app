/**
 * Concrete R1 Beta adapter assembly. Intentionally not called by bootstrap:
 * activation requires a named isolated pilot, explicit Owner grant, exact
 * role-listed WorkOrder scope and BOTH audited transport write flags.
 */
import type { ApiCommandTransport } from '@adapters/api/technician-api-commands'
import type { ApiReadTransport } from '@adapters/api/technician-api'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { createR1PilotAuthoritativeReadback } from '@adapters/api/r1-pilot-authoritative-readback'
import type { AuthSessionPort, StoragePort, TechnicianApiReadPort } from '@shared/ports'
import { isProductionReadOnlyRuntime, isProductionReadOnlyTarget } from '@shared/config'
import type { R1MultiStepScope } from '@features/work-orders/r1-multistep-offline-transaction'
import { loadApplicationRuntimeConfig } from './runtime-config'
import { createR1Stage1PilotExecution } from './r1-stage1-pilot-reconciliation'

export interface IsolatedR1PilotCompositionOptions {
  readonly authSession: AuthSessionPort
  readonly read: TechnicianApiReadPort
  readonly storage: StoragePort
  /** Explicitly approved isolated Beta endpoint; never inferred from env. */
  readonly approvedApiBaseUrl: string
  readonly ownerGrant: (scope: R1MultiStepScope) => boolean
  /** For synthetic integration tests only; never configured in the main App. */
  readonly readTransport?: ApiReadTransport
  readonly commandTransport?: ApiCommandTransport
}

/**
 * No fallback to Production, DEV Mock, or a generic write switch. The
 * returned facade can be used only by an approved external pilot harness;
 * ordinary pages must not import or auto-create it.
 */
export function createIsolatedR1Stage1Pilot(options: IsolatedR1PilotCompositionOptions):
  ReturnType<typeof createR1Stage1PilotExecution> | null {
  const config = loadApplicationRuntimeConfig()
  if (!config.ok || config.value.environment.environment !== 'staging'
    || config.value.authOnlyMockBusiness || isProductionReadOnlyRuntime()
    || isProductionReadOnlyTarget(config.value.environment.environment,
      config.value.environment.apiBaseUrl)
    || !/^https:\/\//.test(config.value.environment.apiBaseUrl)
    || options.approvedApiBaseUrl !== config.value.environment.apiBaseUrl
    || import.meta.env.VITE_XLINK_ENABLE_REAL_WRITES !== 'true'
    || import.meta.env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES !== 'true') return null

  const environment = config.value.environment.environment
  const apiBaseUrl = config.value.environment.apiBaseUrl
  const getSession = () => options.authSession.getCurrentSession()
  const session = getSession()
  if (!session?.sessionRef || !session.currentRole?.id || !session.roleVersion) return null
  const identity = JSON.stringify([
    session.sessionRef, session.user.id, session.currentRole.id, session.roleVersion,
  ])
  const granted = (scope: R1MultiStepScope): boolean => {
    const current = getSession()
    return Boolean(current?.sessionRef && current.currentRole?.id && current.roleVersion
      && identity === JSON.stringify([
        current.sessionRef, current.user.id, current.currentRole.id, current.roleVersion,
      ])
      && String(current.user.id) === scope.userId
      && scope.authorizationScope === identity
      && options.read.isWorkOrderListedForCurrentSession?.(scope.workOrderId) === true
      && options.ownerGrant(scope) === true)
  }
  const getSessionRef = () => getSession()?.sessionRef ?? null
  const readTransport = options.readTransport ?? createUniApiReadTransport({
    apiBaseUrl, getSessionRef, blockRealRequests: false,
  })
  const command = options.commandTransport ?? createUniApiCommandTransport({
    apiBaseUrl, getSessionRef, blockRealRequests: false,
  })
  const rawReadback = createR1PilotAuthoritativeReadback({
    transport: readTransport, environment, apiBaseUrl, mayReadScope: granted,
  })
  return createR1Stage1PilotExecution({
    storage: options.storage, read: options.read, command, getSession,
    environment, apiBaseUrl, rawReadback,
    isExplicitPilotWriteAuthorized: granted,
  })
}
