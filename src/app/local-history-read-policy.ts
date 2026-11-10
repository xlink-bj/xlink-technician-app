import { isProductionReadOnlyTarget } from '@shared/config'
import { isBusinessMockMode } from '@adapters/api/mock/config'
import { normalNodeFormsReadEnabled } from './r1-node-forms-read'

const absent = (value: unknown) => value === undefined || value === ''
const disabled = (value: unknown) => absent(value) || value === 'false'

/** History exposes only completed-record reads. This never supplies an action
 * grant, mutation original, or a substitute environment to the current reader. */
export function historicalFormsReadEnabled(env: Record<string, unknown>, origin: string, tenantId: string): boolean {
  if (env.VITE_XLINK_ENABLE_REAL_WRITES === 'false' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'false') {
    // Preserve the existing read-only rollout and its compatibility contract.
    return normalNodeFormsReadEnabled(env, origin)
  }
  return ordinaryWriteHistoricalReadEnabled(env, origin, tenantId)
}

export function ordinaryWriteHistoricalReadEnabled(env: Record<string, unknown>, origin: string, tenantId: string): boolean {
  return env.DEV === true && (env.PROD === false || env.PROD === undefined)
    && env.VITE_XLINK_ENVIRONMENT === 'dev'
    && !isProductionReadOnlyTarget(env.VITE_XLINK_ENVIRONMENT, env.VITE_XLINK_API_BASE_URL)
    && origin === 'http://127.0.0.1:5189'
    && env.VITE_XLINK_API_BASE_URL === `${origin}/xlink/wm`
    && env.VITE_XLINK_R1_NODE_FORM_READ === 'true'
    && env.VITE_XLINK_ENABLE_REAL_WRITES === 'true'
    && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES === 'false'
    && env.VITE_XLINK_MOCK === 'false' && isBusinessMockMode() === 'off'
    && absent(env.VITE_XLINK_AUTH_API_BASE_URL)
    && disabled(env.VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS)
    && disabled(env.VITE_XLINK_H5_MOCK_E2E)
    && disabled(env.VITE_XLINK_R1_FORMS_ACTIONS) && disabled(env.VITE_XLINK_R1_REPEAT_ACTIONS)
    && absent(env.VITE_XLINK_R1_FORMS_GRANT) && absent(env.VITE_XLINK_R1_REPEAT_GRANT)
    && typeof tenantId === 'string' && tenantId.length > 0 && tenantId.trim() === tenantId
    && env.VITE_XLINK_AUTH_TENANT === tenantId
}
