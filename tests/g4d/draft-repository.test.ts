import { describe, expect, it } from 'vitest'

import {
  actionDraftIdentityFor,
  actionDraftLegacyStorageKey,
  actionDraftStorageKey,
  createActionDraftRepository,
} from '@runtimes/action'
import type { StorageKey, StorageListQuery, StoragePort } from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function storageFor() {
  const values = new Map<string, unknown>()
  const physicalKey = (key: StorageKey): string => `${key.namespace}:${key.key}`
  const storage: StoragePort = {
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
          .map((key) => key.slice(namespacePrefix.length))
          .sort(),
      )
    },
  }
  return { storage, values }
}

const userA = asOpaqueId<'UserId'>('draft-user-a')
const userB = asOpaqueId<'UserId'>('draft-user-b')

function identity(overrides: Partial<Parameters<typeof actionDraftIdentityFor>[0]> = {}) {
  return actionDraftIdentityFor({
    userId: userA,
    workOrderId: asOpaqueId<'WorkOrderId'>('draft-work-order-a'),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('draft-node-a'),
    actionIntent: 'set_appointment',
    contentKind: 'dynamic_form',
    contentIdentity: 'form-definition-a',
    ...overrides,
  })
}

function recordFor(
  draftIdentity: ReturnType<typeof identity>,
  values: Record<string, unknown>,
  updatedAt: string,
) {
  return {
    version: 1 as const,
    identity: draftIdentity,
    values,
    updatedAt,
    status: 'unfinished' as const,
  }
}

