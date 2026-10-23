import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { asOpaqueId } from '@shared/types'
import type { SessionSnapshot, TechnicianApiReadPort, WorkOrderDetail, WorkflowNodeRead } from '@shared/ports'

const orderId = asOpaqueId<'WorkOrderId'>('synthetic-listed-order')
const nodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('synthetic-main-repeat')
const repeatNode: WorkflowNodeRead = {
  id: nodeId, runId: asOpaqueId<'WorkflowRunId'>('synthetic-main-run'),
  formDefinitionId: asOpaqueId<'FormDefinitionId'>('synthetic-repeat-def'),
  sourceNodeType: 'repeat', category: 'repeat', lifecycle: 'active', displayName: '重复表单',
  visibility: { evidenceState: 'verified', selectableRoleIds: [asOpaqueId<'RoleId'>('synthetic-role')] },
}
const baseDetail: WorkOrderDetail = {
  id: orderId, workflowRunId: asOpaqueId<'WorkflowRunId'>('synthetic-main-run'),
  workflowNodes: [repeatNode],
}
const baseSession: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'),
  user: { id: asOpaqueId<'UserId'>('synthetic-user'), displayName: '合成用户' },
  currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role'), name: '合成角色' },
  roleVersion: 'v1', capabilityNames: ['work-order.read'],
}

describe('Production current main repeat read', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('reads only after a listed detail and an exact current repeat context, first page at 20', async () => {
    const listRepeatFormReferences = vi.fn(async () => ({ state: 'succeeded' as const, data: {
      items: [{ id: asOpaqueId<'FormDataId'>('synthetic-record'), title: '合成记录', state: 'active' as const }],
      totalCount: 1,
    } }))
    const api = {
      getWorkOrderDetail: vi.fn(async () => ({ state: 'succeeded' as const, data: baseDetail })),
      isWorkOrderListedForCurrentSession: vi.fn(() => true),
      isRepeatFormContextAuthorizedForCurrentSession: vi.fn(() => true),
      listRepeatFormReferences,
    } as unknown as TechnicianApiReadPort
    const store = useWorkOrderDetailStore()
    store.configureApi(api, () => baseSession)
    await store.loadMainRepeatRecords(String(nodeId))
    expect(listRepeatFormReferences).not.toHaveBeenCalled()
    expect(store.mainRepeatRead.state).toBe('failed_terminal')

    await store.load(orderId)
    expect(store.mainRepeatRead.state).toBe('idle')
    await store.loadMainRepeatRecords(String(nodeId))
    expect(listRepeatFormReferences).toHaveBeenCalledTimes(1)
    expect(listRepeatFormReferences).toHaveBeenCalledWith({
      definitionId: repeatNode.formDefinitionId, workflowRunId: repeatNode.runId, page: 1, pageSize: 20,
    })
    expect(store.mainRepeatRead).toMatchObject({ state: 'succeeded', hasMore: false,
      entries: [{ title: '合成记录', state: 'active' }] })
    store.clear()
    expect(store.mainRepeatRead).toMatchObject({ state: 'idle', entries: [] })
  })

  it('refuses unlisted, unproven, non-current and incomplete nodes before the request', async () => {
    let listed = false
    let authorized = true
    let current = baseDetail
    const listRepeatFormReferences = vi.fn()
    const api = {
      getWorkOrderDetail: vi.fn(async () => ({ state: 'succeeded' as const, data: current })),
      isWorkOrderListedForCurrentSession: () => listed,
      isRepeatFormContextAuthorizedForCurrentSession: () => authorized,
      listRepeatFormReferences,
    } as unknown as TechnicianApiReadPort
    const store = useWorkOrderDetailStore()
    store.configureApi(api, () => baseSession)
    await store.load(orderId)
    await store.loadMainRepeatRecords(String(nodeId))
    listed = true
    await store.loadMainRepeatRecords('synthetic-other-node')
    authorized = false
    await store.loadMainRepeatRecords(String(nodeId))
    authorized = true
    current = { ...baseDetail, workflowNodes: [{ ...repeatNode, formDefinitionId: undefined }] }
    await store.load(orderId)
    await store.loadMainRepeatRecords(String(nodeId))
    current = { ...baseDetail, workflowNodes: [{ ...repeatNode, sourceNodeType: 'forms', category: 'forms' }] }
    await store.load(orderId)
    await store.loadMainRepeatRecords(String(nodeId))
    current = { ...baseDetail, workflowNodes: [{ ...repeatNode,
      runId: asOpaqueId<'WorkflowRunId'>('synthetic-other-run') }] }
    await store.load(orderId)
    await store.loadMainRepeatRecords(String(nodeId))
    expect(listRepeatFormReferences).not.toHaveBeenCalled()
    expect(store.mainRepeatRead.state).toBe('failed_terminal')
  })

  it('discards a response when role version or the current node changes in flight', async () => {
    let actor = baseSession
    let resolve: ((value: { state: 'succeeded'; data: { items: never[]; totalCount: number } }) => void) | undefined
    const listRepeatFormReferences = vi.fn(() => new Promise<{ state: 'succeeded'; data: { items: never[]; totalCount: number } }>((done) => {
      resolve = done
    }))
    const api = {
      getWorkOrderDetail: vi.fn(async () => ({ state: 'succeeded' as const, data: baseDetail })),
      isWorkOrderListedForCurrentSession: () => true,
      isRepeatFormContextAuthorizedForCurrentSession: () => true,
      listRepeatFormReferences,
    } as unknown as TechnicianApiReadPort
    const store = useWorkOrderDetailStore()
    store.configureApi(api, () => actor)
    await store.load(orderId)
    const pending = store.loadMainRepeatRecords(String(nodeId))
    expect(store.mainRepeatRead.state).toBe('loading')
    actor = { ...baseSession, roleVersion: 'v2' }
    resolve?.({ state: 'succeeded', data: { items: [], totalCount: 0 } })
    await pending
    expect(store.mainRepeatRead.entries).toEqual([])
    expect(store.mainRepeatRead.state).not.toBe('succeeded')
  })

  it('distinguishes server empty, incomplete page and failed read', async () => {
    const responses = [
      { state: 'succeeded' as const, data: { items: [], totalCount: 0 } },
      { state: 'succeeded' as const, data: { items: [{ id: asOpaqueId<'FormDataId'>('synthetic-record'), state: 'active' as const }], totalCount: 2 } },
      { state: 'failed_retryable' as const },
    ]
    const api = {
      getWorkOrderDetail: vi.fn(async () => ({ state: 'succeeded' as const, data: baseDetail })),
      isWorkOrderListedForCurrentSession: () => true,
      isRepeatFormContextAuthorizedForCurrentSession: () => true,
      listRepeatFormReferences: vi.fn(async () => responses.shift()!),
    } as unknown as TechnicianApiReadPort
    const store = useWorkOrderDetailStore()
    store.configureApi(api, () => baseSession)
    await store.load(orderId)
    await store.loadMainRepeatRecords(String(nodeId))
    expect(store.mainRepeatRead).toMatchObject({ state: 'succeeded', entries: [], hasMore: false })
    await store.loadMainRepeatRecords(String(nodeId))
    expect(store.mainRepeatRead).toMatchObject({ state: 'succeeded', hasMore: true })
    await store.loadMainRepeatRecords(String(nodeId))
    expect(store.mainRepeatRead).toMatchObject({ state: 'failed_retryable', entries: [] })
  })
})
