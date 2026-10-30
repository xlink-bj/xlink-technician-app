import { describe, expect, it } from 'vitest'
import type { CurrentTaskProjection } from '@runtimes/workflow'
import type { SessionSnapshot, WorkOrderDetail } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import { selectActionWorkspaceLoadTarget } from '@features/work-orders/action-workspace-load-target'
import { readFileSync } from 'node:fs'

const workOrderId = asOpaqueId<'WorkOrderId'>('wo-d1')
const workflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('node-d1')
const formDefinitionId = asOpaqueId<'FormDefinitionId'>('form-d1')
const session = {
  sessionRef: asOpaqueId<'SessionRef'>('session-d1'),
  user: { id: asOpaqueId<'UserId'>('actor-d1') },
  currentRole: { id: asOpaqueId<'RoleId'>('role-d1') },
  capabilityNames: [],
} as SessionSnapshot
function detail(overrides: Partial<WorkOrderDetail> = {}): WorkOrderDetail {
  return { id: workOrderId, workflowNodes: [{ id: workflowNodeId, category: 'forms',
    lifecycle: 'active', formDefinitionId }], ...overrides }
}
function task(overrides: Partial<CurrentTaskProjection> = {}): CurrentTaskProjection {
  return { nodeId: workflowNodeId, title: '勘查记录', category: 'forms', actionIntent: 'interact_with_form',
    execution: 'enabled', domainPolicy: { action: 'interact_with_form', allowed: true },
    ...overrides } as CurrentTaskProjection
}
function target(overrides: Partial<Parameters<typeof selectActionWorkspaceLoadTarget>[0]> = {}) {
  return selectActionWorkspaceLoadTarget({
    detail: detail(), session, currentTask: task(),
    request: { workOrderId, workflowNodeId, actionIntent: 'interact_with_form' },
    devMockE2EBuildEnabled: false, ...overrides,
  })
}
describe('C3-D1 Action Workspace load eligibility', () => {
  it('accepts exact selected workflow/form identity, without inferring command permissions', () => {
    const result = target()
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') {
      expect(result.contentKind).toBe('dynamic_form')
      expect(result.node.formDefinitionId).toBe(formDefinitionId)
    }
  })
  it('blocks foreign Work Order before attaching detail', () => {
    expect(target({ detail: detail({ id: asOpaqueId<'WorkOrderId'>('foreign') }) }))
      .toMatchObject({ kind: 'blocked', keepDetail: false,
        message: 'Work Order response identity does not match the requested order' })
  })
  it('fails closed if the session has no current role', () => {
    expect(target({ session: { ...session, currentRole: undefined } }))
      .toMatchObject({ kind: 'blocked', category: 'session_invalid', keepDetail: false })
  })
  it('rejects missing current task, foreign node, missing node and wrong action intent', () => {
    expect(target({ currentTask: undefined })).toMatchObject({ kind: 'blocked', keepDetail: true })
    expect(target({ currentTask: task({ nodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('other') }) }))
      .toMatchObject({ kind: 'blocked', message: 'This Action is not executable' })
    expect(target({ detail: detail({ workflowNodes: [] }) }))
      .toMatchObject({ kind: 'blocked', message: 'This Action is not executable' })
    expect(target({ request: { workOrderId, workflowNodeId, actionIntent: 'place_order' } }))
      .toMatchObject({ kind: 'blocked', message: 'This Action is not executable' })
  })
  it('does not let any non-whitelisted read-only action become executable', () => {
    const disabled = task({ execution: 'disabled_read_only', sourceNodeType: 'forms' })
    const request = { workOrderId, workflowNodeId, actionIntent: 'interact_with_form', localPreviewOnly: true }
    expect(target({ currentTask: disabled, request, devMockE2EBuildEnabled: false }))
      .toMatchObject({ kind: 'blocked', message: 'This Action is not executable' })
    expect(target({ currentTask: disabled, request, devMockE2EBuildEnabled: true }))
      .toMatchObject({ kind: 'blocked', message: 'This Action is not executable' })
  })
  it('allows exact DEV-only local preview and retains disabled_read_only execution', () => {
    const workOrderId = asOpaqueId<'WorkOrderId'>('mock-work-order-019-continuous-journey')
    const workflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-019-survey')
    const selected = task({ nodeId: workflowNodeId, execution: 'disabled_read_only', sourceNodeType: 'repeat' })
    const result = target({
      detail: detail({ id: workOrderId, workflowNodes: [{ id: workflowNodeId,
        category: 'repeat', lifecycle: 'active', formDefinitionId }] }),
      currentTask: selected, devMockE2EBuildEnabled: true,
      request: { workOrderId, workflowNodeId, actionIntent: 'interact_with_form', localPreviewOnly: true },
    })
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') expect(result.currentTask.execution).toBe('disabled_read_only')
  })
  it('blocks unsupported action and missing dynamic FormDefinition', () => {
    expect(target({ currentTask: task({ actionIntent: 'open_subworkflow' }),
      request: { workOrderId, workflowNodeId, actionIntent: 'open_subworkflow' } }))
      .toMatchObject({ kind: 'blocked', message: 'This Action content is not supported' })
    expect(target({ detail: detail({ workflowNodes: [{ id: workflowNodeId,
      category: 'forms', lifecycle: 'active' }] }) }))
      .toMatchObject({ kind: 'blocked', message: 'Dynamic form definition is unavailable' })
  })
  it('allows quotation action without requiring a FormDefinition', () => {
    const result = target({ currentTask: task({ actionIntent: 'place_order', category: 'placeOrder' }),
      request: { workOrderId, workflowNodeId, actionIntent: 'place_order' } })
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') expect(result.isQuotationAction).toBe(true)
  })
  it('keeps strict DEV + H5 Mock build flag inside Store', () => {
    const code = readFileSync('src/features/work-orders/action-workspace.ts', 'utf8')
    expect(code).toContain('devMockE2EBuildEnabled: import.meta.env.DEV === true')
    expect(code).toContain("import.meta.env.VITE_XLINK_H5_MOCK_E2E === 'true'")
  })
})
