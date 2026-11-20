import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existingRecordFixture } from '../support/r1-existing-record-edit-fixture'
import { installLocalFixtureBrowser } from './local-fixture-lock-test-support'

const definitionId = '7971040108398070730'
const initialPart = ['3', '31']
const correctedPart = ['3', '32']
const partFieldId = 'survey-part-field'
const attachment = { url: 'https://example.invalid/existing.jpg', name: '原图.jpg', type: 'image', size: 21 }

function partEditFixture() {
  const h = existingRecordFixture()
  h.scope.formDefinitionId = definitionId
  h.ext._id = definitionId
  h.fields.splice(0, h.fields.length, {
    _id: partFieldId, tenantId: h.scope.tenantId, extId: definitionId, state: 1, name: 'part',
    nameDisp: '维修部位', type: 'cascade', preset: 1, required: '1', multiple: false,
    colName: 'survey', operationType: '1', showList: ['4'], showType: '1', frontEndConfig: '{}', valueOption: 'parts',
  })
  h.node.nodeDef.formDefId = definitionId
  h.node.nodeDef.formFieldIdsFill = [partFieldId]
  h.grant.fieldIds = [partFieldId]
  h.setGrant()
  h.record.part = [...initialPart]
  h.other.part = [...initialPart]
  h.record.leakageCause = ['previous-verified-cause']
  h.record.infraredImageList = [structuredClone(attachment)]
  h.record.exts.images = [{ ...attachment, name: '原附件.jpg' }]
  const next = h.transport.execute.getMockImplementation()!
  h.transport.execute.mockImplementation(async req => {
    if (req.path !== 'i/code/selectMultistageCode.do') return next(req)
    expect(req.body).toEqual({ types: 'parts', tenantId: h.scope.tenantId })
    return [{ type: 'parts', children: [
      { value: '3', name: '窗', children: [
        { value: '31', name: '内侧', children: [] }, { value: '32', name: '外侧', children: [] },
      ] },
      { value: '1', name: '其他', children: [{ value: '11', name: '顶', children: [] }] },
    ] }]
  })
  return h
}

beforeEach(() => installLocalFixtureBrowser())
afterEach(() => vi.unstubAllGlobals())

