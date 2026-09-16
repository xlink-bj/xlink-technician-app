import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  createTechnicianApiCommandAdapter,
  type ApiCommandRequest,
  type ApiCommandTransport,
} from '@adapters/api/technician-api-commands'
import {
  createRoleScopedTechnicianApiReadAdapter,
  type ApiReadTransport,
} from '@adapters/api/technician-api'
import {
  createUniApiCommandTransport,
  type UniApiCommandRequestExecutor,
} from '@adapters/api/uni-api-command-transport'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import {
  isMockOwnedCommand,
  resetMockCommandState,
  resetBusinessMockCache,
  setBusinessMockMode,
} from '@adapters/api/mock'
import { workOrderListActionFor } from '@features/work-orders/list-actions'
import { detailWorkflowUiProjectionFor } from '@features/work-orders/detail-workflow'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { useWorkOrderListStore } from '@features/work-orders/list'
import type {
  FormDataRead,
  FormDefinitionRead,
  ReadPage,
  SessionSnapshot,
  TechnicianApiReadPort,
  WorkOrderDetail,
} from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'

const roleId = asOpaqueId<'RoleId'>('synthetic-role')
const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'),
  user: { id: asOpaqueId<'UserId'>('synthetic-user') },
  currentRole: { id: roleId },
  capabilityNames: [],
}

const appointmentNode = {
  id: asOpaqueId<'WorkflowNodeRuntimeId'>('appointment-node'),
  category: 'forms' as const,
  lifecycle: 'active' as const,
  displayName: '预约上门时间',
  formPurpose: 'appointment' as const,
  visibility: { evidenceState: 'verified' as const, viewableRoleIds: [roleId] },
}

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

