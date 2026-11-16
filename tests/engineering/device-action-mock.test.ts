import { afterEach, describe, expect, it, vi } from 'vitest'
import { createActionDraftRepository, type ActionDraftIdentity } from '@runtimes/action'
import { createDevMockDevicePort } from '@adapters/device/dev-mock-device'
import { createDeviceAction } from '@features/work-orders/device-action/device-action'
import type { DeviceActionPort, DeviceEvent } from '@shared/ports/device-action'
import type { StoragePort, StorageKey } from '@shared/ports'
import { asOpaqueId } from '@shared/types'

const identity = (task = 'node-a', user = 'user-a'): ActionDraftIdentity => ({
  version: 1, userId: asOpaqueId<'UserId'>(user), roleId: asOpaqueId<'RoleId'>('role-a'),
  workOrderId: asOpaqueId<'WorkOrderId'>('mock-device-order-a'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(task),
  actionIntent: 'construction', contentKind: 'composite', contentIdentity: 'device-action-content-v1',
})
function storage(): StoragePort {
  const values = new Map<string, unknown>()
  const key = (namespace: string, name: string) => `${namespace}:${name}`
  return {
    async read<T>(input: StorageKey) { return { state: 'succeeded', data: (values.get(key(input.namespace, input.key)) ?? null) as T | null } },
    async write<T>(input: StorageKey, value: T) { values.set(key(input.namespace, input.key), value); return { state: 'succeeded', data: undefined } },
    async remove(input) { values.delete(key(input.namespace, input.key)); return { state: 'succeeded', data: undefined } },
    async listKeys(input) { return { state: 'succeeded', data: [...values.keys()]
      .filter(value => value.startsWith(`${input.namespace}:`))
      .map(value => value.slice(input.namespace.length + 1))
      .filter(value => !input.prefix || value.startsWith(input.prefix)) } },
  }
}
afterEach(() => vi.useRealTimers())

describe('DEV device Action Content', () => {
  it('connects, finishes pressure sampling, saves and restores an exact scoped draft', async () => {
    vi.useFakeTimers()
    const repository = createActionDraftRepository(storage())
    const action = createDeviceAction({ identity: identity(), repository, port: createDevMockDevicePort(), isCurrentScope: () => true })
    await action.connect()
    action.start()
    await vi.advanceTimersByTimeAsync(1800)
    expect(action.state.value.phase).toBe('finished')
    expect(action.state.value.result?.samples).toHaveLength(3)
    expect(action.state.value.result?.measurement).toBe('unverified')
    expect(await action.saveLocal()).toBe(true)
    const reopened = createDeviceAction({ identity: identity(), repository, port: createDevMockDevicePort(), isCurrentScope: () => true })
    expect(await reopened.restore()).toBe(true)
    expect(reopened.state.value.localSaved).toBe(true)
    expect(reopened.state.value.connected).toBe(false)
    expect(await createDeviceAction({ identity: identity('node-b'), repository, port: createDevMockDevicePort(), isCurrentScope: () => true }).restore()).toBe(false)
    expect(await createDeviceAction({ identity: identity('node-a', 'user-b'), repository, port: createDevMockDevicePort(), isCurrentScope: () => true }).restore()).toBe(false)
  })

  it('keeps panorama preview separate from a real file or business confirmation', async () => {
    vi.useFakeTimers()
    const action = createDeviceAction({ identity: identity(), repository: createActionDraftRepository(storage()),
      port: createDevMockDevicePort(), isCurrentScope: () => true })
    action.select('panorama')
    await action.connect()
    action.start()
    await vi.advanceTimersByTimeAsync(1800)
    expect(action.state.value.result?.panorama?.stitched).toBe(true)
    expect(action.state.value.result?.dataComplete).toBe(false)
    expect(action.state.value.result?.measurement).toBe('not_applicable')
  })

  it('does not auto restart after disconnect and ignores duplicate start', async () => {
    vi.useFakeTimers()
    const port = createDevMockDevicePort()
    const action = createDeviceAction({ identity: identity(), repository: createActionDraftRepository(storage()), port, isCurrentScope: () => true })
    await action.connect()
    action.start()
    action.start()
    port.disconnect()
    await vi.advanceTimersByTimeAsync(2200)
    expect(action.state.value.phase).toBe('interrupted')
    expect(action.state.value.result).toBeNull()
    await action.connect()
    expect(action.state.value.phase).toBe('ready')
    await vi.advanceTimersByTimeAsync(2200)
    expect(action.state.value.result).toBeNull()
    action.start()
    await vi.advanceTimersByTimeAsync(1800)
    expect(action.state.value.phase).toBe('finished')
  })

  it('drops late events after cancel or account scope change', async () => {
    let emit: ((event: DeviceEvent) => void) | null = null
    const port: DeviceActionPort = {
      async connect() {}, start(_kind, callback) { emit = callback }, cancel() {},
    }
    let current = true
    const action = createDeviceAction({ identity: identity(), repository: createActionDraftRepository(storage()),
      port, isCurrentScope: () => current })
    await action.connect()
    action.start()
    const stale = emit!
    action.interrupt()
    stale({ type: 'finished', result: { kind: 'pressure', source: 'dev_mock', completedAt: '2026-11-16', dataComplete: true, measurement: 'unverified' } })
    expect(action.state.value.result).toBeNull()
    await action.connect()
    action.start()
    current = false
    emit!({ type: 'progress', progress: 75, label: 'late' })
    expect(action.state.value.progress).toBe(0)
    expect(await action.saveLocal()).toBe(false)
  })
})
