import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { mockAppointmentDraftSeeds } from '@app/action-workspace-harness'
import {
  actionDraftIdentityFor,
  createActionDraftRepository,
} from '@runtimes/action'
import { useLocalDraftDiagnosticsStore } from '@features/home/draft-diagnostics'
import type { SessionSnapshot, StorageKey, StorageListQuery, StoragePort } from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function storageFor(): StoragePort {
  const values = new Map<string, unknown>()
  const physicalKey = (key: StorageKey): string => `${key.namespace}:${key.key}`
  return {
    read: async <T>(key: StorageKey) => succeeded((values.get(physicalKey(key)) as T | undefined) ?? null),
    write: async <T>(key: StorageKey, value: T) => {
      values.set(physicalKey(key), value)
      return succeeded(undefined)
    },
    remove: async (key) => {
      values.delete(physicalKey(key))
      return succeeded(undefined)
    },
    listKeys: async (query: StorageListQuery) => {
      const namespacePrefix = `${query.namespace}:`
      const requestedPrefix = `${namespacePrefix}${query.prefix ?? ''}`
      return succeeded(
        [...values.keys()]
          .filter((key) => key.startsWith(requestedPrefix))
          .map((key) => key.slice(namespacePrefix.length)),
      )
    },
  }
}

function sessionFor(userId: string): SessionSnapshot {
  return {
    sessionRef: asOpaqueId<'SessionRef'>(`diagnostic-session-${userId}`),
    user: { id: asOpaqueId<'UserId'>(userId) },
    currentRole: { id: asOpaqueId<'RoleId'>('diagnostic-role') },
    capabilityNames: [],
  }
}

describe('Home local draft diagnostics', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('seeds three Mock drafts through the shared repository and exposes metadata only', async () => {
    const repository = createActionDraftRepository(storageFor())
    const store = useLocalDraftDiagnosticsStore()
    store.configure({
      repository,
      getSession: () => sessionFor('diagnostic-user'),
      isDeveloperModeAvailable: () => true,
      getMockMode: () => 'data',
      mockDraftSeeds: mockAppointmentDraftSeeds,
      now: () => '2026-09-17T12:00:00.000Z',
    })

    const result = await store.seedMockDrafts()

    expect(result.state).toBe('succeeded')
    expect(store.entries).toHaveLength(mockAppointmentDraftSeeds.length)
    expect(store.unfinishedTotal).toBe(3)
    expect(store.entries[0]).not.toHaveProperty('values')
    expect(store.entries.every((entry) => entry.openRoute?.includes('/pages/work-orders/action-workspace'))).toBe(true)
  })

  it('keeps diagnostics user-scoped and clears only known Mock seed identities', async () => {
    const storage = storageFor()
    const repository = createActionDraftRepository(storage)
    const userA = asOpaqueId<'UserId'>('diagnostic-user-a')
    const otherIdentity = actionDraftIdentityFor({
      userId: userA,
      workOrderId: asOpaqueId<'WorkOrderId'>('diagnostic-real-work-order'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('diagnostic-real-node'),
      actionIntent: 'set_appointment',
      contentKind: 'dynamic_form',
      contentIdentity: 'diagnostic-form',
    })
    await repository.write({
      version: 1,
      identity: otherIdentity,
      values: { need: '1' },
      updatedAt: '2026-09-17T09:00:00.000Z',
      status: 'unfinished',
    })

    let mode: 'data' | 'empty' = 'data'
    const store = useLocalDraftDiagnosticsStore()
    store.configure({
      repository,
      getSession: () => sessionFor('diagnostic-user-a'),
      isDeveloperModeAvailable: () => true,
      getMockMode: () => mode,
      mockDraftSeeds: mockAppointmentDraftSeeds,
      now: () => '2026-09-17T12:00:00.000Z',
    })
    await store.seedMockDrafts()
    expect(store.entries).toHaveLength(4)

    mode = 'empty'
    await store.clearMockDrafts()

    expect(store.entries).toHaveLength(1)
    expect(String(store.entries[0].identity.workOrderId)).toBe('diagnostic-real-work-order')
    expect((await repository.listForUser(asOpaqueId<'UserId'>('diagnostic-user-b'))).data?.entries).toHaveLength(0)
  })

  it('does not expose or mutate diagnostics outside the developer environment', async () => {
    const repository = createActionDraftRepository(storageFor())
    const store = useLocalDraftDiagnosticsStore()
    store.configure({
      repository,
      getSession: () => sessionFor('diagnostic-production-user'),
      isDeveloperModeAvailable: () => false,
      getMockMode: () => 'data',
      mockDraftSeeds: mockAppointmentDraftSeeds,
    })

    expect((await store.refresh()).data).toEqual([])
    expect(store.entries).toEqual([])
    expect(store.seedAvailable).toBe(false)
    expect(store.cleanupAvailable).toBe(false)
  })
})