describe('Action Draft Repository', () => {
  it('keeps different Action identities independent and same identity at one latest record', async () => {
    const { storage } = storageFor()
    const repository = createActionDraftRepository(storage)
    const first = identity()
    const second = identity({ workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('draft-node-b') })
    const third = identity({ actionIntent: 'interact_with_form' })

    await repository.write(recordFor(first, { note: 'old' }, '2026-09-17T09:00:00.000Z'))
    await repository.write(recordFor(first, { note: 'latest' }, '2026-09-17T10:00:00.000Z'))
    await repository.write(recordFor(second, { note: 'second' }, '2026-09-17T11:00:00.000Z'))
    await repository.write(recordFor(third, { note: 'third' }, '2026-09-17T12:00:00.000Z'))

    const latest = await repository.read<Record<string, unknown>>(first)
    const registry = await repository.listForUser(userA)

    expect(latest).toMatchObject({ state: 'succeeded', data: { values: { note: 'latest' } } })
    expect(registry).toMatchObject({ state: 'succeeded', data: { invalidRecordCount: 0 } })
    expect(registry.data?.entries).toHaveLength(3)
    expect(registry.data?.entries.map((entry) => String(entry.identity.workOrderId)).sort()).toEqual([
      'draft-work-order-a',
      'draft-work-order-a',
      'draft-work-order-a',
    ])
    expect(registry.data?.entries.map((entry) => String(entry.identity.workflowNodeId)).sort()).toEqual([
      'draft-node-a',
      'draft-node-a',
      'draft-node-b',
    ])
    expect(registry.data?.entries[0]).not.toHaveProperty('values')
  })

  it('isolates users and removes only the exact Action identity', async () => {
    const { storage } = storageFor()
    const repository = createActionDraftRepository(storage)
    const a = identity()
    const b = identity({ userId: userB })
    await repository.write(recordFor(a, { owner: 'a' }, '2026-09-17T09:00:00.000Z'))
    await repository.write(recordFor(b, { owner: 'b' }, '2026-09-17T10:00:00.000Z'))

    expect((await repository.listForUser(userA)).data?.entries).toHaveLength(1)
    expect((await repository.listForUser(userB)).data?.entries).toHaveLength(1)
    expect((await repository.read<Record<string, unknown>>(b)).data?.values).toEqual({ owner: 'b' })

    await repository.remove(a)
    expect((await repository.read<Record<string, unknown>>(a)).data).toBeNull()
    expect((await repository.read<Record<string, unknown>>(b)).data?.values).toEqual({ owner: 'b' })
  })

  it('does not collide when content identity is absent versus the literal "none"', async () => {
    const { storage } = storageFor()
    const repository = createActionDraftRepository(storage)
    const withoutContent = actionDraftIdentityFor({
      userId: userA,
      workOrderId: asOpaqueId<'WorkOrderId'>('collision-work-order'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('collision-node'),
      actionIntent: 'set_appointment',
      contentKind: 'dynamic_form',
    })
    const literalNone = actionDraftIdentityFor({
      userId: userA,
      workOrderId: withoutContent.workOrderId,
      workflowNodeId: withoutContent.workflowNodeId,
      actionIntent: withoutContent.actionIntent,
      contentKind: withoutContent.contentKind,
      contentIdentity: 'none',
    })

    expect(actionDraftStorageKey(withoutContent)).not.toBe(actionDraftStorageKey(literalNone))
    await repository.write(recordFor(withoutContent, { branch: 'absent' }, '2026-09-17T09:00:00.000Z'))
    await repository.write(recordFor(literalNone, { branch: 'literal' }, '2026-09-17T10:00:00.000Z'))

    expect((await repository.listForUser(userA)).data?.entries).toHaveLength(2)
    expect((await repository.read<Record<string, unknown>>(withoutContent)).data?.values).toEqual({ branch: 'absent' })
    expect((await repository.read<Record<string, unknown>>(literalNone)).data?.values).toEqual({ branch: 'literal' })
  })

  it('restores legacy drafts after the key codec upgrade and cleans both formats', async () => {
    const { storage, values } = storageFor()
    const repository = createActionDraftRepository(storage)
    const existing = identity()
    const legacyKey = actionDraftLegacyStorageKey(existing)
    const canonicalKey = actionDraftStorageKey(existing)
    values.set(`draft:${legacyKey}`, recordFor(existing, { source: 'pre-upgrade' }, '2026-09-17T09:00:00.000Z'))

    expect(legacyKey).toContain('action-workspace:1:')
    expect(canonicalKey).toContain('action-workspace:2:')
    expect((await repository.read<Record<string, unknown>>(existing)).data?.values).toEqual({ source: 'pre-upgrade' })
    expect((await repository.listForUser(userA)).data?.entries).toHaveLength(1)

    await repository.write(recordFor(existing, { source: 'post-upgrade' }, '2026-09-17T10:00:00.000Z'))
    expect(values.has(`draft:${canonicalKey}`)).toBe(true)
    expect(values.has(`draft:${legacyKey}`)).toBe(true)
    expect((await repository.listForUser(userA)).data?.entries).toHaveLength(1)
    expect((await repository.read<Record<string, unknown>>(existing)).data?.values).toEqual({ source: 'post-upgrade' })

    await repository.remove(existing)
    expect(values.has(`draft:${canonicalKey}`)).toBe(false)
    expect(values.has(`draft:${legacyKey}`)).toBe(false)
    expect((await repository.read<Record<string, unknown>>(existing)).data).toBeNull()
  })

  it('counts malformed records, ignores mismatched records, and never throws on malformed identity values', async () => {
    const { storage, values } = storageFor()
    const repository = createActionDraftRepository(storage)
    const valid = identity()
    await repository.write(recordFor(valid, { note: 'valid' }, '2026-09-17T10:00:00.000Z'))

    const malformedIdentityKey = actionDraftStorageKey(identity({ workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('draft-node-malformed') }))
    values.set(`draft:${malformedIdentityKey}`, {
      version: 1,
      identity: { ...valid, userId: '' },
      values: { note: 'bad identity' },
      updatedAt: '2026-09-17T09:00:00.000Z',
      status: 'unfinished',
    })
    const mismatchedKey = actionDraftStorageKey(identity({ workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('draft-node-mismatch') }))
    values.set(`draft:${mismatchedKey}`, {
      ...recordFor(valid, { note: 'wrong identity' }, '2026-09-17T09:00:00.000Z'),
    })
    values.set('session:action-workspace:1:draft-user-a:ignored', { unrelated: true })

    const result = await repository.listForUser(userA)

    expect(result).toMatchObject({ state: 'succeeded', data: { invalidRecordCount: 2 } })
    expect(result.data?.entries).toHaveLength(1)
    expect(result.data?.entries[0].identity).toEqual(valid)
  })
})
