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
import { actionDraftIdentityMatches, actionDraftStorageKey, actionDraftStorageKeyPrefixForUser } from './types'

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

function decode(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value)
    return decoded.length > 0 ? decoded : undefined
  } catch {
    return undefined
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function identityFromKey(key: string): ActionDraftIdentity | null {
  const parts = key.split(':')
  if (parts.length !== 8 || parts[0] !== 'action-workspace' || parts[1] !== '1') return null
  const userId = decode(parts[2])
  const workOrderId = decode(parts[3])
  const workflowNodeId = decode(parts[4])
  const actionIntent = decode(parts[5])
  const contentKind = decode(parts[6])
  if (
    !userId ||
    !workOrderId ||
    !workflowNodeId ||
    !actionIntent ||
    !contentKind ||
    !actionIntents.has(actionIntent as WorkflowActionIntent) ||
    !contentKinds.has(contentKind as ActionContentKind)
  ) return null

  let contentIdentity: string | undefined
  if (parts[7] !== 'u') {
    if (!parts[7].startsWith('v')) return null
    contentIdentity = decode(parts[7].slice(1))
    if (!contentIdentity) return null
  }
  return {
    version: 1,
    userId: asOpaqueId<'UserId'>(userId),
    workOrderId: asOpaqueId<'WorkOrderId'>(workOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(workflowNodeId),
    actionIntent: actionIntent as WorkflowActionIntent,
    contentKind: contentKind as ActionContentKind,
    ...(contentIdentity ? { contentIdentity } : {}),
  }
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
    const result = await this.storage.read<unknown>({
      namespace: 'draft',
      key: actionDraftStorageKey(identity),
    })
    if (result.state !== 'succeeded') return result as OperationSnapshot<ActionDraftRecord<TState> | null>
    if (result.data === null || !validDraftRecord<TState>(result.data, identity)) return { state: 'succeeded', data: null }
    return { state: 'succeeded', data: result.data }
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
    return this.storage.remove({ namespace: 'draft', key: actionDraftStorageKey(identity) })
  }

  async listForUser(userId: UserId): Promise<OperationSnapshot<ActionDraftRegistrySnapshot>> {
    const keys = await this.storage.listKeys({
      namespace: 'draft',
      prefix: actionDraftStorageKeyPrefixForUser(userId),
    })
    if (keys.state !== 'succeeded' || !keys.data) {
      return keys.state === 'failed_retryable'
        ? { state: 'failed_retryable', error: keys.error }
        : { state: 'failed_terminal', error: keys.error }
    }

    const entries: Array<ActionDraftRegistryEntry & { readonly key: string }> = []
    let invalidRecordCount = 0
    for (const key of keys.data) {
      const identity = identityFromKey(key)
      if (!identity || String(identity.userId) !== String(userId)) {
        invalidRecordCount += 1
        continue
      }
      if (actionDraftStorageKey(identity) !== key) {
        invalidRecordCount += 1
        continue
      }
      const stored = await this.storage.read<unknown>({ namespace: 'draft', key })
      if (stored.state !== 'succeeded' || !stored.data || !validDraftRecord(stored.data, identity)) {
        invalidRecordCount += 1
        continue
      }
      entries.push({ ...entryFor(identity, stored.data), key })
    }

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
