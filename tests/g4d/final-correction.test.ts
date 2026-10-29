import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createActionDraftRepository } from '@runtimes/action'

import {
  createTechnicianApiCommandAdapter,
  type ApiCommandTransport,
} from '@adapters/api/technician-api-commands'
import {
  createUniApiCommandTransport,
  type UniApiCommandRequestExecutor,
} from '@adapters/api/uni-api-command-transport'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
import {
  isMockOwnedCommand,
  mockCommandScenarioIds,
  resetMockCommandState,
  resetBusinessMockCache,
  setBusinessMockMode,
} from '@adapters/api/mock'
import { createRoleScopedTechnicianApiReadAdapter } from '@adapters/api/technician-api'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { useWorkOrderListStore } from '@features/work-orders/list'
import {
  appointmentRuntimeFieldsFor,
  normalizeAppointmentForm,
} from '@features/work-orders/appointment-form-runtime'
import { detailWorkflowProjectionFor } from '@features/work-orders/detail-workflow'
import type {
  FormDataRead,
  FormDefinitionRead,
  FormMutationCheckpoints,
  ReadPage,
  SessionSnapshot,
  StorageKey,
  StoragePort,
  SubmitAppointmentInput,
  TechnicianApiReadPort,
  WorkOrderDetail,
} from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'

const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('synthetic-session'),
  user: { id: asOpaqueId<'UserId'>('synthetic-user') },
  currentRole: { id: asOpaqueId<'RoleId'>('synthetic-role') },
  capabilityNames: [],
}

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}
const wireCheckpoints: FormMutationCheckpoints = {
  beforeFormDispatch: async () => ({ state: 'succeeded' }),
  afterFormSaved: async () => ({ state: 'succeeded' }),
  beforeWorkflowDispatch: async () => ({ state: 'succeeded' }),
  afterWorkflowCompleted: async () => ({ state: 'succeeded' }),
}
function memoryStorage(): StoragePort {
  const values = new Map<string, unknown>()
  return {
    read: vi.fn(async <T>(key: StorageKey) => ({ state: 'succeeded' as const, data: (values.get(key.key) ?? null) as T | null })),
    write: vi.fn(async (key: StorageKey, value: unknown) => { values.set(key.key, value); return succeeded(undefined) }),
    remove: vi.fn(async (key: StorageKey) => { values.delete(key.key); return succeeded(undefined) }),
    listKeys: vi.fn(async () => succeeded([...values.keys()])),
  } as unknown as StoragePort
}

function formDefinition(id = 'appointment-definition'): FormDefinitionRead {
  return {
    id: asOpaqueId<'FormDefinitionId'>(id),
    purpose: 'appointment',
    fields: [
      { fieldId: 'need', valueKey: 'need', label: '是否需要上门', type: 'radio', required: true, readOnly: false, options: [
        { value: '1', label: '需要上门' },
        { value: '0', label: '暂不上门' },
      ] },
      { fieldId: 'datetime', valueKey: 'datetime', label: '预约时间', type: 'datetime', required: true, readOnly: false },
      { fieldId: 'note', valueKey: 'note', label: '备注', type: 'textarea', required: false, readOnly: false },
      { fieldId: 'source', valueKey: 'source', label: '来源', type: 'text', required: false, readOnly: true },
    ],
  }
}

function readPortFor(
  definition: FormDefinitionRead,
  data: ReadPage<FormDataRead> = { items: [] },
): TechnicianApiReadPort {
  return {
    getFormDefinition: vi.fn(async () => succeeded(definition)),
    getFormData: vi.fn(async () => succeeded(data)),
  } as unknown as TechnicianApiReadPort
}

