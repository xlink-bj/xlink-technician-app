import { describe, expect, it, vi } from 'vitest'

import type {
  QuotationCatalogContext,
  QuotationCatalogReadPort,
  QuotationMaterialRead,
  QuotationMeasureRead,
  QuotationPackageDetailRead,
  QuotationPackageMaterialRead,
  QuotationPackageRead,
  QuotationProcedureRead,
} from '@shared/ports'
import { asOpaqueId, createOperationError, type OperationSnapshot } from '@shared/types'
import { actionDraftIdentityFor, type ActionDraftIdentity } from '@runtimes/action'
import { quotationDraftRecordFor } from '@features/work-orders/quotation/draft-codec'
import { evaluateQuotationDraft } from '@features/work-orders/quotation/engine'
import { hydrateQuotationDraft } from '@features/work-orders/quotation/hydration'
import {
  appendQuotationGroup,
  appendQuotationSelection,
  createEmptyQuotationDraft,
  createQuotationGroup,
  type QuotationDraft,
  type QuotationGroup,
  type QuotationPackageSelection,
} from '@features/work-orders/quotation/model'
import { encodeR1OfficialOrderType1 } from '@features/work-orders/quotation/order-encoder'
import { calculateQuotationPricing, r1AmountToFixed } from '@features/work-orders/quotation/pricing'
import { validateQuotationDraft } from '@features/work-orders/quotation/validation'

const context: QuotationCatalogContext = {
  serviceType: 'synthetic-service-type',
  sourceType: 'synthetic-source-type',
}

const packageItem: QuotationPackageRead = {
  id: 'package-a',
  kind: 'package',
  name: 'Synthetic package',
  unit: '套',
  price: 100,
  minimumPrice: 0,
  pricingMethod: '0',
}

const procedureItem: QuotationProcedureRead = {
  id: 'procedure-a',
  kind: 'procedure',
  name: 'Synthetic procedure',
  unit: '处',
  guideUnitPrice: 10,
  minimumGuideTotalPrice: 0,
}

const materialItem: QuotationMaterialRead = {
  id: 'material-a',
  kind: 'material',
  name: 'Synthetic material',
  unit: '支',
  materialUnit: '支',
  specification: '10',
  specUnit: '毫米',
  price: 4.5,
}

const measureItem: QuotationMeasureRead = {
  id: 'measure-a',
  kind: 'measure',
  name: 'Synthetic measure',
  unit: '次',
  guideUnitPrice: 2.25,
}

const packageMaterialRow: QuotationPackageMaterialRead = {
  id: 'package-material-row-a',
  referenceId: 'material-a',
  kind: 'material',
  item: materialItem,
  price: 7.5,
  layer: 'layer-a',
  coefficient: 1,
  coefficientUnit: '支',
}

function succeeded<T>(data: T): OperationSnapshot<T> {
  return { state: 'succeeded', data }
}

function group(overrides: Partial<QuotationGroup> = {}): QuotationGroup {
  return {
    ...createQuotationGroup('group-a', {
      repairParts: ['roof', 'flat-roof'],
      partDescription: 'Synthetic repair area',
      maintainAreaNum: '12.5',
    }),
    ...overrides,
  }
}

function directDraft(
  kinds: readonly ('procedure' | 'material' | 'measure')[] = ['procedure', 'material'],
  options: { readonly quantity?: number; readonly group?: QuotationGroup } = {},
): QuotationDraft {
  let draft = createEmptyQuotationDraft('work-order-a', 'workflow-node-a')
  draft = appendQuotationGroup(draft, options.group ?? group())
  for (const kind of kinds) {
    const item = kind === 'procedure' ? procedureItem : kind === 'material' ? materialItem : measureItem
    draft = appendQuotationSelection(draft, 'group-a', {
      catalogId: item.id,
      kind: item.kind,
      label: item.name,
      ...(item.unit ? { unit: item.unit } : {}),
    }, `selection-${kind}`)
  }
  if (options.quantity !== undefined) {
    draft = {
      ...draft,
      groups: draft.groups.map((current) => ({
        ...current,
        procedures: current.procedures.map((row) => ({ ...row, quantity: options.quantity! })),
        materials: current.materials.map((row) => ({ ...row, quantity: options.quantity! })),
        measures: current.measures.map((row) => ({ ...row, quantity: options.quantity! })),
      })),
    }
  }
  return draft
}

function packageDraft(options: {
  readonly quantity?: number
  readonly configuration?: QuotationPackageSelection['configuration']
} = {}): QuotationDraft {
  const configuration = options.configuration ?? {
    procedures: [],
    materials: [{
      providerComponentId: packageMaterialRow.id,
      providerReferenceId: packageMaterialRow.referenceId,
      catalogId: materialItem.id,
      label: materialItem.name,
      unit: materialItem.unit,
      layer: packageMaterialRow.layer!,
    }],
    measures: [],
  }
  const selectedPackage: QuotationPackageSelection = {
    selectionId: 'selection-package',
    kind: 'package',
    catalogId: packageItem.id,
    label: packageItem.name,
    unit: packageItem.unit,
    quantity: options.quantity ?? 1,
    configuration,
  }
  let draft = createEmptyQuotationDraft('work-order-a', 'workflow-node-a')
  draft = appendQuotationGroup(draft, group({ projPackages: [selectedPackage] }))
  return draft
}

function packageDetail(options: {
  readonly id?: string
  readonly materials?: readonly QuotationPackageMaterialRead[]
} = {}): QuotationPackageDetailRead {
  return {
    package: { ...packageItem, id: options.id ?? packageItem.id },
    procedures: [],
    materials: options.materials ?? [packageMaterialRow],
    measures: [],
  }
}

