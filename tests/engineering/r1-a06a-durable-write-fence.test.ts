import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginActionMutation,
  loadActionMutationReceipt,
  recordActionFormSaved,
  recordActionWorkflowCompleted,
  type ActionMutationScope,
} from '@features/work-orders/action-mutation-receipt'
import type { StorageKey, StoragePort } from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'
import type { FormMutationCheckpoints, TechnicianApiReadPort } from '@shared/ports'
import {
  ApiCommandTransportError,
  createTechnicianApiCommandAdapter,
  type ApiCommandRequest,
} from '@adapters/api/technician-api-commands'

const scope: ActionMutationScope = {
  userId: 'a06a-user', workOrderId: 'a06a-work-order', workflowNodeId: 'a06a-node',
  formDefinitionId: 'a06a-definition', authorizationScope: 'a06a-session-and-role',
}
const id = asOpaqueId<'FormDataId'>('a06a-server-form-id')

function memoryStore() {
  const records = new Map<string, unknown>()
  const storage = {
    read: vi.fn(async (key: StorageKey) => ({ state: 'succeeded' as const, data: records.get(key.key) ?? null })),
    write: vi.fn(async (key: StorageKey, value: unknown) => {
      records.set(key.key, value)
      return { state: 'succeeded' as const, data: undefined }
    }),
    remove: vi.fn(async (key: StorageKey) => {
      records.delete(key.key)
      return { state: 'succeeded' as const, data: undefined }
    }),
    listKeys: vi.fn(async () => ({ state: 'succeeded' as const, data: [...records.keys()] })),
  } as unknown as StoragePort
  return { storage, records }
}
function checkpoints(storage: StoragePort, actionScope: ActionMutationScope): FormMutationCheckpoints {
  const asVoid = async (promise: Promise<OperationSnapshot<unknown>>): Promise<OperationSnapshot<void>> => {
    const result = await promise
    return result.state === 'succeeded'
      ? { state: 'succeeded' }
      : { state: result.state, ...(result.error ? { error: result.error } : {}) }
  }
  return {
    beforeFormDispatch: () => asVoid(beginActionMutation(storage, actionScope, 'form_dispatched')),
    afterFormSaved: (formDataId) => asVoid(recordActionFormSaved(storage, actionScope, formDataId)),
    beforeWorkflowDispatch: (formDataId) => asVoid(beginActionMutation(storage, actionScope, 'workflow_dispatched', formDataId)),
    afterWorkflowCompleted: () => asVoid(recordActionWorkflowCompleted(storage, actionScope)),
  }
}
const commandInput = {
  workOrderId: asOpaqueId<'WorkOrderId'>(scope.workOrderId),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(scope.workflowNodeId),
  definitionId: asOpaqueId<'FormDefinitionId'>(scope.formDefinitionId),
  values: { memo: 'synthetic-only' },
}

