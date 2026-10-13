import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  actionDraftIdentityFor,
  actionDraftStorageKey,
  createActionDraftRepository,
  type ActionDraftIdentity,
  type ActionDraftRecord,
} from '@runtimes/action'
import type { QuotationCatalogItemRead, StorageKey, StoragePort } from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'
import { useQuotationCompositionStore } from '@features/work-orders/quotation/composition-store'
import { quotationCatalog } from '@features/work-orders/quotation/catalog'
import { decodeQuotationDraftRecord, quotationDraftRecordFor } from '@features/work-orders/quotation/draft-codec'
import { createEmptyQuotationDraft, createQuotationGroup, isDirectQuotationCatalogKind, parseQuotationQuantity } from '@features/work-orders/quotation/model'

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function memoryStorage(): StoragePort {
  const data = new Map<string, unknown>()
  return {
    read: async <T>(key: StorageKey) => succeeded((data.get(key.key) as T | undefined) ?? null),
    write: async (key, value) => { data.set(key.key, value); return succeeded(undefined) },
    remove: async (key) => { data.delete(key.key); return succeeded(undefined) },
    listKeys: async () => succeeded([...data.keys()]),
  }
}

function identityFor(input: {
  userId?: string
  workOrderId?: string
  workflowNodeId?: string
} = {}): ActionDraftIdentity {
  return actionDraftIdentityFor({
    userId: asOpaqueId<'UserId'>(input.userId ?? 'quotation-user-A'),
    workOrderId: asOpaqueId<'WorkOrderId'>(input.workOrderId ?? 'quotation-work-order-A'),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(input.workflowNodeId ?? 'quotation-node-A'),
    actionIntent: 'place_order',
    contentKind: 'quotation',
  })
}

