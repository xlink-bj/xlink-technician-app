import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  actionDraftIdentityFor,
  actionDraftStorageKey,
  createActionDraftRepository,
  type ActionDraftIdentity,
  type ActionDraftRecord,
} from '@runtimes/action'
import type { StorageKey, StoragePort } from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'
import { useQuotationCompositionStore } from '@features/work-orders/quotation/composition-store'
import { quotationCatalog } from '@features/work-orders/quotation/catalog'
import { decodeQuotationDraftRecord, quotationDraftRecordFor } from '@features/work-orders/quotation/draft-codec'
import { createEmptyQuotationDraft, parseQuotationQuantity } from '@features/work-orders/quotation/model'

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

  it('starts empty, composes all supported catalog kinds, edits positive quantity, removes a line, and autosaves semantic state only', async () => {
    vi.useFakeTimers()
    const identity = identityFor()
    const store = useQuotationCompositionStore()
    expect(await store.initialize({ identity, repository, debounceMs: 500 })).toBe('fresh')
    expect(store.draft).toEqual(createEmptyQuotationDraft(String(identity.workOrderId), String(identity.workflowNodeId)))

    for (const item of quotationCatalog) {
      expect(store.addCatalogItem(item.kind, item.catalogId).state).toBe('succeeded')
    }
    const stableLineIds = store.lines.map((line) => line.lineId)
    const measureLine = store.lines.find((line) => line.kind === 'measure')!
    expect(store.setQuantityText(measureLine.lineId, '12.5').state).toBe('succeeded')
    expect(store.lines.map((line) => line.lineId)).toEqual(stableLineIds)
    const removedLine = store.lines.find((line) => line.kind === 'procedure')!
    expect(store.removeLine(removedLine.lineId).state).toBe('succeeded')

    await vi.advanceTimersByTimeAsync(650)
    expect(store.localState).toBe('saved_local')
    const stored = await repository.read<Readonly<Record<string, unknown>>>(identity)
    expect(stored.state).toBe('succeeded')
    expect(stored.data?.values).toEqual({
      schemaVersion: 1,
      quotationDraft: {
        workOrderId: String(identity.workOrderId),
        workflowNodeId: String(identity.workflowNodeId),
        draftVersion: 7,
        lines: [
          { lineId: 'quotation-line-1', kind: 'package', catalogId: 'synthetic-package-basic', label: '标准服务方案', unit: '套', quantity: 1 },
          { lineId: 'quotation-line-3', kind: 'material', catalogId: 'synthetic-material-demo', label: '演示防水材料', unit: '桶', quantity: 1 },
          { lineId: 'quotation-line-4', kind: 'measure', catalogId: 'synthetic-measure-area', label: '施工面积', unit: '㎡', quantity: 12.5 },
        ],
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

  it('does not persist invalid intermediate quantity text as a valid draft change', async () => {
    const identity = identityFor()
    const store = useQuotationCompositionStore()
    await store.initialize({ identity, repository, debounceMs: 10_000 })
    store.addCatalogItem('material', 'synthetic-material-demo')
    const line = store.lines[0]
    const before = store.draft
    expect(store.setQuantityText(line.lineId, '0').state).toBe('failed_terminal')
    expect(store.quantityErrorByLine[line.lineId]).toBe('请输入大于 0 的数量')
    expect(store.draft).toEqual(before)
    const flushed = await store.flushDraft()
    expect(flushed.state).toBe('succeeded')
    const stored = await repository.read<Readonly<Record<string, unknown>>>(identity)
    expect(stored.data?.values).toMatchObject({
      quotationDraft: { lines: [{ quantity: 1 }] },
    })
    expect(JSON.stringify(stored.data?.values)).not.toContain('"quantity":0')
  })

  it('flushes and restores the local quotation draft when an Action Workspace is reopened', async () => {
    const identity = identityFor()
    const first = useQuotationCompositionStore()
    await first.initialize({ identity, repository, debounceMs: 10_000 })
    first.addCatalogItem('package', 'synthetic-package-basic')
    first.addCatalogItem('procedure', 'synthetic-procedure-base')
    expect((await first.flushDraft()).state).toBe('succeeded')

    setActivePinia(createPinia())
    const reopened = useQuotationCompositionStore()
    expect(await reopened.initialize({ identity, repository })).toBe('restored')
    expect(reopened.lines.map((line) => [line.kind, line.catalogId])).toEqual([
      ['package', 'synthetic-package-basic'],
      ['procedure', 'synthetic-procedure-base'],
    ])
    expect(reopened.localStateMessage).toContain('已恢复本地报价草稿')
  })

  it.each([
    ['user', { userId: 'quotation-user-B' }],
    ['work order', { workOrderId: 'quotation-work-order-B' }],
    ['workflow node', { workflowNodeId: 'quotation-node-B' }],
  ] as const)('does not restore a draft across a different %s identity', async (_scope, change) => {
    const originalIdentity = identityFor()
    const original = useQuotationCompositionStore()
    await original.initialize({ identity: originalIdentity, repository })
    original.addCatalogItem('package', 'synthetic-package-basic')
    await original.flushDraft()

    setActivePinia(createPinia())
    const isolated = useQuotationCompositionStore()
    expect(await isolated.initialize({ identity: identityFor(change), repository })).toBe('fresh')
    expect(isolated.lines).toEqual([])
  })

  it('rejects malformed or incompatible persisted drafts without overwriting them', async () => {
    const identity = identityFor()
    const malformed: ActionDraftRecord<Readonly<Record<string, unknown>>> = {
      version: 1,
      identity,
      values: {
        schemaVersion: 1,
        quotationDraft: {
          workOrderId: String(identity.workOrderId),
          workflowNodeId: String(identity.workflowNodeId),
          draftVersion: 1,
          lines: [{ lineId: 'line-1', kind: 'material', catalogId: 'synthetic-material-demo', label: '演示材料', quantity: 0, price: 999 }],
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
    expect(store.addCatalogItem('package', 'synthetic-package-basic').state).toBe('failed_terminal')
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
})