describe('A06-A durable FormData / Workflow dispatch fence', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('persists an unknown save before dispatch and blocks a restarted workspace', async () => {
    const { storage } = memoryStore()
    expect((await beginActionMutation(storage, scope, 'form_dispatched')).state).toBe('succeeded')
    expect((await loadActionMutationReceipt(storage, scope)).data).toMatchObject({ phase: 'form_dispatched' })
    expect((await beginActionMutation(storage, scope, 'form_dispatched')).state).toBe('failed_terminal')
  })

  it('retains the server ID after a save ACK and permits only a matching Workflow continuation', async () => {
    const { storage } = memoryStore()
    await beginActionMutation(storage, scope, 'form_dispatched')
    expect((await recordActionFormSaved(storage, scope, id)).state).toBe('succeeded')
    expect((await loadActionMutationReceipt(storage, scope)).data).toMatchObject({ phase: 'form_saved', formDataId: id })
    expect((await beginActionMutation(storage, scope, 'workflow_dispatched', asOpaqueId<'FormDataId'>('wrong-id'))).state).toBe('failed_terminal')
    expect((await beginActionMutation(storage, scope, 'workflow_dispatched', id)).state).toBe('succeeded')
    expect((await beginActionMutation(storage, scope, 'workflow_dispatched', id)).state).toBe('failed_terminal')
    expect((await recordActionWorkflowCompleted(storage, scope)).state).toBe('succeeded')
    expect((await loadActionMutationReceipt(storage, scope)).data).toMatchObject({ phase: 'completed', formDataId: id })
    expect((await beginActionMutation(storage, scope, 'form_dispatched', id)).state).toBe('failed_terminal')
  })

  it('blocks another role and fails closed when storage reads or writes fail', async () => {
    const { storage } = memoryStore()
    await beginActionMutation(storage, scope, 'form_dispatched')
    expect((await loadActionMutationReceipt(storage, { ...scope, authorizationScope: 'other-role' })).state).toBe('failed_terminal')
    vi.mocked(storage.read).mockRejectedValueOnce(new Error('storage unavailable'))
    expect((await beginActionMutation(storage, scope, 'form_dispatched')).state).toBe('failed_terminal')
    const fresh = memoryStore().storage
    vi.mocked(fresh.write).mockRejectedValueOnce(new Error('quota exceeded'))
    expect((await beginActionMutation(fresh, scope, 'form_dispatched')).state).toBe('failed_terminal')
  })

  it('serializes simultaneous reservations even through different StoragePort wrappers', async () => {
    const { storage, records } = memoryStore()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    vi.mocked(storage.read).mockImplementationOnce(async (key) => {
      await gate
      return { state: 'succeeded', data: records.get(key.key) ?? null }
    })
    const first = beginActionMutation(storage, scope, 'form_dispatched')
    const second = beginActionMutation({ ...storage } as StoragePort, scope, 'form_dispatched')
    expect((await second).state).toBe('failed_terminal')
    release()
    expect((await first).state).toBe('succeeded')
    expect(storage.write).toHaveBeenCalledTimes(1)
  })

  it('fails closed on H5 without a cross-tab Web Lock', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', {})
    const { storage } = memoryStore()
    expect((await beginActionMutation(storage, scope, 'form_dispatched')).state).toBe('failed_terminal')
    expect(storage.write).not.toHaveBeenCalled()
  })

  it('takes the H5 Web Lock before reading and writing a receipt', async () => {
    vi.stubGlobal('window', {})
    const lock = vi.fn(async (_key: string, _options: unknown, callback: () => Promise<unknown>) => callback())
    vi.stubGlobal('navigator', { locks: { request: lock } })
    const { storage } = memoryStore()
    expect((await beginActionMutation(storage, scope, 'form_dispatched')).state).toBe('succeeded')
    expect(lock).toHaveBeenCalledTimes(1)
    expect((await beginActionMutation(storage, scope, 'form_dispatched')).state).toBe('failed_terminal')
    expect(storage.write).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['timeout', new ApiCommandTransportError('synthetic timeout', 'network_retryable')],
    ['HTTP 500', new ApiCommandTransportError('synthetic 500', 'server_terminal')],
    ['HTTP 200 success:false', { success: false, message: 'synthetic rejection' }],
  ])('blocks first-create retry after %s', async (_label, response) => {
    const { storage } = memoryStore()
    const execute = vi.fn(async (_request: ApiCommandRequest) => {
      if (response instanceof Error) throw response
      return response
    })
    const adapter = createTechnicianApiCommandAdapter({ execute }, {} as TechnicianApiReadPort)
    const input = { ...commandInput, mutation: checkpoints(storage, scope) }
    expect((await adapter.saveDynamicForm!(input)).state).not.toBe('succeeded')
    expect((await loadActionMutationReceipt(storage, scope)).data).toMatchObject({ phase: 'form_dispatched' })
    expect((await adapter.saveDynamicForm!(input)).state).toBe('failed_terminal')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('persists a save ACK before Process and blocks Process retry after a failure', async () => {
    const { storage } = memoryStore()
    const phases: string[] = []
    const execute = vi.fn(async (request: ApiCommandRequest) => {
      const receipt = await loadActionMutationReceipt(storage, scope)
      phases.push(String(receipt.data?.phase))
      if (request.path === 'workflow/process') throw new ApiCommandTransportError('synthetic Process 500', 'server_terminal')
      return { success: true, data: { _id: id } }
    })
    const adapter = createTechnicianApiCommandAdapter({ execute }, {} as TechnicianApiReadPort)
    const mutation = checkpoints(storage, scope)
    const saved = await adapter.saveDynamicForm!({ ...commandInput, mutation })
    expect(saved).toMatchObject({ state: 'succeeded', data: id })
    const complete = { ...commandInput, formDataId: id, mutation }
    expect((await adapter.completeWorkflowNode!(complete)).state).toBe('failed_terminal')
    expect(phases).toEqual(['form_dispatched', 'workflow_dispatched'])
    expect((await loadActionMutationReceipt(storage, scope)).data).toMatchObject({ phase: 'workflow_dispatched', formDataId: id })
    expect((await adapter.completeWorkflowNode!(complete)).state).toBe('failed_terminal')
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('does not send FormData while durable storage is pending, then refuses on storage failure', async () => {
    const { storage } = memoryStore()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    vi.mocked(storage.write).mockImplementationOnce(async () => {
      await gate
      return { state: 'failed_terminal', error: { category: 'server_terminal', message: 'disk unavailable', retryable: false } }
    })
    const execute = vi.fn(async () => ({ success: true, data: { _id: id } }))
    const adapter = createTechnicianApiCommandAdapter({ execute }, {} as TechnicianApiReadPort)
    const pending = adapter.saveDynamicForm!({ ...commandInput, mutation: checkpoints(storage, scope) })
    await Promise.resolve()
    expect(execute).not.toHaveBeenCalled()
    release()
    expect((await pending).state).toBe('failed_terminal')
    expect(execute).not.toHaveBeenCalled()
  })
})
