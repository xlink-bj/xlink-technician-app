import { isDevMockJourneyEnabled } from '@adapters/api/mock/journey'
import type { WorkflowNodeRead } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

/**
 * A DEV Mock-only rendering fixture, not a R1 Workflow/WorkflowNode API reply.
 * Production's child loader remains Production-read-only and unchanged.
 * Only observed shape semantics are modelled: subflow parent, opaque child
 * identity, optional FormDefinition identity, unknown action type and inactive
 * (cancelled) lifecycle. No forms/repeat inference or command capability.
 */
export const childSubflowMockWorkOrderId = 'mock-work-order-006'
export const childSubflowMockReviewRoute = '/pages/work-orders/child-subflow-mock-review'
export type ChildSubflowMockScenario = 'mixed' | 'cancelled' | 'empty' | 'read_error'

export const childSubflowMockScenarios: readonly { readonly value: ChildSubflowMockScenario; readonly label: string }[] = [
  { value: 'mixed', label: '未知类型' },
  { value: 'cancelled', label: '已取消' },
  { value: 'empty', label: '空节点' },
  { value: 'read_error', label: '读取失败' },
]

export interface ChildSubflowMockInput {
  readonly workOrderId: string
  readonly userId?: string
  readonly roleId?: string
  readonly scenario: ChildSubflowMockScenario
}

export type ChildSubflowMockRead =
  | { readonly kind: 'blocked' }
  | { readonly kind: 'ready'; readonly parent: WorkflowNodeRead; readonly nodes: readonly WorkflowNodeRead[] }
  | { readonly kind: 'read_error'; readonly parent: WorkflowNodeRead }

const parentId = asOpaqueId<'WorkflowNodeRuntimeId'>('mock-child-subflow-review-parent')
const parent: WorkflowNodeRead = {
  id: parentId,
  displayName: '屋面勘察 · 子流程（合成）',
  sourceNodeType: 'subflows',
  nodeTypeEvidence: 'runtime_node_def',
  category: 'subworkflow',
  lifecycle: 'active',
}

const sampleNodes: readonly WorkflowNodeRead[] = [
  {
    id: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-child-subflow-review-active'),
    parentNodeId: parentId,
    displayName: '现场信息核对（合成）',
    formDefinitionId: asOpaqueId<'FormDefinitionId'>('mock-child-review-form-def'),
    formDefinitionIdEvidence: 'runtime_node',
    nodeTypeEvidence: 'unresolved',
    category: 'unsupported',
    lifecycle: 'active',
  },
  {
    id: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-child-subflow-review-untyped'),
    parentNodeId: parentId,
    displayName: '材料检查（合成）',
    nodeTypeEvidence: 'unresolved',
    category: 'unsupported',
    lifecycle: 'active',
  },
  {
    id: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-child-subflow-review-cancelled'),
    parentNodeId: parentId,
    displayName: '历史勘察节点（合成）',
    formDefinitionId: asOpaqueId<'FormDefinitionId'>('mock-child-review-archived-form-def'),
    formDefinitionIdEvidence: 'runtime_node',
    nodeTypeEvidence: 'unresolved',
    category: 'unsupported',
    lifecycle: 'inactive',
  },
]

export function childSubflowMockReviewUrl(): string {
  return `${childSubflowMockReviewRoute}?id=${encodeURIComponent(childSubflowMockWorkOrderId)}`
}

export function isChildSubflowMockPreviewAvailable(): boolean {
  return isDevMockJourneyEnabled()
}

export function readChildSubflowMock(input: ChildSubflowMockInput): ChildSubflowMockRead {
  if (!isChildSubflowMockPreviewAvailable() || input.workOrderId !== childSubflowMockWorkOrderId
    || input.userId !== 'synthetic-user' || input.roleId !== 'synthetic-role'
    || !childSubflowMockScenarios.some((item) => item.value === input.scenario)) {
    return { kind: 'blocked' }
  }

  if (input.scenario === 'read_error') return { kind: 'read_error', parent }
  return {
    kind: 'ready', parent,
    nodes: input.scenario === 'empty' ? []
      : input.scenario === 'cancelled' ? sampleNodes.filter(node => node.lifecycle === 'inactive')
        : sampleNodes,
  }
}
