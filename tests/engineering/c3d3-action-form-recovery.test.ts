import { describe, expect, it, vi } from 'vitest'
import type { ActionDescriptor } from '@runtimes/action'
import type { AppointmentFormRead, StorageKey, StoragePort, TechnicianApiCommandPort } from '@shared/ports'
import { asOpaqueId, type FormDataId, type OperationSnapshot } from '@shared/types'
import { beginActionMutation, recordActionFormSaved } from '@features/work-orders/action-mutation-receipt'
import { recoverActionFormFromReceipt } from '@features/work-orders/action-workspace-form-recovery'

function succeeded<T>(data: T): OperationSnapshot<T> { return { state: 'succeeded', data } }

const descriptor = {
  userId: asOpaqueId<'UserId'>('u-c3d3'),
  workOrderId: asOpaqueId<'WorkOrderId'>('wo-c3d3'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('node-c3d3'),
  contentIdentity: asOpaqueId<'FormDefinitionId'>('form-c3d3'),
  contentKind: 'dynamic_form',
  title: 'Appointment',
  actionIntent: 'set_appointment',
  execution: 'enabled',
} as ActionDescriptor
const savedId = asOpaqueId<'FormDataId'>('data-c3d3')
const form = { definitionId: descriptor.contentIdentity, dataId: savedId } as AppointmentFormRead
const scope = {
  userId: String(descriptor.userId),
  workOrderId: String(descriptor.workOrderId),
  workflowNodeId: String(descriptor.workflowNodeId),
  formDefinitionId: String(descriptor.contentIdentity),
  authorizationScope: 'session-c3d3:role-v1',
}

function fixture() {
  const values = new Map<string, unknown>()
  const storage = {
    read: vi.fn(async (key: StorageKey) => succeeded(values.get(key.key) ?? null)),
    write: vi.fn(async (key: StorageKey, value: unknown) => {
      values.set(key.key, value)
      return succeeded(undefined)
    }),
    remove: vi.fn(async () => succeeded(undefined)),
    listKeys: vi.fn(async () => succeeded([])),
  } as unknown as StoragePort
  const readAppointmentForm = vi.fn(async () => succeeded(form))
  const commandApi = { readAppointmentForm } as unknown as TechnicianApiCommandPort
  const input = {
    storage, descriptor, initialForm: form, commandApi, appointment: true,
    existingFormDataId: savedId, formDefinitionId: asOpaqueId<'FormDefinitionId'>('form-c3d3'),
    authorizationScope: scope.authorizationScope, stillCurrent: () => true,
  }
  return { storage, readAppointmentForm, input }
}

describe('C3-D3 receipt-backed form recovery', () => {
  it('accepts an absent receipt without a network FormData read', async () => {
    const { input, readAppointmentForm } = fixture()
    expect(await recoverActionFormFromReceipt(input)).toEqual({ kind: 'ready', form })
    expect(readAppointmentForm).not.toHaveBeenCalled()
  })

  it('blocks unknown dispatched ACK without retrying the business read', async () => {
    const { storage, input, readAppointmentForm } = fixture()
    expect((await beginActionMutation(storage, scope, 'form_dispatched')).state).toBe('succeeded')
    const result = await recoverActionFormFromReceipt(input)
    expect(result).toMatchObject({ kind: 'blocked', keepDetail: true })
    expect(readAppointmentForm).not.toHaveBeenCalled()
  })

  it('reads back the exact saved FormData and blocks conflicting node identity', async () => {
    const { storage, input, readAppointmentForm } = fixture()
    expect((await beginActionMutation(storage, scope, 'form_dispatched')).state).toBe('succeeded')
    expect((await recordActionFormSaved(storage, scope, savedId)).state).toBe('succeeded')
    expect(await recoverActionFormFromReceipt(input)).toEqual({ kind: 'ready', form })
    expect(readAppointmentForm).toHaveBeenCalledTimes(1)
    const blocked = await recoverActionFormFromReceipt({
      ...input, existingFormDataId: asOpaqueId<'FormDataId'>('other-data'),
    })
    expect(blocked).toMatchObject({ kind: 'blocked', keepDetail: false })
    expect(readAppointmentForm).toHaveBeenCalledTimes(1)
  })

  it('never mounts a foreign saved FormData returned by the authoritative read', async () => {
    const { storage, input, readAppointmentForm } = fixture()
    expect((await beginActionMutation(storage, scope, 'form_dispatched')).state).toBe('succeeded')
    expect((await recordActionFormSaved(storage, scope, savedId)).state).toBe('succeeded')
    readAppointmentForm.mockResolvedValueOnce(succeeded({
      ...form, dataId: asOpaqueId<'FormDataId'>('foreign-data'),
    }))
    expect(await recoverActionFormFromReceipt(input)).toMatchObject({ kind: 'blocked', keepDetail: false })
  })

  it('does not restore a response if the role switches during FormData readback', async () => {
    const { storage, input, readAppointmentForm } = fixture()
    expect((await beginActionMutation(storage, scope, 'form_dispatched')).state).toBe('succeeded')
    expect((await recordActionFormSaved(storage, scope, savedId)).state).toBe('succeeded')
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const gate = new Promise<void>((resolve) => { release = resolve })
    readAppointmentForm.mockImplementationOnce(async () => {
      entered()
      await gate
      return succeeded(form)
    })
    let current = true
    const pending = recoverActionFormFromReceipt({ ...input, stillCurrent: () => current })
    await started
    current = false
    release()
    expect(await pending).toEqual({ kind: 'stale' })
  })

  it('rejects role revocation during asynchronous receipt lookup', async () => {
    const { storage, input, readAppointmentForm } = fixture()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const originalRead = storage.read.bind(storage)
    storage.read = (async <T>(key: StorageKey) => {
      await gate
      return originalRead<T>(key)
    }) as StoragePort['read']
    let current = true
    const pending = recoverActionFormFromReceipt({ ...input, stillCurrent: () => current })
    current = false
    release()
    expect(await pending).toEqual({ kind: 'stale' })
    expect(readAppointmentForm).not.toHaveBeenCalled()
  })
})
