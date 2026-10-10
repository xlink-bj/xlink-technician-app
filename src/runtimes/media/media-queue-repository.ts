import type { MediaQueueRepository, MediaTaskLookupScope, StoragePort } from '@shared/ports'
import {
  createOperationError,
  type MediaUploadTask,
  type MediaUploadTaskId,
  type MediaTaskScope,
  type OperationSnapshot,
  asOpaqueId,
} from '@shared/types'

const prefix = 'media-upload-queue:v1:'

function keyFor(taskId: MediaUploadTaskId): string {
  return `${prefix}${encodeURIComponent(String(taskId))}`
}

function taskIdFromKey(key: string): MediaUploadTaskId | undefined {
  if (!key.startsWith(prefix)) return undefined
  const raw = decodeURIComponent(key.slice(prefix.length))
  return raw ? asOpaqueId<'MediaUploadTaskId'>(raw) : undefined
}

function isTask(value: unknown): value is MediaUploadTask {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const scope = candidate.scope
  return candidate.schemaVersion === 1
    && typeof candidate.taskId === 'string'
    && typeof candidate.state === 'string'
    && typeof candidate.attempts === 'number'
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
    && scope !== null
    && typeof scope === 'object'
}

export class SemanticMediaQueueRepository implements MediaQueueRepository {
  constructor(private readonly storage: StoragePort) {}

  async read(taskId: MediaUploadTaskId): Promise<OperationSnapshot<MediaUploadTask | null>> {
    const result = await this.storage.read<unknown>({ namespace: 'cache', key: keyFor(taskId) })
    if (result.state !== 'succeeded') return result as OperationSnapshot<MediaUploadTask | null>
    if (result.data === null) return { state: 'succeeded', data: null }
    if (!isTask(result.data)) {
      return {
        state: 'failed_terminal',
        error: createOperationError('server_terminal', 'Media queue task metadata is malformed'),
      }
    }
    return { state: 'succeeded', data: result.data }
  }

  write(task: MediaUploadTask): Promise<OperationSnapshot<void>> {
    return this.storage.write({ namespace: 'cache', key: keyFor(task.taskId) }, task)
  }

  remove(taskId: MediaUploadTaskId): Promise<OperationSnapshot<void>> {
    return this.storage.remove({ namespace: 'cache', key: keyFor(taskId) })
  }

  async list(
    scope: MediaTaskLookupScope,
  ): Promise<OperationSnapshot<readonly MediaUploadTask[]>> {
    const keys = await this.storage.listKeys({ namespace: 'cache', prefix })
    if (keys.state !== 'succeeded' || !keys.data) return keys as unknown as OperationSnapshot<readonly MediaUploadTask[]>
    const tasks: MediaUploadTask[] = []
    for (const key of keys.data) {
      const taskId = taskIdFromKey(key)
      if (!taskId) continue
      const task = await this.read(taskId)
      if (task.state !== 'succeeded' || !task.data) {
        if (task.state !== 'succeeded') return task as unknown as OperationSnapshot<readonly MediaUploadTask[]>
        continue
      }
      const taskScope = task.data.scope
      const baseMatches = String(taskScope.userId) === String(scope.userId)
        && String(taskScope.workOrderId) === String(scope.workOrderId)
        && String(taskScope.workflowNodeId) === String(scope.workflowNodeId)
      if (!baseMatches) continue

      if (scope.formDefinitionId === undefined
        ? taskScope.formDefinitionId !== undefined
        : String(taskScope.formDefinitionId) !== String(scope.formDefinitionId)) continue
      if (scope.fieldId !== undefined && taskScope.fieldId !== scope.fieldId) continue
      if (scope.valueKey !== undefined && taskScope.valueKey !== scope.valueKey) continue

      // A task created before the first form save has no formDataId and may
      // be adopted by that first save. A task tied to a prior saved record
      // must never be restored into a form with no current record identity.
      if (scope.formDataId === undefined) {
        if (taskScope.formDataId !== undefined) continue
      } else if (taskScope.formDataId !== undefined
        && String(taskScope.formDataId) !== String(scope.formDataId)) continue

      tasks.push(task.data)
    }
    return { state: 'succeeded', data: tasks.sort((left, right) => left.createdAt.localeCompare(right.createdAt)) }
  }
}

export function createMediaQueueRepository(storage: StoragePort): MediaQueueRepository {
  return new SemanticMediaQueueRepository(storage)
}