describe('G4-F quotation composition model and local draft recovery', () => {
  let storage: StoragePort
  let repository: ReturnType<typeof createActionDraftRepository>

  beforeEach(() => {
    setActivePinia(createPinia())
    storage = memoryStorage()
    repository = createActionDraftRepository(storage)
  })

  afterEach(() => vi.useRealTimers())

  it('starts empty, composes all catalog kinds in a repair-part group, edits quantity, and autosaves grouped state only', async () => {
    vi.useFakeTimers()
    const identity = identityFor()
    const store = useQuotationCompositionStore()
    expect(await store.initialize({ identity, repository, debounceMs: 500 })).toBe('fresh')
    expect(store.draft).toEqual(createEmptyQuotationDraft(String(identity.workOrderId), String(identity.workflowNodeId)))

    const groupResult = store.createGroup({ repairParts: ['part-root', 'part-leaf'], partDescription: '局部维修', maintainAreaNum: '12.5' })
    expect(groupResult.state).toBe('succeeded')
    const groupId = groupResult.data!
    for (const item of quotationCatalog) {
      expect(store.addCatalogItem(groupId, item.kind, item.catalogId).state).toBe('succeeded')
    }
    const stableSelectionIds = store.groups[0].procedures.map((selection) => selection.selectionId)
    const measureSelection = store.groups[0].measures[0]
    expect(store.setQuantityText(groupId, measureSelection.selectionId, '12.5').state).toBe('succeeded')
    expect(store.groups[0].procedures.map((selection) => selection.selectionId)).toEqual(stableSelectionIds)
    const procedureSelection = store.groups[0].procedures[0]
    expect(store.removeSelection(groupId, procedureSelection.selectionId).state).toBe('succeeded')

    await vi.advanceTimersByTimeAsync(650)
    expect(store.localState).toBe('saved_local')
    const stored = await repository.read<Readonly<Record<string, unknown>>>(identity)
    expect(stored.state).toBe('succeeded')
    expect(stored.data?.values).toEqual({
      schemaVersion: 4,
      quotationDraft: {
        workOrderId: String(identity.workOrderId),
        workflowNodeId: String(identity.workflowNodeId),
        draftVersion: 8,
        groups: [{
          groupId: 'quotation-group-1',
          repairParts: ['part-root', 'part-leaf'],
          partDescription: '局部维修',
          maintainAreaNum: '12.5',
          projPackages: [
            { selectionId: 'quotation-selection-1', kind: 'package', catalogId: 'synthetic-package-basic', label: '标准服务方案', unit: '套', quantity: 1 },
          ],
          procedures: [],
          materials: [
            { selectionId: 'quotation-selection-3', kind: 'material', catalogId: 'synthetic-material-demo', label: '演示防水材料', unit: '桶', quantity: 1 },
          ],
          measures: [
            { selectionId: 'quotation-selection-4', kind: 'measure', catalogId: 'synthetic-measure-area', label: '施工面积', unit: '㎡', quantity: 12.5 },
          ],
        }],
      },
    })
    const serialized = JSON.stringify(stored.data)
    expect(serialized).not.toMatch(/price|subtotal|discount|tax|revision|sessionRef|token/i)
    expect(serialized).not.toContain('演示报价工单')
  })

  it('validates quantity deterministically without imposing scale or business precision rules', () => {
    expect(parseQuotationQuantity('0')).toMatchObject({ valid: false })
    expect(parseQuotationQuantity('-1')).toMatchObject({ valid: false })
    expect(parseQuotationQuantity('1e3')).toMatchObject({ valid: false })
    expect(parseQuotationQuantity(' 2.375 ')).toEqual({ valid: true, value: 2.375 })
    expect(parseQuotationQuantity('.5')).toEqual({ valid: true, value: 0.5 })
  })

  it('adds only direct non-package provider selections and excludes commercial metadata from the local draft', async () => {
    expect(isDirectQuotationCatalogKind('procedure')).toBe(true)
    expect(isDirectQuotationCatalogKind('material')).toBe(true)
    expect(isDirectQuotationCatalogKind('measure')).toBe(true)
    expect(isDirectQuotationCatalogKind('package')).toBe(false)
    expect(isDirectQuotationCatalogKind('sku')).toBe(false)

    const identity = identityFor()
    const store = useQuotationCompositionStore()
    await store.initialize({ identity, repository, debounceMs: 10_000 })
    const groupId = store.createGroup({ repairParts: ['part-roof'] }).data!
    const directItems: readonly QuotationCatalogItemRead[] = [
      { kind: 'procedure', id: 'real-procedure-1', name: '基层处理', unit: '处', guideUnitPrice: 999, minimumGuideTotalPrice: 888 },
      { kind: 'material', id: 'real-material-1', name: '防水材料', unit: '桶', price: 777, servicePrice: 666 },
      { kind: 'measure', id: 'real-measure-1', name: '机械措施', unit: '次', guideUnitPrice: 555, cost: 444 },
    ]

    for (const item of directItems) {
      expect(store.addCatalogReadItem(groupId, item).state).toBe('succeeded')
    }
    expect(store.groups[0]).toMatchObject({
      procedures: [{ catalogId: 'real-procedure-1', label: '基层处理', unit: '处', quantity: 1 }],
      materials: [{ catalogId: 'real-material-1', label: '防水材料', unit: '桶', quantity: 1 }],
      measures: [{ catalogId: 'real-measure-1', label: '机械措施', unit: '次', quantity: 1 }],
    })
    expect(JSON.stringify(store.draft)).not.toMatch(/price|minimum|cost|guideUnit/i)

    const beforeDuplicateSelections = JSON.stringify(store.draft)
    for (const item of directItems) {
      expect(store.addCatalogReadItem(groupId, item).state).toBe('succeeded')
    }
    expect(JSON.stringify(store.draft)).toBe(beforeDuplicateSelections)
    expect(store.groups[0]).toMatchObject({
      procedures: [{ catalogId: 'real-procedure-1', quantity: 1 }],
      materials: [{ catalogId: 'real-material-1', quantity: 1 }],
      measures: [{ catalogId: 'real-measure-1', quantity: 1 }],
    })

    const otherGroupId = store.createGroup({ repairParts: ['part-window'] }).data!
    for (const item of directItems) {
      expect(store.addCatalogReadItem(otherGroupId, item).state).toBe('succeeded')
    }
    expect(store.groups[1]).toMatchObject({
      procedures: [{ catalogId: 'real-procedure-1', quantity: 1 }],
      materials: [{ catalogId: 'real-material-1', quantity: 1 }],
      measures: [{ catalogId: 'real-measure-1', quantity: 1 }],
    })

    const unboundGroupId = store.createGroup().data!
    const beforeUnboundSelection = JSON.stringify(store.draft)
    expect(store.addCatalogReadItem(unboundGroupId, directItems[0]).state).toBe('failed_terminal')
    expect(JSON.stringify(store.draft)).toBe(beforeUnboundSelection)

    const beforePackage = JSON.stringify(store.draft)
    expect(store.addCatalogReadItem(groupId, {
      kind: 'package', id: 'real-package-1', name: '套餐', unit: '项', price: 100,
    }).state).toBe('failed_terminal')
    expect(JSON.stringify(store.draft)).toBe(beforePackage)
  })

  it('does not persist invalid intermediate quantity text as a valid draft change', async () => {
    const identity = identityFor()
    const store = useQuotationCompositionStore()
    await store.initialize({ identity, repository, debounceMs: 10_000 })
    const groupId = store.createGroup({ repairParts: ['part-material'] }).data!
    store.addCatalogItem(groupId, 'material', 'synthetic-material-demo')
    const selection = store.groups[0].materials[0]
    const before = store.draft
    expect(store.setQuantityText(groupId, selection.selectionId, '0').state).toBe('failed_terminal')
    expect(store.quantityErrorBySelection[selection.selectionId]).toBe('请输入大于 0 的数量')
    expect(store.draft).toEqual(before)
    const flushed = await store.flushDraft()
    expect(flushed.state).toBe('succeeded')
    const stored = await repository.read<Readonly<Record<string, unknown>>>(identity)
    expect(stored.data?.values).toMatchObject({
      quotationDraft: { groups: [{ materials: [{ quantity: 1 }] }] },
    })
    expect(JSON.stringify(stored.data?.values)).not.toContain('"quantity":0')
  })

  it('flushes and restores the local quotation draft when an Action Workspace is reopened', async () => {
    const identity = identityFor()
    const first = useQuotationCompositionStore()
    await first.initialize({ identity, repository, debounceMs: 10_000 })
    const groupId = first.createGroup({ repairParts: ['part-roof'] }).data!
    first.addCatalogItem(groupId, 'package', 'synthetic-package-basic')
    first.addCatalogItem(groupId, 'procedure', 'synthetic-procedure-base')
    expect((await first.flushDraft()).state).toBe('succeeded')

    setActivePinia(createPinia())
    const reopened = useQuotationCompositionStore()
    expect(await reopened.initialize({ identity, repository })).toBe('restored')
    expect(reopened.groups.map((group) => group.repairParts)).toEqual([['part-roof']])
    expect(reopened.groups[0].projPackages.map((selection) => selection.catalogId)).toEqual([
      'synthetic-package-basic',
    ])
    expect(reopened.groups[0].procedures.map((selection) => selection.catalogId)).toEqual([
      'synthetic-procedure-base',
    ])
    expect(reopened.localStateMessage).toContain('已恢复本地报价分组草稿')
  })

  it('restores grouped schema v2 losslessly and writes v4 after a local edit', async () => {
    const currentIdentity = identityFor()
    const v2Draft = {
      workOrderId: String(currentIdentity.workOrderId),
      workflowNodeId: String(currentIdentity.workflowNodeId),
      draftVersion: 9,
      groups: [{
        groupId: 'quotation-group-7',
        repairParts: ['roof-path', 'roof-child'],
        partDescription: '旧版组描述',
        maintainAreaNum: '6.25',
        projPackages: [{ selectionId: 'legacy-package-selection', kind: 'package', catalogId: 'legacy-package-id', label: '旧版套餐', unit: '套', quantity: 3 }],
        procedures: [{ selectionId: 'legacy-procedure-selection', kind: 'procedure', catalogId: 'legacy-procedure-id', label: '旧版工序', unit: '项', quantity: 2 }],
        materials: [{ selectionId: 'legacy-material-selection', kind: 'material', catalogId: 'legacy-material-id', label: '旧版材料', unit: '桶', quantity: 4 }],
        measures: [{ selectionId: 'legacy-measure-selection', kind: 'measure', catalogId: 'legacy-measure-id', label: '旧版机措', unit: '次', quantity: 1 }],
      }],
    }
    const originalRecord: ActionDraftRecord<Readonly<Record<string, unknown>>> = {
      version: 1,
      identity: currentIdentity,
      values: { schemaVersion: 2, quotationDraft: v2Draft },
      updatedAt: '2026-09-22T09:00:00.000Z',
      status: 'unfinished',
    }
    await repository.write(originalRecord)

    const store = useQuotationCompositionStore()
    expect(await store.initialize({ identity: currentIdentity, repository, debounceMs: 60_000 })).toBe('restored')
    expect(store.draft).toEqual(v2Draft)
    expect(store.groups[0].projPackages[0].configuration).toBeUndefined()
    expect(await repository.read<Readonly<Record<string, unknown>>>(currentIdentity)).toMatchObject({ data: originalRecord })

    expect(store.updateGroupContext('quotation-group-7', { partDescription: '编辑后的组描述' }).state).toBe('succeeded')
    expect((await store.flushDraft()).state).toBe('succeeded')
    const saved = await repository.read<Readonly<Record<string, unknown>>>(currentIdentity)
    expect(saved.data?.values).toEqual({
      schemaVersion: 4,
      quotationDraft: {
        ...v2Draft,
        draftVersion: 10,
        groups: [{ ...v2Draft.groups[0], partDescription: '编辑后的组描述' }],
      },
    })
    expect(store.groups[0].projPackages[0].configuration).toBeUndefined()
  })

  it.each([
    ['user', { userId: 'quotation-user-B' }],
    ['work order', { workOrderId: 'quotation-work-order-B' }],
    ['workflow node', { workflowNodeId: 'quotation-node-B' }],
  ] as const)('does not restore a draft across a different %s identity', async (_scope, change) => {
    const originalIdentity = identityFor()
    const original = useQuotationCompositionStore()
    await original.initialize({ identity: originalIdentity, repository })
    const groupId = original.createGroup({ repairParts: ['part-roof'] }).data!
    original.addCatalogItem(groupId, 'package', 'synthetic-package-basic')
    await original.flushDraft()

    setActivePinia(createPinia())
    const isolated = useQuotationCompositionStore()
    expect(await isolated.initialize({ identity: identityFor(change), repository })).toBe('fresh')
    expect(isolated.groups).toEqual([])
  })

  it('rejects malformed or incompatible persisted drafts without overwriting them', async () => {
    const identity = identityFor()
    const malformed: ActionDraftRecord<Readonly<Record<string, unknown>>> = {
      version: 1,
      identity,
      values: {
        schemaVersion: 2,
        quotationDraft: {
          workOrderId: String(identity.workOrderId),
          workflowNodeId: String(identity.workflowNodeId),
          draftVersion: 1,
          groups: [{
            groupId: 'group-1',
            repairParts: [],
            partDescription: '',
            maintainAreaNum: '',
            projPackages: [],
            procedures: [],
            materials: [{ selectionId: 'selection-1', kind: 'material', catalogId: 'synthetic-material-demo', label: '演示材料', quantity: 0, price: 999 }],
            measures: [],
          }],
        },
      },
      updatedAt: '2026-09-22T09:00:00.000Z',
      status: 'unfinished',
    }
    await repository.write(malformed)
    const before = await repository.read<Readonly<Record<string, unknown>>>(identity)
    const decoded = decodeQuotationDraftRecord(before.state === 'succeeded' ? before.data : null, identity)
    expect(decoded.state).toBe('invalid')

    const store = useQuotationCompositionStore()
    expect(await store.initialize({ identity, repository })).toBe('invalid')
    expect(store.createGroup().state).toBe('failed_terminal')
    expect((await repository.read<Readonly<Record<string, unknown>>>(identity)).data).toEqual(malformed)
    expect(await store.discardInvalidDraft()).toMatchObject({ state: 'succeeded' })
    expect(store.localState).toBe('fresh')
  })

  it('requires the explicit place_order quotation scope in its local draft codec', () => {
    const identity = identityFor()
    const draft = createEmptyQuotationDraft(String(identity.workOrderId), String(identity.workflowNodeId))
    const record = quotationDraftRecordFor(identity, draft, '2026-09-22T09:00:00.000Z')
    expect(decodeQuotationDraftRecord(record, identity)).toMatchObject({ state: 'valid', draft })
    expect(decodeQuotationDraftRecord(record, {
      ...identity,
      actionIntent: 'quotation',
    })).toMatchObject({ state: 'invalid' })
    expect(actionDraftStorageKey(identity)).toContain('quotation')
  })

  it('validates schema-v3 configured Package snapshots and rejects duplicate configured identity/layer', () => {
    const currentIdentity = identityFor()
    const configuredPackage = {
      selectionId: 'quotation-selection-1',
      kind: 'package' as const,
      catalogId: 'provider-package-a',
      label: '演示套餐',
      quantity: 2,
      configuration: {
        procedures: [{ providerReferenceId: 'procedure-ref-a', catalogId: 'procedure-a', label: '演示工序' }],
        materials: [{ providerComponentId: 'material-body-a', catalogId: 'material-a', label: '演示材料', layer: 1 }],
        measures: [{ providerReferenceId: 'measure-ref-a', catalogId: 'measure-a', label: '演示机措' }],
      },
    }
    const draft = {
      ...createEmptyQuotationDraft(String(currentIdentity.workOrderId), String(currentIdentity.workflowNodeId)),
      groups: [{ ...createQuotationGroup('group-v3', { repairParts: ['roof'] }), projPackages: [configuredPackage] }],
    }
    const record = quotationDraftRecordFor(currentIdentity, draft, '2026-09-22T09:00:00.000Z')
    expect(record.values.schemaVersion).toBe(4)
    expect(decodeQuotationDraftRecord(record, currentIdentity)).toMatchObject({ state: 'valid', draft })

    const malformedProviderIdentity = JSON.parse(JSON.stringify(record)) as {
      identity: ActionDraftIdentity
      values: {
        schemaVersion: number
        quotationDraft: {
          groups: Array<{
            projPackages: Array<{
              configuration: { procedures: Array<Record<string, unknown>> }
            }>
          }>
        }
      }
    }
    malformedProviderIdentity.values.quotationDraft.groups[0].projPackages[0]
      .configuration.procedures[0].providerComponentId = 42
    expect(decodeQuotationDraftRecord(malformedProviderIdentity, currentIdentity).state).toBe('invalid')

    const duplicateLayer = {
      ...draft,
      groups: [{ ...draft.groups[0], projPackages: [{
        ...configuredPackage,
        configuration: {
          ...configuredPackage.configuration,
          materials: [
            ...configuredPackage.configuration.materials,
            { providerComponentId: 'material-body-b', catalogId: 'material-b', label: '同层另一材料', layer: 1 },
          ],
        },
      }] }],
    }
    expect(decodeQuotationDraftRecord(quotationDraftRecordFor(currentIdentity, duplicateLayer, '2026-09-22T09:00:00.000Z'), currentIdentity).state).toBe('invalid')
    // R1 treats provider layer 1 and "01" as the same material layer.
    // Restoring two selections for that logical layer must remain invalid.
    const mixedRepresentation = {
      ...draft,
      groups: [{ ...draft.groups[0], projPackages: [{
        ...configuredPackage,
        configuration: {
          ...configuredPackage.configuration,
          materials: [
            ...configuredPackage.configuration.materials,
            { providerComponentId: 'material-body-b', catalogId: 'material-b', label: '同层另一材料', layer: '01' },
          ],
        },
      }] }],
    }
    expect(decodeQuotationDraftRecord(
      quotationDraftRecordFor(currentIdentity, mixedRepresentation, '2026-09-22T09:00:00.000Z'),
      currentIdentity,
    ).state).toBe('invalid')

    const duplicatePackage = {
      ...draft,
      groups: [{ ...draft.groups[0], projPackages: [configuredPackage, { ...configuredPackage, selectionId: 'quotation-selection-2' }] }],
    }
    expect(decodeQuotationDraftRecord(quotationDraftRecordFor(currentIdentity, duplicatePackage, '2026-09-22T09:00:00.000Z'), currentIdentity).state).toBe('invalid')
  })

  it('retains legacy flat v1 drafts without migration or overwrite until explicit user disposition', async () => {
    const identity = identityFor()
    const legacy: ActionDraftRecord<Readonly<Record<string, unknown>>> = {
      version: 1,
      identity,
      values: {
        schemaVersion: 1,
        quotationDraft: {
          workOrderId: String(identity.workOrderId),
          workflowNodeId: String(identity.workflowNodeId),
          draftVersion: 4,
          lines: [{ lineId: 'old-line-1', kind: 'material', catalogId: 'synthetic-material-demo', label: '演示材料', quantity: 2 }],
        },
      },
      updatedAt: '2026-09-22T09:00:00.000Z',
      status: 'unfinished',
    }
    await repository.write(legacy)
    expect(decodeQuotationDraftRecord(legacy, identity)).toMatchObject({ state: 'legacy_requires_action' })

    const store = useQuotationCompositionStore()
    expect(await store.initialize({ identity, repository })).toBe('legacy_requires_action')
    expect(store.draft).toBeNull()
    expect(store.createGroup().state).toBe('failed_terminal')
    await store.flushDraft()
    expect((await repository.read<Readonly<Record<string, unknown>>>(identity)).data).toEqual(legacy)

    expect(await store.discardLegacyDraft()).toMatchObject({ state: 'succeeded' })
    expect((await repository.read<Readonly<Record<string, unknown>>>(identity)).data).toBeNull()
    expect(store.localState).toBe('fresh')
  })
})
