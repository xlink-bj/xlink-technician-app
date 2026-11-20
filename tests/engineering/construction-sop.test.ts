import { describe, expect, it } from 'vitest'
import { createConstructionSopAdapter } from '@adapters/api/mock/construction-sop'
import type { ConstructionSopFault, ConstructionSopOperation } from '@shared/construction-sop-mock-contract'
import type { StoragePort } from '@shared/ports'

function fixture() {
  let raw: unknown = null
  let current = true
  let writeCount = 0
  let revokeOnRead = false
  const faults = new Map<ConstructionSopOperation, ConstructionSopFault>()
  const storage: StoragePort = {
    async read<T>() {
      if (revokeOnRead) current = false
      return { state: 'succeeded', data: structuredClone(raw) as T | null }
    },
    async write(_key, value) {
      writeCount++
      raw = structuredClone(value)
      return { state: 'succeeded', data: undefined }
    },
    async remove() { throw new Error('unreachable') },
    async listKeys() { throw new Error('unreachable') },
  }
  function open() {
    return createConstructionSopAdapter({
      storage, userId: 'synthetic-user', isCurrent: () => current,
      takeFault(operation) {
        const fault = faults.get(operation)
        faults.delete(operation)
        return fault
      },
    })
  }
  return {
    open, writes: () => writeCount,
    fault(operation: ConstructionSopOperation, value: ConstructionSopFault) { faults.set(operation, value) },
    revokeOnNextRead() { revokeOnRead = true },
    overwrite(value: unknown) { raw = value },
  }
}

const application = { location: '屋面排水口', description: '复查排水口收口。' } as const

describe('isolated construction commands and original receipts', () => {
  it('rejects before create, then reopens exactly one cross-linked record after a lost reply', async () => {
    const f = fixture()
    const port = f.open()
    f.fault('create', 'reject')
    expect(await port.create(application)).toBe('rejected')
    expect(f.writes()).toBe(0)

    f.fault('create', 'lose-receipt')
    expect(await port.create(application)).toBe('unknown')
    const original = await f.open().read()
    expect(original).toMatchObject({
      state: 'ready',
      data: { created: { requestId: 'REQ-26022', target: {
        constructionId: 'C-26022', serviceId: 'S-26022', projectId: 'E-26022',
      }, task: { state: 0 } } },
    })
    expect(await port.create(application)).toBe('accepted')
    expect(await port.create({ ...application, description: '内容改变。' })).toBe('rejected')
    expect(await f.open().read()).toEqual(original)
    expect(f.writes()).toBe(1)
  })

  it('rejects cross-record and cross-node mutations, then reads the original terminal node', async () => {
    const f = fixture()
    const port = f.open()
    const before = await port.read()
    if (before.state !== 'ready') throw new Error('expected assigned task')
    const { target } = before.data.assigned
    const note = '复核合格。'
    expect(await port.process({ ...target, serviceId: 'S-26022' }, note)).toBe('rejected')
    expect(await port.process({ ...target, workflowNodeId: 'wrong-node' }, note)).toBe('rejected')
    f.fault('process', 'reject')
    expect(await port.process(target, note)).toBe('rejected')
    expect(await port.read()).toEqual(before)
    f.fault('process', 'lose-receipt')
    expect(await port.process(target, note)).toBe('unknown')
    expect(await f.open().read()).toMatchObject({
      state: 'ready', data: { created: null, assigned: { target, task: {
        state: 10, receipt: {
          workflowNodeId: target.workflowNodeId, handleUserId: 'synthetic-user',
          formDataId: target.workflowNodeId + '-form', note,
        },
      } } },
    })
    expect(await port.process(target, note)).toBe('accepted')
    expect(await port.process(target, '覆盖原结论。')).toBe('rejected')
    expect(f.writes()).toBe(1)
  })

  it('denies a stale role after the journal read and rejects malformed persisted identity', async () => {
    const f = fixture()
    const port = f.open()
    f.revokeOnNextRead()
    expect(await port.create(application)).toBe('denied')
    expect(await port.read()).toEqual({ state: 'denied' })
    expect(f.writes()).toBe(0)

    const other = fixture()
    other.overwrite({ version: 1, userId: 'unexpected-owner', assigned: {}, created: null })
    expect(await other.open().read()).toEqual({ state: 'failed' })
    expect(await other.open().create(application)).toBe('unknown')
    expect(other.writes()).toBe(0)
  })
})