describe('G4-D accept and appointment semantics', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_MOCK', '')
    resetBusinessMockCache()
    resetMockCommandState()
  })

  it('derives pre-accept List affordances from one actor-eligible accept node', () => {
    const item = {
      id: asOpaqueId<'WorkOrderId'>('work-order'),
      taskLabel: '待接单',
      workflowNodes: [{
        id: asOpaqueId<'WorkflowNodeRuntimeId'>('accept-node'),
        category: 'accept' as const,
        lifecycle: 'active' as const,
        displayName: '接单',
        handlers: [{ kind: 'unclassified' as const, value: 'synthetic-user' }],
        visibility: { evidenceState: 'verified' as const },
      }],
      contact: { normalizedPhone: '13800000000' },
    }

    expect(workOrderListActionFor(item, session)).toEqual({
      detailAccessible: false,
      acceptOrder: { workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('accept-node') },
      contactAvailable: false,
    })
  })

  it('keeps accept eligibility actor- and lifecycle-driven', () => {
    const mismatch = workOrderListActionFor({
      id: asOpaqueId<'WorkOrderId'>('work-order'),
      workflowNodes: [{
        id: asOpaqueId<'WorkflowNodeRuntimeId'>('accept-node'),
        category: 'accept',
        lifecycle: 'active',
        visibility: { evidenceState: 'verified', selectableRoleIds: [asOpaqueId<'RoleId'>('other-role')] },
      }],
    }, session)
    const closed = workOrderListActionFor({
      id: asOpaqueId<'WorkOrderId'>('work-order'),
      workflowNodes: [{
        id: asOpaqueId<'WorkflowNodeRuntimeId'>('accept-node'),
        category: 'accept',
        lifecycle: 'closed',
        visibility: { evidenceState: 'verified', selectableRoleIds: [roleId] },
      }],
    }, session)
    expect(mismatch.acceptOrder).toBeUndefined()
    expect(mismatch.detailAccessible).toBe(false)
    expect(closed.detailAccessible).toBe(true)
  })

  it('maps inspection, accept, and appointment submit to the verified command wires', async () => {
    const requests: ApiCommandRequest[] = []
    const transport: ApiCommandTransport = {
      execute: async (request) => {
        requests.push(request)
        if (request.path.startsWith('biz/extForm/upsert/')) return { data: { _id: 'saved-form-data' } }
        return { data: [] }
      },
    }
    const readPort = {
      getFormDefinition: async (): Promise<OperationSnapshot<FormDefinitionRead>> => succeeded({
        id: asOpaqueId<'FormDefinitionId'>('appointment-definition'),
        fields: [{ key: 'datetime', label: '预约时间', type: 'datetime', required: true, readOnly: false }],
      }),
      getFormData: async (): Promise<OperationSnapshot<ReadPage<FormDataRead>>> => succeeded({
        items: [{
          id: asOpaqueId<'FormDataId'>('existing-form-data'),
          definitionId: asOpaqueId<'FormDefinitionId'>('appointment-definition'),
          values: { datetime: '2026-04-20 10:00' },
        }],
      }),
    } as unknown as TechnicianApiReadPort
    const command = createTechnicianApiCommandAdapter(transport, readPort)
    const workOrderId = asOpaqueId<'WorkOrderId'>('real-shaped-work-order')
    const nodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('appointment-node')

    expect((await command.inspectAcceptOrder({ workOrderId, workflowNodeId: nodeId })).state).toBe('succeeded')
    expect((await command.acceptOrder({ workOrderId, workflowNodeId: nodeId })).state).toBe('succeeded')
    const form = await command.readAppointmentForm({ formDataId: asOpaqueId<'FormDataId'>('existing-form-data') })
    expect(form.data?.fields[0].key).toBe('datetime')
    expect(form.data?.values.datetime).toBe('2026-04-20 10:00')
    expect((await command.submitAppointment({
      workOrderId,
      workflowNodeId: nodeId,
      formDataId: asOpaqueId<'FormDataId'>('existing-form-data'),
      values: { datetime: '2026-04-21 10:00', note: null },
    })).state).toBe('succeeded')

    expect(requests[0]).toMatchObject({ path: 'basic/serviceAppointment/selfExamination', body: { saId: workOrderId } })
    expect(requests[1]).toMatchObject({ path: 'workflow/process', body: { sid: workOrderId, workflowNodeId: nodeId } })
    expect(requests[2].path).toContain('biz/extForm/upsert/')
    expect(requests[3]).toMatchObject({
      path: 'workflow/process',
      body: { nodeFormDataId: 'saved-form-data', nodeFormDefId: requests[2].path.split('/').pop() },
    })
    expect(JSON.parse(String(requests[2].body?.dataStr))).toMatchObject({
      sid: workOrderId,
      nodeId,
      datetime: '2026-04-21 10:00',
    })
  })

  it('runs synthetic accept and appointment through the same mock command/read path', async () => {
    setBusinessMockMode('data')
    const readRequests = vi.fn()
    const commandRequests = vi.fn<UniApiCommandRequestExecutor>()
    const readTransport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      getMockActor: () => ({ userId: session.user.id, roleId }),
      request: readRequests,
      mockLatencyMs: 0,
    })
    const commandTransport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request: commandRequests,
    })
    const read = createRoleScopedTechnicianApiReadAdapter(
      readTransport,
      () => roleId,
      { cascadeTenantId: 'synthetic-tenant' },
    )
    const command = createTechnicianApiCommandAdapter(commandTransport, read)
    const list = await read.listWorkOrders({ page: 1, pageSize: 20 })
    const row = list.data?.items.find((item) => String(item.id) === 'mock-work-order-003')
    expect(row).toBeDefined()
    const accept = row ? workOrderListActionFor(row, session).acceptOrder : undefined
    expect(accept).toBeDefined()
    if (!row || !accept) return

    await command.inspectAcceptOrder({ workOrderId: row.id, workflowNodeId: accept.workflowNodeId })
    await command.acceptOrder({ workOrderId: row.id, workflowNodeId: accept.workflowNodeId })
    const rereadList = await read.listWorkOrders({ page: 1, pageSize: 20 })
    const rereadRow = rereadList.data?.items.find((item) => String(item.id) === String(row.id))
    expect(rereadRow?.taskLabel).toBe('待预约')
    expect(workOrderListActionFor(rereadRow!, session)).toMatchObject({ detailAccessible: true, contactAvailable: true })
    const acceptedDetail = await read.getWorkOrderDetail(row.id)
    const projection = detailWorkflowUiProjectionFor(acceptedDetail.data ?? null, session)
    expect(projection.currentTask).toMatchObject({
      title: '预约上门时间',
      actionIntent: 'set_appointment',
      tone: 'orange',
    })
    const form = await command.readAppointmentForm({})
    expect(form.data?.fields.map((field) => field.key)).toEqual(['need', 'datetime', 'note'])
    await command.submitAppointment({
      workOrderId: row.id,
      workflowNodeId: projection.currentTask!.nodeId,
      workflowRunId: acceptedDetail.data?.workflowRunId,
      values: { need: '1', datetime: '2026-04-20 10:00', note: '客户已确认' },
    })
    const completeDetail = await read.getWorkOrderDetail(row.id)
    expect(detailWorkflowUiProjectionFor(completeDetail.data ?? null, session).currentTask).toBeUndefined()
    expect(readRequests).not.toHaveBeenCalled()
    expect(commandRequests).not.toHaveBeenCalled()
  })

  it('never lets a synthetic command fall through when Mock is off', async () => {
    setBusinessMockMode('off')
    const request = vi.fn<UniApiCommandRequestExecutor>()
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request,
    })
    expect(isMockOwnedCommand('workflow/process', { sid: 'mock-work-order-003' })).toBe(true)
    await expect(transport.execute({
      method: 'POST',
      path: 'workflow/process',
      body: { sid: 'mock-work-order-003', workflowNodeId: 'synthetic-node', smodule: 'serviceAppointment' },
    })).rejects.toMatchObject({ category: 'server_terminal' })
    expect(request).not.toHaveBeenCalled()
  })

  it('rereads Detail after appointment submit through the Action Workspace boundary', async () => {
    const id = asOpaqueId<'WorkOrderId'>('store-work-order')
    const detail: WorkOrderDetail = {
      id,
      workflowNodes: [appointmentNode],
    }
    const api = {
      getWorkOrderDetail: vi.fn()
        .mockResolvedValueOnce(succeeded(detail))
        .mockResolvedValueOnce(succeeded({ id, workflowNodes: [] })),
    } as unknown as TechnicianApiReadPort
    const command = {
      readAppointmentForm: vi.fn(async () => succeeded({
        fields: [{ key: 'datetime', label: '预约时间', type: 'datetime', required: true, readOnly: false }],
        values: {},
      })),
      submitAppointment: vi.fn(async () => succeeded(undefined)),
      inspectAcceptOrder: vi.fn(),
      acceptOrder: vi.fn(),
    }
    const storage = {
      read: vi.fn(async () => succeeded(null)),
      write: vi.fn(async () => succeeded(undefined)),
      remove: vi.fn(async () => succeeded(undefined)),
    }
    const store = useActionWorkspaceStore()
    store.configure({
      apiRead: api,
      commandApi: command,
      storage,
      navigation: { navigate: vi.fn(async () => undefined), back: vi.fn(async () => undefined) },
      getSession: () => session,
      debounceMs: 0,
    })
    await store.load({ workOrderId: id, workflowNodeId: appointmentNode.id, actionIntent: 'set_appointment' })
    store.setField('datetime', '2026-04-20 10:00')
    expect((await store.submit()).state).toBe('succeeded')
    expect(command.submitAppointment).toHaveBeenCalledWith(expect.objectContaining({ workOrderId: id }))
    expect(api.getWorkOrderDetail).toHaveBeenCalledTimes(2)
    expect(store.detail?.workflowNodes).toEqual([])
  })

  it('keeps accept precheck, confirmation, invalidation, and list reread separate', async () => {
    const id = asOpaqueId<'WorkOrderId'>('accept-store-work-order')
    const nodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('accept-store-node')
    const item = { id, workflowNodes: [] }
    const api = {
      listWorkOrders: vi.fn(async () => succeeded({ items: [item], page: 1, pageSize: 20, totalCount: 1 })),
    } as unknown as TechnicianApiReadPort
    const command = {
      inspectAcceptOrder: vi.fn(async () => succeeded({ requiresConfirmation: true })),
      acceptOrder: vi.fn(async () => succeeded(undefined)),
      readAppointmentForm: vi.fn(),
      submitAppointment: vi.fn(),
    }
    let detailCleared = false
    const store = useWorkOrderListStore()
    store.configureApi(api, () => session)
    store.configureCommandApi(command, () => { detailCleared = true })
    await store.load()

    const input = { workOrderId: id, workflowNodeId: nodeId }
    expect((await store.acceptOrder(input)).state).toBe('confirmation_required')
    expect(command.acceptOrder).not.toHaveBeenCalled()
    expect((await store.acceptOrder(input, true)).state).toBe('succeeded')
    expect(command.acceptOrder).toHaveBeenCalledTimes(1)
    expect(detailCleared).toBe(true)
    expect(api.listWorkOrders).toHaveBeenCalledTimes(2)
  })
})
