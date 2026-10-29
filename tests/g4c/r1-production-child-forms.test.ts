import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { asOpaqueId } from '@shared/types'
import type { SessionSnapshot, TechnicianApiReadPort, WorkOrderDetail, WorkflowNodeRead } from '@shared/ports'

const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'),
  user: { id: asOpaqueId<'UserId'>('synthetic-user'), displayName: '测试服务人员' },
  currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role'), name: '服务人员' },
  capabilityNames: ['work-order.read'],
}
const workOrderId = asOpaqueId<'WorkOrderId'>('synthetic-order')
const parentId = asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-parent')
const childNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-repeat')
const child: WorkflowNodeRead = {
  id: childNodeId, runId: asOpaqueId<'WorkflowRunId'>('synthetic-run'),
  formDefinitionId: asOpaqueId<'FormDefinitionId'>('synthetic-def'),
  sourceNodeType: 'repeat', category: 'repeat', lifecycle: 'active',
}
const detail: WorkOrderDetail = {
  id: workOrderId, workflowRunId: asOpaqueId<'WorkflowRunId'>('synthetic-main'),
  workflowNodes: [{
    id: parentId, runId: asOpaqueId<'WorkflowRunId'>('synthetic-main'),
    sourceNodeType: 'subflows', category: 'subworkflow', lifecycle: 'active',
  }],
}

describe('R1 Production child multi-form read presentation store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('requires the actual detail parent and exposes source-backed repeat records without commands', async () => {
    const getChildWorkflowNodes = vi.fn(async () => ({ state: 'succeeded' as const, data: [child] }))
    const listRepeatFormReferences = vi.fn(async () => ({
      state: 'succeeded' as const,
      data: { items: [{ id: asOpaqueId<'FormDataId'>('synthetic-form-record'), state: 'active' as const }], totalCount: 1 },
    }))
    const api = {
      getWorkOrderDetail: vi.fn(async () => ({ state: 'succeeded' as const, data: detail })),
      getChildWorkflowNodes, listRepeatFormReferences,
    } as unknown as TechnicianApiReadPort
    const store = useWorkOrderDetailStore()
    store.configureApi(api, () => session)

    expect((await store.loadChildWorkflowForms(String(parentId))).state).toBe('failed_terminal')
    expect(getChildWorkflowNodes).not.toHaveBeenCalled()
    await store.load(workOrderId)
    expect((await store.loadChildWorkflowForms('synthetic-unlisted-parent')).state).toBe('failed_terminal')
    expect(getChildWorkflowNodes).not.toHaveBeenCalled()
    expect((await store.loadChildWorkflowForms(String(parentId))).state).toBe('succeeded')
    expect(store.childReadNodes).toEqual([child])
    expect(getChildWorkflowNodes).toHaveBeenCalledWith(parentId)
    await store.loadChildRepeatRecords(String(childNodeId))
    expect(listRepeatFormReferences).toHaveBeenCalledWith({
      definitionId: child.formDefinitionId, workflowRunId: child.runId, page: 1, pageSize: 20,
    })
    expect(store.repeatReadByNode[String(childNodeId)]?.entries).toHaveLength(1)
    store.clear()
    expect(store.childReadNodes).toEqual([])
    expect(store.repeatReadByNode).toEqual({})
  })

  it('preserves untyped and cancelled child references in read-only state without granting repeat record reads', async () => {
    const generic: readonly WorkflowNodeRead[] = [
      { id: asOpaqueId<'WorkflowNodeRuntimeId'>('generic-form'),
        runId: asOpaqueId<'WorkflowRunId'>('synthetic-child-run'),
        formDefinitionId: asOpaqueId<'FormDefinitionId'>('synthetic-form-definition'),
        formDefinitionIdEvidence: 'runtime_node', nodeTypeEvidence: 'unresolved',
        category: 'unsupported', lifecycle: 'closed' },
      { id: asOpaqueId<'WorkflowNodeRuntimeId'>('cancelled-form'),
        runId: asOpaqueId<'WorkflowRunId'>('synthetic-child-run'),
        nodeTypeEvidence: 'unresolved', category: 'unsupported', lifecycle: 'inactive' },
    ]
    const listRepeatFormReferences = vi.fn()
    const store = useWorkOrderDetailStore()
    store.configureApi({
      getWorkOrderDetail: async () => ({ state: 'succeeded', data: detail }),
      getChildWorkflowNodes: async () => ({ state: 'succeeded', data: generic }),
      listRepeatFormReferences,
    } as unknown as TechnicianApiReadPort, () => session)
    await store.load(workOrderId)
    expect((await store.loadChildWorkflowForms(String(parentId))).state).toBe('succeeded')
    expect(store.childReadNodes).toEqual(generic)
    await store.loadChildRepeatRecords('generic-form')
    await store.loadChildRepeatRecords('cancelled-form')
    expect(listRepeatFormReferences).not.toHaveBeenCalled()
    expect(store.repeatReadByNode).toEqual({})
  })

  it('discards a child result when the current role changes during the request', async () => {
    let actor: SessionSnapshot = session
    let deliver: ((data: readonly WorkflowNodeRead[]) => void) | undefined
    const getChildWorkflowNodes = vi.fn(() => new Promise<{ state: 'succeeded'; data: readonly WorkflowNodeRead[] }>((resolve) => {
      deliver = (data) => resolve({ state: 'succeeded', data })
    }))
    const store = useWorkOrderDetailStore()
    store.configureApi({
      getWorkOrderDetail: async () => ({ state: 'succeeded', data: detail }),
      getChildWorkflowNodes,
    } as unknown as TechnicianApiReadPort, () => actor)
    await store.load(workOrderId)
    const pending = store.loadChildWorkflowForms(String(parentId))
    actor = { ...session, currentRole: { id: asOpaqueId<'RoleId'>('other-role'), name: '其他角色' } }
    deliver?.([child])
    expect((await pending).state).toBe('failed_terminal')
    expect(store.childReadNodes).toEqual([])
  })
})
