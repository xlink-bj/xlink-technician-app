import { describe, expect, it } from 'vitest'
import { createPipeLocalRecord } from '@features/work-orders/pipe-work/local-record'
import { createNoCardOrder, parseNoCardOrder, pipeOrderFixture } from '@features/work-orders/pipe-work/no-card-order'
import {
  createPressureDraft, emptyPressureFields, parsePressureDraft, pressureDraftContentIdentity,
} from '@features/work-orders/pipe-work/pressure-draft'
import { actionDraftStorageKey, createActionDraftRepository, type ActionDraftIdentity } from '@runtimes/action'
import type { StorageKey, StoragePort } from '@shared/ports'
import { asOpaqueId, createOperationError } from '@shared/types'

const scope = { workOrderId: 'mock-work-order-002', taskId: 'mock-device-action-node-002' }
const pressureIdentity: ActionDraftIdentity = {
  version: 1, userId: asOpaqueId<'UserId'>('synthetic-user'), roleId: asOpaqueId<'RoleId'>('synthetic-role'),
  workOrderId: asOpaqueId<'WorkOrderId'>(scope.workOrderId),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(scope.taskId),
  actionIntent: 'construction', contentKind: 'composite', contentIdentity: pressureDraftContentIdentity,
}

function fixture() {
  const stored = new Map<string, unknown>()
  let current = true
  let failRead = false
  let loseReceipt = false
  let writes = 0
  const failure = { state: 'failed_terminal', error: createOperationError('server_terminal', 'Synthetic local error') } as const
  const storage: StoragePort = {
    async read<T>(key: StorageKey) {
      if (failRead) return failure
      return { state: 'succeeded', data: (stored.get(key.key) ?? null) as T | null }
    },
    async write<T>(key: StorageKey, record: T) {
      writes++
      stored.set(key.key, record)
      return loseReceipt ? failure : { state: 'succeeded', data: undefined }
    },
    async remove() { throw Error('Pipe work does not remove rows') },
    async listKeys() { throw Error('Pipe work reads only exact rows') },
  }
  const repository = createActionDraftRepository(storage)
  const make = (identity = pressureIdentity) => createPipeLocalRecord({
    repository, identity, stillCurrent: () => current,
    parse: value => parsePressureDraft(value, scope), withLock: (_, work) => work(),
  })
  return {
    stored, make, writes: () => writes,
    revoke: () => { current = false }, failRead: () => { failRead = true },
    loseReceipt: () => { loseReceipt = true },
  }
}

const partial = createPressureDraft(scope, { ...emptyPressureFields, start: '0.90', minutes: '4' })

describe('G11 no-card order fixture', () => {
  it('creates exactly one known identity for the assigned synthetic business and trimmed note', () => {
    const proposed = createNoCardOrder(pipeOrderFixture.subjectId, '  管道作业  ')
    expect(proposed).toMatchObject({ id: pipeOrderFixture.id, card: 'none', note: '管道作业' })
    expect(parseNoCardOrder(proposed)).toEqual(proposed)
    expect(createNoCardOrder('another-subject', '管道作业')).toBeNull()
    expect(createNoCardOrder(pipeOrderFixture.subjectId, ' ')).toBeNull()
    expect(parseNoCardOrder({ ...proposed, id: 'other-order' })).toBeNull()
  })
})

describe('G19 unsent pressure draft', () => {
  it('accepts draft strings and checks job, scope, method, unit and schema before restoring', () => {
    const entered = createPressureDraft(scope, { ...emptyPressureFields, start: '0.' })
    expect(parsePressureDraft(entered, scope)).toEqual(entered)
    for (const change of [
      { schema: 2 }, { workOrderId: 'other-order' }, { taskId: 'other-task' }, { jobId: 'other-job' },
      { method: 'device' }, { unit: 'kPa' }, { fields: { ...entered.fields, minutes: '0.2' } },
    ]) expect(parsePressureDraft({ ...entered, ...change }, scope)).toBeNull()
  })

  it('reads the exact role/job key after saving, separately from the existing pressure-result key', async () => {
    const f = fixture()
    expect(await f.make().write(partial, null)).toEqual({ state: 'saved', record: partial })
    expect(await f.make().read()).toEqual({ state: 'ready', record: partial })
    expect(await f.make({ ...pressureIdentity, roleId: asOpaqueId<'RoleId'>('other-role') }).read())
      .toEqual({ state: 'ready', record: null })
    expect(await f.make({ ...pressureIdentity, contentIdentity: 'device-action-content-v1:pressure' }).read())
      .toEqual({ state: 'ready', record: null })
    expect(f.stored.size).toBe(1)
  })

  it('never overwrites when the version read back is newer than the editor baseline', async () => {
    const f = fixture()
    await f.make().write(partial, null)
    const second = createPressureDraft(scope, { ...emptyPressureFields, end: '0.81' })
    expect(await f.make().write(second, null)).toEqual({ state: 'conflict', record: partial })
    expect(f.writes()).toBe(1)
    expect(await f.make().read()).toEqual({ state: 'ready', record: partial })
  })

  it('reconciles a write applied without a receipt through a fresh read only', async () => {
    const f = fixture()
    f.loseReceipt()
    expect(await f.make().write(partial, null)).toEqual({ state: 'unknown' })
    expect(await f.make().read()).toEqual({ state: 'ready', record: partial })
    expect(f.writes()).toBe(1)
  })

  it('blocks writes if current scope or a valid baseline cannot be proven', async () => {
    const f = fixture()
    f.failRead()
    expect(await f.make().write(partial, null)).toEqual({ state: 'failed' })
    f.revoke()
    expect(await f.make().read()).toEqual({ state: 'blocked' })
    expect(await f.make().write(partial, null)).toEqual({ state: 'blocked' })
    expect(f.writes()).toBe(0)
  })

  it('keeps an incompatible stored payload unchanged', async () => {
    const f = fixture()
    await f.make().write(partial, null)
    const key = actionDraftStorageKey(pressureIdentity)
    const known = f.stored.get(key) as Record<string, unknown>
    const later = { ...known, values: { pipeWork: { ...partial, schema: 2 } } }
    f.stored.set(key, later)
    expect(await f.make().read()).toEqual({ state: 'failed' })
    expect(await f.make().write(partial, null)).toEqual({ state: 'failed' })
    expect(f.stored.get(key)).toBe(later)
    expect(f.writes()).toBe(1)
  })
})
