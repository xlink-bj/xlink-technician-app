import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createRoleScopedTechnicianApiReadAdapter, type ApiReadRequest } from '@adapters/api/technician-api'
import { TechnicianApiCommandAdapter, type ApiCommandRequest } from '@adapters/api/technician-api-commands'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { createActionDraftRepository } from '@runtimes/action'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'
import type { SessionSnapshot, StorageKey, StoragePort, WorkOrderDetail, MediaUploadQueuePort } from '@shared/ports'

// Offline synthetic six-field A13-style fixture, not an observed production record.
// Only transports, storage, navigation and the WorkOrder detail provider are stubs.
// Actual form read adapter/mapper, option hydration, Workspace, receipts and serializer run.
const definitionId = asOpaqueId<'FormDefinitionId'>('workspace-reopen-definition')
const dataId = asOpaqueId<'FormDataId'>('workspace-reopen-record')
const workOrderId = asOpaqueId<'WorkOrderId'>('workspace-reopen-order')
const workflowNodeId = asOpaqueId<'WorkflowNodeRuntimeId'>('workspace-reopen-node')
const workflowRunId = asOpaqueId<'WorkflowRunId'>('workspace-reopen-run')
const roleId = asOpaqueId<'RoleId'>('workspace-reopen-role')
const session: SessionSnapshot = {
  sessionRef: asOpaqueId<'SessionRef'>('workspace-reopen-session'),
  user: { id: asOpaqueId<'UserId'>('workspace-reopen-user') }, currentRole: { id: roleId }, capabilityNames: [],
}
const rows = [
  { name: 'need', type: 'radio', valueOption: 'need', required: '1', frontEndConfig: '{}' },
  { name: 'reasons1', type: 'select', valueOption: 'reasons1', required: '1', frontEndConfig: '{"showField":"need","showValue":"2"}' },
  { name: 'otherReason', type: 'text', required: '1', frontEndConfig: '{"showField":"reasons1","showValue":"other"}' },
  { name: 'datetime', type: 'datetime', required: '1', frontEndConfig: '{"showField":"need","showValue":"1"}' },
  { name: 'note', type: 'text', required: '0', frontEndConfig: '{}' },
  { name: 'modifyReason', type: 'text', required: '1', frontEndConfig: '{"showField":"_id","showValue":"$exist"}' },
].map(row => ({ ...row, _id: `${row.name}-row`, colName: 'appointment', showList: ['2', '4'], showType: '1' }))
function success<T>(data: T): OperationSnapshot<T> { return { state: 'succeeded', data } }

function fixture() {
  setActivePinia(createPinia())
  let persisted: Record<string, unknown> | undefined
  const readExecute = vi.fn(async (request: ApiReadRequest): Promise<unknown> => {
    if (request.path === 'biz/extField/query') return { data: rows }
    if (request.path === 'i/code/selectCode.do') {
      const [{ codeId, eleid }] = JSON.parse(String(request.body?.jsonPara)) as { codeId: string; eleid: string }[]
      if (codeId !== 'need' && codeId !== 'reasons1') throw new Error(`Unexpected option group: ${codeId}`)
      expect(eleid).toBe(codeId)
      return [{ eleid, options: codeId === 'need' ? { '1': '需要上门', '2': '暂不上门' } : { '1': '普通原因', other: '其他' } }]
    }
    if (request.path === `biz/extForm/query/${definitionId}`) {
      expect(request.body?.['is:_id|string#and']).toBe(dataId)
      expect(persisted).toBeDefined()
      return { data: [JSON.parse(JSON.stringify(persisted))], total: 1 }
    }
    throw new Error(`Unexpected offline read: ${request.path}`)
  })
  const read = createRoleScopedTechnicianApiReadAdapter({ execute: readExecute }, () => roleId, { codeTenantId: 'synthetic-tenant' })
  // No node.formDataId is fabricated after ACK. Reopen must use its durable receipt.
  const detail: WorkOrderDetail = { id: workOrderId, workflowRunId, workflowNodes: [{
    id: workflowNodeId, category: 'forms', sourceNodeType: 'form', lifecycle: 'active',
    displayName: '普通预约表单', formDefinitionId: definitionId,
    visibility: { evidenceState: 'verified', viewableRoleIds: [roleId] },
  }] }
  const detailProvider = vi.spyOn(read, 'getWorkOrderDetail').mockImplementation(async () => success(detail))
  const execute = vi.fn(async (request: ApiCommandRequest): Promise<unknown> => {
    expect(request).toMatchObject({ method: 'POST', path: `biz/extForm/upsert/${definitionId}` })
    const replacement = JSON.parse(String(request.body?.dataStr)) as Record<string, unknown>
    // Literal replacement, never merge with the previous business document.
    persisted = { ...replacement, _id: dataId }
    return { success: true, data: { _id: dataId } }
  })
  const command = new TechnicianApiCommandAdapter({ execute }, read)
  const readForm = vi.spyOn(command, 'readDynamicForm')
  const saveForm = vi.spyOn(command, 'saveDynamicForm')
  const values = new Map<string, unknown>()
  const storage: StoragePort = {
    read: vi.fn(async <T>(key: StorageKey): Promise<OperationSnapshot<T | null>> => success((values.get(key.key) as T | undefined) ?? null)) as StoragePort['read'],
    write: vi.fn(async (key, value) => { values.set(key.key, value); return success(undefined) }),
    remove: vi.fn(async key => { values.delete(key.key); return success(undefined) }),
    listKeys: vi.fn(async () => success([...values.keys()])),
  }
  let activeSession: SessionSnapshot | null = session
  let invalidateNextSessionRead = false
  const navigation = { navigate: vi.fn(async () => undefined) }
  const listMedia = vi.fn<MediaUploadQueuePort['listForAction']>(async () => success([]))
  const mediaQueue: MediaUploadQueuePort = {
    listForAction: listMedia,
    enqueue: async () => ({ state: 'failed_terminal' }),
    process: async () => ({ state: 'failed_terminal' }),
    retry: async () => ({ state: 'failed_terminal' }),
    discard: async () => ({ state: 'failed_terminal' }),
    finalizeAfterSave: async () => ({ state: 'failed_terminal' }),
  }
  const store = useActionWorkspaceStore()
  store.configure({ apiRead: read, commandApi: command, storage,
    mediaUploadQueue: mediaQueue, draftRepository: createActionDraftRepository(storage), getSession: () => {
      if (invalidateNextSessionRead) { invalidateNextSessionRead = false; return null }
      return activeSession
    },
    navigation, debounceMs: 60000,
  })
  const load = () => store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
  const edit = (key: string, value: string) => {
    const field = store.dynamicForm?.fields.find(candidate => candidate.valueKey === key)
    expect(field).toBeDefined()
    expect(store.setField(field!.fieldId, value).state).toBe('succeeded')
  }
  return { store, load, edit, execute, read, readExecute, readForm, saveForm, detailProvider, detail, storage, navigation,
    invalidateSessionOnce: () => { invalidateNextSessionRead = true },
    listMedia, persisted: () => persisted, changeSession: (next: SessionSnapshot | null) => { activeSession = next },
  }
}

