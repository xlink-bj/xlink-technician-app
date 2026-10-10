import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  createActionDraftRepository,
  actionDraftIdentityFor,
  type ActionDraftIdentity,
} from '@runtimes/action'
import type {
  QuotationPackageDetailRead,
  QuotationPackageRead,
  StorageKey,
  StoragePort,
} from '@shared/ports'
import type { OperationSnapshot } from '@shared/types'
import { asOpaqueId } from '@shared/types'
import { useQuotationCompositionStore } from '@features/work-orders/quotation/composition-store'
import {
  configuredQuotationPackageCandidateFor,
  type QuotationPackageMaterialChoice,
} from '@features/work-orders/quotation/package-configuration'
import { createQuotationGroup } from '@features/work-orders/quotation/model'

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

const identity: ActionDraftIdentity = actionDraftIdentityFor({
  userId: asOpaqueId<'UserId'>('phase1g-user'),
  workOrderId: asOpaqueId<'WorkOrderId'>('phase1g-work-order'),
  workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('phase1g-node'),
  actionIntent: 'place_order',
  contentKind: 'quotation',
})

const packageRow: QuotationPackageRead = {
  kind: 'package', id: 'package-synthetic-a', name: '演示套餐甲', unit: '套', price: 999, minimumPrice: 888,
}

const detail: QuotationPackageDetailRead = {
  package: packageRow,
  procedures: [{
    kind: 'procedure', id: 'procedure-body-1', referenceId: 'procedure-catalog-1', unit: '组',
    item: { kind: 'procedure', id: 'procedure-catalog-1', name: '演示工序', unit: '项', guideUnitPrice: 777 },
  }],
  materials: [
    {
      kind: 'material', id: 'material-body-1', referenceId: 'material-catalog-1', layer: 1, unit: '箱', price: 666,
      item: { kind: 'material', id: 'material-catalog-1', name: '演示材料一', unit: '支', price: 555 },
    },
    {
      kind: 'material', id: 'material-body-2', referenceId: 'material-catalog-2', layer: 1, unit: '箱',
      item: { kind: 'material', id: 'material-catalog-2', name: '演示材料一替代', unit: '支' },
    },
    {
      kind: 'material', id: 'material-body-3', referenceId: 'material-catalog-3', layer: '1', unit: '桶',
      item: { kind: 'material', id: 'material-catalog-3', name: '演示材料字符串层', unit: '桶' },
    },
  ],
  measures: [{
    kind: 'measure', id: 'measure-body-1', referenceId: 'measure-catalog-1', unit: '次',
    item: { kind: 'measure', id: 'measure-catalog-1', name: '演示机措', unit: '次', guideUnitPrice: 444 },
  }],
}

const choices: readonly QuotationPackageMaterialChoice[] = [
  { layer: 1, componentId: 'material-body-2', referenceId: 'material-catalog-2' },
  { layer: '1', componentId: 'material-body-3', referenceId: 'material-catalog-3' },
]

