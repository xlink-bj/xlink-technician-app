import { describe, expect, it, vi } from 'vitest'
import { TechnicianApiCommandAdapter, type ApiCommandRequest } from '@adapters/api/technician-api-commands'
import { appointmentFormDefinitionWireId } from '@adapters/api/appointment-contract'
import { beginActionMutation, loadActionMutationReceipt, recordActionFormSaved,
  recordActionWorkflowCompleted, type ActionMutationScope } from '@features/work-orders/action-mutation-receipt'
import type { FormMutationCheckpoints, StoragePort, SubmitAppointmentInput, TechnicianApiReadPort } from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'

// Offline protocol-shaped transport only: actual adapter, wires and durable
// receipt modules. This does not enable the default Mock forms-node UI command.
function fixture(response?: (request: ApiCommandRequest) => Promise<unknown>) {
  const records = new Map<string, unknown>()
  const storage: StoragePort = {
    read: async key => ({ state: 'succeeded', data: (records.get(key.key) ?? null) as never }),
    write: async (key, value) => { records.set(key.key, structuredClone(value)); return { state: 'succeeded' } },
    remove: async key => { records.delete(key.key); return { state: 'succeeded' } },
    listKeys: async () => ({ state: 'succeeded', data: [...records.keys()] }),
  }
  const scope: ActionMutationScope = { userId: 'appointment-recovery-user', authorizationScope: 'actor-a',
    workOrderId: 'appointment-recovery-work', workflowNodeId: 'appointment-recovery-node', formDefinitionId: appointmentFormDefinitionWireId }
  const checkpoint = async (pending: Promise<OperationSnapshot<unknown>>): Promise<OperationSnapshot<void>> => {
    const result = await pending
    return { state: result.state, ...(result.error ? { error: result.error } : {}) }
  }
  const mutation: FormMutationCheckpoints = {
    beforeFormDispatch: () => checkpoint(beginActionMutation(storage, scope, 'form_dispatched')),
    afterFormSaved: id => checkpoint(recordActionFormSaved(storage, scope, id)),
    beforeWorkflowDispatch: id => checkpoint(beginActionMutation(storage, scope, 'workflow_dispatched', id)),
    afterWorkflowCompleted: () => checkpoint(recordActionWorkflowCompleted(storage, scope)),
  }
  const execute = vi.fn(response ?? (async request => request.path.startsWith('biz/extForm/upsert/')
    ? { success: true, data: { _id: 'synthetic-server-appointment-id' } } : { success: true }))
  const command = () => new TechnicianApiCommandAdapter({ execute }, {} as TechnicianApiReadPort)
  const input: SubmitAppointmentInput = { workOrderId: asOpaqueId<'WorkOrderId'>(scope.workOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(scope.workflowNodeId),
    workflowRunId: asOpaqueId<'WorkflowRunId'>('appointment-recovery-run'), sourceNodeType: 'form',
    visitIntent: 'visit_deferred', values: { need: '0', datetime: '2026-11-09 09:17:59', note: '合成恢复验收' }, mutation }
  return { scope, storage, execute, command, input, records }
}

describe('Appointment command and durable recovery protocol boundaries', () => {
  it('keeps hidden datetime literal, uses the actual returned ID for Process, and blocks replay after completion', async () => {
    const f = fixture()
    expect((await f.command().submitAppointment(f.input)).state).toBe('succeeded')
    expect(f.execute).toHaveBeenCalledTimes(2)
    const first = f.execute.mock.calls[0][0]
    expect(JSON.parse(String(first.body?.dataStr))).toMatchObject({ need: '0', datetime: '2026-11-09 09:17:59' })
    expect(f.execute.mock.calls[1][0]).toMatchObject({ path: 'workflow/process', body: {
      sid: f.scope.workOrderId, workflowNodeId: f.scope.workflowNodeId,
      nodeFormDefId: appointmentFormDefinitionWireId, nodeFormDataId: 'synthetic-server-appointment-id',
    } })
    expect((await loadActionMutationReceipt(f.storage, f.scope)).data?.phase).toBe('completed')
    expect((await f.command().submitAppointment(f.input)).state).toBe('failed_terminal')
    expect(f.execute).toHaveBeenCalledTimes(2)
  })
  it.each(['RETRYABLE', 'TERMINAL'])('retains dispatch uncertainty after explicit %s rejection instead of replaying on reconstruction', async code => {
    const f = fixture(async () => ({ success: false, code }))
    expect((await f.command().submitAppointment(f.input)).state).not.toBe('succeeded')
    expect((await loadActionMutationReceipt(f.storage, f.scope)).data?.phase).toBe('form_dispatched')
    expect((await f.command().submitAppointment(f.input)).state).toBe('failed_terminal')
    expect(f.execute).toHaveBeenCalledOnce()
  })
  it('retains a lost ACK as unknown even when a synthetic provider committed a row', async () => {
    let committed = 0
    const f = fixture(async () => { committed++; throw Error('Synthetic ACK lost after provider commit') })
    await f.command().submitAppointment(f.input)
    expect((await loadActionMutationReceipt(f.storage, f.scope)).data?.phase).toBe('form_dispatched')
    await f.command().submitAppointment(f.input)
    expect(committed).toBe(1)
    expect(f.execute).toHaveBeenCalledOnce()
  })
  it('reserves before concurrent clicks and sends only one upsert and one Process', async () => {
    const f = fixture()
    const results = await Promise.all([f.command().submitAppointment(f.input), f.command().submitAppointment(f.input)])
    expect(results.filter(x => x.state === 'succeeded')).toHaveLength(1)
    expect(f.execute.mock.calls.filter(([r]) => r.path.startsWith('biz/extForm/upsert/'))).toHaveLength(1)
    expect(f.execute.mock.calls.filter(([r]) => r.path === 'workflow/process')).toHaveLength(1)
  })
  it('keeps late old-scope ACK on its old key and refuses cross-role continuation', async () => {
    const f = fixture()
    await beginActionMutation(f.storage, f.scope, 'form_dispatched')
    for (const change of [{ authorizationScope: 'actor-b' }, { workflowNodeId: 'node-b' }, { workOrderId: 'work-b' }]) {
      const changed = { ...f.scope, ...change }
      if ('authorizationScope' in change) expect((await loadActionMutationReceipt(f.storage, changed)).state).toBe('failed_terminal')
      else expect((await loadActionMutationReceipt(f.storage, changed)).data).toBeNull()
    }
    await recordActionFormSaved(f.storage, f.scope, asOpaqueId<'FormDataId'>('late-old-record'))
    expect((await loadActionMutationReceipt(f.storage, f.scope)).data).toMatchObject({ phase: 'form_saved', formDataId: 'late-old-record' })
    expect((await beginActionMutation(f.storage, { ...f.scope, authorizationScope: 'actor-b' }, 'workflow_dispatched', asOpaqueId<'FormDataId'>('late-old-record'))).state).toBe('failed_terminal')
    expect(f.execute).not.toHaveBeenCalled()
  })
})
