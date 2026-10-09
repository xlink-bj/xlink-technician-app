import { actionDraftIdentityFor, actionDraftStorageKey } from '@runtimes/action'
import type { StorageKey, StorageListQuery, StoragePort } from '@shared/ports'
import { asOpaqueId, createOperationError, type OperationSnapshot } from '@shared/types'

import { quotationDraftRecordFor } from '@features/work-orders/quotation/draft-codec'
import type { QuotationDraft } from '@features/work-orders/quotation/model'

export type G4fReviewScenario = 'empty' | 'populated' | 'restored' | 'catalog' | 'catalog-empty' | 'catalog-error' | 'invalid' | 'legacy' | 'submit-ready' | 'readback-pending' | 'edit' | 'unsupported-edit' | 'dynamic-fields'

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

export function reviewScenarioFromLocation(): G4fReviewScenario {
  if (typeof window === 'undefined') return 'empty'
  const value = new URLSearchParams(window.location.search).get('scenario')
  return ['populated', 'restored', 'catalog', 'catalog-empty', 'catalog-error', 'invalid', 'legacy', 'submit-ready', 'readback-pending', 'edit', 'unsupported-edit', 'dynamic-fields'].includes(value ?? '')
    ? value as G4fReviewScenario
    : 'empty'
}

export function createG4fReviewStorage(): StoragePort {
  const entries = new Map<string, unknown>()
  const keyFor = ({ namespace, key }: StorageKey) => `${namespace}\u0000${key}`
  return {
    read: async <T>(key: StorageKey) => succeeded((entries.get(keyFor(key)) as T | undefined) ?? null),
    write: async (key, value) => { entries.set(keyFor(key), value); return succeeded(undefined) },
    remove: async (key) => { entries.delete(keyFor(key)); return succeeded(undefined) },
    listKeys: async ({ namespace, prefix }: StorageListQuery) => succeeded(
      [...entries.keys()]
        .filter((key) => key.startsWith(`${namespace}\u0000`))
        .map((key) => key.slice(namespace.length + 1))
        .filter((key) => prefix === undefined || key.startsWith(prefix)),
    ),
  }
}

/** Browser-local storage isolated from the app draft store and quotation V3 keyspace. */
export function createG4fSyntheticReviewStorage(): StoragePort {
  const prefix = 'g4f-synthetic-review:v1:'
  const physicalKey = (key: StorageKey): string | undefined => key.namespace === 'draft' && key.key.startsWith('g4f-synthetic-order-extfield:v1:')
    ? `${prefix}${key.key}`
    : undefined
  const unavailable = <T>(): OperationSnapshot<T> => ({
    state: 'failed_terminal',
    error: createOperationError('server_terminal', 'synthetic review localStorage unavailable', { code: 'synthetic_review_storage_unavailable' }),
  })
  return {
    read: async <T>(key: StorageKey) => {
      const target = physicalKey(key)
      if (!target || typeof window === 'undefined') return unavailable<T | null>()
      try {
        const raw = window.localStorage.getItem(target)
        if (raw === null) return succeeded(null)
        try {
          return succeeded(JSON.parse(raw) as T)
        } catch {
          // Let the versioned repository classify corrupt serialized records;
          // returning the raw string keeps the original value untouched.
          return succeeded(raw as T)
        }
      } catch {
        return unavailable<T | null>()
      }
    },
    write: async <T>(key: StorageKey, value: T) => {
      const target = physicalKey(key)
      if (!target || typeof window === 'undefined') return unavailable<void>()
      try {
        window.localStorage.setItem(target, JSON.stringify(value))
        return succeeded(undefined)
      } catch {
        return unavailable<void>()
      }
    },
    remove: async (key: StorageKey) => {
      const target = physicalKey(key)
      if (!target || typeof window === 'undefined') return unavailable<void>()
      try {
        window.localStorage.removeItem(target)
        return succeeded(undefined)
      } catch {
        return unavailable<void>()
      }
    },
    listKeys: async ({ namespace, prefix: keyPrefix }: StorageListQuery) => {
      if (namespace !== 'draft' || typeof window === 'undefined') return unavailable<readonly string[]>()
      try {
        const keys = Object.keys(window.localStorage)
          .filter((key) => key.startsWith(prefix))
          .map((key) => key.slice(prefix.length))
          .filter((key) => keyPrefix === undefined || key.startsWith(keyPrefix))
        return succeeded(keys)
      } catch {
        return unavailable<readonly string[]>()
      }
    },
  }
}

