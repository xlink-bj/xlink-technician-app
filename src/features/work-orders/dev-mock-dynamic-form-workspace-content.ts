import type { WorkOrderDetail, WorkflowNodeRead } from '@shared/ports'
import type { AStageMockActor, AStageDynamicFormNodeKind } from './a-stage-dynamic-form-mock-port'
/** App-owned DEV synthetic read qualification, never a business grant. */
export interface DevMockDynamicFormWorkspaceContent {
 readonly node:WorkflowNodeRead
 readonly kind:AStageDynamicFormNodeKind
 readonly mode:'active'|'pending'|'completed'
}
export type DevMockDynamicFormWorkspaceResolver=(input:{
 readonly detail:WorkOrderDetail
 readonly runtimeNodeId:string
 readonly actionIntent?:string
 readonly getActor:()=>AStageMockActor|null
})=>Promise<DevMockDynamicFormWorkspaceContent|null>
