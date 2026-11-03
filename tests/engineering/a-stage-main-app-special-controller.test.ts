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
    listKeys: async (scope: { readonly prefix?: string }) => ({
      state: 'succeeded', data: [...receipts.keys()].filter(key =>
        !scope.prefix || key.startsWith(scope.prefix)),
    }),
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
  it.each(['forms', 'repeat'] as const)('%s resolves business IDs, rejects forged IDs and revokes stale identity', async kind => {
    vi.stubEnv('VITE_XLINK_R1_BUSINESS_FIELDS', 'true')
    let current = actor
    const ui = controller(kind, () => current)
    expect((await ui.load()).definition.fields?.find(field => field.valueKey === 'serviceGoods')?.options)
      .toEqual([{ value: 'mock-service-package-roof', label: '屋面防水维修' }, { value: 'mock-service-package-wall', label: '外墙防水维修' }])
    expect(await ui.execute({ kind: 'save', fields: { ...fields('业务值'), serviceGoods: ['forged-id'] } })).toMatchObject({ state: 'blocked' })
    expect(await ui.execute({ kind: 'save', fields: { ...fields('业务值'), serviceGoods: ['mock-service-package-roof'] } })).toMatchObject({ state: 'succeeded' })
    current = { ...actor, identity: 'changed-role-version' }
    await expect(ui.load()).rejects.toThrow()
    expect(await ui.execute({ kind: 'save', fields: fields('旧身份') })).toMatchObject({ state: 'blocked' })
  })

  it('persists incomplete drafts per role/node/FormDef/record and never auto-submits on reconnect', async () => {
    vi.stubEnv('VITE_XLINK_R1_STAGE2B_FIELDS', 'true')
    let online = false
    const network = { current: async () => online ? 'online' as const : 'offline' as const,
      subscribe: () => () => undefined }
    const ui = createAStageSpecialMockController({ kind: 'forms', workOrderId: mockR1FormsWorkOrderId,
      getActor: () => actor, storage: storage(), network })
    await ui.writeDraft(mockSyntheticDynamicFormDefinitionId, { inspectionSummary: '离线草稿', inspectionPointCount: '-' })
    await ui.writeDraft(mockR1NoteFormDefinitionId, { note: '独立备注' })
    await ui.writeDraft(mockSyntheticDynamicFormDefinitionId, fields('独立记录编辑'), 'saved-record')
    expect(await controller('forms').readDraft(mockSyntheticDynamicFormDefinitionId)).toMatchObject({ inspectionPointCount: '-' })
    expect(await controller('forms').readDraft(mockR1NoteFormDefinitionId)).toEqual({ note: '独立备注' })
    expect(await controller('forms').readDraft(mockSyntheticDynamicFormDefinitionId, 'saved-record')).toEqual(fields('独立记录编辑'))
    expect(await controller('repeat').readDraft(mockSyntheticDynamicFormDefinitionId)).toBeNull()
    expect(await ui.execute({ kind: 'save', fields: fields('只允许主动提交') })).toMatchObject({ state: 'blocked' })
    expect((await ui.load()).receiptPending).toBe(false)
    online = true
    expect((await ui.load()).entries.filter(row => row.editable)).toHaveLength(0)
    expect(await ui.readDraft(mockSyntheticDynamicFormDefinitionId)).not.toBeNull()
    expect(await ui.execute({ kind: 'save', fields: fields('只允许主动提交') })).toMatchObject({ state: 'succeeded' })
    await ui.removeDraft(mockSyntheticDynamicFormDefinitionId)
    expect(await ui.readDraft(mockSyntheticDynamicFormDefinitionId)).toBeNull()
    expect(await ui.readDraft(mockR1NoteFormDefinitionId)).toEqual({ note: '独立备注' })
    let current = actor
    const revoked = controller('forms', () => current)
    current = { ...actor, identity: 'revoked' }
    await expect(revoked.readDraft(mockR1NoteFormDefinitionId)).rejects.toThrow()
  })

  it.each(['forms', 'repeat'] as const)('%s saves, reloads and clears temporal/rating fields through the real Mock protocol', async kind => {
    vi.stubEnv('VITE_XLINK_R1_STAGE2D_FIELDS', 'true')
    const ui = controller(kind)
    const input = { ...fields('时间与评分'), inspectionDate: '2026-11-03',
      inspectionTime: '09:30', inspectionDateTime: '2026-11-03 09:30:15', inspectionRating: 4 }
    for (const invalid of [{ inspectionDate: '2026-02-30' }, { inspectionTime: '25:00' },
      { inspectionDateTime: '2026-11-03T09:30:15Z' }, { inspectionRating: 6 }]) {
      expect(await ui.execute({ kind: 'save', fields: { ...input, ...invalid } })).toMatchObject({ state: 'blocked' })
    }
    expect((await ui.load()).entries.filter(row => row.editable)).toHaveLength(0)
    const saved = await ui.execute({ kind: 'save', fields: input })
    expect(saved.state).toBe('succeeded')
    if (saved.state !== 'succeeded') return
    const id = saved.view.entries.find(row => row.editable)!.id
    resetMockCommandState()
    expect((await controller(kind).load()).entries.find(row => row.id === id)?.values).toEqual(input)
    expect(await ui.execute({ kind: 'edit', id, fields: fields('已清空可选值') })).toMatchObject({ state: 'succeeded' })
    resetMockCommandState()
    expect((await controller(kind).load()).entries.find(row => row.id === id)?.values).toEqual(fields('已清空可选值'))
  })

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
      fields: fields('已清空可选备注', 'follow_up') })).state).toBe('succeeded')
    expect((await ui.load()).entries.find(row => row.id === created.id)?.values)
      .toEqual(fields('已清空可选备注', 'follow_up'))
    const updated = await ui.execute({ kind: 'edit', id: created.id,
      fields: fields('多字段更新现场', 'follow_up', '需客户补签') })
    expect(updated.state).toBe('succeeded')
    expect((await ui.load()).entries.find(row => row.id === created.id)?.values)
      .toEqual(fields('多字段更新现场', 'follow_up', '需客户补签'))
  })

  it('optional clear requires an authoritative missing-key readback and records only field names in receipt', async () => {
    const transport = await import('@adapters/api/mock/router')
    const actual = transport.tryMockRead
    const ui = controller('forms')
    const saved = await ui.execute({ kind: 'save', fields: fields('准备清空现场备注', 'safe', '原备注') })
    expect(saved.state).toBe('succeeded')
    if (saved.state !== 'succeeded') return
    const id = saved.view.entries.find(row => row.editable)!.id
    let injectStale = true
    vi.spyOn(transport, 'tryMockRead').mockImplementation(async (...args) => {
      const response = await actual(...args)
      if (injectStale && args[0].startsWith('biz/extForm/query/')
        && args[1]?.['is:_id|string#and'] === id) {
        const raw = response as { data?: Record<string, unknown>[] }
        if (raw.data?.[0] && !Object.hasOwn(raw.data[0], 'inspectionNote')) {
          return { ...raw, data: [{ ...raw.data[0], inspectionNote: '过期回读值' }] }
        }
      }
      return response
    })
    expect((await ui.execute({ kind: 'edit', id,
      fields: fields('修改并清空现场备注', 'safe') })).state).toBe('uncertain')
    const pending = await ui.load()
    expect(pending).toMatchObject({ receiptPending: true, pendingRecoverable: true })
    // The UI projects source exts, but receipt verification still catches a
    // stale top-level FormData key and refuses to release the replay fence.
    expect((pending.entries.find(row => row.id === id)?.values as Record<string, unknown>).inspectionNote)
      .toBeUndefined()
    const stored = [...receipts.values()].find(value => (value as { clearedFieldKeys?: unknown })?.clearedFieldKeys)
    expect(stored).toMatchObject({ clearedFieldKeys: ['inspectionNote'] })
    expect(JSON.stringify(stored)).not.toContain('原备注')
    expect((await ui.execute({ kind: 'save', fields: fields('绝不重复提交') })).state).toBe('blocked')
    injectStale = false
    expect(await ui.recoverCompleted(fields('修改并清空现场备注', 'safe')))
      .toMatchObject({ state: 'succeeded', view: { receiptPending: false } })
    expect((await ui.load()).entries.find(row => row.id === id)?.values)
      .toEqual(fields('修改并清空现场备注', 'safe'))
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


describe('A special Mock cross-editor revision and transaction boundary', () => {
  it.each(['forms', 'repeat'] as const)('%s rejects a stale edit from another editor, including a cold read', async kind => {
    const editorA = controller(kind)
    const editorB = controller(kind)
    const created = await editorA.execute({ kind: 'save', fields: fields('初始记录') })
    expect(created.state).toBe('succeeded')
    if (created.state !== 'succeeded') return
    const saved = created.view.entries.find(row => row.editable)!
    expect(typeof saved.revision).toBe('string')
    const oldVersion = (await editorB.load()).entries.find(row => row.id === saved.id)!.revision!
    const first = await editorA.execute({
      kind: 'edit', id: saved.id, expectedRevision: saved.revision, fields: fields('编辑器 A 修改'),
    })
    expect(first.state).toBe('succeeded')
    const stale = await editorB.execute({
      kind: 'edit', id: saved.id, expectedRevision: oldVersion, fields: fields('编辑器 B 旧版本'),
    })
    expect(stale).toMatchObject({ state: 'blocked' })
    resetMockCommandState()
    const persisted = (await controller(kind).load()).entries.find(row => row.id === saved.id)!
    expect(persisted.values.inspectionSummary).toBe('编辑器 A 修改')
    expect(persisted.revision).not.toBe(oldVersion)
  })

  it('serializes concurrent same-record writes and blocks one stale submission', async () => {
    const created = await controller('forms').execute({ kind: 'save', fields: fields('创建') })
    expect(created.state).toBe('succeeded')
    if (created.state !== 'succeeded') return
    const row = created.view.entries.find(item => item.editable)!
    const results = await Promise.all([
      controller('forms').execute({ kind: 'edit', id: row.id,
        expectedRevision: row.revision, fields: fields('第一版') }),
      controller('forms').execute({ kind: 'edit', id: row.id,
        expectedRevision: row.revision, fields: fields('第二版') }),
    ])
    expect(results.map(item => item.state).sort()).toEqual(['blocked', 'succeeded'])
  })

  it('fails closed on media-sized storage quota rejection without exposing a successful record', async () => {
    const original = (globalThis as unknown as { uni: { getStorageSync: (key: string) => unknown } }).uni
    vi.stubGlobal('uni', {
      ...original,
      setStorageSync: (key: string, value: unknown) => {
        if (key === 'xlink.dev.mock.r1-special.020-021.v1') throw new Error('QuotaExceededError')
        memory.set(key, value)
      },
    })
    const result = await controller('repeat').execute({ kind: 'save', fields: fields('写入容量不足') })
    expect(result.state).not.toBe('succeeded')
    expect(memory.has('xlink.dev.mock.r1-special.020-021.v1')).toBe(false)
  })
})


describe('source-backed R1 generic file field in special forms and repeat', () => {
  it.each(['forms', 'repeat'] as const)('%s queues, uploads, commits, rereads and finalizes generic file values', async kind => {
    vi.stubEnv('VITE_XLINK_R1_SPECIAL_MEDIA', 'true')
    const { createMediaUploadQueue, createMediaQueueRepository, InMemoryDurableMediaStore } =
      await import('@runtimes/media')
    const { asOpaqueId, createCapabilityResult } = await import('@shared/types')
    const refs = { count: 0 }
    const picker = { pick: async () => createCapabilityResult('media_file_picker', 'granted', [{
      ref: asOpaqueId<'LocalMediaRef'>(`source-r1-file-${++refs.count}`),
      mimeType: 'image/jpeg', name: '现场记录.jpg', source: 'library' as const,
    }]) }
    const queue = createMediaUploadQueue(new InMemoryDurableMediaStore(),
      createMediaQueueRepository(storage()), {
        upload: async () => ({ state: 'succeeded' as const,
          data: { url: 'https://mock-upload.invalid/special/file.jpg',
            key: 'special/file.jpg', extension: 'jpg', fileName: '现场记录.jpg',
            source: 'library' as const, uploadState: 'uploaded' as const } }),
      })
    const ui = createAStageSpecialMockController({
      kind, workOrderId: kind === 'forms' ? mockR1FormsWorkOrderId : mockR1RepeatWorkOrderId,
      getActor: () => actor, storage: storage(), mediaQueue: queue, mediaPicker: picker,
    })
    const def = (await ui.load()).definition
    const field = def.fields?.find(field => field.valueKey === 'inspectionFiles')!
    expect(field.type).toBe('file')
    expect(def.fields?.find(field => field.valueKey === 'inspectionPhoto')?.presentationOnly).toBe(true)
    expect(await ui.execute({ kind: 'save', fields: {
      ...fields('伪造上传'), inspectionFiles: [{
        url: 'https://example.invalid/forged.jpg', name: 'forged.jpg', extname: 'jpg',
      }],
    } })).toMatchObject({ state: 'blocked' })
    expect(await ui.pickMedia(mockSyntheticDynamicFormDefinitionId, field.fieldId)).toMatchObject({ state: 'succeeded' })
    const uploaded = (await ui.listMediaTasks(mockSyntheticDynamicFormDefinitionId))[0]!
    expect(uploaded.state).toBe('uploaded')
    const { r1FileWireFromUpload } = await import('@shared/types')
    const file = r1FileWireFromUpload(uploaded.uploadedRef!)!
    expect(file).toEqual({ url: 'https://mock-upload.invalid/special/file.jpg',
      name: 'special/file.jpg', extname: 'jpg' })
    const input = { ...fields('含附件'), inspectionFiles: [file] }
    const saved = await ui.execute({ kind: 'save', fields: input })
    expect(saved.state).toBe('succeeded')
    if (saved.state !== 'succeeded') return
    const id = saved.view.entries.find(row => row.editable)!.id
    resetMockCommandState()
    const roundtrip = await ui.load()
    expect(roundtrip.entries.find(row => row.id === id)?.values.inspectionFiles).toEqual([file])
    expect(await ui.finalizeMedia(mockSyntheticDynamicFormDefinitionId)).toBe(true)
    expect(await ui.listMediaTasks(mockSyntheticDynamicFormDefinitionId)).toHaveLength(0)
    expect(await ui.execute({ kind: 'edit', id, fields: fields('清除附件') })).toMatchObject({ state: 'succeeded' })
    expect((await ui.load()).entries.find(row => row.id === id)?.values.inspectionFiles).toBeUndefined()
  })

  it('keeps upload failure out of submitted FormData and retries only explicitly', async () => {
    vi.stubEnv('VITE_XLINK_R1_SPECIAL_MEDIA', 'true')
    const { createMediaUploadQueue, createMediaQueueRepository, InMemoryDurableMediaStore } =
      await import('@runtimes/media')
    const { asOpaqueId, createOperationError, createCapabilityResult } = await import('@shared/types')
    let attempts = 0
    const queue = createMediaUploadQueue(new InMemoryDurableMediaStore(),
      createMediaQueueRepository(storage()), {
        upload: async () => ++attempts === 1
          ? { state: 'failed_retryable' as const,
              error: createOperationError('network_retryable', 'synthetic upload unavailable') }
          : { state: 'succeeded' as const,
              data: { url: 'https://mock-upload.invalid/retry.jpg', key: 'retry.jpg',
                extension: 'jpg', source: 'library' as const, uploadState: 'uploaded' as const } },
      })
    const ui = createAStageSpecialMockController({
      kind: 'forms', workOrderId: mockR1FormsWorkOrderId,
      getActor: () => actor, storage: storage(), mediaQueue: queue,
      mediaPicker: { pick: async () => createCapabilityResult('media_file_picker', 'granted',
        [{ ref: asOpaqueId<'LocalMediaRef'>('synthetic-retry-asset'),
          mimeType: 'image/jpeg', source: 'library' as const, name: 'retry.jpg' }]) },
    })
    const id = (await ui.load()).definition.fields!.find(field => field.valueKey === 'inspectionFiles')!.fieldId
    expect((await ui.pickMedia(mockSyntheticDynamicFormDefinitionId, id)).state).toBe('failed')
    const task = (await ui.listMediaTasks(mockSyntheticDynamicFormDefinitionId))[0]!
    expect(task.state).toBe('failed_retryable')
    expect(await ui.execute({ kind: 'save', fields: fields('没有附件随附') })).toMatchObject({ state: 'blocked' })
    expect(await ui.retryMedia(mockSyntheticDynamicFormDefinitionId, task.taskId)).toBe(true)
    const completed = (await ui.listMediaTasks(mockSyntheticDynamicFormDefinitionId))[0]!
    const { r1FileWireFromUpload } = await import('@shared/types')
    expect(await ui.execute({ kind: 'save',
      fields: { ...fields('重试完成'), inspectionFiles: [r1FileWireFromUpload(completed.uploadedRef!)!] } }))
      .toMatchObject({ state: 'succeeded' })
  })
})
