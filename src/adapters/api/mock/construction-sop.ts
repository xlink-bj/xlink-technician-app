import type { StoragePort } from '@shared/ports'
import {
  constructionLocations, sameConstructionSopTarget,
  type ConstructionSopCommandResult, type ConstructionSopFault, type ConstructionSopOperation,
  type ConstructionSopPort, type ConstructionSopRead, type ConstructionSopRecord, type ConstructionSopTarget,
} from '@shared/construction-sop-mock-contract'

const taskName = '现场工序复核' as const
const sopVersion = '防水维修 · V1'
const storageKey = { namespace: 'draft', key: 'construction-sop-offline:v1:synthetic-qa-tenant' } as const

const assignedTarget: ConstructionSopTarget = Object.freeze({
  projectId: 'E-26021', serviceId: 'S-26021', constructionId: 'C-26021',
  workflowId: 'mock-construction-run-26021', workflowNodeId: 'mock-construction-node-26021',
})
const selfCreatedTarget: ConstructionSopTarget = Object.freeze({
  projectId: 'E-26022', serviceId: 'S-26022', constructionId: 'C-26022',
  workflowId: 'mock-construction-run-26022', workflowNodeId: 'mock-construction-node-26022',
})
const initialAssigned: ConstructionSopRecord = Object.freeze({
  requestId: 'REQ-26021', target: assignedTarget, location: '屋面女儿墙根部',
  description: '检查基层、节点收口和接缝连续性。',
  task: Object.freeze({ name: taskName, version: sopVersion, state: 0 }),
})
const textFits = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= 120
const validLocation = (value: unknown): value is ConstructionSopRecord['location'] =>
  constructionLocations.some(location => value === location)

interface LocalJournal extends ConstructionSopRead {
  readonly version: 1
  readonly userId: string
}
interface ConstructionSopDependencies {
  readonly storage: StoragePort
  readonly userId: string
  readonly isCurrent: () => boolean
  readonly takeFault: (operation: ConstructionSopOperation) => ConstructionSopFault | undefined
}

function linkedRecordMatches(
  record: ConstructionSopRecord, target: ConstructionSopTarget, requestId: string, userId: string,
): boolean {
  if (!record || !sameConstructionSopTarget(record.target, target)
    || record.requestId !== requestId || !validLocation(record.location) || !textFits(record.description)
    || record.task?.name !== taskName || record.task.version !== sopVersion) return false
  const receipt = record.task.receipt
  if (record.task.state === 0) return receipt === undefined
  return record.task.state === 10 && !!receipt
    && receipt.workflowNodeId === target.workflowNodeId && receipt.handleUserId === userId
    && receipt.formDataId === target.workflowNodeId + '-form'
    && typeof receipt.completedAt === 'string' && Number.isFinite(Date.parse(receipt.completedAt))
    && textFits(receipt.note)
}

// Serialize local journal transitions across workspace instances in one runtime.
let writing = false

export function createConstructionSopAdapter({
  storage, userId, isCurrent, takeFault,
}: ConstructionSopDependencies): ConstructionSopPort {
  async function readJournal(): Promise<LocalJournal> {
    const result = await storage.read<LocalJournal>(storageKey)
    if (result.state !== 'succeeded') throw new Error('Construction journal unavailable')
    const row = result.data
    if (row === null) return { version: 1, userId, assigned: initialAssigned, created: null }
    if (!row || row.version !== 1 || row.userId !== userId
      || !linkedRecordMatches(row.assigned, assignedTarget, 'REQ-26021', userId)
      || (row.created !== null && !linkedRecordMatches(row.created, selfCreatedTarget, 'REQ-26022', userId))) {
      throw new Error('Construction journal identity mismatch')
    }
    return row
  }

  async function execute(
    operation: 'create' | 'process', update: (current: LocalJournal) => LocalJournal | null,
  ): Promise<ConstructionSopCommandResult> {
    const reserve = async (): Promise<ConstructionSopCommandResult> => {
      if (!isCurrent()) return 'denied'
      if (writing) return 'unknown'
      writing = true
      try {
        const previous = await readJournal()
        if (!isCurrent()) return 'denied'
        const fault = takeFault(operation)
        if (fault === 'reject') return 'rejected'
        const changed = update(previous)
        if (!changed) return 'rejected'
        if (changed !== previous) {
          const committed = await storage.write(storageKey, changed)
          if (committed.state !== 'succeeded') return 'unknown'
        }
        return fault === 'lose-receipt' || !isCurrent() ? 'unknown' : 'accepted'
      } catch {
        return 'unknown'
      } finally {
        writing = false
      }
    }
    // #ifdef H5
    if (typeof navigator !== 'undefined' && navigator.locks) {
      try { return await navigator.locks.request(storageKey.key, reserve) }
      catch { return 'unknown' }
    }
    // #endif
    return reserve()
  }

  return {
    isCurrent,
    async read() {
      if (!isCurrent()) return { state: 'denied' }
      try {
        if (takeFault('read')) return { state: 'failed' }
        const { assigned, created } = await readJournal()
        return isCurrent() ? { state: 'ready', data: { assigned, created } } : { state: 'denied' }
      } catch {
        return { state: 'failed' }
      }
    },
    create({ location, description }) {
      if (!validLocation(location) || !textFits(description)) return Promise.resolve('rejected')
      return execute('create', current => {
        if (current.created) {
          return current.created.location === location && current.created.description === description ? current : null
        }
        return {
          ...current,
          created: {
            requestId: 'REQ-26022', target: selfCreatedTarget, location, description,
            task: { name: taskName, version: sopVersion, state: 0 },
          },
        }
      })
    },
    process(target, note) {
      if (!textFits(note)) return Promise.resolve('rejected')
      return execute('process', current => {
        const entry = sameConstructionSopTarget(target, current.assigned.target) ? 'assigned'
          : current.created && sameConstructionSopTarget(target, current.created.target) ? 'created' : null
        const original = entry ? current[entry] : null
        if (!entry || !original) return null
        if (original.task.state === 10) return original.task.receipt?.note === note ? current : null
        const receipt = {
          workflowNodeId: original.target.workflowNodeId, handleUserId: userId,
          formDataId: original.target.workflowNodeId + '-form', completedAt: new Date().toISOString(), note,
        }
        return { ...current, [entry]: { ...original, task: { ...original.task, state: 10, receipt } } }
      })
    },
  }
}
