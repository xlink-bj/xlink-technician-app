import type { StoragePort } from '@shared/ports'
import {
  asOpaqueId,
  type OperationSnapshot,
  type UserId,
} from '@shared/types'
import type { WorkflowActionIntent } from '@runtimes/workflow'
import type {
  ActionContentKind,
  ActionDraftIdentity,
  ActionDraftRecord,
} from './types'
import {
  actionDraftIdentityMatches,
  actionDraftLegacyStorageKeyPrefixForUser,
  actionDraftLegacyStorageKeys,
  actionDraftStorageKey,
  actionDraftStorageKeyPrefixForUser,
} from './types'

export interface ActionDraftRegistryEntry {
  readonly identity: ActionDraftIdentity
  readonly updatedAt: string
  readonly status: 'unfinished' | 'completed'
}

export interface ActionDraftRegistrySnapshot {
  readonly entries: readonly ActionDraftRegistryEntry[]
  readonly invalidRecordCount: number
}

export interface ActionDraftRepository {
  read<TState extends Readonly<Record<string, unknown>>>(
    identity: ActionDraftIdentity,
  ): Promise<OperationSnapshot<ActionDraftRecord<TState> | null>>
  write<TState extends Readonly<Record<string, unknown>>>(
    record: ActionDraftRecord<TState>,
  ): Promise<OperationSnapshot<void>>
  remove(identity: ActionDraftIdentity): Promise<OperationSnapshot<void>>
  listForUser(userId: UserId): Promise<OperationSnapshot<ActionDraftRegistrySnapshot>>
}

const actionIntents = new Set<WorkflowActionIntent>([
  'accept_order',
  'interact_with_form',
  'set_appointment',
  'complete',
  'open_subworkflow',
  'place_order',
  'transition',
  'rollback',
  'takeback',
  'cancel',
  'acceptance',
  'quotation',
  'construction',
])

