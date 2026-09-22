import { actionDraftIdentityFor, actionDraftStorageKey } from '@runtimes/action'
import type { StorageKey, StorageListQuery, StoragePort } from '@shared/ports'
import { asOpaqueId, type OperationSnapshot } from '@shared/types'

import { quotationDraftRecordFor } from '@features/work-orders/quotation/draft-codec'
import type { QuotationDraft } from '@features/work-orders/quotation/model'

export type G4fReviewScenario = 'empty' | 'populated' | 'restored' | 'catalog' | 'invalid'

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

export function reviewScenarioFromLocation(): G4fReviewScenario {
  if (typeof window === 'undefined') return 'empty'
  const value = new URLSearchParams(window.location.search).get('scenario')
  return ['populated', 'restored', 'catalog', 'invalid'].includes(value ?? '')
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

export function seedG4fReviewDraft(storage: StoragePort, scenario: G4fReviewScenario): void {
  if (scenario !== 'populated' && scenario !== 'restored' && scenario !== 'invalid') return
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
  if (scenario === 'invalid') {
    void storage.write({ namespace: 'draft', key: actionDraftStorageKey(identity) }, {
      ...common,
      values: {
        schemaVersion: 1,
        quotationDraft: {
          workOrderId: String(identity.workOrderId),
          workflowNodeId: String(identity.workflowNodeId),
          draftVersion: 1,
          lines: [{ lineId: 'quotation-line-1', kind: 'material', catalogId: 'synthetic-material-demo', label: '演示防水材料', unit: '桶', quantity: 0 }],
        },
      },
    })
    return
  }

  const draft: QuotationDraft = {
    workOrderId: String(identity.workOrderId),
    workflowNodeId: String(identity.workflowNodeId),
    draftVersion: 5,
    lines: [
      { lineId: 'quotation-line-1', kind: 'package', catalogId: 'synthetic-package-basic', label: '标准服务方案', unit: '套', quantity: 1 },
      { lineId: 'quotation-line-2', kind: 'procedure', catalogId: 'synthetic-procedure-base', label: '基层处理', unit: '项', quantity: 1 },
      { lineId: 'quotation-line-3', kind: 'material', catalogId: 'synthetic-material-demo', label: '演示防水材料', unit: '桶', quantity: 2 },
      { lineId: 'quotation-line-4', kind: 'measure', catalogId: 'synthetic-measure-area', label: '施工面积', unit: '㎡', quantity: 12.5 },
    ],
  }
  void storage.write({ namespace: 'draft', key: actionDraftStorageKey(identity) }, quotationDraftRecordFor(identity, draft, common.updatedAt))
}
