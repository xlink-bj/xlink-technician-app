import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFile } from 'node:fs/promises'

import {
  actionDraftIdentityFor,
  actionDraftStorageKey,
} from '@runtimes/action'
import { createTechnicianApiCommandAdapter } from '@adapters/api/technician-api-commands'
import { createRoleScopedTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { createUniApiCommandTransport } from '@adapters/api/uni-api-command-transport'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import { resetMockCommandState, resetBusinessMockCache, setBusinessMockMode } from '@adapters/api/mock'
import {
  actionWorkspaceConfirmationRouteFor,
  actionWorkspaceTimeRouteFor,
  useActionWorkspaceStore,
} from '@features/work-orders/action-workspace'
import type {
  AppointmentFormRead,
  SessionSnapshot,
  StorageKey,
  StoragePort,
  TechnicianApiCommandPort,
  TechnicianApiReadPort,
  WorkOrderDetail,
} from '@shared/ports'
import { asOpaqueId, type OperationSnapshot, type WorkOrderId, type WorkflowNodeRuntimeId } from '@shared/types'

const roleId = asOpaqueId<'RoleId'>('workspace-role')
const session = {
  sessionRef: asOpaqueId<'SessionRef'>('workspace-session'),
  user: { id: asOpaqueId<'UserId'>('workspace-user') },
  currentRole: { id: roleId },
  capabilityNames: [],
}

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function appointmentDetail(
  workOrderId = 'workspace-work-order',
  nodeId = 'workspace-appointment-node',
): WorkOrderDetail {
  return {
    id: asOpaqueId<'WorkOrderId'>(workOrderId),
    displayNumber: '19001',
    customerName: '演示工单',
    workflowNodes: [{
      id: asOpaqueId<'WorkflowNodeRuntimeId'>(nodeId),
      category: 'forms',
      lifecycle: 'active',
      displayName: '预约上门时间',
      formPurpose: 'appointment',
      visibility: { evidenceState: 'verified', viewableRoleIds: [roleId] },
    }],
  }
}

function appointmentForm(values: AppointmentFormRead['values'] = {}): AppointmentFormRead {
  return {
    definitionId: asOpaqueId<'FormDefinitionId'>('workspace-appointment-definition'),
    fields: [
      {
        key: 'need',
        label: '是否需要上门',
        type: 'radio',
        required: true,
        readOnly: false,
        options: [{ value: '1', label: '需要上门' }, { value: '0', label: '暂不上门' }],
      },
      { key: 'datetime', label: '预约时间', type: 'datetime', required: true, readOnly: false },
      { key: 'note', label: '备注', type: 'textarea', required: false, readOnly: false },
    ],
    values,
  }
}

function storageFor() {
  const values = new Map<string, unknown>()
  const storage = {
    read: vi.fn(async (key: StorageKey) => succeeded(values.get(key.key) ?? null)),
    write: vi.fn(async (key: StorageKey, value: unknown) => {
      values.set(key.key, value)
      return succeeded(undefined)
    }),
    remove: vi.fn(async (key: StorageKey) => {
      values.delete(key.key)
      return succeeded(undefined)
    }),
  } as unknown as StoragePort
  return { storage, values }
}

function navigation() {
  return { navigate: vi.fn(async () => undefined), back: vi.fn(async () => undefined) }
}

function configureWorkspace(
  detail: WorkOrderDetail = appointmentDetail(),
  form: AppointmentFormRead = appointmentForm(),
  sharedStorage?: ReturnType<typeof storageFor>,
  getSession: () => SessionSnapshot | null = () => session,
) {
  const storage = sharedStorage ?? storageFor()
  const nextNavigation = navigation()
  const api: TechnicianApiReadPort = {
    getWorkOrderDetail: vi.fn(async () => succeeded(detail)),
  } as unknown as TechnicianApiReadPort
  const command: TechnicianApiCommandPort = {
    readAppointmentForm: vi.fn(async () => succeeded(form)),
    submitAppointment: vi.fn(async () => succeeded(undefined)),
  } as unknown as TechnicianApiCommandPort
  const store = useActionWorkspaceStore()
  store.configure({
    apiRead: api,
    commandApi: command,
    storage: storage.storage,
    navigation: nextNavigation,
    getSession,
    debounceMs: 5,
    now: () => '2026-04-20T10:00:00.000Z',
  })
  return { store, api, command, storage, navigation: nextNavigation }
}

async function openWorkspace(
  store: ReturnType<typeof useActionWorkspaceStore>,
  workOrderId: WorkOrderId = asOpaqueId<'WorkOrderId'>('workspace-work-order'),
  nodeId: WorkflowNodeRuntimeId = asOpaqueId<'WorkflowNodeRuntimeId'>('workspace-appointment-node'),
) {
  return store.load({ workOrderId, workflowNodeId: nodeId, actionIntent: 'set_appointment' })
}

describe('Action Workspace runtime and Appointment content boundary', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens an enabled Current Action through the Workflow projection', async () => {
    const { store, command } = configureWorkspace()
    const result = await openWorkspace(store)

    expect(result.state).toBe('succeeded')
    expect(store.descriptor).toMatchObject({
      actionIntent: 'set_appointment',
      contentKind: 'dynamic_form',
      execution: 'enabled',
      title: '预约上门时间',
    })
    expect(command.readAppointmentForm).toHaveBeenCalledTimes(1)
    expect(store.appointmentFields.map((field) => field.key)).toEqual(['need', 'datetime', 'note'])
  })

  it('blocks a disabled or unsupported action without reading or submitting content', async () => {
    const detail: WorkOrderDetail = {
      id: asOpaqueId<'WorkOrderId'>('place-order-work-order'),
      workflowNodes: [{
        id: asOpaqueId<'WorkflowNodeRuntimeId'>('place-order-node'),
        category: 'placeOrder',
        lifecycle: 'active',
        displayName: '下单',
        visibility: { evidenceState: 'verified', viewableRoleIds: [roleId] },
      }],
    }
    const { store, command } = configureWorkspace(detail)
    const result = await store.load({
      workOrderId: detail.id,
      workflowNodeId: detail.workflowNodes![0].id,
      actionIntent: 'place_order',
    })

    expect(result.error?.category).toBe('unsupported_capability')
    expect(store.lifecycle).toBe('blocked')
    expect(command.readAppointmentForm).not.toHaveBeenCalled()
  })

  it('scopes draft identity to Work Order, workflow node, action, and content', () => {
    const base = {
      userId: asOpaqueId<'UserId'>('user-a'),
      workOrderId: asOpaqueId<'WorkOrderId'>('work-order-a'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('node-a'),
      actionIntent: 'set_appointment' as const,
      contentKind: 'dynamic_form' as const,
      contentIdentity: 'definition-a',
    }
    const otherOrder = actionDraftStorageKey(actionDraftIdentityFor({ ...base, workOrderId: asOpaqueId<'WorkOrderId'>('work-order-b') }))
    const otherNode = actionDraftStorageKey(actionDraftIdentityFor({ ...base, workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('node-b') }))
    expect(otherOrder).not.toBe(otherNode)
    expect(otherOrder).not.toContain('work-order-a')
    expect(actionDraftStorageKey(actionDraftIdentityFor(base))).not.toBe(otherOrder)
  })

  it('does not restore a draft across authenticated users', async () => {
    const shared = storageFor()
    const userA = { ...session, user: { ...session.user, id: asOpaqueId<'UserId'>('user-a') } }
    const userB = { ...session, user: { ...session.user, id: asOpaqueId<'UserId'>('user-b') } }
    const first = configureWorkspace(appointmentDetail(), appointmentForm(), shared, () => userA)
    await openWorkspace(first.store)
    first.store.setField('need', '1')
    await first.store.flushDraft()

    const second = configureWorkspace(appointmentDetail(), appointmentForm(), shared, () => userB)
    await openWorkspace(second.store)
    expect(second.store.appointmentForm?.values.need).toBeUndefined()
    expect(second.store.draftStatus).toBe('clean')
  })

  it('debounces edits into a local draft without a manual save command', async () => {
    const { store, storage } = configureWorkspace()
    await openWorkspace(store)
    store.setField('need', '1')
    store.setField('datetime', '2026-04-20 10:00')
    expect(storage.storage.write).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(storage.storage.write).toHaveBeenCalledTimes(1)
    expect(store.draftStatus).toBe('saved_local')
    expect(storage.values.values().next().value).toMatchObject({
      status: 'unfinished',
      values: { need: '1', datetime: '2026-04-20 10:00' },
    })
  })

  it('leaves and reopens the same Action with its scoped draft restored', async () => {
    const { store, storage } = configureWorkspace()
    await openWorkspace(store)
    store.setField('need', '1')
    await store.flushDraft()
    store.clear()
    store.configure({
      apiRead: {
        getWorkOrderDetail: vi.fn(async () => succeeded(appointmentDetail())),
      } as unknown as TechnicianApiReadPort,
      commandApi: {
        readAppointmentForm: vi.fn(async () => succeeded(appointmentForm())),
        submitAppointment: vi.fn(async () => succeeded(undefined)),
      } as unknown as TechnicianApiCommandPort,
      storage: storage.storage,
      navigation: navigation(),
      getSession: () => session,
      debounceMs: 5,
    })

    await openWorkspace(store)
    expect(store.appointmentForm?.values.need).toBe('1')
    expect(store.draftStatus).toBe('restore_available')
  })

  it('does not consume a draft from another Work Order or a changed workflow node', async () => {
    const first = configureWorkspace(appointmentDetail('work-order-a', 'node-a'))
    await openWorkspace(first.store, asOpaqueId<'WorkOrderId'>('work-order-a'), asOpaqueId<'WorkflowNodeRuntimeId'>('node-a'))
    first.store.setField('need', '1')
    await first.store.flushDraft()

    const second = configureWorkspace(appointmentDetail('work-order-b', 'node-a'), appointmentForm(), first.storage)
    await openWorkspace(second.store, asOpaqueId<'WorkOrderId'>('work-order-b'), asOpaqueId<'WorkflowNodeRuntimeId'>('node-a'))
    expect(second.store.appointmentForm?.values.need).toBeUndefined()

    const changed = configureWorkspace(appointmentDetail('work-order-a', 'node-b'), appointmentForm(), first.storage)
    await openWorkspace(changed.store, asOpaqueId<'WorkOrderId'>('work-order-a'), asOpaqueId<'WorkflowNodeRuntimeId'>('node-b'))
    expect(changed.store.appointmentForm?.values.need).toBeUndefined()
  })

  it('keeps local input on retryable submit failure and never reports fake success offline', async () => {
    const { store, command, storage } = configureWorkspace()
    vi.mocked(command.submitAppointment).mockResolvedValueOnce({
      state: 'failed_retryable',
      error: { category: 'network_retryable', message: 'offline', retryable: true },
    })
    await openWorkspace(store)
    store.setField('need', '1')
    store.setField('datetime', '2026-04-20 10:00')
    await store.flushDraft()

    const result = await store.submit()
    expect(result.state).toBe('failed_retryable')
    expect(store.lifecycle).toBe('failed_retryable')
    expect(store.appointmentForm?.values.datetime).toBe('2026-04-20 10:00')
    expect(storage.values.size).toBe(1)
  })

  it('clears the unfinished draft and rereads authoritative state after success', async () => {
    const { store, api, storage } = configureWorkspace()
    await openWorkspace(store)
    store.setField('need', '1')
    store.setField('datetime', '2026-04-20 10:00')
    await store.flushDraft()

    const result = await store.submit()
    expect(result.state).toBe('succeeded')
    expect(store.lifecycle).toBe('succeeded')
    expect(storage.storage.remove).toHaveBeenCalledTimes(1)
    expect(storage.values.size).toBe(0)
    expect(api.getWorkOrderDetail).toHaveBeenCalledTimes(2)
  })

  it('keeps business success terminal when draft cleanup and refresh remain pending', async () => {
    const { store, api, command, storage } = configureWorkspace()
    await openWorkspace(store)
    store.setField('need', '1')
    store.setField('datetime', '2026-04-20 10:00')
    await store.flushDraft()

    vi.mocked(api.getWorkOrderDetail).mockResolvedValueOnce({
      state: 'failed_retryable',
      error: { category: 'network_retryable', message: 'offline', retryable: true },
    })
    vi.mocked(storage.storage.remove).mockResolvedValue({
      state: 'failed_retryable',
      error: { category: 'network_retryable', message: 'storage unavailable', retryable: true },
    })
    vi.mocked(storage.storage.write).mockResolvedValue({
      state: 'failed_retryable',
      error: { category: 'network_retryable', message: 'storage unavailable', retryable: true },
    })

    const result = await store.submit()
    expect(result.state).toBe('succeeded')
    expect(store.businessResult).toBe('succeeded')
    expect(store.lifecycle).toBe('succeeded')
    expect(store.draftFinalization).toBe('pending')
    expect(store.refreshStatus).toBe('pending')
    expect(store.canSubmit).toBe(false)
    expect(command.submitAppointment).toHaveBeenCalledTimes(1)
    expect((await store.submit()).state).toBe('succeeded')
    expect(command.submitAppointment).toHaveBeenCalledTimes(1)
  })

  it('validates before entering confirmation and routes through the time step', async () => {
    const { store, navigation, storage } = configureWorkspace()
    await openWorkspace(store)

    const missing = await store.continueToConfirmation()
    expect(missing.state).toBe('failed_terminal')
    expect(missing.error?.category).toBe('validation')
    expect(navigation.navigate).not.toHaveBeenCalled()

    store.setField('need', '1')
    const toTime = await store.openAppointmentTimeSelection()
    expect(toTime.state).toBe('succeeded')
    expect(navigation.navigate).toHaveBeenCalledWith(actionWorkspaceTimeRouteFor(
      asOpaqueId<'WorkOrderId'>('workspace-work-order'),
      asOpaqueId<'WorkflowNodeRuntimeId'>('workspace-appointment-node'),
      'set_appointment',
    ))
    expect(storage.storage.write).toHaveBeenCalledTimes(1)
  })

  it('keeps the selected datetime in the dynamic form and routes to confirmation', async () => {
    const { store, navigation } = configureWorkspace()
    await openWorkspace(store)
    store.setField('need', '1')

    expect(store.setAppointmentTime('2026-04-20 14:00').state).toBe('succeeded')
    const result = await store.openConfirmation()

    expect(result.state).toBe('succeeded')
    expect(store.appointmentForm?.values.datetime).toBe('2026-04-20 14:00')
    expect(navigation.navigate).toHaveBeenCalledWith(actionWorkspaceConfirmationRouteFor(
      asOpaqueId<'WorkOrderId'>('workspace-work-order'),
      asOpaqueId<'WorkflowNodeRuntimeId'>('workspace-appointment-node'),
      'set_appointment',
    ))
  })

  it('does not re-submit after business success and exposes post-success navigation', async () => {
    const { store, command, navigation } = configureWorkspace()
    await openWorkspace(store)
    store.setField('need', '1')
    store.setAppointmentTime('2026-04-20 14:00')
    expect((await store.submit()).state).toBe('succeeded')
    expect(store.businessResult).toBe('succeeded')
    expect(store.canSubmit).toBe(false)

    await store.submit()
    expect(command.submitAppointment).toHaveBeenCalledTimes(1)
    await store.navigateToDetail()
    await store.navigateToList()
    expect(navigation.navigate).toHaveBeenNthCalledWith(1, '/pages/work-orders/detail?id=workspace-work-order')
    expect(navigation.navigate).toHaveBeenNthCalledWith(2, '/pages/work-orders/work-orders')
  })

  it('uses the same Mock raw read/command path as the real Action Workspace', async () => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    setBusinessMockMode('data')
    resetMockCommandState()
    const read = createRoleScopedTechnicianApiReadAdapter(
      createUniApiReadTransport({
        apiBaseUrl: 'https://example.invalid',
        getSessionRef: () => session.sessionRef,
        getMockActor: () => ({ userId: String(session.user.id), roleId: String(roleId) }),
        mockLatencyMs: 0,
      }),
      () => roleId,
      { cascadeTenantId: 'workspace-tenant' },
    )
    const command = createTechnicianApiCommandAdapter(
      createUniApiCommandTransport({
        apiBaseUrl: 'https://example.invalid',
        getSessionRef: () => session.sessionRef,
      }),
      read,
    )
    const storage = storageFor()
    const store = useActionWorkspaceStore()
    store.configure({
      apiRead: read,
      commandApi: command,
      storage: storage.storage,
      navigation: navigation(),
      getSession: () => session,
      debounceMs: 0,
    })

    const result = await store.load({
      workOrderId: asOpaqueId<'WorkOrderId'>('mock-work-order-016-appointment-success'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-016-appointment'),
      actionIntent: 'set_appointment',
    })
    expect(result.state).toBe('succeeded')
    store.setField('need', '1')
    store.setField('datetime', '2026-04-20 10:00')
    expect((await store.submit()).state).toBe('succeeded')
    expect(store.refreshStatus).toBe('refreshed')
    expect(storage.values.size).toBe(0)
  })

  it('keeps Appointment content dynamic-form driven and never embeds a raw endpoint or storage API', async () => {
    const source = await readFile(new URL('../../src/pages/work-orders/action-workspace.vue', import.meta.url), 'utf8')
    expect(source).toContain('workspace.appointmentFields')
    expect(source).toContain('workspace.setField')
    expect(source).not.toContain('uni.getStorage')
    expect(source).not.toContain('biz/extForm')
    expect(source).not.toContain('mock-work-order-')
  })
})