const contentKinds = new Set<ActionContentKind>([
  'dynamic_form',
  'quotation',
  'contract',
  'media_signature',
  'composite',
  'unsupported',
])

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function identityFromRecord(value: unknown): ActionDraftIdentity | null {
  const record = objectRecord(value)
  const identity = objectRecord(record?.identity)
  const userId = nonEmptyString(identity?.userId)
  const workOrderId = nonEmptyString(identity?.workOrderId)
  const workflowNodeId = nonEmptyString(identity?.workflowNodeId)
  const hasContentIdentity = Boolean(identity && Object.prototype.hasOwnProperty.call(identity, 'contentIdentity'))
  const contentIdentity = hasContentIdentity
    ? nonEmptyString(identity?.contentIdentity)
    : undefined
  if (
    identity?.version !== 1 ||
    !userId ||
    !workOrderId ||
    !workflowNodeId ||
    typeof identity.actionIntent !== 'string' ||
    typeof identity.contentKind !== 'string' ||
    !actionIntents.has(identity.actionIntent as WorkflowActionIntent) ||
    !contentKinds.has(identity.contentKind as ActionContentKind) ||
    (hasContentIdentity && !contentIdentity)
  ) return null

  return {
    version: 1,
    userId: asOpaqueId<'UserId'>(userId),
    workOrderId: asOpaqueId<'WorkOrderId'>(workOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(workflowNodeId),
    actionIntent: identity.actionIntent as WorkflowActionIntent,
    contentKind: identity.contentKind as ActionContentKind,
    ...(contentIdentity ? { contentIdentity } : {}),
  }
}

function validDraftRecord<TState extends Readonly<Record<string, unknown>>>(
  value: unknown,
  expectedIdentity?: ActionDraftIdentity,
): value is ActionDraftRecord<TState> {
  const record = objectRecord(value)
  const values = objectRecord(record?.values)
  const identity = identityFromRecord(value)
  if (
    record?.version !== 1 ||
    !values ||
    !identity ||
    typeof record.updatedAt !== 'string' ||
    record.updatedAt.trim().length === 0 ||
    (record.status !== 'unfinished' && record.status !== 'completed')
  ) return false
  if (expectedIdentity && !actionDraftIdentityMatches(identity, expectedIdentity)) return false
  return true
}

function entryFor(
  identity: ActionDraftIdentity,
  record: ActionDraftRecord<Readonly<Record<string, unknown>>>,
): ActionDraftRegistryEntry {
  return {
    identity,
    updatedAt: record.updatedAt,
    status: record.status,
  }
}

export class SemanticActionDraftRepository implements ActionDraftRepository {
  constructor(private readonly storage: StoragePort) {}

  async read<TState extends Readonly<Record<string, unknown>>>(
    identity: ActionDraftIdentity,
  ): Promise<OperationSnapshot<ActionDraftRecord<TState> | null>> {
    const canonical = await this.storage.read<unknown>({
      namespace: 'draft',
      key: actionDraftStorageKey(identity),
    })
    if (canonical.state !== 'succeeded') return canonical as OperationSnapshot<ActionDraftRecord<TState> | null>
    if (canonical.data !== null && validDraftRecord<TState>(canonical.data, identity)) {
      return { state: 'succeeded', data: canonical.data }
    }

    for (const key of actionDraftLegacyStorageKeys(identity)) {
      const legacy = await this.storage.read<unknown>({ namespace: 'draft', key })
      if (legacy.state !== 'succeeded') return legacy as OperationSnapshot<ActionDraftRecord<TState> | null>
      if (legacy.data !== null && validDraftRecord<TState>(legacy.data, identity)) {
        return { state: 'succeeded', data: legacy.data }
      }
    }
    return { state: 'succeeded', data: null }
  }

  write<TState extends Readonly<Record<string, unknown>>>(
    record: ActionDraftRecord<TState>,
  ): Promise<OperationSnapshot<void>> {
    return this.storage.write(
      { namespace: 'draft', key: actionDraftStorageKey(record.identity) },
      record,
    )
  }

  remove(identity: ActionDraftIdentity): Promise<OperationSnapshot<void>> {
    return Promise.all([
      this.storage.remove({ namespace: 'draft', key: actionDraftStorageKey(identity) }),
      ...actionDraftLegacyStorageKeys(identity).map((key) => this.storage.remove({ namespace: 'draft', key })),
    ]).then((results) => results.find((result) => result.state !== 'succeeded') ?? results[0])
  }

  async listForUser(userId: UserId): Promise<OperationSnapshot<ActionDraftRegistrySnapshot>> {
    const [canonicalKeys, legacyKeys] = await Promise.all([
      this.storage.listKeys({ namespace: 'draft', prefix: actionDraftStorageKeyPrefixForUser(userId) }),
      this.storage.listKeys({ namespace: 'draft', prefix: actionDraftLegacyStorageKeyPrefixForUser(userId) }),
    ])
    for (const keys of [canonicalKeys, legacyKeys]) {
      if (keys.state !== 'succeeded' || !keys.data) {
        return keys.state === 'failed_retryable'
          ? { state: 'failed_retryable', error: keys.error }
          : { state: 'failed_terminal', error: keys.error }
      }
    }

    const candidates: Array<ActionDraftRegistryEntry & { readonly key: string; readonly format: 'canonical' | 'legacy' }> = []
    let invalidRecordCount = 0
    const allKeys: Array<{ readonly key: string; readonly format: 'canonical' | 'legacy' }> = [
      ...(canonicalKeys.data ?? []).map((key) => ({ key, format: 'canonical' as const })),
      ...(legacyKeys.data ?? []).map((key) => ({ key, format: 'legacy' as const })),
    ]
    for (const { key, format } of allKeys) {
      const stored = await this.storage.read<unknown>({ namespace: 'draft', key })
      const storedIdentity = stored.state === 'succeeded' && stored.data
        ? identityFromRecord(stored.data)
        : null
      const keyMatchesIdentity = storedIdentity && (format === 'canonical'
        ? actionDraftStorageKey(storedIdentity) === key
        : actionDraftLegacyStorageKeys(storedIdentity).includes(key))
      if (
        stored.state !== 'succeeded' ||
        !stored.data ||
        !storedIdentity ||
        !keyMatchesIdentity ||
        !validDraftRecord(stored.data, storedIdentity) ||
        String(storedIdentity.userId) !== String(userId)
      ) {
        invalidRecordCount += 1
        continue
      }
      candidates.push({ ...entryFor(storedIdentity, stored.data), key, format })
    }

    const entriesByIdentity = new Map<string, typeof candidates[number]>()
    for (const candidate of candidates) {
      const identityKey = actionDraftStorageKey(candidate.identity)
      const previous = entriesByIdentity.get(identityKey)
      const preferCandidate = !previous
        || (candidate.format === 'canonical' && previous.format === 'legacy')
        || (candidate.format === previous.format && candidate.updatedAt.localeCompare(previous.updatedAt) > 0)
      if (preferCandidate) entriesByIdentity.set(identityKey, candidate)
    }
    const entries = [...entriesByIdentity.values()]

    entries.sort((left, right) => {
      const unfinishedOrder = Number(right.status === 'unfinished') - Number(left.status === 'unfinished')
      if (unfinishedOrder !== 0) return unfinishedOrder
      const updatedOrder = right.updatedAt.localeCompare(left.updatedAt)
      return updatedOrder !== 0 ? updatedOrder : left.key.localeCompare(right.key)
    })
    return {
      state: 'succeeded',
      data: {
        entries: entries.map(({ key: _key, ...entry }) => entry),
        invalidRecordCount,
      },
    }
  }
}

export function createActionDraftRepository(storage: StoragePort): ActionDraftRepository {
  return new SemanticActionDraftRepository(storage)
}