export function seedG4fReviewDraft(storage: StoragePort, scenario: G4fReviewScenario): void {
  if (scenario === 'dynamic-fields') {
    const identity = actionDraftIdentityFor({
      userId: asOpaqueId<'UserId'>('g4f-mock-review-user'),
      workOrderId: asOpaqueId<'WorkOrderId'>('mock-work-order-018-quotation-foundation'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-018-place-order'),
      actionIntent: 'place_order',
      contentKind: 'quotation',
    })
    const draft: QuotationDraft = {
      workOrderId: String(identity.workOrderId),
      workflowNodeId: String(identity.workflowNodeId),
      draftVersion: 1,
      groups: [{
        groupId: 'quotation-group-synthetic-dynamic-fields',
        repairParts: [],
        partDescription: '',
        maintainAreaNum: '',
        projPackages: [],
        procedures: [],
        materials: [],
        measures: [],
      }],
    }
    void storage.write(
      { namespace: 'draft', key: actionDraftStorageKey(identity) },
      quotationDraftRecordFor(identity, draft, '2026-10-09T00:00:00.000Z'),
    )
    return
  }
  if (scenario === 'submit-ready' || scenario === 'readback-pending') {
    const identity = actionDraftIdentityFor({
      userId: asOpaqueId<'UserId'>('g4f-mock-review-user'),
      workOrderId: asOpaqueId<'WorkOrderId'>('mock-work-order-018-quotation-foundation'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-018-place-order'),
      actionIntent: 'place_order',
      contentKind: 'quotation',
    })
    const draft: QuotationDraft = {
      workOrderId: String(identity.workOrderId), workflowNodeId: String(identity.workflowNodeId), draftVersion: 8,
      groups: [{
        groupId: 'quotation-group-review-submit', repairParts: ['repair-part-code-001'],
        partDescription: '合成屋面区域', maintainAreaNum: '12', projPackages: [],
        procedures: [{ selectionId: 'review-procedure', kind: 'procedure', catalogId: 'mock-catalog-procedure-seal', label: '檐口密封处理（示例）', unit: '处', quantity: 1 }],
        materials: [{ selectionId: 'review-material', kind: 'material', catalogId: 'mock-catalog-material-sealant', label: '弹性密封材料（示例）', unit: '支', quantity: 2 }],
        measures: [{ selectionId: 'review-measure', kind: 'measure', catalogId: 'mock-catalog-measure-inspection', label: '高处作业防护（示例）', unit: '次', quantity: 1 }],
      }],
    }
    void storage.write({ namespace: 'draft', key: actionDraftStorageKey(identity) }, quotationDraftRecordFor(identity, draft, '2026-09-23T00:00:00.000Z'))
    if (scenario === 'readback-pending') {
      const receiptKey = `quotation-order-receipt:v1:${encodeURIComponent(String(identity.userId))}:${encodeURIComponent(String(identity.workOrderId))}:${encodeURIComponent(String(identity.workflowNodeId))}`
      void storage.write({ namespace: 'draft', key: receiptKey }, {
        version: 1,
        workOrderId: String(identity.workOrderId),
        workflowNodeId: String(identity.workflowNodeId),
        fingerprint: 'synthetic-pending-readback-fingerprint',
        draftVersion: draft.draftVersion,
        state: 'write_succeeded_readback_pending',
        orderId: 'order-synthetic-review',
      })
    }
    return
  }
  if (scenario !== 'populated' && scenario !== 'restored' && scenario !== 'invalid' && scenario !== 'legacy') return
  const identity = actionDraftIdentityFor({
    userId: asOpaqueId<'UserId'>('g4f-mock-review-user'),
    workOrderId: asOpaqueId<'WorkOrderId'>('mock-work-order-018-quotation-foundation'),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('mock-workflow-node-018-place-order'),
    actionIntent: 'place_order',
    contentKind: 'quotation',
  })
  const common = {
    version: 1 as const,
    identity,
    updatedAt: '2026-09-22T09:00:00.000Z',
    status: 'unfinished' as const,
  }
  if (scenario === 'invalid' || scenario === 'legacy') {
    void storage.write({ namespace: 'draft', key: actionDraftStorageKey(identity) }, {
      ...common,
      values: {
        schemaVersion: scenario === 'legacy' ? 1 : 2,
        quotationDraft: scenario === 'legacy'
          ? {
              workOrderId: String(identity.workOrderId),
              workflowNodeId: String(identity.workflowNodeId),
              draftVersion: 4,
              lines: [{ lineId: 'old-line-1', kind: 'material', catalogId: 'synthetic-material-demo', label: '演示防水材料', unit: '桶', quantity: 2 }],
            }
          : {
              workOrderId: String(identity.workOrderId),
              workflowNodeId: String(identity.workflowNodeId),
              draftVersion: 1,
              groups: [{
                groupId: 'quotation-group-1',
                repairParts: ['repair-part-code-001'],
                partDescription: '屋面局部维修',
                maintainAreaNum: '18',
                projPackages: [],
                procedures: [],
                materials: [{ selectionId: 'quotation-selection-1', kind: 'material', catalogId: 'synthetic-material-demo', label: '演示防水材料', unit: '桶', quantity: 0 }],
                measures: [],
              }],
            },
      },
    })
    return
  }

  const draft: QuotationDraft = {
    workOrderId: String(identity.workOrderId),
    workflowNodeId: String(identity.workflowNodeId),
    draftVersion: 5,
    groups: [{
      groupId: 'quotation-group-1',
      repairParts: ['repair-part-code-001'],
      partDescription: '屋面局部维修',
      maintainAreaNum: '18',
      projPackages: [
        { selectionId: 'quotation-selection-1', kind: 'package', catalogId: 'synthetic-package-basic', label: '标准服务方案', unit: '套', quantity: 1 },
      ],
      procedures: [
        { selectionId: 'quotation-selection-2', kind: 'procedure', catalogId: 'synthetic-procedure-base', label: '基层处理', unit: '项', quantity: 1 },
      ],
      materials: [
        { selectionId: 'quotation-selection-3', kind: 'material', catalogId: 'synthetic-material-demo', label: '演示防水材料', unit: '桶', quantity: 2 },
      ],
      measures: [
        { selectionId: 'quotation-selection-4', kind: 'measure', catalogId: 'synthetic-measure-area', label: '施工面积', unit: '㎡', quantity: 12.5 },
      ],
    }],
  }
  void storage.write({ namespace: 'draft', key: actionDraftStorageKey(identity) }, quotationDraftRecordFor(identity, draft, common.updatedAt))
}
