import type { WorkOrderDetail, WorkflowNodeRead } from '@shared/ports'
import type { DevMockActor, DevMockDynamicFormNodeKind } from './dev-mock-dynamic-form-port'
/** App-owned DEV synthetic read qualification, never a business grant. */
export interface DevMockDynamicFormWorkspaceContent {
 readonly node:WorkflowNodeRead
 readonly kind:DevMockDynamicFormNodeKind
 readonly mode:'active'|'pending'|'completed'
}
export type DevMockDynamicFormWorkspaceResolver=(input:{
 readonly detail:WorkOrderDetail
 readonly runtimeNodeId:string
 readonly actionIntent?:string
 readonly getActor:()=>DevMockActor|null
})=>Promise<DevMockDynamicFormWorkspaceContent|null>