describe('BF016 existing typed Survey repair-part correction', () => {
  it('edits the exact same record and preserves existing original attachment references and causes after precise reread', async () => {
    const h = partEditFixture(), snapshot = await h.load()
    const prior = structuredClone(h.record), other = structuredClone(h.other)
    const actions = h.provider().forSnapshot(snapshot)
    expect(actions?.canEdit?.(h.record._id)).toBe(true)
    expect(actions?.canCreate?.()).toBe(false)
    expect(actions?.canComplete?.()).toBe(false)
    expect(actions!.initialValues!(h.record._id)).toEqual({ part: initialPart })
    expect(actions!.projectFields?.({ part: initialPart }, h.record._id)).toEqual([
      expect.objectContaining({ fieldId: partFieldId, type: 'cascade', supported: true, readOnly: false }),
    ])
    const draft = actions!.updateEditDraft!(h.record._id, { part: initialPart }, 'part', correctedPart)
    expect(draft.part).toEqual(correctedPart)
    expect(Object.isFrozen(draft.part)).toBe(true)
    expect(actions!.validateDraft!(draft, h.record._id)).toBe(true)
    const saved = await actions!.saveOnly(draft, h.record._id)
    expect(saved.records.find(r => r.id === h.record._id)?.values?.part).toEqual(correctedPart)
    expect(saved.records.map(r => r.id)).toEqual([prior._id, other._id])
    expect(h.writes).toHaveLength(1)
    const outbound = JSON.parse(h.writes[0].body.dataStr)
    expect(outbound).toEqual({ ...prior, part: correctedPart })
    expect(h.record).toEqual({ ...prior, part: correctedPart })
    expect(h.other).toEqual(other)
    expect(h.events.filter(path => /process|updateExts|upload/.test(path))).toEqual([])
    expect((await h.load()).records.find(r => r.id === prior._id)?.values?.part).toEqual(correctedPart)
  })

  it.each([[['3']], [['3', 'stale']], [['1', '11']], [['3', '32', 'extra']], [[]], ['3,32']])(
    'rejects malformed or out-of-scope paths without dispatch: %j', async part => {
      const h = partEditFixture(), edit = h.provider().forSnapshot(await h.load())!
      expect(edit.canEdit!(h.record._id)).toBe(true)
      await expect(edit.saveOnly({ part }, h.record._id)).rejects.toThrow()
      await expect(edit.saveOnly({ part: correctedPart }, h.other._id)).rejects.toThrow()
      expect(h.writes).toEqual([])
    },
  )

  it('rejects UI transitions for another record or branch, and does not save an unchanged path', async () => {
    const h = partEditFixture(), edit = h.provider().forSnapshot(await h.load())!
    const before = structuredClone(h.record), original = { part: [...initialPart] }
    expect(edit.validateDraft!(original, h.record._id)).toBe(false)
    expect(() => edit.updateEditDraft!(h.other._id, original, 'part', correctedPart)).toThrow()
    expect(() => edit.updateEditDraft!(h.record._id, original, 'part', ['1', '11'])).toThrow()
    expect(() => edit.updateEditDraft!(h.record._id, original, 'leakageCause', [])).toThrow()
    const changed = edit.updateEditDraft!(h.record._id, original, 'part', correctedPart)
    const reverted = edit.updateEditDraft!(h.record._id, changed, 'part', initialPart)
    expect(reverted).toEqual(original)
    expect(edit.validateDraft!(reverted, h.record._id)).toBe(false)
    await expect(edit.saveOnly(reverted, h.record._id)).rejects.toThrow('请选择不同的维修部位后保存。')
    expect(h.record).toEqual(before)
    expect(h.writes).toEqual([])
  })

  it('restores an unsaved part draft on a same-record reread and can revert before any write', async () => {
    const h = partEditFixture(), id = h.record._id, provider = h.provider()
    const first = provider.forSnapshot(await h.load())!
    expect(first.beginEdit!(id)).toBe(true)
    const changed = first.updateEditDraft!(id, { part: initialPart }, 'part', correctedPart)
    first.recordFieldSelection!(id, 'part', correctedPart, changed)
    expect(first.validateDraft!(changed, id)).toBe(true)
    const restored = provider.forSnapshot(await h.load())!
    expect(restored.validateDraft!(changed, id)).toBe(true)
    const reverted = restored.updateEditDraft!(id, changed, 'part', initialPart)
    expect(() => restored.recordFieldSelection!(id, 'part', initialPart, reverted)).not.toThrow()
    expect(restored.validateDraft!(reverted, id)).toBe(false)
    expect(() => restored.recordFieldSelection!(h.other._id, 'part', initialPart, reverted)).toThrow()
    await expect(restored.saveOnly(reverted, id)).rejects.toThrow()
    expect(h.writes).toEqual([])
  })

  it('rejects a changed original before write, including when the old page still holds the original record ID', async () => {
    const h = partEditFixture(), edit = h.provider().forSnapshot(await h.load())!
    h.record.infraredImageList[0].name = '另一设备修改.jpg'
    await expect(edit.saveOnly({ part: correctedPart }, h.record._id)).rejects.toThrow()
    expect(h.writes).toEqual([])
  })

  it('cannot revive an editor after a different reader generation', async () => {
    const h = partEditFixture(), edit = h.provider().forSnapshot(await h.load())!
    await h.load()
    expect(edit.canEdit!(h.record._id)).toBe(false)
    expect(() => edit.updateEditDraft!(h.record._id, { part: initialPart }, 'part', correctedPart)).toThrow()
    await expect(edit.saveOnly({ part: correctedPart }, h.record._id)).rejects.toThrow()
    expect(h.writes).toEqual([])
  })

  it.each(['missing', 'conflicting-exts', 'unverified-existing-path'] as const)(
    'keeps %s root evidence read-only without changing the record', async issue => {
      const h = partEditFixture()
      if (issue === 'missing') delete h.record.part
      else if (issue === 'conflicting-exts') h.record.exts.part = correctedPart
      else h.record.part = ['3', 'no-longer-listed']
      const edit = h.provider().forSnapshot(await h.load())
      expect(edit?.canEdit?.(h.record._id)).toBe(false)
      expect(h.writes).toEqual([])
    },
  )

  it('pins the validated path before an asynchronous preflight reread', async () => {
    const h = partEditFixture(), edit = h.provider().forSnapshot(await h.load())!
    let signal!: () => void, release!: () => void
    const started = new Promise<void>(resolve => { signal = resolve })
    const waiting = new Promise<void>(resolve => { release = resolve })
    const read = h.transport.execute.getMockImplementation()!
    h.transport.execute.mockImplementationOnce(async req => {
      signal()
      await waiting
      return read(req)
    })
    const draft = { part: [...correctedPart] }
    const saving = edit.saveOnly(draft, h.record._id)
    await started
    draft.part.splice(0, draft.part.length, '1', '11')
    release()
    expect((await saving).records.find(r => r.id === h.record._id)?.values?.part).toEqual(correctedPart)
    expect(h.writes).toHaveLength(1)
  })

  it.each(['stale-part', 'lost-attachment', 'wrong-record', 'lost-ack'] as const)(
    'locks without resend or Process when post-dispatch evidence is %s', async fault => {
      const h = partEditFixture(), edit = h.provider().forSnapshot(await h.load())!
      const send = h.commands.execute.getMockImplementation()!
      h.commands.execute.mockImplementation(async req => {
        const ack = await send(req)
        if (fault === 'stale-part') h.record.part = [...initialPart]
        else if (fault === 'lost-attachment') h.record.infraredImageList = []
        else if (fault === 'wrong-record') return { ...ack, data: { ...ack.data, _id: 'foreign' } }
        else throw Error('synthetic timeout after dispatch')
        return ack
      })
      await expect(edit.saveOnly({ part: correctedPart }, h.record._id)).rejects.toThrow()
      await expect(edit.complete!()).rejects.toThrow()
      const successor = h.provider().forSnapshot(await h.load())!
      expect(successor.canEdit!(h.record._id)).toBe(false)
      await expect(successor.saveOnly({ part: correctedPart }, h.record._id)).rejects.toThrow()
      expect(h.writes).toHaveLength(1)
      expect(h.events.filter(path => /process|updateExts|upload/.test(path))).toEqual([])
    },
  )
})
