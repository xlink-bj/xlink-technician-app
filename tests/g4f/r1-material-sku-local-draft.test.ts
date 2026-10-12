import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  actionDraftIdentityFor,
  createActionDraftRepository,
  type ActionDraftIdentity,
} from '@runtimes/action'
import type { StoragePort, StorageKey } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import { useQuotationCompositionStore } from '@features/work-orders/quotation/composition-store'
import { createEmptyQuotationDraft, createQuotationGroup, upsertLocalQuotationMaterialSkuChoice, type QuotationDraft } from '@features/work-orders/quotation/model'
import { quotationDraftRecordFor, decodeQuotationDraftRecord } from '@features/work-orders/quotation/draft-codec'
import { validateQuotationDraft } from '@features/work-orders/quotation/validation'

const matchA = { skuId: 'sku-black-2', quantity: 3, attributes: { color: 'black', thickness: '2' } }
const matchB = { skuId: 'sku-grey-3', quantity: 2, attributes: { color: 'grey', thickness: '3' } }
const ok = <T>(data: T) => ({ state: 'succeeded' as const, data })

function memoryStorage(): StoragePort {
  const db = new Map<string, unknown>()
  return {
    read: async <T>(key: StorageKey) => ok((db.get(key.key) as T | undefined) ?? null),
    write: async (key, data) => { db.set(key.key, data); return ok(undefined) },
    remove: async key => { db.delete(key.key); return ok(undefined) },
    listKeys: async () => ok([...db.keys()]),
  }
}
function identity(userId = 'technician-1', workOrderId = 'wo-1'): ActionDraftIdentity {
  return actionDraftIdentityFor({
    userId: asOpaqueId<'UserId'>(userId),
    workOrderId: asOpaqueId<'WorkOrderId'>(workOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('node-place-order'),
    actionIntent: 'place_order', contentKind: 'quotation',
  })
}
function setupDraft(workOrderId: string, nodeId: string): QuotationDraft {
  return {
    ...createEmptyQuotationDraft(workOrderId, nodeId),
    groups: [
      { ...createQuotationGroup('group-a', { repairParts: ['bathroom'] }),
        materials: [{ kind: 'material' as const, selectionId: 'material-a', catalogId: 'spu-A',
          label: 'A', quantity: 1 }] },
      { ...createQuotationGroup('group-b', { repairParts: ['balcony'] }),
        materials: [{ kind: 'material' as const, selectionId: 'material-b', catalogId: 'spu-A',
          label: 'A', quantity: 1 }] },
    ],
  }
}

describe('M1 I2 R1 local SKU quantity choices / schema v4: NO official Order', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('stores multiple exact SKU identities separately in EACH repair group and sums parent SPU quantities', () => {
    const draft = setupDraft('wo-1', 'node-1')
    const one = upsertLocalQuotationMaterialSkuChoice(draft, 'group-a', 'spu-A', matchA)
    const two = upsertLocalQuotationMaterialSkuChoice(one, 'group-a', 'spu-A', matchB)
    const three = upsertLocalQuotationMaterialSkuChoice(two, 'group-b', 'spu-A',
      { ...matchA, quantity: 6 })
    expect(draft.groups[0]?.materials[0]?.skuChoices).toBeUndefined()
    expect(three.groups[0]?.materials[0]).toMatchObject({
      quantity: 5,
      skuChoices: [{ ...matchA }, { ...matchB }],
    })
    expect(three.groups[1]?.materials[0]).toMatchObject({
      quantity: 6, skuChoices: [{ ...matchA, quantity: 6 }],
    })
    expect(three.draftVersion).toBe(draft.draftVersion + 3)
    expect(upsertLocalQuotationMaterialSkuChoice(three, 'group-a', 'spu-A', matchB))
      .toBe(three)
  })

  it('rejects foreign group/material, unsafe counts, duplicate combinations and changed SKU identity attributes', () => {
    const draft = setupDraft('wo-1', 'node-1')
    expect(upsertLocalQuotationMaterialSkuChoice(draft, 'foreign-group', 'spu-A', matchA)).toBe(draft)
    expect(upsertLocalQuotationMaterialSkuChoice(draft, 'group-a', 'foreign-material', matchA)).toBe(draft)
    for (const quantity of [0, -1, 1.5, Infinity, 10000]) {
      expect(upsertLocalQuotationMaterialSkuChoice(draft, 'group-a', 'spu-A', { ...matchA, quantity })).toBe(draft)
    }
    const first = upsertLocalQuotationMaterialSkuChoice(draft, 'group-a', 'spu-A', matchA)
    expect(upsertLocalQuotationMaterialSkuChoice(first, 'group-a', 'spu-A',
      { ...matchA, skuId: 'different-sku' })).toBe(first)
    expect(upsertLocalQuotationMaterialSkuChoice(first, 'group-a', 'spu-A',
      { ...matchA, attributes: { color: 'grey' } })).toBe(first)
  })

  it('treats reordered attribute keys as the same SKU identity and still rejects changes', () => {
    const draft = setupDraft('wo-1', 'node-1')
    const first = upsertLocalQuotationMaterialSkuChoice(draft, 'group-a', 'spu-A', matchA)
    const reordered = { skuId: matchA.skuId, quantity: matchA.quantity,
      attributes: { thickness: '2', color: 'black' } }
    expect(upsertLocalQuotationMaterialSkuChoice(first, 'group-a', 'spu-A', reordered)).toBe(first)
    const updated = upsertLocalQuotationMaterialSkuChoice(first, 'group-a', 'spu-A',
      { ...reordered, quantity: 7 })
    expect(updated.groups[0]!.materials[0]!.quantity).toBe(7)
    expect(updated.groups[0]!.materials[0]!.skuChoices).toHaveLength(1)
    expect(upsertLocalQuotationMaterialSkuChoice(updated, 'group-a', 'spu-A',
      { ...reordered, skuId: 'different-sku', quantity: 1 })).toBe(updated)
    expect(upsertLocalQuotationMaterialSkuChoice(updated, 'group-a', 'spu-A',
      { ...reordered, attributes: { thickness: '4', color: 'black' } })).toBe(updated)
  })

  it('round-trips new SKU choices through the ACTUAL scoped local draft repository', async () => {
    const repository = createActionDraftRepository(memoryStorage())
    const id = identity()
    const store = useQuotationCompositionStore()
    expect(await store.initialize({ identity: id, repository, debounceMs: 60_000 })).toBe('fresh')
    const groupA = store.createGroup({ repairParts: ['bathroom'] }).data!
    const groupB = store.createGroup({ repairParts: ['balcony'] }).data!
    expect(store.addCatalogReadItem(groupA, { kind: 'material', id: 'spu-A', name: '材料 A' }).state).toBe('succeeded')
    expect(store.addCatalogReadItem(groupB, { kind: 'material', id: 'spu-A', name: '材料 A' }).state).toBe('succeeded')
    expect(store.saveLocalMaterialSkuChoice(groupA, 'spu-A', matchA).state).toBe('succeeded')
    const versionAfterFirstSave = store.draft!.draftVersion
    // Attribute insertion order is not part of SKU identity; a repeated save
    // must be accepted without marking the draft dirty again.
    expect(store.saveLocalMaterialSkuChoice(groupA, 'spu-A', {
      skuId: matchA.skuId, quantity: matchA.quantity,
      attributes: { thickness: '2', color: 'black' },
    }).state).toBe('succeeded')
    expect(store.draft!.draftVersion).toBe(versionAfterFirstSave)
    expect(store.saveLocalMaterialSkuChoice(groupB, 'spu-A', { ...matchA, quantity: 5 }).state).toBe('succeeded')
    expect(store.setQuantityText(groupA, store.groups[0]!.materials[0]!.selectionId, '99').state)
      .toBe('failed_terminal')
    expect(store.groups[0]!.materials[0]!.quantity).toBe(3)
    expect((await store.flushDraft()).state).toBe('succeeded')
    const stored = await repository.read<Readonly<Record<string, unknown>>>(id)
    expect(stored.data?.values?.schemaVersion).toBe(4)

    setActivePinia(createPinia())
    const reopened = useQuotationCompositionStore()
    expect(await reopened.initialize({ identity: id, repository })).toBe('restored')
    expect(reopened.groups[0]!.materials[0]!.skuChoices).toEqual([matchA])
    expect(reopened.groups[1]!.materials[0]!.skuChoices).toEqual([{ ...matchA, quantity: 5 }])
    expect(reopened.groups[0]!.materials[0]!.quantity).toBe(3)
    expect(reopened.groups[1]!.materials[0]!.quantity).toBe(5)
    expect(validateQuotationDraft(reopened.draft!).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'material.sku_local_only' }),
    ]))

    setActivePinia(createPinia())
    const wrongUser = useQuotationCompositionStore()
    expect(await wrongUser.initialize({ identity: identity('other-technician'), repository })).toBe('fresh')
    expect(wrongUser.groups).toEqual([])
    setActivePinia(createPinia())
    const wrongOrder = useQuotationCompositionStore()
    expect(await wrongOrder.initialize({ identity: identity('technician-1', 'other-order'), repository })).toBe('fresh')
  })

  it('reads existing v3 drafts but rejects damaged v4 SKU choices rather than overwriting them', () => {
    const id = identity()
    const draft = setupDraft(String(id.workOrderId), String(id.workflowNodeId))
    const stored = quotationDraftRecordFor(id, draft, '2026-10-12T00:00:00.000Z')
    expect(stored.values.schemaVersion).toBe(4)
    expect(decodeQuotationDraftRecord(stored, id).state).toBe('valid')
    const v3 = { ...stored, values: { schemaVersion: 3, quotationDraft: draft } }
    expect(decodeQuotationDraftRecord(v3, id).state).toBe('valid')
    const withSku = upsertLocalQuotationMaterialSkuChoice(draft, 'group-a', 'spu-A', matchA)
    expect(decodeQuotationDraftRecord(quotationDraftRecordFor(id, withSku,
      '2026-10-12T00:00:00.000Z'), id)).toMatchObject({ state: 'valid' })
    type MutableDraft = { groups: Array<{ materials: Array<{
      skuChoices: Array<{ skuId: string; quantity: number; attributes: Record<string, string> }>
      quantity: number
    }> }> }
    for (const broken of [
      { ...matchA, quantity: 0 },
      { ...matchA, quantity: 1.5 },
      { ...matchA, attributes: { color: '' } },
    ]) {
      const invalid = JSON.parse(JSON.stringify(withSku)) as MutableDraft
      invalid.groups[0]!.materials[0]!.skuChoices[0] = broken
      const record = quotationDraftRecordFor(id, invalid as unknown as QuotationDraft, '2026-10-12T00:00:00.000Z')
      expect(decodeQuotationDraftRecord(record, id).state).toBe('invalid')
    }
    const inconsistent = JSON.parse(JSON.stringify(withSku)) as MutableDraft
    inconsistent.groups[0]!.materials[0]!.quantity = 999
    expect(decodeQuotationDraftRecord(quotationDraftRecordFor(id, inconsistent as unknown as QuotationDraft,
      '2026-10-12T00:00:00.000Z'), id).state).toBe('invalid')
  })
})