describe('G4-F Phase 1G package configuration contract', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('requires a real target group with a repair-part path', () => {
    expect(configuredQuotationPackageCandidateFor(undefined, packageRow, detail, choices).state).toBe('failed_terminal')
    expect(configuredQuotationPackageCandidateFor(createQuotationGroup('empty-group'), packageRow, detail, choices).state).toBe('failed_terminal')
  })

  it('requires the selected list row and returned Package Detail identities to match', () => {
    expect(configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-a', { repairParts: ['roof'] }), packageRow,
      { ...detail, package: { ...packageRow, id: 'another-package' } }, choices,
    ).state).toBe('failed_terminal')
  })

  it('fails closed if any material row has no exact provider layer', () => {
    const missingLayer: QuotationPackageDetailRead = {
      ...detail,
      materials: [...detail.materials, { kind: 'material', id: 'missing-layer-row', item: null }],
    }
    expect(configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-a', { repairParts: ['roof'] }), packageRow, missingLayer, choices,
    ).state).toBe('failed_terminal')
  })

  it('treats numeric and string layer identities as distinct and preserves both exact values', () => {
    const result = configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-a', { repairParts: ['roof'] }), packageRow, detail, choices,
    )
    expect(result).toMatchObject({ state: 'succeeded', data: { configuration: { materials: [{ layer: 1 }, { layer: '1' }] } } })
  })

  it.each([
    ['none', []],
    ['duplicate selection for one layer', [choices[0], choices[0], choices[1]]],
    ['selection for an unknown layer', [choices[0], { ...choices[1], layer: 2 }]],
  ] as const)('requires exactly one selected Material for each layer (%s)', (_case, selected) => {
    expect(configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-a', { repairParts: ['roof'] }), packageRow, detail, selected,
    ).state).toBe('failed_terminal')
  })

  it('rejects an unresolved selected Material and never substitutes an alternative', () => {
    const unresolved: QuotationPackageDetailRead = {
      ...detail,
      materials: detail.materials.map((row) => row.id === 'material-body-2' ? { ...row, item: null } : row),
    }
    expect(configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-a', { repairParts: ['roof'] }), packageRow, unresolved, choices,
    ).state).toBe('failed_terminal')
  })

  it('rejects unresolved bundled Procedure or Measure identity/display', () => {
    const unresolvedProcedure: QuotationPackageDetailRead = {
      ...detail,
      procedures: [{ kind: 'procedure', id: 'procedure-body-1', item: null }],
    }
    const unresolvedMeasure: QuotationPackageDetailRead = {
      ...detail,
      measures: [{ kind: 'measure', referenceId: 'measure-catalog-1', item: null }],
    }
    const group = createQuotationGroup('group-a', { repairParts: ['roof'] })
    expect(configuredQuotationPackageCandidateFor(group, packageRow, unresolvedProcedure, choices).state).toBe('failed_terminal')
    expect(configuredQuotationPackageCandidateFor(group, packageRow, unresolvedMeasure, choices).state).toBe('failed_terminal')
  })

  it('rejects bundled components without a provider body/reference identity', () => {
    const unresolved: QuotationPackageDetailRead = {
      ...detail,
      procedures: [{ kind: 'procedure', item: { kind: 'procedure', id: 'procedure-catalog-1', name: '演示工序' } }],
    }
    expect(configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-a', { repairParts: ['roof'] }), packageRow, unresolved, choices,
    ).state).toBe('failed_terminal')
  })

  it('rejects a normalized child item that conflicts with its provider reference identity', () => {
    const conflicting: QuotationPackageDetailRead = {
      ...detail,
      procedures: [{
        kind: 'procedure', id: 'procedure-body-1', referenceId: 'procedure-catalog-1',
        item: { kind: 'procedure', id: 'different-catalog-id', name: '错误工序' },
      }],
    }
    expect(configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-a', { repairParts: ['roof'] }), packageRow, conflicting, choices,
    ).state).toBe('failed_terminal')
  })

  it('stores only package, bundled component identities/display, and selected alternatives', () => {
    const result = configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-a', { repairParts: ['roof'] }), packageRow, detail, choices,
    )
    expect(result.state).toBe('succeeded')
    expect(result.data?.configuration).toEqual({
      procedures: [{ providerComponentId: 'procedure-body-1', providerReferenceId: 'procedure-catalog-1', catalogId: 'procedure-catalog-1', label: '演示工序', unit: '组' }],
      materials: [
        { providerComponentId: 'material-body-2', providerReferenceId: 'material-catalog-2', catalogId: 'material-catalog-2', label: '演示材料一替代', unit: '箱', layer: 1 },
        { providerComponentId: 'material-body-3', providerReferenceId: 'material-catalog-3', catalogId: 'material-catalog-3', label: '演示材料字符串层', unit: '桶', layer: '1' },
      ],
      measures: [{ providerComponentId: 'measure-body-1', providerReferenceId: 'measure-catalog-1', catalogId: 'measure-catalog-1', label: '演示机措', unit: '次' }],
    })
    const serialized = JSON.stringify(result.data)
    expect(serialized).not.toMatch(/price|minimum|guide|cost|amount|total/i)
    expect(serialized).not.toContain('material-catalog-1')
  })

  it('initializes Package quantity from a valid positive maintainAreaNum', () => {
    expect(configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-a', { repairParts: ['roof'], maintainAreaNum: '18.25' }), packageRow, detail, choices,
    )).toMatchObject({ state: 'succeeded', data: { quantity: 18.25 } })
  })

  it.each(['', '  ', '0', '-2', 'NaN'])('falls back to quantity 1 for invalid maintainAreaNum %j', (maintainAreaNum) => {
    expect(configuredQuotationPackageCandidateFor(
      createQuotationGroup('group-a', { repairParts: ['roof'], maintainAreaNum }), packageRow, detail, choices,
    )).toMatchObject({ state: 'succeeded', data: { quantity: 1 } })
  })

  it('reconfigures in place, preserves selectionId and edited quantity, and allows another group', async () => {
    const repository = createActionDraftRepository(memoryStorage())
    const store = useQuotationCompositionStore()
    await store.initialize({ identity, repository, debounceMs: 60_000 })
    const groupId = store.createGroup({ repairParts: ['roof'], maintainAreaNum: '12' }).data!
    expect(store.configurePackageReadItem(groupId, packageRow, detail, choices).state).toBe('succeeded')
    const first = store.groups[0].projPackages[0]
    expect(first).toMatchObject({ selectionId: 'quotation-selection-1', quantity: 12 })
    expect(store.setQuantityText(groupId, first.selectionId, '7.5').state).toBe('succeeded')
    const changedChoices = [
      { layer: 1, componentId: 'material-body-1', referenceId: 'material-catalog-1' },
      choices[1],
    ]
    expect(store.configurePackageReadItem(groupId, packageRow, detail, changedChoices).state).toBe('succeeded')
    expect(store.groups[0].projPackages).toHaveLength(1)
    expect(store.groups[0].projPackages[0]).toMatchObject({ selectionId: first.selectionId, quantity: 7.5 })
    expect(store.groups[0].projPackages[0].configuration?.materials[0].catalogId).toBe('material-catalog-1')
    expect(JSON.stringify(store.draft)).not.toMatch(/price|minimum|guideUnit|cost|subtotal|total/i)

    const otherGroupId = store.createGroup({ repairParts: ['window'] }).data!
    expect(store.configurePackageReadItem(otherGroupId, packageRow, detail, choices).state).toBe('succeeded')
    expect(store.groups[1].projPackages).toHaveLength(1)
    expect(store.groups[1].projPackages[0].selectionId).not.toBe(first.selectionId)
    store.clear()
  })
})