function catalogPort(overrides: Partial<QuotationCatalogReadPort> = {}): QuotationCatalogReadPort {
  return {
    listPackages: vi.fn(async () => succeeded({ items: [packageItem] })),
    getPackageDetail: vi.fn(async () => succeeded(packageDetail())),
    listProcedures: vi.fn(async () => succeeded({ items: [procedureItem] })),
    listMaterials: vi.fn(async () => succeeded({ items: [materialItem] })),
    listMeasures: vi.fn(async () => succeeded({ items: [measureItem] })),
    ...overrides,
  }
}

async function hydrate(draft: QuotationDraft, port = catalogPort()) {
  return hydrateQuotationDraft({ draft, context, port })
}

async function pricingFor(draft: QuotationDraft, port = catalogPort()) {
  const hydrated = await hydrate(draft, port)
  expect(hydrated.state).toBe('succeeded')
  if (hydrated.state !== 'succeeded') throw new Error('Expected hydration to succeed')
  return calculateQuotationPricing(hydrated.data)
}

describe('G4-F Phase 1H quotation engine', () => {
  it('1. accepts a valid group with direct procedure and material composition', () => {
    expect(validateQuotationDraft(directDraft())).toMatchObject({ state: 'ready', issues: [] })
  })

  it('2. blocks a group with no repair-part path', () => {
    const result = validateQuotationDraft(directDraft(['procedure', 'material'], { group: group({ repairParts: [] }) }))
    expect(result.issues.map((issue) => issue.code)).toContain('group.repair_parts_required')
  })

  it('3. blocks a group with no part description', () => {
    const result = validateQuotationDraft(directDraft(['procedure', 'material'], { group: group({ partDescription: '' }) }))
    expect(result.issues.map((issue) => issue.code)).toContain('group.description_required')
  })

  it('4. blocks a non-positive or malformed maintainAreaNum', () => {
    for (const maintainAreaNum of ['', '0', '-2', '1e3']) {
      expect(validateQuotationDraft(directDraft(['procedure', 'material'], {
        group: group({ maintainAreaNum }),
      })).issues.map((issue) => issue.code)).toContain('group.maintain_area_invalid')
    }
  })

  it('5. blocks an empty group', () => {
    expect(validateQuotationDraft(directDraft([], { group: group() })).issues.map((issue) => issue.code))
      .toContain('group.composition_empty')
  })

  it('6. blocks a group containing only a Procedure', () => {
    expect(validateQuotationDraft(directDraft(['procedure'])).issues.map((issue) => issue.code))
      .toContain('group.direct_composition_incomplete')
  })

  it('7. blocks a group containing only a Material', () => {
    expect(validateQuotationDraft(directDraft(['material'])).issues.map((issue) => issue.code))
      .toContain('group.direct_composition_incomplete')
  })

  it('8. accepts direct Procedure + Material without requiring a Measure', () => {
    expect(validateQuotationDraft(directDraft(['procedure', 'material'])).state).toBe('ready')
  })

  it('9. blocks a restored Package without configuration', () => {
    const unconfigured = {
      selectionId: 'legacy-package', kind: 'package' as const, catalogId: 'package-a',
      label: 'Synthetic package', quantity: 1,
    }
    const result = validateQuotationDraft(directDraft([], { group: group({ projPackages: [unconfigured] }) }))
    expect(result.issues.map((issue) => issue.code)).toContain('package.configuration_incomplete')
  })

  it('10. accepts a structurally complete configured Package snapshot', () => {
    expect(validateQuotationDraft(packageDraft()).state).toBe('ready')
  })

  it('11. blocks zero, negative, NaN, and infinite selected quantities', () => {
    for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateQuotationDraft(directDraft(['procedure', 'material'], { quantity }))
        .issues.map((issue) => issue.code)).toContain('selection.quantity_invalid')
    }
  })

  it('12. hydrates restored selections directly from the read Port without UI navigation', async () => {
    const port = catalogPort()
    const result = await hydrate(directDraft(), port)
    expect(result.state).toBe('succeeded')
    expect(port.listProcedures).toHaveBeenCalledOnce()
    expect(port.listMaterials).toHaveBeenCalledOnce()
    expect(port.listPackages).not.toHaveBeenCalled()
    expect(port.listMeasures).not.toHaveBeenCalled()
  })

  it('13. blocks hydration when the exact provider identity is missing', async () => {
    const port = catalogPort({ listMaterials: vi.fn(async () => succeeded({ items: [] })) })
    const result = await hydrate(directDraft(), port)
    expect(result).toMatchObject({ state: 'blocked', issues: [{ code: 'catalog.identity_missing' }] })
  })

  it('14. blocks hydration when the matching provider row has the wrong kind', async () => {
    const wrongKind = { ...procedureItem, id: 'material-a' } as unknown as QuotationMaterialRead
    const port = catalogPort({ listMaterials: vi.fn(async () => succeeded({ items: [wrongKind] })) })
    const result = await hydrate(directDraft(), port)
    expect(result).toMatchObject({ state: 'blocked', issues: [{ code: 'catalog.kind_mismatch' }] })
  })

  it('15. blocks hydration when configured Package Detail identity differs from the selected Package', async () => {
    const port = catalogPort({ getPackageDetail: vi.fn(async () => succeeded(packageDetail({ id: 'another-package' }))) })
    const result = await hydrate(packageDraft(), port)
    expect(result).toMatchObject({ state: 'blocked', issues: [{ code: 'package.detail_identity_mismatch' }] })
  })

  it('16. blocks hydration when a configured Package material is no longer in the current detail', async () => {
    const disappeared = { ...packageMaterialRow, id: 'replacement-row', referenceId: 'another-material' }
    const port = catalogPort({ getPackageDetail: vi.fn(async () => succeeded(packageDetail({ materials: [disappeared] }))) })
    const result = await hydrate(packageDraft(), port)
    expect(result).toMatchObject({ state: 'blocked', issues: [{ code: 'package.component_identity_missing' }] })
  })

  it('17. matches hydrated provider identities independent of list ordering', async () => {
    const other = { ...materialItem, id: 'material-b', name: 'Other synthetic material' }
    const port = catalogPort({ listMaterials: vi.fn(async () => succeeded({ items: [other, materialItem] })) })
    const result = await hydrate(directDraft(), port)
    expect(result.state).toBe('succeeded')
    if (result.state === 'succeeded') {
      const material = result.data.groups[0].selections.find((selection) => selection.kind === 'material')
      expect(material?.kind === 'material' && material.item.id).toBe('material-a')
    }
  })

  it('18. prices a standard Package as base price plus selected exts.price markup times quantity', async () => {
    const outcome = await pricingFor(packageDraft({ quantity: 2 }))
    expect(outcome).toMatchObject({ state: 'succeeded', data: {
      calcTotalPrice: { originPrice: 215, totalPrice: 215 },
      fillOrder: { groups: [{ selectionAmounts: [{ fillOrderTotalAmount: 215 }], subtotal: 215 }] },
    } })
  })

  it('19. applies the observed Package minimum-price floor at and below the boundary', async () => {
    const belowPort = catalogPort({ listPackages: vi.fn(async () => succeeded({ items: [{ ...packageItem, minimumPrice: 120 }] })) })
    const boundaryPort = catalogPort({ listPackages: vi.fn(async () => succeeded({ items: [{ ...packageItem, minimumPrice: 107.5 }] })) })
    const below = await pricingFor(packageDraft({ quantity: 1 }), belowPort)
    const atBoundary = await pricingFor(packageDraft({ quantity: 1 }), boundaryPort)
    expect(below).toMatchObject({ state: 'succeeded', data: { calcTotalPrice: { originPrice: 120 }, fillOrder: { groups: [{ selectionAmounts: [{ fillOrderTotalAmount: 120 }] }] } } })
    expect(atBoundary).toMatchObject({ state: 'succeeded', data: { calcTotalPrice: { originPrice: 107.5 }, fillOrder: { groups: [{ selectionAmounts: [{ fillOrderTotalAmount: 107.5 }] }] } } })
  })

  it('20. applies the Procedure minimum total when the guide-price product is below it', async () => {
    const lowMinimum = { ...procedureItem, guideUnitPrice: 10, minimumGuideTotalPrice: 30 }
    const port = catalogPort({ listProcedures: vi.fn(async () => succeeded({ items: [lowMinimum] })) })
    const outcome = await pricingFor(directDraft(['procedure', 'material'], { quantity: 2 }), port)
    expect(outcome.state).toBe('succeeded')
    if (outcome.state === 'succeeded') {
      expect(outcome.data.calcTotalPrice.originPrice).toBe(39)
      expect(outcome.data.fillOrder.groups[0].selectionAmounts[0].fillOrderTotalAmount).toBe(30)
    }
  })

  it('21. prices direct Material by its current catalog price and quantity', async () => {
    const outcome = await pricingFor(directDraft(['procedure', 'material'], { quantity: 2 }))
    expect(outcome).toMatchObject({ state: 'succeeded', data: { fillOrder: { groups: [{ selectionAmounts: [{ fillOrderTotalAmount: 20 }, { fillOrderTotalAmount: 9 }] }] } } })
  })

  it('22. prices Measure by guideUnitPrice and quantity', async () => {
    const outcome = await pricingFor(directDraft(['procedure', 'material', 'measure'], { quantity: 2 }))
    expect(outcome).toMatchObject({ state: 'succeeded', data: { fillOrder: { groups: [{ selectionAmounts: [{ fillOrderTotalAmount: 20 }, { fillOrderTotalAmount: 9 }, { fillOrderTotalAmount: 4.5 }] }] } } })
  })

  it('22a. exposes only source-backed direct unit prices for commercial quotation display', async () => {
    const result = await pricingFor(directDraft(['procedure', 'material', 'measure'], { quantity: 2 }))
    expect(result.state).toBe('succeeded')
    if (result.state !== 'succeeded') return
    const rows = result.data.fillOrder.groups[0].selectionAmounts
    expect(rows.map(row => row.catalogUnitPrice)).toEqual([10, 4.5, 2.25])
    // A priced row amount can legitimately differ from catalogue rate ×
    // quantity due to an R1 minimum. Never back-compute a fake unit price.
    const minimum = await pricingFor(directDraft(['procedure'], { quantity: 2 }), catalogPort({
      listProcedures: vi.fn(async () => succeeded({
        items: [{ ...procedureItem, guideUnitPrice: 10, minimumGuideTotalPrice: 30 }],
      })),
    }))
    expect(minimum.state).toBe('succeeded')
    if (minimum.state === 'succeeded') {
      expect(minimum.data.fillOrder.groups[0].selectionAmounts[0]).toMatchObject({
        fillOrderTotalAmount: 30, catalogUnitPrice: 10,
      })
    }
  })

  it('23. aggregates multiple groups deterministically', async () => {
    const first = group({ groupId: 'group-a', procedures: [{ selectionId: 'p1', kind: 'procedure', catalogId: procedureItem.id, label: procedureItem.name, quantity: 1 }], materials: [{ selectionId: 'm1', kind: 'material', catalogId: materialItem.id, label: materialItem.name, quantity: 1 }] })
    const second = group({ groupId: 'group-b', procedures: [{ selectionId: 'p2', kind: 'procedure', catalogId: procedureItem.id, label: procedureItem.name, quantity: 2 }], materials: [{ selectionId: 'm2', kind: 'material', catalogId: materialItem.id, label: materialItem.name, quantity: 2 }] })
    const draft = {
      ...createEmptyQuotationDraft('work-order-a', 'workflow-node-a'),
      groups: [first, second],
    }
    const outcome = await pricingFor(draft)
    expect(outcome).toMatchObject({ state: 'succeeded', data: {
      calcTotalPrice: { originPrice: 43.5, totalPrice: 43.5 },
      fillOrder: { groups: [{ subtotal: 14.5 }, { subtotal: 29 }], orderListTotalAmount: 43.5 },
    } })
  })

  it('keeps calcTotalPrice and fillOrder projections distinct when R1 row rounding creates a one-cent difference', async () => {
    const port = catalogPort({
      listProcedures: vi.fn(async () => succeeded({ items: [{ ...procedureItem, guideUnitPrice: 0.335 }] })),
      listMaterials: vi.fn(async () => succeeded({ items: [{ ...materialItem, price: 0.335 }] })),
    })
    const result = await evaluateQuotationDraft({ draft: directDraft(), catalogContext: context, catalogRead: port })
    expect(result.state).toBe('ready')
    expect(result.pricing).toMatchObject({
      calcTotalPrice: { originPrice: 0.67, totalPrice: 0.67 },
      fillOrder: {
        groups: [{
          selectionAmounts: [
            { kind: 'procedure', calcTotalPriceContribution: 0.335, fillOrderTotalAmount: 0.34 },
            { kind: 'material', calcTotalPriceContribution: 0.335, fillOrderTotalAmount: 0.34 },
          ],
          categoryTotals: { procedure: 0.34, material: 0.34 },
          subtotal: 0.68,
        }],
        orderListTotalAmount: 0.68,
      },
    })
    expect(result.payload?.originPrice).toBe(0.67)
    expect(result.payload?.totalPrice).toBe(0.67)
    const encoded = JSON.parse(result.payload!.bjProducts) as { orderList: Array<{ totalAmount: number; procedures: { totalAmount: number }; materials: { totalAmount: number } }> }
    expect(encoded.orderList[0]).toMatchObject({
      totalAmount: 0.68,
      procedures: { totalAmount: 0.34 },
      materials: { totalAmount: 0.34 },
    })
  })

  it('24. applies the R1 two-decimal toFixed behavior deterministically', () => {
    expect(r1AmountToFixed(1.005)).toBe(Number((1.005).toFixed(2)))
    expect(r1AmountToFixed(1.005)).toBe(1)
    expect(r1AmountToFixed(1.006)).toBe(1.01)
  })

  it('25. persists no provider commercial metadata in the v4 grouped draft', () => {
    const identity: ActionDraftIdentity = actionDraftIdentityFor({
      userId: asOpaqueId<'UserId'>('synthetic-user'),
      workOrderId: asOpaqueId<'WorkOrderId'>('work-order-a'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('workflow-node-a'),
      actionIntent: 'place_order',
      contentKind: 'quotation',
    })
    const record = quotationDraftRecordFor(identity, directDraft(), '2026-09-23T00:00:00.000Z')
    expect(record.values.schemaVersion).toBe(4)
    expect(JSON.stringify(record.values)).not.toMatch(/price|cost|subtotal|discount|token|session/i)
  })

  it('26. engine results do not carry session credentials or raw provider response envelopes', async () => {
    const result = await evaluateQuotationDraft({ draft: directDraft(), catalogContext: context, catalogRead: catalogPort() })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/sessionRef|accessToken|refreshToken|cookie|rawResponse|rawPayload/i)
    expect(result).toMatchObject({ state: 'ready', payload: { type: 1 } })
  })

  it('27. encodes the verified type=1 payload as grouped bjProducts.orderList', async () => {
    const result = await evaluateQuotationDraft({ draft: directDraft(), catalogContext: context, catalogRead: catalogPort() })
    expect(result.state).toBe('ready')
    expect(result.payload?.type).toBe(1)
    const bjProducts = JSON.parse(result.payload!.bjProducts) as { orderList: unknown[] }
    expect(bjProducts.orderList).toHaveLength(1)
  })

  it('28. preserves repair-part group, category identity, quantity, unit price and row total', async () => {
    const result = await evaluateQuotationDraft({ draft: directDraft(), catalogContext: context, catalogRead: catalogPort() })
    const bjProducts = JSON.parse(result.payload!.bjProducts) as {
      orderList: Array<{ repairParts: string[]; partDescription: string; maintainAreaNum: string; procedures: { data: Array<Record<string, unknown>> }; materials: { data: Array<Record<string, unknown>> } }>
    }
    expect(bjProducts.orderList[0]).toMatchObject({
      repairParts: ['roof', 'flat-roof'],
      partDescription: 'Synthetic repair area',
      maintainAreaNum: '12.5',
      procedures: { data: [{ _id: 'procedure-a', number: 1, amount: 10, totalAmount: 10 }] },
      materials: { data: [{ _id: 'material-a', number: 1, amount: 4.5, totalAmount: 4.5 }] },
    })
  })

  it('independently rejects forged calcTotalPrice or fillOrder projections at the encoder boundary', async () => {
    const hydrated = await hydrate(directDraft())
    expect(hydrated.state).toBe('succeeded')
    if (hydrated.state !== 'succeeded') throw new Error('Expected hydration to succeed')
    const calculated = calculateQuotationPricing(hydrated.data)
    expect(calculated.state).toBe('succeeded')
    if (calculated.state !== 'succeeded') throw new Error('Expected pricing to succeed')

    const forgedTopLevel = {
      ...calculated.data,
      calcTotalPrice: { ...calculated.data.calcTotalPrice, totalPrice: calculated.data.calcTotalPrice.totalPrice + 0.01 },
    }
    const forgedBreakdown = {
      ...calculated.data,
      fillOrder: {
        ...calculated.data.fillOrder,
        groups: calculated.data.fillOrder.groups.map((current, index) => index === 0
          ? { ...current, subtotal: current.subtotal + 0.01 }
          : current),
      },
    }
    for (const pricing of [forgedTopLevel, forgedBreakdown]) {
      const encoded = encodeR1OfficialOrderType1({ draft: hydrated.data, pricing, catalogContext: context })
      expect(encoded).toMatchObject({ state: 'blocked', issues: [expect.objectContaining({ code: 'encoding.pricing_incomplete' })] })
    }
  })

  it('29. refuses to encode a hydrated draft with incomplete group readiness', () => {
    const invalid = {
      workOrderId: 'work-order-a', workflowNodeId: 'workflow-node-a', draftVersion: 1,
      groups: [{ group: group({ repairParts: [] }), selections: [] }],
    }
    const result = encodeR1OfficialOrderType1({
      draft: invalid,
      pricing: {
        calcTotalPrice: { originPrice: 0, totalPrice: 0 },
        fillOrder: { groups: [{ groupId: 'group-a', selectionAmounts: [], categoryTotals: { package: 0, procedure: 0, material: 0, measure: 0 }, subtotal: 0 }], orderListTotalAmount: 0 },
        rounding: 'r1_calcTotalPrice_and_fillOrder',
      },
      catalogContext: context,
    })
    expect(result).toMatchObject({ state: 'blocked', issues: expect.arrayContaining([expect.objectContaining({ code: 'encoding.group.repair_parts_required' })]) })
  })

  it('30. never emits SKU or skuCode for direct non-SKU composition', async () => {
    const result = await evaluateQuotationDraft({ draft: directDraft(), catalogContext: context, catalogRead: catalogPort() })
    expect(JSON.stringify(result.payload)).not.toMatch(/skuCode|\bskus\b|spuid/i)
  })

  it('31. emits only official Order type=1 semantics, not standalone quote type=0', async () => {
    const result = await evaluateQuotationDraft({ draft: directDraft(), catalogContext: context, catalogRead: catalogPort() })
    expect(result.payload).toMatchObject({ type: 1, serviceAppointmentId: 'work-order-a', productIds: '[]' })
    expect(result.payload).not.toHaveProperty('workflowId')
  })

  it('32. evaluation only invokes required catalog read methods and exposes no command path', async () => {
    const port = catalogPort()
    const result = await evaluateQuotationDraft({ draft: directDraft(), catalogContext: context, catalogRead: port })
    expect(result.state).toBe('ready')
    expect(port.listProcedures).toHaveBeenCalledOnce()
    expect(port.listMaterials).toHaveBeenCalledOnce()
    expect(port.listPackages).not.toHaveBeenCalled()
    expect(port.listMeasures).not.toHaveBeenCalled()
    expect(port.getPackageDetail).not.toHaveBeenCalled()
    expect(port).not.toHaveProperty('saveOrder')
    expect(port).not.toHaveProperty('upsertOrder')
    expect(port).not.toHaveProperty('completeWorkflow')
  })

  it('blocks SPU/SKU-based direct material prices', async () => {
    const skuMaterial = { ...materialItem, spuId: 'synthetic-spu' }
    const materialPort = catalogPort({ listMaterials: vi.fn(async () => succeeded({ items: [skuMaterial] })) })
    const materialDraft = directDraft(['procedure', 'material'])
    const materialResult = await pricingFor(materialDraft, materialPort)
    expect(materialResult).toMatchObject({ state: 'blocked', issues: [expect.objectContaining({ code: 'pricing.material_sku_deferred' })] })
  })

  it('prices a Package without pricingMethod and emits R1 standard material quantity', async () => {
    const packageWithoutMethod: QuotationPackageRead = { ...packageItem, pricingMethod: undefined }
    const port = catalogPort({ listPackages: vi.fn(async () => succeeded({ items: [packageWithoutMethod] })) })
    const result = await evaluateQuotationDraft({ draft: packageDraft(), catalogContext: context, catalogRead: port })
    expect(result.state).toBe('ready')
    expect(result.pricing).toMatchObject({
      calcTotalPrice: { originPrice: 107.5, totalPrice: 107.5 },
      fillOrder: { groups: [{ categoryTotals: { package: 107.5 }, subtotal: 107.5 }] },
    })
    const products = JSON.parse(result.payload!.bjProducts) as { orderList: Array<{ projPackages: { data: Array<{ materialList: Array<{ number: number }> }> } }> }
    expect(products.orderList[0].projPackages.data[0].materialList[0].number).toBe(1)
  })

  it('prices explicit SKU-mode Package under calcTotalPrice but never emits its unsupported SKU payload', async () => {
    const skuPackage: QuotationPackageRead = { ...packageItem, pricingMethod: '1' }
    const port = catalogPort({ listPackages: vi.fn(async () => succeeded({ items: [skuPackage] })) })
    const result = await evaluateQuotationDraft({ draft: packageDraft(), catalogContext: context, catalogRead: port })
    expect(result.state).toBe('blocked')
    expect(result.pricing?.calcTotalPrice.originPrice).toBe(107.5)
    expect(result.issues).toContainEqual(expect.objectContaining({
      phase: 'encoding', code: 'encoding.package_sku_path_not_authorized',
    }))
    expect(result.payload).toBeUndefined()
  })

  it('matches shipped R1 ceil(package quantity × coefficient / material spec) without persisting the derived count', async () => {
    const result = await evaluateQuotationDraft({ draft: packageDraft({ quantity: 20 }), catalogContext: context, catalogRead: catalogPort() })
    expect(result.state).toBe('ready')
    const products = JSON.parse(result.payload!.bjProducts) as { orderList: Array<{ projPackages: { data: Array<{ materialList: Array<{ number: number }> }> } }> }
    expect(products.orderList[0].projPackages.data[0].materialList[0].number).toBe(2)
    expect(packageDraft({ quantity: 20 }).groups[0].projPackages[0].quantity).toBe(20)
  })

  it('blocks standard Package encoding when coefficient or material spec is missing/invalid', async () => {
    const invalidCoefficient = { ...packageMaterialRow, coefficient: undefined }
    const noCoefficientPort = catalogPort({ getPackageDetail: vi.fn(async () => succeeded(packageDetail({ materials: [invalidCoefficient] }))) })
    const noCoefficient = await evaluateQuotationDraft({ draft: packageDraft(), catalogContext: context, catalogRead: noCoefficientPort })
    expect(noCoefficient).toMatchObject({ state: 'blocked', issues: [expect.objectContaining({ code: 'encoding.package_material_quantity_contract_invalid' })] })

    const invalidSpecPort = catalogPort({
      listMaterials: vi.fn(async () => succeeded({ items: [{ ...materialItem, specification: '0' }] })),
      getPackageDetail: vi.fn(async () => succeeded(packageDetail({ materials: [{ ...packageMaterialRow, item: { ...materialItem, specification: '0' } }] }))),
    })
    const invalidSpec = await evaluateQuotationDraft({ draft: packageDraft(), catalogContext: context, catalogRead: invalidSpecPort })
    expect(invalidSpec).toMatchObject({ state: 'blocked', issues: [expect.objectContaining({ code: 'encoding.package_material_quantity_contract_invalid' })] })
  })

  it('blocks pricing when source-backed provider amount is absent instead of substituting zero', async () => {
    const missingPrice = { ...materialItem, price: undefined }
    const port = catalogPort({ listMaterials: vi.fn(async () => succeeded({ items: [missingPrice] })) })
    const result = await pricingFor(directDraft(), port)
    expect(result).toMatchObject({ state: 'blocked', issues: [expect.objectContaining({ code: 'pricing.material_price_missing' })] })
  })

  it('blocks hydration on an unavailable read and does not fall back to synthetic local catalog', async () => {
    const port = catalogPort({
      listMaterials: vi.fn(async () => ({ state: 'failed_terminal' as const, error: createOperationError('server_terminal', 'synthetic read failure') })),
    })
    const result = await hydrate(directDraft(), port)
    expect(result).toMatchObject({ state: 'blocked', issues: [expect.objectContaining({ code: 'catalog.read_failed' })] })
  })

  it('returns structured validation without catalog reads for an invalid local draft', async () => {
    const port = catalogPort()
    const invalid = directDraft(['procedure', 'material'], { group: group({ partDescription: '' }) })
    const result = await evaluateQuotationDraft({ draft: invalid, catalogContext: context, catalogRead: port })
    expect(result).toMatchObject({ state: 'blocked', validation: { state: 'blocked' } })
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'validation', code: 'group.description_required' })]))
    expect(port.listProcedures).not.toHaveBeenCalled()
  })
  // I3: one executable source-derived golden matrix. Every result is a
  // local, synthetic type-1 *candidate projection*, not R1 live parity or
  // authorization to send a quote / commercial Order command.
  describe('M1-I3 offline R1 pricing and Order contract golden matrix', () => {
    it('G1: preserves two repair-group IDs, quantities, category totals and field semantics in one bjProducts', async () => {
      const g1 = group({
        groupId: 'roof-zone',
        procedures: [{ selectionId: 'p-roof', kind: 'procedure', catalogId: procedureItem.id, label: procedureItem.name, quantity: 3 }],
        materials: [{ selectionId: 'm-roof', kind: 'material', catalogId: materialItem.id, label: materialItem.name, quantity: 2 }],
      })
      const g2 = group({
        groupId: 'bath-zone', repairParts: ['bath', 'wall'], partDescription: '独立区域',
        maintainAreaNum: '3.5',
        procedures: [{ selectionId: 'p-bath', kind: 'procedure', catalogId: procedureItem.id, label: procedureItem.name, quantity: 1 }],
        materials: [{ selectionId: 'm-bath', kind: 'material', catalogId: materialItem.id, label: materialItem.name, quantity: 4 }],
      })
      const draft: QuotationDraft = { ...createEmptyQuotationDraft('work-order-a', 'workflow-node-a'), groups: [g1, g2] }
      const result = await evaluateQuotationDraft({ draft, catalogContext: context, catalogRead: catalogPort() })
      expect(result.state).toBe('ready')
      expect(result.pricing).toMatchObject({
        calcTotalPrice: { originPrice: 67, totalPrice: 67 },
        fillOrder: { groups: [{ groupId: 'roof-zone', subtotal: 39 }, { groupId: 'bath-zone', subtotal: 28 }], orderListTotalAmount: 67 },
      })
      const products = JSON.parse(result.payload!.bjProducts) as {
        orderList: Array<{ repairParts: string[]; maintainAreaNum: string; partDescription: string; totalAmount: number;
          procedures: { totalAmount: number; data: Array<{ number: number; amount: number; totalAmount: number }> };
          materials: { totalAmount: number; data: Array<{ number: number; amount: number; totalAmount: number }> } }>
      }
      expect(products.orderList).toHaveLength(2)
      expect(products.orderList[0]).toMatchObject({ repairParts: ['roof', 'flat-roof'], totalAmount: 39,
        procedures: { totalAmount: 30, data: [{ number: 3, amount: 10, totalAmount: 30 }] },
        materials: { totalAmount: 9, data: [{ number: 2, amount: 4.5, totalAmount: 9 }] } })
      expect(products.orderList[1]).toMatchObject({ repairParts: ['bath', 'wall'], maintainAreaNum: '3.5',
        partDescription: '独立区域', totalAmount: 28,
        procedures: { totalAmount: 10, data: [{ number: 1, amount: 10, totalAmount: 10 }] },
        materials: { totalAmount: 18, data: [{ number: 4, amount: 4.5, totalAmount: 18 }] } })
    })

    it('G2: package positive material markup applies R1 minimum floor before per-row rounding', async () => {
      const port = catalogPort({ listPackages: vi.fn(async () => succeeded({
        items: [{ ...packageItem, minimumPrice: 350 }],
      })) })
      const result = await evaluateQuotationDraft({
        draft: packageDraft({ quantity: 3 }), catalogContext: context, catalogRead: port,
      })
      expect(result.state).toBe('ready')
      expect(result.pricing?.calcTotalPrice).toEqual({ originPrice: 350, totalPrice: 350 })
      const products = JSON.parse(result.payload!.bjProducts) as {
        orderList: Array<{ projPackages: { data: Array<{
          amount: number; markup: number; number: number; totalAmount: number;
          materialList: Array<{ number: number; exts: { price: number } }>
        }> } }>
      }
      expect(products.orderList[0].projPackages.data[0]).toMatchObject({
        amount: 107.5, markup: 7.5, number: 3, totalAmount: 350,
        materialList: [{ number: 1, exts: { price: 7.5 } }],
      })
      expect(result.payload?.discount).toBe(1)
      expect(result.payload?.preferentialAmount).toBe(0)
    })

    it('G3: procedure floor, measure fractional quantity, direct material price remain distinct categories', async () => {
      const port = catalogPort({
        listProcedures: vi.fn(async () => succeeded({ items: [{ ...procedureItem, minimumGuideTotalPrice: 30 }] })),
      })
      const result = await evaluateQuotationDraft({
        draft: directDraft(['procedure', 'material', 'measure'], { quantity: 2 }),
        catalogContext: context, catalogRead: port,
      })
      expect(result.state).toBe('ready')
      expect(result.pricing).toMatchObject({
        calcTotalPrice: { originPrice: 43.5, totalPrice: 43.5 },
        fillOrder: { groups: [{ categoryTotals: { procedure: 30, material: 9, measure: 4.5 }, subtotal: 43.5 }] },
      })
      const products = JSON.parse(result.payload!.bjProducts) as {
        orderList: Array<{ procedures: { data: Array<{ amount: number; totalAmount: number }> };
          materials: { data: Array<{ amount: number; totalAmount: number }> };
          measures: { data: Array<{ amount: number; totalAmount: number }> } }>
      }
      expect(products.orderList[0]).toMatchObject({
        procedures: { data: [{ amount: 10, totalAmount: 30 }] },
        materials: { data: [{ amount: 4.5, totalAmount: 9 }] },
        measures: { data: [{ amount: 2.25, totalAmount: 4.5 }] },
      })
    })

    it('G4: calcTotalPrice versus fillOrder two-decimal rounding MUST remain separate across groups', async () => {
      const first = group({
        groupId: 'round-a',
        procedures: [{ selectionId: 'rp1', kind: 'procedure', catalogId: procedureItem.id, label: procedureItem.name, quantity: 1 }],
        materials: [{ selectionId: 'rm1', kind: 'material', catalogId: materialItem.id, label: materialItem.name, quantity: 1 }],
      })
      const second = group({
        groupId: 'round-b',
        procedures: [{ selectionId: 'rp2', kind: 'procedure', catalogId: procedureItem.id, label: procedureItem.name, quantity: 2 }],
        materials: [{ selectionId: 'rm2', kind: 'material', catalogId: materialItem.id, label: materialItem.name, quantity: 2 }],
      })
      const port = catalogPort({
        listProcedures: vi.fn(async () => succeeded({ items: [{ ...procedureItem, guideUnitPrice: 0.335 }] })),
        listMaterials: vi.fn(async () => succeeded({ items: [{ ...materialItem, price: 0.335 }] })),
      })
      const result = await evaluateQuotationDraft({
        draft: { ...createEmptyQuotationDraft('work-order-a', 'workflow-node-a'), groups: [first, second] },
        catalogContext: context, catalogRead: port,
      })
      expect(result.state).toBe('ready')
      expect(result.pricing).toMatchObject({
        calcTotalPrice: { originPrice: 2.01, totalPrice: 2.01 },
        fillOrder: { groups: [{ subtotal: 0.68 }, { subtotal: 1.34 }], orderListTotalAmount: 2.02 },
      })
      expect(result.payload?.totalPrice).toBe(2.01)
      const bj = JSON.parse(result.payload!.bjProducts) as { orderList: Array<{ totalAmount: number }> }
      expect(bj.orderList.map(g => g.totalAmount)).toEqual([0.68, 1.34])
      // No hidden reconciliation to the top-level rounded amount.
      expect(bj.orderList.reduce((sum, g) => sum + g.totalAmount, 0)).toBe(2.02)
    })

    it('G5: ceil(package quantity × coefficient / specification) is a derived wire value, not stored in draft', async () => {
      const prepared = packageDraft({ quantity: 21 })
      const original = JSON.stringify(prepared)
      const result = await evaluateQuotationDraft({ draft: prepared, catalogContext: context, catalogRead: catalogPort() })
      expect(result.state).toBe('ready')
      const product = JSON.parse(result.payload!.bjProducts) as { orderList: Array<{
        projPackages: { data: Array<{ materialList: Array<{ number: number }> }> }
      }> }
      expect(product.orderList[0].projPackages.data[0].materialList[0].number).toBe(3)
      expect(JSON.stringify(prepared)).toBe(original)
      expect(result.payload?.type).toBe(1)
    })

    it('G6: local SPU/SKU has no price authority; the engine may not fabricate type-1 rows or a price', async () => {
      const port = catalogPort({ listMaterials: vi.fn(async () => succeeded({
        items: [{ ...materialItem, spuId: 'spu-real-shape' }],
      })) })
      const result = await evaluateQuotationDraft({
        draft: directDraft(['procedure', 'material']), catalogContext: context, catalogRead: port,
      })
      expect(result).toMatchObject({ state: 'blocked', issues: expect.arrayContaining([
        expect.objectContaining({ phase: 'pricing', code: 'pricing.material_sku_deferred' }),
      ]) })
      expect(result.payload).toBeUndefined()
      expect(JSON.stringify(result)).not.toMatch(/"skuCode":|"skus":/)
    })

    it('G7: explicit pricingMethod=1 blocks guessed package child SKU while preserving independent price diagnostics', async () => {
      const port = catalogPort({
        listPackages: vi.fn(async () => succeeded({ items: [{ ...packageItem, pricingMethod: '1' }] })),
      })
      const result = await evaluateQuotationDraft({
        draft: packageDraft({ quantity: 2 }), catalogContext: context, catalogRead: port,
      })
      expect(result.state).toBe('blocked')
      expect(result.pricing?.calcTotalPrice).toEqual({ originPrice: 215, totalPrice: 215 })
      expect(result.issues).toContainEqual(expect.objectContaining({
        phase: 'encoding', code: 'encoding.package_sku_path_not_authorized',
      }))
      expect(result.payload).toBeUndefined()
    })

    it('G8: missing price and untrusted component spec are independently fail-closed, never neutralized', async () => {
      const missingPrice = catalogPort({ listMaterials: vi.fn(async () => succeeded({
        items: [{ ...materialItem, price: undefined }],
      })) })
      const result = await evaluateQuotationDraft({
        draft: directDraft(['procedure', 'material']), catalogContext: context, catalogRead: missingPrice,
      })
      expect(result).toMatchObject({ state: 'blocked', issues: expect.arrayContaining([
        expect.objectContaining({ code: 'pricing.material_price_missing' }),
      ]) })
      expect(result.payload).toBeUndefined()
      const invalid = catalogPort({
        getPackageDetail: vi.fn(async () => succeeded(packageDetail({
          materials: [{ ...packageMaterialRow, coefficient: 0 }],
        }))),
      })
      const cannotEncode = await evaluateQuotationDraft({
        draft: packageDraft(), catalogContext: context, catalogRead: invalid,
      })
      expect(cannotEncode).toMatchObject({ state: 'blocked', issues: expect.arrayContaining([
        expect.objectContaining({ code: 'encoding.package_material_quantity_contract_invalid' }),
      ]) })
      expect(cannotEncode.payload).toBeUndefined()
    })

    it('G9: candidate Order envelope stays neutral and does not impersonate R1 quote type=0 or a submitted order', async () => {
      const port = catalogPort()
      const result = await evaluateQuotationDraft({
        draft: directDraft(), catalogContext: context, catalogRead: port,
        serviceAppointmentNum: '  LOCAL-TEST-ORDER  ',
      })
      expect(result.state).toBe('ready')
      expect(result.payload).toMatchObject({
        type: 1, serviceAppointmentId: 'work-order-a', productIds: '[]',
        discount: 1, otherAmount: 0, preferentialAmount: 0,
        exts: { serviceAppointmentNum: 'LOCAL-TEST-ORDER', coupons: '', couponsVal: 0,
          couponsName: '', isCreateBjdPDF: '1', serviceType: 'synthetic-service-type',
          sourceType: 'synthetic-source-type' },
      })
      const bj = JSON.parse(result.payload!.bjProducts) as {
        addItems: { totalAmount: number; data: unknown[] },
        deleteItems: { totalAmount: number; data: unknown[] }, otherItemsAmount: number,
        preferentialAmount: number,
      }
      expect(bj).toMatchObject({
        addItems: { totalAmount: 0, data: [] }, deleteItems: { totalAmount: 0, data: [] },
        otherItemsAmount: 0, preferentialAmount: 0,
      })
      expect(port).not.toHaveProperty('saveOrder')
      expect(port).not.toHaveProperty('completeWorkflow')
      // R1 placeOrders.vue quote() uses type:0; this is an *offline type-1
      // projection only*, not verified parity with the live R1 quote stage.
    })
  })

})
