import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { setBusinessMockMode, resetBusinessMockCache } from '@adapters/api/mock/config'
import { resetMockCommandState } from '@adapters/api/mock/command-state'
import { resetMockJourney } from '@adapters/api/mock/journey'
import * as r1SpecialTransport from '@adapters/api/mock/r1-special-protocol'
import {
  createAStageSpecialMockController, type AStageMockActor,
} from '@app/a-stage-special-mock-ui'
import { mockR1FormsWorkOrderId, mockR1RepeatWorkOrderId,
  mockSyntheticDynamicFormDefinitionId, mockR1NoteFormDefinitionId } from '@adapters/api/mock/fixtures'
import type { StoragePort, StorageKey } from '@shared/ports'

const memory = new Map<string, unknown>()
const receipts = new Map<string, unknown>()
const actor: AStageMockActor = {
  userId: 'synthetic-user', roleId: 'synthetic-role', identity: 'synthetic-user:synthetic-role:local',
}
const fields = (summary: string, result = 'follow_up', note?: string) => ({
  inspectionSummary: summary, inspectionResult: result,
  ...(note ? { inspectionNote: note } : {}),
})
const stage2bFields = (summary: string) => ({ ...fields(summary, 'safe'),
  inspectionContactPhone: '0013800100200',
  inspectionIdentityNumber: '000100200300400500',
  inspectionPointCount: '12', inspectionMeasuredArea: '12.50',
  inspectionConfirmed: '0', inspectionCategory: 'roof',
})
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
  vi.restoreAllMocks()
})
function controller(kind: 'forms' | 'repeat', getActor = () => actor,
  port: StoragePort = storage()) {
  return createAStageSpecialMockController({ kind,
    workOrderId: kind === 'forms' ? mockR1FormsWorkOrderId : mockR1RepeatWorkOrderId,
    storage: port, getActor })
}

