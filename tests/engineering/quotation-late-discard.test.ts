import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { actionDraftIdentityFor, createActionDraftRepository, type ActionDraftIdentity } from '@runtimes/action'
import type { StoragePort } from '@shared/ports'
import { asOpaqueId, createOperationError, type OperationSnapshot } from '@shared/types'
import { useQuotationCompositionStore } from '@features/work-orders/quotation/composition-store'

function succeeded<T>(data: T): OperationSnapshot<T> { return { state: 'succeeded', data } }

function identityFor(scope: string): ActionDraftIdentity {
  return actionDraftIdentityFor({
    userId: asOpaqueId<'UserId'>('discard-user'),
    workOrderId: asOpaqueId<'WorkOrderId'>(`work-${scope}`),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(`node-${scope}`),
    actionIntent: 'place_order', contentKind: 'quotation',
  })
}

function fixture() {
  const values = new Map<string, unknown>()
  let release!: () => void
  let entered!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { entered = resolve })
  let hold = false
  let fail = false
  const storage: StoragePort = {
    read: async <T>(key: { key: string }) => succeeded((values.get(key.key) as T | undefined) ?? null),
    write: async (key, value) => { values.set(key.key, value); return succeeded(undefined) },
    remove: async key => {
      if (hold) { entered(); await pending }
      if (fail) return { state: 'failed_terminal', error: createOperationError('server_terminal', 'Synthetic local remove failure') }
      values.delete(key.key)
      return succeeded(undefined)
    },
    listKeys: async () => succeeded([...values.keys()]),
  }
  return { repository: createActionDraftRepository(storage), started, release, hold: () => { hold = true }, fail: () => { fail = true } }
}

async function initializeInvalid(f: ReturnType<typeof fixture>, identity = identityFor('A')) {
  await f.repository.write({ version: 1, identity, values: { schemaVersion: 4, origin: 'new', quotationDraft: { malformed: true } }, updatedAt: '2026-11-12T00:00:00.000Z', status: 'unfinished' })
  const store = useQuotationCompositionStore()
  expect(await store.initialize({ identity, repository: f.repository })).toBe('invalid')
  return { store, identity }
}

function currentState() {
  const store = useQuotationCompositionStore()
  return JSON.parse(JSON.stringify({ draft: store.draft, localState: store.localState, origin: store.origin, message: store.localStateMessage }))
}

describe('quotation explicit discard generation ownership', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers() })
  afterEach(() => { useQuotationCompositionStore().clear(); vi.useRealTimers() })

  it('same scope removes the invalid record and permits fresh input', async () => {
    const f = fixture(), { store, identity } = await initializeInvalid(f)
    expect((await store.discardInvalidDraft()).state).toBe('succeeded')
    expect((await f.repository.read(identity)).data).toBeNull()
    expect(store.localState).toBe('fresh')
    expect(store.createGroup({ repairParts: ['part-A'], partDescription: 'New A input' }).state).toBe('succeeded')
    expect(store.groups[0].partDescription).toBe('New A input')
  })

  it('late A discard preserves B draft and dirty state after normal initialize', async () => {
    const f = fixture(), { store, identity } = await initializeInvalid(f)
    f.hold(); const discarding = store.discardInvalidDraft(); await f.started
    await store.initialize({ identity: identityFor('B'), repository: f.repository })
    expect(store.createGroup({ repairParts: ['part-B'], partDescription: 'B owns this draft' }).state).toBe('succeeded')
    const before = currentState(); f.release()
    expect((await discarding).state).toBe('failed_terminal')
    expect(currentState()).toEqual(before)
    expect((await f.repository.read(identity)).data).toBeNull()
  })

  it('same key reinitialize does not let the older discard reset the new view', async () => {
    const f = fixture(), { store, identity } = await initializeInvalid(f)
    f.hold(); const discarding = store.discardInvalidDraft(); await f.started
    await store.initialize({ identity, repository: f.repository })
    const before = currentState(); f.release()
    expect((await discarding).state).toBe('failed_terminal')
    expect(currentState()).toEqual(before)
  })

  it('changing repository under the same identity preserves the replacement draft', async () => {
    const a = fixture(), b = fixture(), { store, identity } = await initializeInvalid(a)
    a.hold(); const discarding = store.discardInvalidDraft(); await a.started
    await store.initialize({ identity, repository: b.repository })
    store.createGroup({ repairParts: ['part-B'], partDescription: 'Replacement repository' })
    const before = currentState(); a.release()
    expect((await discarding).state).toBe('failed_terminal')
    expect(currentState()).toEqual(before)
  })

  it('failed storage removal keeps the original invalid record and state', async () => {
    const f = fixture(), { store, identity } = await initializeInvalid(f)
    const stored = await f.repository.read(identity), before = currentState(); f.fail()
    expect((await store.discardInvalidDraft()).state).toBe('failed_terminal')
    expect(currentState()).toEqual(before)
    expect(await f.repository.read(identity)).toEqual(stored)
  })

  it('a second pending discard cannot clear fresh input after the first succeeds', async () => {
    const f = fixture(), { store } = await initializeInvalid(f)
    const first = store.discardInvalidDraft()
    f.hold(); const second = store.discardInvalidDraft(); await f.started
    expect((await first).state).toBe('succeeded')
    expect(store.createGroup({ repairParts: ['part-A'], partDescription: 'Input after first discard' }).state).toBe('succeeded')
    const before = currentState(); f.release()
    expect((await second).state).toBe('failed_terminal')
    expect(currentState()).toEqual(before)
  })

  it('leaving the view during remove keeps the cleared view idle', async () => {
    const f = fixture(), { store } = await initializeInvalid(f)
    f.hold(); const discarding = store.discardInvalidDraft(); await f.started
    store.clear(); f.release()
    expect((await discarding).state).toBe('failed_terminal')
    expect(store.localState).toBe('idle')
    expect(store.draft).toBeNull()
  })
})
