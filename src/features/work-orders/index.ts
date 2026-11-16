/**
 * Public Work Order feature surface for other business features.
 *
 * Only stable, pure contracts belong here. Do not re-export Pinia stores,
 * internal Workspace coordination or API/Mock implementations.
 */
export { actionWorkspaceRouteFor } from './action-workspace-routes'

export { workOrderReadScopeKey } from './read-identity-scope'
export { workOrderListActionFor } from './list-actions'