describe('A main-App source-only multi-form/repeat controller', () => {
  it('020 resolves AddFormCode and independently saves, edits, deletes and finalizes a second FormDef', async () => {
    const ui = controller('forms')
    const first = await ui.load()
    expect(first.definitions.map(item => [item.id, item.label])).toEqual([
      [mockSyntheticDynamicFormDefinitionId, '现场记录'],
      [mockR1NoteFormDefinitionId, '服务备注'],
    ])
    expect(first.entries.find(item => item.formDefinitionId === mockR1NoteFormDefinitionId))
      .toMatchObject({ editable: false, title: '客户沟通记录' })
    expect(await ui.execute({ kind: 'save', formDefinitionId: mockR1NoteFormDefinitionId,
      fields: { inspectionSummary: 'cross-def injection' } })).toMatchObject({ state: 'blocked' })
    const saved = await ui.execute({ kind: 'save', formDefinitionId: mockR1NoteFormDefinitionId,
      fields: { note: '预约后已与业主确认进场' }, title: '电话沟通记录' })
    expect(saved.state).toBe('succeeded')
    if (saved.state !== 'succeeded') return
    const newRow = saved.view.entries.find(row => row.editable)!
    expect(newRow).toMatchObject({ formDefinitionId: mockR1NoteFormDefinitionId,
      title: '电话沟通记录', values: { note: '预约后已与业主确认进场' } })
    expect(await ui.execute({ kind: 'edit', id: newRow.id,
      formDefinitionId: mockSyntheticDynamicFormDefinitionId,
      fields: { note: 'attempt to switch definition' } })).toMatchObject({ state: 'blocked' })
    expect(await ui.execute({ kind: 'edit', id: newRow.id,
      formDefinitionId: mockR1NoteFormDefinitionId,
      fields: { note: '维修方案已电话解释' } })).toMatchObject({ state: 'succeeded' })
    resetMockCommandState()
    expect((await controller('forms').load()).entries.find(row => row.id === newRow.id))
      .toMatchObject({ formDefinitionId: mockR1NoteFormDefinitionId,
        values: { note: '维修方案已电话解释' } })
    expect(await ui.execute({ kind: 'delete', id: newRow.id }))
      .toMatchObject({ state: 'succeeded' })
    expect((await ui.load()).entries.find(row => row.id === newRow.id)?.state).toBe('deleted')
    expect(await ui.execute({ kind: 'finish' })).toMatchObject({
      state: 'succeeded', view: { nodeActive: false, receiptPending: false },
    })
  })

  it('020 sibling FormDef remains blocked while another definition has a pending receipt', async () => {
    const underlying = storage()
    const port: StoragePort = { ...underlying,
      remove: async () => ({ state: 'failed_terminal' }),
    } as StoragePort
    const ui = controller('forms', () => actor, port)
    const incomplete = await ui.execute({ kind: 'save', formDefinitionId: mockR1NoteFormDefinitionId,
      fields: { note: '待核对的电话记录' } })
    expect(incomplete.state).toBe('uncertain')
    expect(await ui.load()).toMatchObject({ receiptPending: true,
      pendingFormDefinitionId: mockR1NoteFormDefinitionId })
    expect(await ui.execute({ kind: 'save', formDefinitionId: mockSyntheticDynamicFormDefinitionId,
      fields: fields('不得绕过不同 FormDef 的回执锁') })).toMatchObject({ state: 'blocked' })
  })

  it('Stage 2B 020/021 source-field variant saves, edits and independently reads numeric/string/switch/select values', async () => {
    vi.stubEnv('VITE_XLINK_R1_STAGE2B_FIELDS', 'true')
    const forms = controller('forms')
    expect((await forms.load()).definition.fields).toHaveLength(10)
    const saved = await forms.execute({ kind: 'save', fields: stage2bFields('020 完整表单') })
    expect(saved.state).toBe('succeeded')
    if (saved.state !== 'succeeded') return
    const created = saved.view.entries.find(row => row.editable)!
    expect(created.values).toMatchObject({ inspectionContactPhone: '0013800100200',
      inspectionIdentityNumber: '000100200300400500',
      inspectionPointCount: 12, inspectionMeasuredArea: 12.5,
      inspectionConfirmed: '0', inspectionCategory: 'roof' })
    expect(await forms.execute({ kind: 'edit', id: created.id, fields: {
      ...stage2bFields('020 二次复核'), inspectionPointCount: '14',
      inspectionMeasuredArea: '14.25', inspectionConfirmed: '1', inspectionCategory: 'wall',
    } })).toMatchObject({ state: 'succeeded' })
    expect((await forms.load()).entries.find(row => row.id === created.id)?.values)
      .toMatchObject({ inspectionPointCount: 14, inspectionMeasuredArea: 14.25,
        inspectionConfirmed: '1', inspectionCategory: 'wall' })

    const repeat = controller('repeat')
    expect(await repeat.execute({ kind: 'save', fields: stage2bFields('021 完整表单') }))
      .toMatchObject({ state: 'succeeded' })
    expect((await repeat.load()).entries.find(row => row.editable)?.values)
      .toMatchObject({ inspectionContactPhone: '0013800100200',
        inspectionPointCount: 12, inspectionMeasuredArea: 12.5, inspectionConfirmed: '0' })
    expect(await repeat.execute({ kind: 'finish' }))
      .toMatchObject({ state: 'succeeded', view: { nodeActive: false, receiptPending: false } })
  })

  it('Stage 2B completed receipt recovery requires the original full typed payload', async () => {
    vi.stubEnv('VITE_XLINK_R1_STAGE2B_FIELDS', 'true')
    const underlying = storage()
    let failRemoval = true
    const port: StoragePort = { ...underlying,
      remove: async (key: StorageKey) => failRemoval
        ? { state: 'failed_terminal' } : underlying.remove(key),
    } as StoragePort
    const original = stage2bFields('现场回执原文')
    expect((await controller('forms', () => actor, port).execute({ kind: 'save', fields: original })).state)
      .toBe('uncertain')
    resetMockCommandState()
    const reopened = controller('forms', () => actor, port)
    expect(await reopened.load()).toMatchObject({ receiptPending: true, pendingRecoverable: true })
    expect((await reopened.recoverCompleted({ ...original, inspectionMeasuredArea: '12.51' })).state)
      .toBe('uncertain')
    expect((await reopened.recoverCompleted({ ...original, inspectionConfirmed: '1' })).state)
      .toBe('uncertain')
    expect((await reopened.load()).receiptPending).toBe(true)
    failRemoval = false
    expect(await reopened.recoverCompleted(original))
      .toMatchObject({ state: 'succeeded', view: { receiptPending: false } })
  })

  it('Stage 2A reads FormDef, requires a valid conclusion, ignores reference image and round-trips optional notes', async () => {
    const ui = controller('forms')
    const initial = await ui.load()
    expect(initial.definition.fields?.map(field => [field.valueKey, field.type, field.presentationOnly]))
      .toEqual([
        ['inspectionSummary', 'textarea', undefined],
        ['inspectionResult', 'radio', undefined],
        ['inspectionPhoto', 'image', true],
        ['inspectionNote', 'textarea', undefined],
      ])
    expect(await ui.execute({ kind: 'save', fields: { inspectionSummary: '遗漏结论' } }))
      .toMatchObject({ state: 'blocked', message: expect.stringContaining('勘察结论') })
    expect(await ui.execute({ kind: 'save', fields: fields('非法结论', 'forged-option') }))
      .toMatchObject({ state: 'blocked' })
    expect(await ui.execute({ kind: 'save', fields: {
      ...fields('带伪造图片'), inspectionPhoto: 'https://unverified.example/upload.jpg',
    } })).toMatchObject({ state: 'blocked' })
    expect(await ui.execute({ kind: 'save', fields: {
      ...fields('非法额外字段'), unknown: 'not-from-FormDef',
    } })).toMatchObject({ state: 'blocked' })
    expect((await ui.load()).entries.every(row => !row.editable)).toBe(true)

    const saved = await ui.execute({ kind: 'save', fields: fields('多字段原始现场', 'safe', '需客户补签') })
    expect(saved.state).toBe('succeeded')
    if (saved.state !== 'succeeded') return
    const created = saved.view.entries.find(row => row.editable)!
    expect(created.values).toEqual(fields('多字段原始现场', 'safe', '需客户补签'))
    expect((await ui.execute({ kind: 'edit', id: created.id,
      fields: fields('尝试清空原备注', 'follow_up') })).state).toBe('blocked')
    const updated = await ui.execute({ kind: 'edit', id: created.id,
      fields: fields('多字段更新现场', 'follow_up', '需客户补签') })
    expect(updated.state).toBe('succeeded')
    expect((await ui.load()).entries.find(row => row.id === created.id)?.values)
      .toEqual(fields('多字段更新现场', 'follow_up', '需客户补签'))
  })

  it('Stage 2A retains the receipt when a non-summary FormData field disagrees on readback', async () => {
    const transport = await import('@adapters/api/mock/router')
    const actual = transport.tryMockRead
    vi.spyOn(transport, 'tryMockRead').mockImplementation(async (...args) => {
      const result = await actual(...args)
      if (args[0].startsWith('biz/extForm/query/')
        && typeof args[1]?.['is:_id|string#and'] === 'string') {
        const raw = result as { data?: Record<string, unknown>[] }
        if (raw.data?.[0]?.inspectionNote === '必须完整核对') return {
          ...raw, data: [{ ...raw.data[0], inspectionNote: '回读备注不一致' }],
        }
      }
      return result
    })
    const ui = controller('repeat')
    expect((await ui.execute({ kind: 'save', fields: fields('现场完成', 'safe', '必须完整核对') })).state)
      .toBe('uncertain')
    expect(await ui.load()).toMatchObject({ receiptPending: true, pendingRecoverable: true })
    expect((await ui.execute({ kind: 'save', fields: fields('禁止二次提交') })).state).toBe('blocked')
    expect((await ui.recoverCompleted(fields('现场完成', 'safe', '错误的备注'))).state).toBe('uncertain')
  })

  it('Stage 1B forms Save→full EXTS→Process re-reads FormData and workflow before clearing the receipt', async () => {
    const dispatched: string[] = []
    const original = r1SpecialTransport.tryMockR1SpecialCommand
    vi.spyOn(r1SpecialTransport, 'tryMockR1SpecialCommand').mockImplementation(async (...args) => {
      dispatched.push(args[0].path)
      return original(...args)
    })
    const ui = controller('forms')
    expect(await ui.execute({ kind: 'save_finish', fields: fields('Stage1B 屋面完成记录') }))
      .toMatchObject({ state: 'succeeded', view: { nodeActive: false, receiptPending: false } })
    expect(dispatched).toEqual([
      `biz/extForm/upsert/${mockSyntheticDynamicFormDefinitionId}`,
      'workflowNode/updateExts/mock-workflow-node-020-forms',
      'workflow/process',
    ])
    resetMockCommandState()
    const state = await controller('forms').load()
    expect(state.nodeActive).toBe(false)
    expect(state.receiptPending).toBe(false)
    expect(state.entries.some(row => row.summary === 'Stage1B 屋面完成记录')).toBe(true)
    expect((await ui.execute({ kind: 'save_finish', fields: fields('不得重复发送') })).state).toBe('blocked')
    expect(dispatched).toHaveLength(3)
  })

  it('Stage 1B completion retains a durable fence when final FormData readback disagrees', async () => {
    const transport = await import('@adapters/api/mock/router')
    const actual = transport.tryMockRead
    let corrupt = true
    vi.spyOn(transport, 'tryMockRead').mockImplementation(async (...args) => {
      const result = await actual(...args)
      if (corrupt && args[0].startsWith('biz/extForm/query/')
        && typeof args[1]?.['is:_id|string#and'] === 'string') {
        const raw = result as { data?: Record<string, unknown>[] }
        if (raw.data?.[0]?.inspectionSummary === 'Stage1B 原始文本') return {
          ...raw, data: [{ ...raw.data[0], inspectionSummary: '读到不一致的值' }],
        }
      }
      return result
    })
    const ui = controller('forms')
    expect((await ui.execute({ kind: 'save_finish', fields: fields('Stage1B 原始文本') })).state).toBe('uncertain')
    expect(await ui.load()).toMatchObject({ receiptPending: true,
      pendingRecoverable: true, nodeActive: false })
    expect((await ui.execute({ kind: 'save', fields: fields('不得重发') })).state).toBe('blocked')
    expect((await ui.recoverCompleted(fields('错误的现场情况'))).state).toBe('uncertain')
    corrupt = false
    resetMockCommandState()
    expect(await controller('forms').recoverCompleted(fields('Stage1B 原始文本')))
      .toMatchObject({ state: 'succeeded', view: { receiptPending: false } })
  })

  it('Stage 1B rejects a Save→Process shortcut on repeat (repeat uses CSV doProcess)', async () => {
    expect(await controller('repeat').execute({ kind: 'save_finish', fields: fields('不能走 forms 分支') }))
      .toMatchObject({ state: 'blocked' })
    expect((await controller('repeat').load()).entries.every(row => !row.editable)).toBe(true)
  })

  it('forms: page saves, edits, soft-deletes and finalizes through real source transaction receipts', async () => {
    const ui = controller('forms')
    expect((await ui.load()).entries).toHaveLength(2)
    const saved = await ui.execute({ kind: 'save', fields: fields('平屋顶局部渗水'), title: '屋面勘察记录' })
    expect(saved.state).toBe('succeeded')
    if (saved.state !== 'succeeded') return
    const newRow = saved.view.entries.find(row => row.editable)!
    expect(newRow.summary).toBe('平屋顶局部渗水')
    expect(saved.view.receiptPending).toBe(false)
    // The actual panel edits the field value without changing the row title.
    expect(await ui.execute({ kind: 'edit', id: newRow.id,
      fields: fields('平屋顶女儿墙根部裂缝') }))
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
    const first = await ui.execute({ kind: 'save', fields: fields('屋面初检') })
    expect(first.state).toBe('succeeded')
    if (first.state !== 'succeeded') return
    const firstId = first.view.entries.find(row => row.editable)!.id
    const second = await ui.execute({ kind: 'save', fields: fields('屋面复检') })
    expect(second.state).toBe('succeeded')
    expect(await ui.execute({ kind: 'edit', id: firstId, fields: fields('初检修订') }))
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
    expect((await ui.execute({ kind: 'save', fields: fields('越权') })).state).toBe('blocked')
    current = actor
    expect(await ui.execute({ kind: 'save', fields: fields('合法创建') })).toMatchObject({ state: 'succeeded' })
    // Corrupt local transaction record is not a permission to reset/replay it.
    const [key] = [...receipts.keys()]
    expect(key).toBeUndefined()
    receipts.set('fake', { arbitrary: 'untrusted' })
    expect((await ui.load()).receiptPending).toBe(false)
    vi.stubEnv('VITE_XLINK_H5_MOCK_E2E', 'false')
    expect((await ui.execute({ kind: 'save', fields: fields('环境已关闭') })).state).toBe('blocked')
  })

  it('recovers a completed save receipt after restart using only fresh FormData/EXTS reads and exact original text', async () => {
    const source = storage()
    let failRemoval = true
    const port: StoragePort = {
      ...source,
      remove: async (key: StorageKey) => failRemoval
        ? { state: 'failed_terminal' } : source.remove(key),
    } as StoragePort
    const first = controller('forms', () => actor, port)
    expect((await first.execute({ kind: 'save', fields: fields('平屋顶节点原始记录') })).state).toBe('uncertain')
    expect(await first.load()).toMatchObject({ receiptPending: true,
      pendingRecoverable: true, pendingNeedsOriginalFields: true })
    resetMockCommandState() // new page / same durable server+receipt data
    const reopened = controller('forms', () => actor, port)
    expect((await reopened.recoverCompleted(fields('错误的原始内容'))).state).toBe('uncertain')
    expect((await reopened.load()).receiptPending).toBe(true)
    failRemoval = false
    expect(await reopened.recoverCompleted(fields('平屋顶节点原始记录')))
      .toMatchObject({ state: 'succeeded', view: { receiptPending: false } })
    expect((await reopened.load()).entries.some(item => item.summary === '平屋顶节点原始记录')).toBe(true)
  })

  it('keeps a lost ACK replay fence after mutation, even when the Mock already applied FormData', async () => {
    const actual = r1SpecialTransport.tryMockR1SpecialCommand
    vi.spyOn(r1SpecialTransport, 'tryMockR1SpecialCommand').mockImplementation(async (...args) => {
      const result = await actual(...args)
      if (args[0].path.startsWith('biz/extForm/upsert/')) throw new Error('simulated lost ACK')
      return result
    })
    const ui = controller('forms')
    expect((await ui.execute({ kind: 'save', fields: fields('提交回执丢失') })).state).toBe('uncertain')
    expect(await ui.load()).toMatchObject({ receiptPending: true, pendingRecoverable: false })
    expect((await ui.recoverCompleted(fields('提交回执丢失'))).state).toBe('uncertain')
    expect((await ui.execute({ kind: 'save', fields: fields('不得重发') })).state).toBe('blocked')
    expect((await controller('forms').load()).receiptPending).toBe(true)
  })

  it('prevents concurrent save taps while the first request waits for the durable receipt', async () => {
    const source = storage()
    let resume!: () => void
    const barrier = new Promise<void>(resolve => { resume = resolve })
    let firstRead = true
    const port: StoragePort = {
      ...source,
      read: async (key: StorageKey) => {
        if (firstRead) { firstRead = false; await barrier }
        return source.read(key)
      },
    } as StoragePort
    const ui = controller('repeat', () => actor, port)
    const first = ui.execute({ kind: 'save', fields: fields('同一按钮首次点击') })
    expect((await ui.execute({ kind: 'save', fields: fields('重复点击') })).state).toBe('blocked')
    resume()
    expect((await first).state).toBe('succeeded')
    expect((await ui.load()).entries.filter(row => row.editable)).toHaveLength(1)
  })
})
