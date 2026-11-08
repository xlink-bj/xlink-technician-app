import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNormalRepeatActionProvider } from '@app/r1-repeat-authorization'
import type { R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

const wire = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@adapters/api/uni-api-command-transport', () => ({ createUniApiCommandTransport: () => wire }))
const scope = { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: 'e' }
const origin = 'http://127.0.0.1:5189'
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function setup(saved = false) {
  const base = { workOrderId: 's', node: { id: 'n', runId: 'w', formDefinitionId: 'e', sourceNodeType: 'repeat', nodeTypeEvidence: 'runtime_node_def', category: 'repeat', lifecycle: 'active', handlers: [{ kind: 'user', userId: 'u' }], visibility: { evidenceState: 'verified', viewableRoleIds: ['r'] }, formFieldIdsReadOnly: [] }, definition: { id: 'e', fields: [{ fieldId: 'x', valueKey: 'area', type: 'digit', label: 'Area', required: true, readOnly: false }] }, fillableFieldIds: ['x'], records: [] } as unknown as R1NodeFormsSnapshot
  let rows: R1NodeFormsSnapshot['records'] = saved ? [{ id: 'saved', definitionId: 'e', workflowRunId: 'w', values: { area: 3 } }] as never : []
  let current: R1NodeFormsSnapshot | null = { ...base, records: rows }
  const initial = current
  const reader = { enabled: () => true, isCurrent: (value: R1NodeFormsSnapshot) => current === value,
    clear: () => { current = null }, load: vi.fn(async () => { current = structuredClone({ ...base, records: rows }); return current }) }
  wire.execute.mockImplementation(async () => { rows = [{ id: 'saved', definitionId: 'e', workflowRunId: 'w', values: { area: 3 } }] as never; return { success: true, status: 1, data: { _id: 'saved' } } })
  const env = { DEV: true, VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_AUTH_TENANT: 't', VITE_XLINK_API_BASE_URL: origin + '/xlink/wm', VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true', VITE_XLINK_MOCK: 'false', VITE_XLINK_R1_REPEAT_ACTIONS: 'true', VITE_XLINK_R1_REPEAT_GRANT: JSON.stringify({ version: 1, scope, expiresAt: '2099-01-01T00:00:00Z', fieldIds: ['x'], operations: ['create', 'complete'] }) }
  const provider = createNormalRepeatActionProvider({ env, origin, reader, auth: { getCurrentSession: () => ({ sessionRef: 'synthetic', user: { id: 'u' }, currentRole: { id: 'r' } }) as never } })
  return { reader, provider, initial, get current() { return current! }, moveAway() { reader.clear(); current = structuredClone({ ...base, workOrderId: 'other' }); return current } }
}
beforeEach(() => { installLocalFixtureBrowser(); wire.execute.mockReset() })
afterEach(() => vi.unstubAllGlobals())

describe('normal repeat page snapshot ownership across awaits', () => {
  it('renews only its own successful reads and retains the normal save path', async () => {
    const h = setup(), action = h.provider.forSnapshot(h.initial)!
    const result = await action.saveOnly({ area: 3 })
    expect(result.records[0]?.id).toBe('saved'); expect(h.reader.isCurrent(result)).toBe(true)
    expect(h.reader.load).toHaveBeenCalledTimes(2); expect(wire.execute).toHaveBeenCalledTimes(1)
  })
  it.each(['different page', 'same page reread'])('rejects a late save ACK after %s without restarting old reads', async kind => {
    const h = setup(), action = h.provider.forSnapshot(h.initial)!, ack = deferred<unknown>()
    wire.execute.mockReturnValueOnce(ack.promise)
    const pending = action.saveOnly({ area: 3 }); const outcome = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(wire.execute).toHaveBeenCalledTimes(1))
    const active = kind === 'different page' ? h.moveAway() : await h.reader.load()
    const before = h.reader.load.mock.calls.length
    ack.resolve({ success: true, status: 1, data: { _id: 'saved' } }); await outcome
    expect(h.reader.load).toHaveBeenCalledTimes(before); expect(h.reader.isCurrent(active)).toBe(true)
    expect(action.locked()).toBe(true); expect(wire.execute).toHaveBeenCalledTimes(1)
  })
  it('does not renew ownership when its pre-save read is superseded', async () => {
    const h = setup(), action = h.provider.forSnapshot(h.initial)!, read = deferred<R1NodeFormsSnapshot>()
    h.reader.load.mockReturnValueOnce(read.promise)
    const pending = action.saveOnly({ area: 3 }); const outcome = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(h.reader.load).toHaveBeenCalledTimes(1))
    const active = h.moveAway(); read.resolve(structuredClone(h.initial)); await outcome
    expect(h.reader.isCurrent(active)).toBe(true); expect(wire.execute).not.toHaveBeenCalled()
  })
  it('can explicitly complete a current saved record after its own fresh read', async () => {
    const h = setup(true), action = h.provider.forSnapshot(h.initial)!
    wire.execute.mockResolvedValueOnce({ success: true, status: 1, entity: { _id: 'w' } })
    expect(await action.complete()).toEqual({ acknowledged: true, transitionVerified: false })
    expect(h.reader.load).toHaveBeenCalledTimes(1); expect(wire.execute).toHaveBeenCalledTimes(1)
  })
  it('keeps a late completion ACK uncertain after leaving the page', async () => {
    const h = setup(true), action = h.provider.forSnapshot(h.initial)!, ack = deferred<unknown>()
    wire.execute.mockReturnValueOnce(ack.promise)
    const pending = action.complete(); const outcome = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(wire.execute).toHaveBeenCalledTimes(1))
    const active = h.moveAway(); ack.resolve({ success: true, status: 1, entity: { _id: 'w' } }); await outcome
    expect(h.reader.isCurrent(active)).toBe(true); expect(action.locked()).toBe(true)
    expect(h.reader.load).toHaveBeenCalledTimes(1); expect(wire.execute).toHaveBeenCalledTimes(1)
  })
})
