import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { setBusinessMockMode, resetBusinessMockCache } from '@adapters/api/mock/config'
import { resetMockCommandState } from '@adapters/api/mock/command-state'
import { resetMockJourney } from '@adapters/api/mock/journey'
import {
  createAStageSpecialMockController, type AStageMockActor,
} from '@app/a-stage-special-mock-ui'
import { mockR1FormsWorkOrderId, mockR1RepeatWorkOrderId } from '@adapters/api/mock/fixtures'
import type { StoragePort, StorageKey } from '@shared/ports'

const memory = new Map<string, unknown>()
const receipts = new Map<string, unknown>()
const actor: AStageMockActor = {
  userId: 'synthetic-user', roleId: 'synthetic-role', identity: 'synthetic-user:synthetic-role:local',
}
function storage(): StoragePort {
  return {
    read: async (key: StorageKey) => ({ state: 'succeeded', data: receipts.get(key.key) ?? null }),
    write: async (key: StorageKey, value: unknown) => {
      receipts.set(key.key, value)
      return { state: 'succeeded' }
    },
    remove: async (key: StorageKey) => {
      receipts.delete(key.key)
      return { state: 'succeeded' }
    },
  } as StoragePort
}
beforeEach(() => {
  memory.clear()
  receipts.clear()
  vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev')
  vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'true')
  vi.stubEnv('VITE_XLINK_MOCK', 'true')
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => memory.get(key),
    setStorageSync: (key: string, value: unknown) => { memory.set(key, value) },
    removeStorageSync: (key: string) => { memory.delete(key) },
  })
  resetBusinessMockCache()
  setBusinessMockMode('data')
  resetMockCommandState()
  resetMockJourney()
})
afterEach(() => {
  resetBusinessMockCache()
  resetMockCommandState()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
function controller(kind: 'forms' | 'repeat', getActor = () => actor) {
  return createAStageSpecialMockController({ kind,
    workOrderId: kind === 'forms' ? mockR1FormsWorkOrderId : mockR1RepeatWorkOrderId,
    storage: storage(), getActor })
}

describe('A main-App source-only multi-form/repeat controller', () => {
  it('forms: page saves, edits, soft-deletes and finalizes through real source transaction receipts', async () => {
    const ui = controller('forms')
    expect((await ui.load()).entries).toHaveLength(2)
    const saved = await ui.execute({ kind: 'save', summary: '平屋顶局部渗水', title: '屋面勘察记录' })
    expect(saved.state).toBe('succeeded')
    if (saved.state !== 'succeeded') return
    const newRow = saved.view.entries.find(row => row.editable)!
    expect(newRow.summary).toBe('平屋顶局部渗水')
    expect(saved.view.receiptPending).toBe(false)
    // The actual panel edits the field value without changing the row title.
    expect(await ui.execute({ kind: 'edit', id: newRow.id,
      summary: '平屋顶女儿墙根部裂缝' }))
      .toMatchObject({ state: 'succeeded' })
    resetMockCommandState()
    expect((await ui.load()).entries.find(row => row.id === newRow.id))
      .toMatchObject({ summary: '平屋顶女儿墙根部裂缝' })
    expect(await ui.execute({ kind: 'delete', id: newRow.id })).toMatchObject({ state: 'succeeded' })
    expect((await ui.load()).entries.find(row => row.id === newRow.id))
      .toMatchObject({ state: 'deleted', editable: false })
    expect(await ui.execute({ kind: 'finish' })).toMatchObject({ state: 'succeeded', view: {
      nodeActive: false, receiptPending: false,
    } })
  })

  it('repeat: saves two records, edits/removes one, completes scoped live row only', async () => {
    const ui = controller('repeat')
    const first = await ui.execute({ kind: 'save', summary: '屋面初检' })
    expect(first.state).toBe('succeeded')
    if (first.state !== 'succeeded') return
    const firstId = first.view.entries.find(row => row.editable)!.id
    const second = await ui.execute({ kind: 'save', summary: '屋面复检' })
    expect(second.state).toBe('succeeded')
    expect(await ui.execute({ kind: 'edit', id: firstId, summary: '初检修订' }))
      .toMatchObject({ state: 'succeeded' })
    expect(await ui.execute({ kind: 'delete', id: firstId })).toMatchObject({ state: 'succeeded' })
    resetMockCommandState()
    expect((await ui.load()).entries.some(row => row.id === firstId)).toBe(false)
    expect(await ui.execute({ kind: 'finish' })).toMatchObject({ state: 'succeeded', view: {
      nodeActive: false, receiptPending: false,
    } })
  })

  it('does not dispatch after actor/role change or replay uncertain receipt', async () => {
    let current = actor
    const ui = controller('forms', () => current)
    current = { ...actor, roleId: 'different-role' }
    expect((await ui.execute({ kind: 'save', summary: '越权' })).state).toBe('blocked')
    current = actor
    expect(await ui.execute({ kind: 'save', summary: '合法创建' })).toMatchObject({ state: 'succeeded' })
    // Corrupt local transaction record is not a permission to reset/replay it.
    const [key] = [...receipts.keys()]
    expect(key).toBeUndefined()
    receipts.set('fake', { arbitrary: 'untrusted' })
    expect((await ui.load()).receiptPending).toBe(false)
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect((await ui.execute({ kind: 'save', summary: '环境已关闭' })).state).toBe('blocked')
  })
})