describe('G4-D final functional and safety corrections', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'test')
    vi.stubEnv('VITE_XLINK_MOCK', '')
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'false')
    resetBusinessMockCache()
    resetMockCommandState()
  })

  it('normalizes HTTP 200 business failures and malformed responses before Adapter mapping', async () => {
    const request = vi.fn<UniApiCommandRequestExecutor>((options) => {
      if (options.url.includes('session')) {
        options.success?.({ statusCode: 200, data: { success: false, code: 'SESSION_EXPIRED', message: 'private' } } as never)
        return
      }
      options.success?.({ statusCode: 200, data: { success: false, code: 'TERMINAL', message: 'private' } } as never)
    })
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request,
    })

    await expect(transport.execute({ method: 'POST', path: 'workflow/process', body: { sid: 'real-work-order' } }))
      .rejects.toMatchObject({ category: 'unsupported_capability' })

    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    const command = createTechnicianApiCommandAdapter(transport, readPortFor(formDefinition()))
    const failed = await command.acceptOrder({
      workOrderId: asOpaqueId<'WorkOrderId'>('real-work-order'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('node'),
    })
    expect(failed.state).toBe('failed_terminal')
    expect(failed.error).toMatchObject({ category: 'server_terminal' })
    expect(failed.error?.message).not.toContain('private')

    const sessionTransport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid/session',
      getSessionRef: () => session.sessionRef,
      request,
    })
    await expect(sessionTransport.execute({ method: 'POST', path: 'workflow/process', body: { sid: 'real-work-order' } }))
      .rejects.toMatchObject({ category: 'session_invalid' })

    const malformed = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid/malformed',
      getSessionRef: () => session.sessionRef,
      request: vi.fn<UniApiCommandRequestExecutor>((options) => {
        options.success?.({ statusCode: 200, data: null } as never)
      }),
    })
    await expect(malformed.execute({ method: 'POST', path: 'basic/serviceAppointment/selfExamination', body: { saId: 'real-work-order' } }))
      .rejects.toMatchObject({ category: 'server_terminal' })
  })

  it('normalizes the R1 literal restart response as session invalid', async () => {
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request: vi.fn<UniApiCommandRequestExecutor>((options) => {
        options.success?.({ statusCode: 200, data: 'restart' } as never)
      }),
    })

    await expect(transport.execute({
      method: 'POST',
      path: 'basic/serviceAppointment/selfExamination',
      body: { saId: 'real-work-order' },
    })).rejects.toMatchObject({ category: 'session_invalid' })
  })

  it('does not reread List after a normalized failed workflow process', async () => {
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    const request = vi.fn<UniApiCommandRequestExecutor>((options) => {
      if (options.url.includes('selfExamination')) {
        options.success?.({ statusCode: 200, data: { data: [] } } as never)
        return
      }
      options.success?.({ statusCode: 200, data: { success: false, code: 'TERMINAL', message: 'private' } } as never)
    })
    const command = createTechnicianApiCommandAdapter(
      createUniApiCommandTransport({ apiBaseUrl: 'https://example.invalid', getSessionRef: () => session.sessionRef, request }),
      readPortFor(formDefinition()),
    )
    const api = {
      listWorkOrders: vi.fn(async () => succeeded({ items: [{ id: asOpaqueId<'WorkOrderId'>('real-work-order') }], page: 1, pageSize: 20, totalCount: 1 })),
    } as unknown as TechnicianApiReadPort
    const store = useWorkOrderListStore()
    store.configureApi(api, () => session)
    store.configureCommandApi(command)
    await store.load()
    const result = await store.acceptOrder({
      workOrderId: asOpaqueId<'WorkOrderId'>('real-work-order'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('node'),
    })
    expect(result.state).toBe('failed_terminal')
    expect(api.listWorkOrders).toHaveBeenCalledTimes(1)
  })

  it('isolates appointment form data: definition-only reads never query all records', async () => {
    const getFormData = vi.fn(async () => succeeded<ReadPage<FormDataRead>>({
      items: [{
        id: asOpaqueId<'FormDataId'>('requested-form-data'),
        definitionId: asOpaqueId<'FormDefinitionId'>('appointment-definition'),
        values: { datetime: '2026-04-20 10:00' },
      }],
    }))
    const readPort = {
      getFormDefinition: vi.fn(async () => succeeded(formDefinition())),
      getFormData,
    } as unknown as TechnicianApiReadPort
    const command = createTechnicianApiCommandAdapter({ execute: vi.fn() }, readPort)

    const empty = await command.readAppointmentForm({})
    expect(empty).toMatchObject({ state: 'succeeded', data: { values: {} } })
    expect(getFormData).not.toHaveBeenCalled()

    const exact = await command.readAppointmentForm({ formDataId: asOpaqueId<'FormDataId'>('requested-form-data') })
    expect(exact.data?.values.datetime).toBe('2026-04-20 10:00')
    expect(getFormData).toHaveBeenCalledWith({
      definitionId: asOpaqueId<'FormDefinitionId'>('2522989775781119510'),
      dataId: asOpaqueId<'FormDataId'>('requested-form-data'),
    })

    getFormData.mockResolvedValueOnce(succeeded({
      items: [{
        id: asOpaqueId<'FormDataId'>('other-work-order-form-data'),
        definitionId: asOpaqueId<'FormDefinitionId'>('appointment-definition'),
        values: { datetime: 'wrong-record' },
      }],
    }))
    const contaminated = await command.readAppointmentForm({ formDataId: asOpaqueId<'FormDataId'>('requested-form-data') })
    expect(contaminated.state).toBe('failed_terminal')
    expect(contaminated.error?.category).toBe('server_terminal')
  })

  it('applies dynamic appointment validation before any submit command', async () => {
    const id = asOpaqueId<'WorkOrderId'>('validation-work-order')
    const nodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('appointment-node')
    const api = {
      getWorkOrderDetail: vi.fn(async () => succeeded<WorkOrderDetail>({
        id,
        workflowNodes: [{ id: nodeId, category: 'forms', lifecycle: 'active', displayName: '预约', formPurpose: 'appointment', visibility: { evidenceState: 'verified', viewableRoleIds: [session.currentRole!.id] } }],
      })),
    } as unknown as TechnicianApiReadPort
    const command = {
      readAppointmentForm: vi.fn(async () => succeeded({
        definitionId: formDefinition().id,
        fields: formDefinition().fields!,
        values: { source: 'backend value' },
      })),
      submitAppointment: vi.fn(async (input: SubmitAppointmentInput) => {
        const id = asOpaqueId<'FormDataId'>('final-correction-saved-form')
        await input.mutation?.afterFormSaved(id)
        await input.mutation?.beforeWorkflowDispatch(id)
        await input.mutation?.afterWorkflowCompleted()
        return succeeded(undefined)
      }),
      inspectAcceptOrder: vi.fn(),
      acceptOrder: vi.fn(),
    }
    const storage = memoryStorage()
    const store = useActionWorkspaceStore()
    store.configure({
      apiRead: api,
      commandApi: command,
      draftRepository: createActionDraftRepository(storage),
      storage,
      navigation: { navigate: vi.fn(async () => undefined), back: vi.fn(async () => undefined) },
      getSession: () => session,
      debounceMs: 0,
    })
    await store.load({ workOrderId: id, workflowNodeId: nodeId, actionIntent: 'set_appointment' })

    const readonlyResult = store.setField('source', 'changed')
    expect(readonlyResult.error?.category).toBe('validation')
    expect(store.appointmentForm?.values.source).toBe('backend value')
    const optionResult = store.setField('need', 'unsupported')
    expect(optionResult.error?.category).toBe('validation')
    expect(store.appointmentForm?.values.need).toBeUndefined()

    const missing = await store.submit()
    expect(missing.error?.category).toBe('validation')
    expect(store.lifecycle).toBe('in_progress')
    expect(command.submitAppointment).not.toHaveBeenCalled()

    store.setField('need', '1')
    store.setField('datetime', '2026-04-20 10:00')
    expect((await store.submit()).state).toBe('succeeded')
    expect(command.submitAppointment).toHaveBeenCalledTimes(1)
  })

  it('keeps Runtime execution authorization separate from action intent', () => {
    const detail: WorkOrderDetail = {
      id: asOpaqueId<'WorkOrderId'>('appointment-work-order'),
      workflowNodes: [{
        id: asOpaqueId<'WorkflowNodeRuntimeId'>('appointment-node'),
        category: 'forms',
        lifecycle: 'active',
        displayName: '预约上门时间',
        formPurpose: 'appointment',
        visibility: { evidenceState: 'verified', viewableRoleIds: [session.currentRole!.id] },
      }],
    }
    expect(detailWorkflowProjectionFor(detail, session).currentTask).toMatchObject({
      actionIntent: 'set_appointment',
      execution: 'enabled',
    })
  })

  it('routes appointment fields, state, options, and values through Dynamic Form Runtime', () => {
    const form = {
      fields: formDefinition().fields!,
      values: { source: 'backend value' },
    }
    const fields = appointmentRuntimeFieldsFor(form)
    expect(fields.map((field) => field.valueKey)).toEqual(['need', 'datetime', 'note', 'source'])
    expect(fields.find((field) => field.valueKey === 'need')?.runtime.optionProvider).toEqual({
      state: 'provider',
      provider: { kind: 'inline' },
    })
    expect(fields.find((field) => field.valueKey === 'source')?.runtime).toMatchObject({
      readOnly: true,
      required: false,
    })

    expect(normalizeAppointmentForm({
      ...form,
      values: {
        need: '1',
        datetime: ' 2026-04-20 10:00 ',
        source: 'backend value',
      },
    })).toEqual({
      state: 'succeeded',
      data: {
        need: '1',
        datetime: '2026-04-20 10:00',
        source: 'backend value',
      },
    })
  })

  it('does not reread Detail after an appointment command failure', async () => {
    const id = asOpaqueId<'WorkOrderId'>('failed-appointment-work-order')
    const nodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('failed-appointment-node')
    const api = {
      getWorkOrderDetail: vi.fn(async () => succeeded<WorkOrderDetail>({
        id,
        workflowNodes: [{
          id: nodeId,
          category: 'forms',
          lifecycle: 'active',
          displayName: '预约上门时间',
          formPurpose: 'appointment',
          visibility: { evidenceState: 'verified', viewableRoleIds: [session.currentRole!.id] },
        }],
      })),
    } as unknown as TechnicianApiReadPort
    const command = {
      readAppointmentForm: vi.fn(async () => succeeded({
        definitionId: formDefinition().id,
        fields: formDefinition().fields!,
        values: { need: '1', datetime: '2026-04-20 10:00' },
      })),
      submitAppointment: vi.fn(async () => ({
        state: 'failed_retryable' as const,
        error: { category: 'network_retryable' as const, message: 'retry', retryable: true },
      })),
      inspectAcceptOrder: vi.fn(),
      acceptOrder: vi.fn(),
    }
    const storage = memoryStorage()
    const store = useActionWorkspaceStore()
    store.configure({
      apiRead: api,
      commandApi: command,
      draftRepository: createActionDraftRepository(storage),
      storage,
      navigation: { navigate: vi.fn(async () => undefined), back: vi.fn(async () => undefined) },
      getSession: () => session,
      debounceMs: 0,
    })
    await store.load({ workOrderId: id, workflowNodeId: nodeId, actionIntent: 'set_appointment' })
    expect((await store.submit()).state).toBe('failed_retryable')
    expect(api.getWorkOrderDetail).toHaveBeenCalledTimes(1)
  })

  it('blocks real mutations by default while allowing read-only commands', async () => {
    setBusinessMockMode('off')
    const request = vi.fn<UniApiCommandRequestExecutor>((options) => {
      options.success?.({ statusCode: 200, data: { data: [] } } as never)
    })
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request,
    })
    await expect(transport.execute({ method: 'POST', path: 'workflow/process', body: { sid: 'real-work-order' } }))
      .rejects.toMatchObject({ category: 'unsupported_capability' })
    await expect(transport.execute({ method: 'POST', path: 'biz/extForm/upsert/definition', body: { dataStr: '{}' } }))
      .rejects.toMatchObject({ category: 'unsupported_capability' })
    await expect(transport.execute({
      method: 'POST',
      path: 'biz/extForm/upsert/definition',
      body: { dataStr: JSON.stringify({ sid: 'mock-work-order-003' }) },
    })).rejects.toMatchObject({ category: 'server_terminal' })
    await transport.execute({ method: 'POST', path: 'basic/serviceAppointment/selfExamination', body: { saId: 'real-work-order' } })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('blocks deferred appointment writes when the real encoding is still unverified', async () => {
    vi.stubEnv('VITE_XLINK_ENABLE_REAL_WRITES', 'true')
    setBusinessMockMode('off')
    const request = vi.fn<UniApiCommandRequestExecutor>()
    const transport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request,
    })

    await expect(transport.execute({
      method: 'POST',
      path: 'biz/extForm/upsert/appointment-definition',
      body: { dataStr: JSON.stringify({ sid: 'real-work-order', need: '0' }) },
      safety: 'deferred_appointment_datetime_encoding_unknown',
    })).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })

  it('preserves accept Mock commands but blocks raw forms Appointment on single-record command path', async () => {
    setBusinessMockMode('data')
    const commandRequests = vi.fn<UniApiCommandRequestExecutor>()
    const commandTransport = createUniApiCommandTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      request: commandRequests,
    })
    const readTransport = createUniApiReadTransport({
      apiBaseUrl: 'https://example.invalid',
      getSessionRef: () => session.sessionRef,
      getMockActor: () => ({ userId: session.user.id, roleId: session.currentRole!.id }),
      request: vi.fn(),
      mockLatencyMs: 0,
    })
    const read = createRoleScopedTechnicianApiReadAdapter(readTransport, () => session.currentRole!.id, { cascadeTenantId: 'synthetic-tenant' })
    const command = createTechnicianApiCommandAdapter(commandTransport, read)

    const direct = asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.acceptDirect)
    const retryable = asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.acceptRetryable)
    const terminal = asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.acceptTerminal)
    for (const id of [direct, retryable, terminal]) {
      const detail = await read.getWorkOrderDetail(id)
      const node = detail.data?.workflowNodes?.[0]
      expect(node).toBeDefined()
      const inspected = await command.inspectAcceptOrder({ workOrderId: id, workflowNodeId: node!.id })
      expect(inspected.state).toBe('succeeded')
      const accepted = await command.acceptOrder({ workOrderId: id, workflowNodeId: node!.id })
      if (id === direct) expect(accepted.state).toBe('succeeded')
      else expect(accepted.state).toBe(id === retryable ? 'failed_retryable' : 'failed_terminal')
    }

    const appointmentFailureIds = [
      asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.appointmentRetryable),
      asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.appointmentTerminal),
    ] as const
    for (const id of appointmentFailureIds) {
      const detail = await read.getWorkOrderDetail(id)
      const projection = detailWorkflowProjectionFor(detail.data ?? null, session)
      expect(projection.currentTask?.sourceNodeType).toBe('forms')
      expect(projection.currentTask?.execution).toBe('disabled_read_only')
      const form = await command.readAppointmentForm({})
      const result = await command.submitAppointment({
        workOrderId: id,
        workflowNodeId: projection.currentTask!.nodeId,
        sourceNodeType: projection.currentTask!.sourceNodeType,
        mutation: wireCheckpoints,
        values: { need: '1', datetime: '2026-04-20 10:00' },
      })
      expect(result.state).toBe('failed_terminal')
      expect(result.error?.category).toBe('unsupported_capability')
      expect(form.state).toBe('succeeded')
    }

    expect(isMockOwnedCommand('workflow/process', { sid: mockCommandScenarioIds.acceptDirect })).toBe(true)
    expect(commandRequests).not.toHaveBeenCalled()
  })
})