describe('Workspace appointment new ACK → same-page denial → authoritative reopen', () => {
  it('recovers after an explicit cold clear/load through the real receipt/read/provider chain', async () => {
    const x = fixture()
    try {
      expect((await x.load()).state).toBe('succeeded')
      expect(x.store.dynamicForm).toMatchObject({ purpose: 'appointment', values: {} })
      expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
      x.edit('need', '2')
      x.edit('reasons1', 'other')
      x.edit('otherReason', 'synthetic reason')
      x.edit('note', 'new note')
      expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
      expect(x.store.dynamicFormSaveState).toBe('saved')
      expect(x.store.dynamicForm?.dataId).toBe(dataId)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
      expect(x.execute).toHaveBeenCalledTimes(1)
      expect(x.saveForm).toHaveBeenCalledTimes(1)
      const newWire = JSON.parse(String(x.execute.mock.calls[0]![0].body?.dataStr))
      expect(newWire).toEqual({ need: '2', reasons1: 'other', otherReason: 'synthetic reason', note: 'new note',
        sid: workOrderId, smodule: 'serviceAppointment', nodeId: workflowNodeId, workflowId: workflowRunId, state: 1 })
      // Satisfy edit-only modifyReason so rejection is provenance, not required-field noise.
      x.edit('modifyReason', 'same-page attempted edit')
      x.edit('note', 'same-page attempted note')
      const writesBeforeDenial = vi.mocked(x.storage.write).mock.calls.length
      const blocked = await x.store.saveDynamicForm()
      expect(blocked.state).toBe('failed_terminal')
      expect(blocked.error?.category).toBe('unsupported_capability')
      expect(blocked.error?.message).toBe('Reopen the appointment to read its replacement context before saving')
      expect(x.execute).toHaveBeenCalledTimes(1)
      expect(x.saveForm).toHaveBeenCalledTimes(1) // blocked before command adapter, not merely transport
      expect(x.storage.write).toHaveBeenCalledTimes(writesBeforeDenial)
      expect(x.readForm).toHaveBeenCalledTimes(1)
      expect(x.persisted()?.note).toBe('new note')

      x.store.clear()
      expect((await x.load()).state).toBe('succeeded')
      expect(x.detail.workflowNodes?.[0]).not.toHaveProperty('formDataId')
      expect(x.detailProvider).toHaveBeenCalledTimes(2)
      expect(x.readForm.mock.calls).toEqual([
        [{ definitionId, expectedWorkflowRunId: workflowRunId }],
        [{ definitionId, expectedWorkflowRunId: workflowRunId }],
        [{ definitionId, formDataId: dataId, expectedWorkflowRunId: workflowRunId }],
      ])
      const formReads = x.readExecute.mock.calls.filter(([r]) => r.path === `biz/extForm/query/${definitionId}`)
      expect(formReads).toHaveLength(1)
      expect(x.readExecute.mock.calls.filter(([r]) => r.path === 'biz/extField/query')).toHaveLength(3)
      const optionReads = x.readExecute.mock.calls.filter(([r]) => r.path === 'i/code/selectCode.do')
      expect(optionReads).toHaveLength(6)
      expect(optionReads.map(([r]) => JSON.parse(String(r.body?.jsonPara))[0].codeId).sort())
        .toEqual(['need', 'need', 'need', 'reasons1', 'reasons1', 'reasons1'])
      expect(x.store.dynamicForm?.values.note).toBe('new note')
      expect(x.store.dynamicForm?.values).not.toHaveProperty('modifyReason')
      expect(Object.isFrozen(x.store.dynamicForm?.appointmentReplacement)).toBe(true)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      x.edit('need', '1')
      x.edit('datetime', '2026-11-10 10:00:00')
      x.edit('modifyReason', 'reopened edit')
      x.edit('note', 'edited after reopen')
      expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
      expect(x.store.dynamicFormSaveState).toBe('saved')
      expect(x.saveForm).toHaveBeenCalledTimes(2)
      expect(x.execute).toHaveBeenCalledTimes(2)
      const editedWire = JSON.parse(String(x.execute.mock.calls[1]![0].body?.dataStr))
      expect(editedWire).toEqual({ ...newWire, _id: dataId, need: '1', datetime: '2026-11-10 10:00:00',
        modifyReason: 'reopened edit', note: 'edited after reopen' })
      expect(x.persisted()).toEqual(editedWire)
      expect(x.execute.mock.calls.every(([r]) => r.path === `biz/extForm/upsert/${definitionId}`)).toBe(true)
    } finally { x.store.clear() }
  })
  const reenter = (x: ReturnType<typeof fixture>) => x.store.ensureLoaded({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' })
  async function saved() {
    const x = fixture()
    expect((await x.load()).state).toBe('succeeded')
    x.edit('need', '2')
    x.edit('reasons1', '1')
    expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
    return x
  }
  function gateRecordRead(x: ReturnType<typeof fixture>) {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const original = x.readExecute.getMockImplementation()!
    x.readExecute.mockImplementation(async request => {
      if (request.path === `biz/extForm/query/${definitionId}`) await gate
      return original(request)
    })
    return release
  }

  it('normal exit/reentry reads authoritative context and preserves unsaved edits', async () => {
    const x = await saved()
    try {
      x.edit('modifyReason', 'unsaved reason')
      x.edit('note', 'unsaved note')
      expect((await x.store.exit()).state).toBe('succeeded')
      expect((await reenter(x)).state).toBe('succeeded')
      expect(x.readForm).toHaveBeenCalledTimes(3)
      expect(x.detailProvider).toHaveBeenCalledTimes(2)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.store.dynamicForm?.values).toMatchObject({ note: 'unsaved note', modifyReason: 'unsaved reason' })
      expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
      expect(x.execute).toHaveBeenCalledTimes(2)
      expect(x.persisted()).toMatchObject({ _id: dataId, note: 'unsaved note', modifyReason: 'unsaved reason' })
    } finally { x.store.clear() }
  })

  it('same-page ensureLoaded does not refresh ACK context or bypass the save guard', async () => {
    const x = await saved()
    try {
      expect((await reenter(x)).state).toBe('succeeded')
      expect(x.readForm).toHaveBeenCalledTimes(1)
      x.edit('modifyReason', 'same page')
      expect((await x.store.saveDynamicForm()).error?.message).toBe('Reopen the appointment to read its replacement context before saving')
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.store.clear() }
  })

  it('native unload signal coalesces concurrent reentry reads without extra commands', async () => {
    const x = await saved()
    try {
      x.edit('modifyReason', 'native unload draft')
      x.store.leavePage(x.store.descriptor)
      const release = gateRecordRead(x)
      const first = reenter(x)
      await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(3))
      const second = reenter(x)
      release()
      expect((await first).state).toBe('succeeded')
      expect((await second).state).toBe('succeeded')
      expect(x.detailProvider).toHaveBeenCalledTimes(2)
      expect(x.readForm).toHaveBeenCalledTimes(3)
      expect(x.store.dynamicForm?.values.modifyReason).toBe('native unload draft')
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.store.clear() }
  })

  for (const lostScope of ['logout', 'role'] as const) it(`rejects ${lostScope} during authoritative read`, async () => {
    const x = await saved()
    try {
      await x.store.exit()
      const release = gateRecordRead(x)
      const pending = reenter(x)
      await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(3))
      x.changeSession(lostScope === 'logout' ? null : { ...session, currentRole: { id: asOpaqueId<'RoleId'>('other-role') } })
      release()
      expect((await pending).error?.category).toBe('session_invalid')
      expect(x.store.dynamicForm).toBeNull()
      expect((await x.store.saveDynamicForm()).state).toBe('failed_terminal')
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.store.clear() }
  })

  it('discards a stale read after clear and never installs its trusted context', async () => {
    const x = await saved()
    try {
      await x.store.exit()
      const release = gateRecordRead(x)
      const pending = reenter(x)
      await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(3))
      x.store.clear()
      release()
      expect((await pending).error?.category).toBe('cancelled')
      expect(x.store.dynamicForm).toBeNull()
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.store.clear() }
  })

  it('preserves mounted edits if draft flush fails before reentry', async () => {
    const x = await saved()
    try {
      x.edit('note', 'must survive flush failure')
      x.edit('modifyReason', 'pending reason')
      x.store.leavePage(x.store.descriptor)
      vi.mocked(x.storage.write).mockResolvedValue({ state: 'failed_terminal' })
      expect((await reenter(x)).state).toBe('failed_terminal')
      expect(x.readForm).toHaveBeenCalledTimes(1)
      expect(x.store.dynamicForm?.values.note).toBe('must survive flush failure')
      expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.store.clear() }
  })

  it('fails closed on read failure, retains durable edits and can retry normally', async () => {
    const x = await saved()
    try {
      x.edit('note', 'must survive read failure')
      x.edit('modifyReason', 'pending reason')
      await x.store.exit()
      const original = x.readExecute.getMockImplementation()!
      x.readExecute.mockImplementation(async request => {
        if (request.path === `biz/extForm/query/${definitionId}`) throw new Error('offline injected read failure')
        return original(request)
      })
      expect((await reenter(x)).state).toBe('failed_terminal')
      expect(x.store.dynamicForm).toBeNull()
      expect((await x.store.saveDynamicForm()).state).toBe('failed_terminal')
      expect(x.execute).toHaveBeenCalledTimes(1)
      x.readExecute.mockImplementation(original)
      expect((await reenter(x)).state).toBe('succeeded')
      expect(x.store.dynamicForm?.values.note).toBe('must survive read failure')
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
    } finally { x.store.clear() }
  })
  it('consumes the leave marker on unsaved reentry before a later same-page ACK', async () => {
    const x = fixture()
    try {
      await x.load()
      x.store.leavePage(x.store.descriptor)
      await reenter(x)
      x.edit('need', '2')
      x.edit('reasons1', '1')
      await x.store.saveDynamicForm()
      await reenter(x)
      expect(x.readForm).toHaveBeenCalledTimes(1)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
    } finally { x.store.clear() }
  })

  it('ignores a late unload from a previous mounted action generation', async () => {
    const x = fixture()
    try {
      await x.load()
      const oldMountedAction = x.store.descriptor
      x.store.clear()
      await x.load()
      x.edit('need', '2')
      x.edit('reasons1', '1')
      await x.store.saveDynamicForm()
      x.store.leavePage(oldMountedAction)
      await reenter(x)
      expect(x.readForm).toHaveBeenCalledTimes(2)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
    } finally { x.store.clear() }
  })

  it('does not mark departure when navigation fails', async () => {
    const x = await saved()
    try {
      x.navigation.navigate.mockRejectedValue(new Error('navigation failed'))
      await expect(x.store.exit()).rejects.toThrow('navigation failed')
      await reenter(x)
      expect(x.readForm).toHaveBeenCalledTimes(1)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
    } finally { x.store.clear() }
  })

  it('preserves a newer edit made during the reentry draft flush', async () => {
    const x = await saved()
    try {
      x.edit('note', 'first unsaved edit')
      x.store.leavePage(x.store.descriptor)
      let release!: () => void
      const gate = new Promise<void>(resolve => { release = resolve })
      const original = vi.mocked(x.storage.write).getMockImplementation()!
      vi.mocked(x.storage.write).mockImplementation(async (key, value) => {
        await gate
        return original(key, value)
      })
      const pending = reenter(x)
      x.edit('note', 'newer edit during flush')
      release()
      expect((await pending).error?.category).toBe('cancelled')
      expect(x.store.dynamicForm?.values.note).toBe('newer edit during flush')
      expect(x.readForm).toHaveBeenCalledTimes(1)
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.store.clear() }
  })

  it('invalidates the old leave marker when directly loading another action without clear', async () => {
    const x = fixture()
    try {
      await x.load()
      const oldAction = x.store.descriptor
      x.store.leavePage(oldAction)
      const otherOrder = asOpaqueId<'WorkOrderId'>('other-order')
      const otherNode = asOpaqueId<'WorkflowNodeRuntimeId'>('other-node')
      x.detailProvider.mockResolvedValue(success({ ...x.detail, id: otherOrder,
        workflowNodes: [{ ...x.detail.workflowNodes![0], id: otherNode }],
      }))
      const otherInput = { workOrderId: otherOrder, workflowNodeId: otherNode, actionIntent: 'interact_with_form' }
      expect((await x.store.load(otherInput)).state).toBe('succeeded')
      x.edit('need', '2')
      x.edit('reasons1', '1')
      expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
      x.store.leavePage(oldAction) // Late A unload also must not mark B.
      expect((await x.store.ensureLoaded(otherInput)).state).toBe('succeeded')
      expect(x.readForm).toHaveBeenCalledTimes(2)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
    } finally { x.store.clear() }
  })

  async function pendingCreate(outcome: 'success' | 'uncertain' | 'failure' = 'success', leased = true) {
    const x = fixture()
    const firstPage = leased ? {} : undefined
    const nextPage = leased ? {} : undefined
    const input = { workOrderId, workflowNodeId, actionIntent: 'interact_with_form' }
    await x.store.ensureLoaded({ ...input, pageLease: firstPage })
    x.edit('need', '2')
    x.edit('reasons1', '1')
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const original = x.execute.getMockImplementation()!
    x.execute.mockImplementation(async request => {
      const result = await original(request)
      await gate // Real serializer/adapter ACK, deliberately delivered after navigation.
      if (outcome === 'uncertain') throw new Error('ACK transport lost after dispatch')
      if (outcome === 'failure') return { success: false, message: 'injected terminal rejection' }
      return result
    })
    const saving = x.store.saveDynamicForm()
    await vi.waitFor(() => expect(x.execute).toHaveBeenCalledTimes(1))
    const mounted = x.store.descriptor
    const enter = () => x.store.ensureLoaded({ ...input, pageLease: nextPage })
    const leave = () => x.store.leavePage(mounted, firstPage)
    return { ...x, saving, release, mounted, firstPage, nextPage, enter, leave }
  }

  it('automatically reads once after held create ACK for the exact reentered page, then edits the same ID', async () => {
    const x = await pendingCreate()
    try {
      x.leave()
      await x.enter()
      await x.enter()
      x.leave() // Delayed duplicate unload from the old page cannot cancel new page intent.
      x.release()
      x.release() // A settled transport cannot trigger another completion.
      expect((await x.saving).state).toBe('succeeded')
      expect(x.detailProvider).toHaveBeenCalledTimes(2)
      expect(x.readForm).toHaveBeenCalledTimes(3)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.store.dynamicForm?.dataId).toBe(dataId)
      expect(x.execute).toHaveBeenCalledTimes(1)
      x.edit('modifyReason', 'after pending reentry')
      x.edit('note', 'same ID edit')
      expect((await x.store.saveDynamicForm()).state).toBe('succeeded')
      expect(x.execute).toHaveBeenCalledTimes(2)
      expect(JSON.parse(String(x.execute.mock.calls[1]![0].body?.dataStr))._id).toBe(dataId)
    } finally { x.release(); x.store.clear() }
  })

  for (const navigation of ['same-page', 'left-only', 'left-again', 'failed-navigation'] as const) {
    it(`does not automatically read after ACK when ${navigation}`, async () => {
      const x = await pendingCreate()
      try {
        if (navigation === 'left-only' || navigation === 'left-again') x.leave()
        if (navigation === 'left-again') {
          await x.enter()
          x.store.leavePage(x.mounted, x.nextPage)
        }
        if (navigation === 'failed-navigation') {
          x.navigation.navigate.mockRejectedValueOnce(new Error('navigation failed'))
          await expect(x.store.exit()).rejects.toThrow('navigation failed')
          await x.enter()
        }
        x.release()
        await x.saving
        expect(x.readForm).toHaveBeenCalledTimes(1)
        expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
        expect(x.store.dynamicForm?.dataId).toBe(dataId)
        expect(x.execute).toHaveBeenCalledTimes(1)
      } finally { x.release(); x.store.clear() }
    })
  }

  for (const scope of ['logout', 'session', 'role', 'clear', 'action'] as const) {
    it(`does not attach pending ACK context after ${scope} changes`, async () => {
      const x = await pendingCreate()
      try {
        x.leave()
        await x.enter()
        if (scope === 'logout') x.changeSession(null)
        if (scope === 'session') x.changeSession({ ...session, sessionRef: asOpaqueId<'SessionRef'>('another-session') })
        if (scope === 'role') x.changeSession({ ...session, currentRole: { id: asOpaqueId<'RoleId'>('another-role') } })
        if (scope === 'clear') x.store.clear()
        if (scope === 'action') {
          await x.store.load({ workOrderId, workflowNodeId, actionIntent: 'not-this-action' })
        }
        x.release()
        expect((await x.saving).state).not.toBe('succeeded')
        expect(x.readForm).toHaveBeenCalledTimes(1)
        expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
        expect(x.execute).toHaveBeenCalledTimes(1)
      } finally { x.release(); x.store.clear() }
    })
  }

  it('preserves newer values during ACK and blocks edits while the authoritative read is loading', async () => {
    const x = await pendingCreate()
    try {
      x.leave()
      await x.enter()
      const noteField = x.store.dynamicForm!.fields.find(f => f.valueKey === 'note')!.fieldId
      x.edit('note', 'newer than ACK')
      const releaseRead = gateRecordRead(x)
      x.release()
      await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(3))
      expect(x.store.setField(noteField, 'cannot silently replace draft during load').state).not.toBe('succeeded')
      releaseRead()
      expect((await x.saving).error?.category).toBe('cancelled')
      expect(x.store.dynamicForm?.values).toMatchObject({ note: 'newer than ACK' })
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  it('cancels a pending automatic read if its reentered page departs before the read completes', async () => {
    const x = await pendingCreate()
    try {
      x.leave()
      await x.enter()
      const releaseRead = gateRecordRead(x)
      x.release()
      await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(3))
      x.store.leavePage(x.mounted, x.nextPage)
      releaseRead()
      await x.saving
      expect(x.store.dynamicForm).toBeNull()
      expect(x.execute).toHaveBeenCalledTimes(1)
      // Durable receipt survives cancellation; next explicit load never repeats create.
      await x.enter()
      expect(x.store.dynamicForm?.dataId).toBe(dataId)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  it('fails closed on automatic read failure and recovers the saved ID on explicit retry', async () => {
    const x = await pendingCreate()
    try {
      x.leave()
      await x.enter()
      const original = x.readExecute.getMockImplementation()!
      x.readExecute.mockImplementation(async request => {
        if (request.path === `biz/extForm/query/${definitionId}`) throw new Error('read failed')
        return original(request)
      })
      x.release()
      expect((await x.saving).state).toBe('succeeded') // Command succeeded, read did not.
      expect(x.store.loadState).not.toBe('succeeded')
      expect(x.store.dynamicForm).toBeNull()
      expect((await x.store.saveDynamicForm()).state).not.toBe('succeeded')
      x.readExecute.mockImplementation(original)
      await x.enter()
      expect(x.store.dynamicForm?.dataId).toBe(dataId)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  it('preserves newer edits made during the automatic reentry flush without installing context', async () => {
    const x = await pendingCreate()
    try {
      x.leave()
      await x.enter()
      x.edit('note', 'first newer edit')
      let releaseFlush!: () => void
      const gate = new Promise<void>(resolve => { releaseFlush = resolve })
      const original = vi.mocked(x.storage.write).getMockImplementation()!
      let waiting = false
      vi.mocked(x.storage.write).mockImplementation(async (key, value) => {
        if (key.key.startsWith('action-workspace:')) { waiting = true; await gate }
        return original(key, value)
      })
      x.release()
      await vi.waitFor(() => expect(waiting).toBe(true))
      x.edit('note', 'latest during flush')
      releaseFlush()
      await x.saving
      expect(x.store.dynamicForm?.values.note).toBe('latest during flush')
      expect(x.store.dynamicForm?.dataId).toBe(dataId)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
      expect(x.readForm).toHaveBeenCalledTimes(1)
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  for (const outcome of ['uncertain', 'failure', 'receipt-failure'] as const) {
    it(`never auto reads or repeats create after ${outcome}`, async () => {
      const x = await pendingCreate(outcome === 'receipt-failure' ? 'success' : outcome)
      try {
        x.leave()
        await x.enter()
        if (outcome === 'receipt-failure') {
          vi.mocked(x.storage.write).mockResolvedValue({ state: 'failed_terminal' })
        }
        x.release()
        expect((await x.saving).state).not.toBe('succeeded')
        expect(x.readForm).toHaveBeenCalledTimes(1)
        expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
        await x.store.saveDynamicForm()
        expect(x.execute).toHaveBeenCalledTimes(1)
      } finally { x.release(); x.store.clear() }
    })
  }

  for (const invalidation of ['logout', 'role', 'clear'] as const) {
    it(`rejects automatic read response after ${invalidation}`, async () => {
      const x = await pendingCreate()
      try {
        x.leave()
        await x.enter()
        const releaseRead = gateRecordRead(x)
        x.release()
        await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(3))
        if (invalidation === 'clear') x.store.clear()
        else x.changeSession(invalidation === 'logout' ? null : { ...session, currentRole: { id: asOpaqueId<'RoleId'>('lost-role') } })
        releaseRead()
        await x.saving
        expect(x.store.dynamicForm).toBeNull()
        expect(x.execute).toHaveBeenCalledTimes(1)
      } finally { x.release(); x.store.clear() }
    })
  }

  it('ignores a late old-page exit navigation completion after a new page reenters', async () => {
    const x = await pendingCreate()
    try {
      let releaseNavigation!: () => void
      const gate = new Promise<void>(resolve => { releaseNavigation = resolve })
      x.navigation.navigate.mockImplementationOnce(async () => { await gate; return undefined })
      const exiting = x.store.exit()
      await vi.waitFor(() => expect(x.navigation.navigate).toHaveBeenCalledTimes(1))
      x.leave() // onUnload may precede navigation promise resolution.
      await x.enter()
      releaseNavigation()
      await exiting
      x.release()
      await x.saving
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.readForm).toHaveBeenCalledTimes(3)
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  it('supports existing callers without page tokens for pending-save reentry', async () => {
    const x = await pendingCreate('success', false)
    try {
      x.leave()
      await x.enter()
      x.release()
      await x.saving
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  for (const interrupt of ['departure', 'failure'] as const) {
    it(`preserves the draft on automatic pre-read flush ${interrupt}`, async () => {
      const x = await pendingCreate()
      try {
        x.leave()
        await x.enter()
        x.edit('note', 'newer pending draft')
        let releaseFlush!: () => void
        let waiting = false
        const gate = new Promise<void>(resolve => { releaseFlush = resolve })
        const original = vi.mocked(x.storage.write).getMockImplementation()!
        vi.mocked(x.storage.write).mockImplementation(async (key, value) => {
          if (key.key.startsWith('action-workspace:')) {
            waiting = true
            await gate
            if (interrupt === 'failure') return { state: 'failed_terminal' }
          }
          return original(key, value)
        })
        x.release()
        await vi.waitFor(() => expect(waiting).toBe(true))
        if (interrupt === 'departure') x.store.leavePage(x.mounted, x.nextPage)
        releaseFlush()
        await x.saving
        expect(x.store.dynamicForm?.values.note).toBe('newer pending draft')
        expect(x.store.dynamicForm?.dataId).toBe(dataId)
        expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
        expect(x.store.loadState).not.toBe('loading')
        expect(x.readForm).toHaveBeenCalledTimes(1)
        expect(x.execute).toHaveBeenCalledTimes(1)
      } finally { x.release(); x.store.clear() }
    })
  }

  it('review: direct ensureLoaded of another route invalidates old automatic record read', async () => {
    const x = await pendingCreate()
    try {
      x.leave()
      await x.enter()
      const releaseRead = gateRecordRead(x)
      x.release()
      await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(3))
      const otherOrder = asOpaqueId<'WorkOrderId'>('review-other-order')
      const otherNode = asOpaqueId<'WorkflowNodeRuntimeId'>('review-other-node')
      x.detailProvider.mockResolvedValue(success({ ...x.detail, id: otherOrder,
        workflowNodes: [{ ...x.detail.workflowNodes![0], id: otherNode }],
      }))
      const switched = await x.store.ensureLoaded({ workOrderId: otherOrder, workflowNodeId: otherNode,
        actionIntent: 'interact_with_form', pageLease: {} })
      releaseRead()
      await x.saving
      expect({ switched: switched.state, workOrderId: x.store.descriptor?.workOrderId,
        contextAttached: Boolean(x.store.dynamicForm?.appointmentReplacement) })
        .not.toMatchObject({ workOrderId, contextAttached: true })
      expect(switched.state).toBe('succeeded')
      expect(x.store.descriptor?.workOrderId).toBe(otherOrder)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
      x.detailProvider.mockResolvedValue(success(x.detail))
      await x.store.ensureLoaded({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form', pageLease: {} })
      expect(x.store.dynamicForm?.dataId).toBe(dataId)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  it('review: a new page does not join the cancelled previous automatic flush flight', async () => {
    const x = await pendingCreate()
    try {
      x.leave()
      await x.enter()
      x.edit('note', 'preserved review draft')
      let releaseFlush!: () => void
      let waiting = false
      const gate = new Promise<void>(resolve => { releaseFlush = resolve })
      const original = vi.mocked(x.storage.write).getMockImplementation()!
      vi.mocked(x.storage.write).mockImplementation(async (key, value) => {
        if (key.key.startsWith('action-workspace:')) { waiting = true; await gate }
        return original(key, value)
      })
      x.release()
      await vi.waitFor(() => expect(waiting).toBe(true))
      x.store.leavePage(x.mounted, x.nextPage)
      const entering = x.store.ensureLoaded({ workOrderId, workflowNodeId,
        actionIntent: 'interact_with_form', pageLease: {} })
      releaseFlush()
      const result = await entering
      await x.saving
      // The cancelled old flight is replaced by a fresh receipt-backed read.
      expect(result.state).toBe('succeeded')
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.readForm).toHaveBeenCalledTimes(3)
      expect(x.store.dynamicForm?.dataId).toBe(dataId)
      expect(x.store.dynamicForm?.values.note).toBe('preserved review draft')
      expect((await x.store.ensureLoaded({ workOrderId, workflowNodeId,
        actionIntent: 'interact_with_form', pageLease: {} })).state).toBe('succeeded')
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  it('transfers pending flush B→C→D only to the latest page and persists intervening edits', async () => {
    const x = await pendingCreate()
    try {
      x.leave()
      await x.enter()
      x.edit('note', 'before transfer')
      let releaseFlush!: () => void
      let waiting = false
      const gate = new Promise<void>(resolve => { releaseFlush = resolve })
      const original = vi.mocked(x.storage.write).getMockImplementation()!
      vi.mocked(x.storage.write).mockImplementation(async (key, value) => {
        if (key.key.startsWith('action-workspace:')) { waiting = true; await gate }
        return original(key, value)
      })
      x.release()
      await vi.waitFor(() => expect(waiting).toBe(true))
      const input = { workOrderId, workflowNodeId, actionIntent: 'interact_with_form' }
      const enteringC = x.store.ensureLoaded({ ...input, pageLease: {} })
      x.edit('note', 'newer while changing pages')
      const pageD = {}
      const enteringD = x.store.ensureLoaded({ ...input, pageLease: pageD })
      const duplicateD = x.store.ensureLoaded({ ...input, pageLease: pageD })
      releaseFlush()
      expect((await enteringC).error?.category).toBe('cancelled')
      expect((await enteringD).state).toBe('succeeded')
      expect((await duplicateD).state).toBe('succeeded')
      await x.saving
      expect(x.store.dynamicForm?.values.note).toBe('newer while changing pages')
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.detailProvider).toHaveBeenCalledTimes(2)
      expect(x.readForm).toHaveBeenCalledTimes(3)
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  it('keeps the newest transfer flight when old automatic and transfer reads settle later', async () => {
    const x = await pendingCreate()
    try {
      x.leave()
      await x.enter()
      const releaseB = gateRecordRead(x)
      x.release()
      await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(3))
      const otherOrder = asOpaqueId<'WorkOrderId'>('transfer-order')
      const otherNode = asOpaqueId<'WorkflowNodeRuntimeId'>('transfer-node')
      let releaseC!: () => void
      const gateC = new Promise<void>(resolve => { releaseC = resolve })
      x.detailProvider.mockImplementation(async id => {
        if (id === otherOrder) {
          await gateC
          return success({ ...x.detail, id: otherOrder,
            workflowNodes: [{ ...x.detail.workflowNodes![0], id: otherNode }] })
        }
        return success(x.detail)
      })
      const enteringC = x.store.ensureLoaded({ workOrderId: otherOrder, workflowNodeId: otherNode,
        actionIntent: 'interact_with_form', pageLease: {} })
      await vi.waitFor(() => expect(x.detailProvider).toHaveBeenCalledTimes(3))
      const pageD = {}
      const inputD = { workOrderId, workflowNodeId, actionIntent: 'interact_with_form', pageLease: pageD }
      const enteringD = x.store.ensureLoaded(inputD)
      await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(5))
      releaseC()
      expect((await enteringC).error?.category).toBe('cancelled')
      const duplicateD = x.store.ensureLoaded(inputD)
      releaseB()
      await x.saving
      expect((await enteringD).state).toBe('succeeded')
      expect((await duplicateD).state).toBe('succeeded')
      expect(x.store.descriptor?.workOrderId).toBe(workOrderId)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.detailProvider).toHaveBeenCalledTimes(4)
      expect(x.readForm).toHaveBeenCalledTimes(5)
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  it('keeps the transfer flush fence after failure so explicit retry preserves newer draft', async () => {
    const x = await pendingCreate()
    try {
      x.leave()
      await x.enter()
      x.edit('note', 'must survive failed transfer')
      let releaseFlush!: () => void
      let waiting = false
      const gate = new Promise<void>(resolve => { releaseFlush = resolve })
      const original = vi.mocked(x.storage.write).getMockImplementation()!
      vi.mocked(x.storage.write).mockImplementation(async (key, value) => {
        if (key.key.startsWith('action-workspace:')) {
          waiting = true
          await gate
          return { state: 'failed_terminal' }
        }
        return original(key, value)
      })
      x.release()
      await vi.waitFor(() => expect(waiting).toBe(true))
      const input = { workOrderId, workflowNodeId, actionIntent: 'interact_with_form', pageLease: {} }
      const entering = x.store.ensureLoaded(input)
      releaseFlush()
      expect((await entering).state).not.toBe('succeeded')
      await x.saving
      expect(x.store.dynamicForm?.values.note).toBe('must survive failed transfer')
      expect(x.store.dynamicForm?.dataId).toBe(dataId)
      expect(x.store.dynamicForm?.appointmentReplacement).toBeUndefined()
      vi.mocked(x.storage.write).mockImplementation(original)
      expect((await x.store.ensureLoaded(input)).state).toBe('succeeded')
      expect(x.store.dynamicForm?.values.note).toBe('must survive failed transfer')
      expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.release(); x.store.clear() }
  })

  for (const restoreStage of ['draft', 'media'] as const) {
  for (const ownerKind of ['automatic', 'transfer'] as const) {
    for (const interruption of ['different-target', 'departure'] as const) {
      it(`review P2: invalidates ${ownerKind} load during ${restoreStage} restoration on ${interruption}`, async () => {
        const x = await pendingCreate()
        try {
          x.leave()
          await x.enter()
          x.edit('note', 'durable pending-create draft')
          let releaseDraft!: () => void
          let draftReadWaiting = false
          let gated = false
          const draftGate = new Promise<void>(resolve => { releaseDraft = resolve })
          const originalRead = vi.mocked(x.storage.read).getMockImplementation()!
          vi.mocked(x.storage.read).mockImplementation(async key => {
            const result = await originalRead(key)
            if (restoreStage === 'draft' && key.key.startsWith('action-workspace:') && !gated
              && x.store.dynamicForm?.appointmentReplacement) {
              gated = true
              draftReadWaiting = true
              await draftGate
            }
            return result
          })
          if (restoreStage === 'media') x.listMedia.mockImplementationOnce(async () => {
            draftReadWaiting = true
            await draftGate
            return success([])
          })
          let activePage = x.nextPage
          let transfer: ReturnType<typeof x.enter> | undefined
          if (ownerKind === 'transfer') {
            const releaseRecord = gateRecordRead(x)
            x.release()
            await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(3))
            activePage = {}
            transfer = x.store.ensureLoaded({ workOrderId, workflowNodeId,
              actionIntent: 'interact_with_form', pageLease: activePage })
            await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(5))
            releaseRecord()
          } else x.release()
          await vi.waitFor(() => expect(draftReadWaiting).toBe(true))
          // UI readiness is not load completion: authorization scope is still unset.
          expect(x.store.loadState).toBe('succeeded')
          const restoringDescriptor = x.store.descriptor
          const otherOrder = asOpaqueId<'WorkOrderId'>('restore-other-order')
          const otherNode = asOpaqueId<'WorkflowNodeRuntimeId'>('restore-other-node')
          if (interruption === 'departure') {
            x.store.leavePage(restoringDescriptor, activePage)
          } else {
            x.detailProvider.mockResolvedValue(success({ ...x.detail, id: otherOrder,
              workflowNodes: [{ ...x.detail.workflowNodes![0], id: otherNode }] }))
            const result = await x.store.ensureLoaded({ workOrderId: otherOrder, workflowNodeId: otherNode,
              actionIntent: 'interact_with_form', pageLease: {} })
            // Preserve the failure evidence without leaving the old draft gate unresolved.
            releaseDraft()
            await x.saving
            if (transfer) await transfer
            expect(result.state).toBe('succeeded')
          }
          releaseDraft()
          await x.saving
          if (transfer) expect((await transfer).error?.category).toBe('cancelled')
          if (interruption === 'departure') {
            expect(x.store.descriptor).toBeNull()
            expect(x.store.dynamicForm).toBeNull()
          } else expect(x.store.descriptor?.workOrderId).toBe(otherOrder)
          x.detailProvider.mockResolvedValue(success(x.detail))
          expect((await x.store.ensureLoaded({ workOrderId, workflowNodeId,
            actionIntent: 'interact_with_form', pageLease: {} })).state).toBe('succeeded')
          expect(x.store.dynamicForm?.dataId).toBe(dataId)
          expect(x.store.dynamicForm?.values.note).toBe('durable pending-create draft')
          expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
          expect(x.execute).toHaveBeenCalledTimes(1)
        } finally { x.release(); x.store.clear() }
      })
    }
  }

  }

  it('owned load cancellation during its preparation await cannot restart a cleared generation', async () => {
    const x = await saved()
    try {
      x.edit('note', 'preparation draft')
      let releaseWrite!: () => void
      let waiting = false
      const gate = new Promise<void>(resolve => { releaseWrite = resolve })
      const originalWrite = vi.mocked(x.storage.write).getMockImplementation()!
      vi.mocked(x.storage.write).mockImplementation(async (key, value) => {
        if (key.key.startsWith('action-workspace:')) { waiting = true; await gate }
        return originalWrite(key, value)
      })
      const writing = x.store.saveDraft()
      await vi.waitFor(() => expect(waiting).toBe(true))
      let ownerCurrent = true
      // Exercise the exact internal owner callback contract with a real pending
      // draft write, not an injected read context or a fabricated form response.
      const loading = x.store.load({ workOrderId, workflowNodeId, actionIntent: 'interact_with_form' },
        () => ownerCurrent)
      ownerCurrent = false
      x.store.clear()
      releaseWrite()
      await writing
      expect((await loading).error?.category).toBe('cancelled')
      expect(x.detailProvider).toHaveBeenCalledTimes(1)
      expect(x.store.descriptor).toBeNull()
      expect(x.store.loadState).toBe('idle')
      expect((await x.load()).state).toBe('succeeded')
      expect(x.store.dynamicForm?.dataId).toBe(dataId)
      expect(x.store.dynamicForm?.values.note).toBe('preparation draft')
      expect(x.execute).toHaveBeenCalledTimes(1)
    } finally { x.store.clear() }
  })

  for (const quotationStage of ['provider', 'draft', 'receipt'] as const) {
  for (const interruption of ['departure', 'different-target', 'logout'] as const) {
    it(`review: quotation ${quotationStage} restoration cannot revive a cancelled transfer after ${interruption}`, async () => {
      const x = await pendingCreate()
      let releaseQuote!: () => void
      let releaseRecord: (() => void) | undefined
      try {
        x.leave()
        await x.enter()
        releaseRecord = gateRecordRead(x)
        x.release()
        await vi.waitFor(() => expect(x.readForm).toHaveBeenCalledTimes(3))
        const quoteOrder = asOpaqueId<'WorkOrderId'>('receipt-transfer-quote-order')
        const quoteNode = asOpaqueId<'WorkflowNodeRuntimeId'>('receipt-transfer-quote-node')
        const nextOrder = asOpaqueId<'WorkOrderId'>('receipt-transfer-next-order')
        const nextNode = asOpaqueId<'WorkflowNodeRuntimeId'>('receipt-transfer-next-node')
        const quoteDetail: WorkOrderDetail = { id: quoteOrder, workflowNodes: [{
          id: quoteNode, category: 'placeOrder', sourceNodeType: 'placeOrder', lifecycle: 'active',
          displayName: 'Synthetic quotation transfer',
          visibility: { evidenceState: 'verified', viewableRoleIds: [roleId] },
        }] }
        x.detailProvider.mockImplementation(async id => success(id === quoteOrder ? quoteDetail
          : id === nextOrder ? { ...x.detail, id: nextOrder,
            workflowNodes: [{ ...x.detail.workflowNodes![0], id: nextNode }] } : x.detail))
        const quoteGate = new Promise<void>(resolve => { releaseQuote = resolve })
        let quoteWaiting = false
        vi.spyOn(x.read, 'getCascadeCodeOptions').mockImplementation(async () => {
          if (quotationStage === 'provider') { quoteWaiting = true; await quoteGate }
          return success({ items: [] })
        })
        const read = vi.mocked(x.storage.read).getMockImplementation()!
        vi.mocked(x.storage.read).mockImplementation(async key => {
          const result = await read(key)
          const exactQuote = key.key.includes(quoteOrder) && key.key.includes(quoteNode)
          if ((quotationStage === 'receipt' && key.key.startsWith('quotation-order-receipt:'))
            || (quotationStage === 'draft' && key.key.startsWith('action-workspace:') && exactQuote)) {
            quoteWaiting = true
            await quoteGate
          }
          return result
        })
        const quotePage = {}
        const enteringQuote = x.store.ensureLoaded({ workOrderId: quoteOrder, workflowNodeId: quoteNode,
          actionIntent: 'place_order', pageLease: quotePage })
        await vi.waitFor(() => expect(quoteWaiting).toBe(true))
        expect(x.store.descriptor?.contentKind).toBe('quotation')
        if (interruption === 'departure') x.store.leavePage(x.store.descriptor, quotePage)
        else if (interruption === 'logout') x.changeSession(null)
        else expect((await x.store.ensureLoaded({ workOrderId: nextOrder, workflowNodeId: nextNode,
          actionIntent: 'interact_with_form', pageLease: {} })).state).toBe('succeeded')
        releaseQuote()
        releaseRecord()
        const oldResult = await enteringQuote
        await x.saving
        // Session failure clears the owner, so the outer transfer reports cancellation.
        expect(oldResult.error?.category).toBe('cancelled')
        expect(x.store.quotationContentState).toBe('idle')
        expect(x.store.quotationOrderState).toEqual({ state: 'idle' })
        if (interruption !== 'different-target') {
          expect(x.store.descriptor).toBeNull()
          expect(x.store.loadState).toBe('idle')
        } else expect(x.store.descriptor?.workOrderId).toBe(nextOrder)
        if (interruption === 'logout') x.changeSession(session)
        expect((await x.store.ensureLoaded({ workOrderId, workflowNodeId,
          actionIntent: 'interact_with_form', pageLease: {} })).state).toBe('succeeded')
        expect(x.store.dynamicForm?.dataId).toBe(dataId)
        expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
        expect(x.execute).toHaveBeenCalledTimes(1)
      } finally { releaseQuote?.(); releaseRecord?.(); x.release(); x.store.clear() }
    })
  }

  }

  for (const checkpoint of ['receipt', 'record'] as const) {
    it(`clears current load after transient session loss at the ${checkpoint} recovery checkpoint`, async () => {
      const x = await saved()
      try {
        x.store.leavePage(x.store.descriptor)
        let armed = false
        if (checkpoint === 'receipt') {
          const read = vi.mocked(x.storage.read).getMockImplementation()!
          vi.mocked(x.storage.read).mockImplementation(async key => {
            const result = await read(key)
            if (!armed && key.key.startsWith('action-mutation%3Av1:')) {
              armed = true
              x.invalidateSessionOnce()
            }
            return result
          })
        } else {
          const read = x.readExecute.getMockImplementation()!
          x.readExecute.mockImplementation(async request => {
            const result = await read(request)
            if (!armed && request.path === `biz/extForm/query/${definitionId}`) {
              armed = true
              x.invalidateSessionOnce()
            }
            return result
          })
        }
        const before = x.execute.mock.calls.length
        const result = await reenter(x)
        expect(armed).toBe(true)
        expect(result.state).not.toBe('succeeded')
        expect(x.store.loadState).toBe('idle')
        expect(x.store.descriptor).toBeNull()
        expect(x.store.dynamicForm).toBeNull()
        expect(x.execute).toHaveBeenCalledTimes(before)
        expect((await reenter(x)).state).toBe('succeeded')
        expect(x.store.dynamicForm?.dataId).toBe(dataId)
        expect(x.store.dynamicForm?.appointmentReplacement).toBeDefined()
        expect(x.execute).toHaveBeenCalledTimes(before)
      } finally { x.store.clear() }
    })
  }

})
