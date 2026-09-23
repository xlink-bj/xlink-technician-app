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
    expect(outcome).toMatchObject({ state: 'succeeded', data: { groups: [{ selectionAmounts: [{ amount: 215 }] }] } })
  })

  it('19. applies the observed Package minimum-price floor at and below the boundary', async () => {
    const belowPort = catalogPort({ listPackages: vi.fn(async () => succeeded({ items: [{ ...packageItem, minimumPrice: 120 }] })) })
    const boundaryPort = catalogPort({ listPackages: vi.fn(async () => succeeded({ items: [{ ...packageItem, minimumPrice: 107.5 }] })) })
    const below = await pricingFor(packageDraft({ quantity: 1 }), belowPort)
    const atBoundary = await pricingFor(packageDraft({ quantity: 1 }), boundaryPort)
    expect(below).toMatchObject({ state: 'succeeded', data: { groups: [{ selectionAmounts: [{ amount: 120 }] }] } })
    expect(atBoundary).toMatchObject({ state: 'succeeded', data: { groups: [{ selectionAmounts: [{ amount: 107.5 }] }] } })
  })

  it('20. applies the Procedure minimum total when the guide-price product is below it', async () => {
    const lowMinimum = { ...procedureItem, guideUnitPrice: 10, minimumGuideTotalPrice: 30 }
    const port = catalogPort({ listProcedures: vi.fn(async () => succeeded({ items: [lowMinimum] })) })
    const outcome = await pricingFor(directDraft(['procedure', 'material'], { quantity: 2 }), port)
    expect(outcome.state).toBe('succeeded')
    if (outcome.state === 'succeeded') expect(outcome.data.groups[0].selectionAmounts[0].amount).toBe(30)
  })

  it('21. prices direct Material by its current catalog price and quantity', async () => {
    const outcome = await pricingFor(directDraft(['procedure', 'material'], { quantity: 2 }))
    expect(outcome).toMatchObject({ state: 'succeeded', data: { groups: [{ selectionAmounts: [{ amount: 20 }, { amount: 9 }] }] } })
  })

  it('22. prices Measure by guideUnitPrice and quantity', async () => {
    const outcome = await pricingFor(directDraft(['procedure', 'material', 'measure'], { quantity: 2 }))
    expect(outcome).toMatchObject({ state: 'succeeded', data: { groups: [{ selectionAmounts: [{ amount: 20 }, { amount: 9 }, { amount: 4.5 }] }] } })
  })

  it('23. aggregates multiple groups deterministically', async () => {
    const first = group({ groupId: 'group-a', procedures: [{ selectionId: 'p1', kind: 'procedure', catalogId: procedureItem.id, label: procedureItem.name, quantity: 1 }], materials: [{ selectionId: 'm1', kind: 'material', catalogId: materialItem.id, label: materialItem.name, quantity: 1 }] })
    const second = group({ groupId: 'group-b', procedures: [{ selectionId: 'p2', kind: 'procedure', catalogId: procedureItem.id, label: procedureItem.name, quantity: 2 }], materials: [{ selectionId: 'm2', kind: 'material', catalogId: materialItem.id, label: materialItem.name, quantity: 2 }] })
    const draft = {
      ...createEmptyQuotationDraft('work-order-a', 'workflow-node-a'),
      groups: [first, second],
    }
    const outcome = await pricingFor(draft)
    expect(outcome).toMatchObject({ state: 'succeeded', data: { groups: [{ subtotal: 14.5 }, { subtotal: 29 }], grossTotal: 43.5 } })
  })

  it('24. applies the R1 two-decimal toFixed behavior deterministically', () => {
    expect(r1AmountToFixed(1.005)).toBe(Number((1.005).toFixed(2)))
    expect(r1AmountToFixed(1.005)).toBe(1)
    expect(r1AmountToFixed(1.006)).toBe(1.01)
  })

  it('25. persists no provider commercial metadata in the v3 grouped draft', () => {
    const identity: ActionDraftIdentity = actionDraftIdentityFor({
      userId: asOpaqueId<'UserId'>('synthetic-user'),
      workOrderId: asOpaqueId<'WorkOrderId'>('work-order-a'),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>('workflow-node-a'),
      actionIntent: 'place_order',
      contentKind: 'quotation',
    })
    const record = quotationDraftRecordFor(identity, directDraft(), '2026-09-23T00:00:00.000Z')
    expect(record.values.schemaVersion).toBe(3)
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

  it('29. refuses to encode a hydrated draft with incomplete group readiness', () => {
    const invalid = {
      workOrderId: 'work-order-a', workflowNodeId: 'workflow-node-a', draftVersion: 1,
      groups: [{ group: group({ repairParts: [] }), selections: [] }],
    }
    const result = encodeR1OfficialOrderType1({
      draft: invalid,
      pricing: { groups: [{ groupId: 'group-a', selectionAmounts: [], categoryTotals: { package: 0, procedure: 0, material: 0, measure: 0 }, subtotal: 0 }], grossTotal: 0, displayGrossTotal: 0, rounding: 'r1_toFixed_2' },
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

  it('blocks SKU-based package and SPU/SKU-based direct material prices', async () => {
    const skuPackage = { ...packageItem, pricingMethod: '1' }
    const packagePort = catalogPort({ listPackages: vi.fn(async () => succeeded({ items: [skuPackage] })) })
    const packageResult = await pricingFor(packageDraft(), packagePort)
    expect(packageResult).toMatchObject({ state: 'blocked', issues: [expect.objectContaining({ code: 'pricing.package_sku_deferred' })] })

    const skuMaterial = { ...materialItem, spuId: 'synthetic-spu' }
    const materialPort = catalogPort({ listMaterials: vi.fn(async () => succeeded({ items: [skuMaterial] })) })
    const materialDraft = directDraft(['procedure', 'material'])
    const materialResult = await pricingFor(materialDraft, materialPort)
    expect(materialResult).toMatchObject({ state: 'blocked', issues: [expect.objectContaining({ code: 'pricing.material_sku_deferred' })] })
  })

  it('does not generate an encodable payload for configured Package materials with unapproved derived quantity', async () => {
    const result = await evaluateQuotationDraft({ draft: packageDraft(), catalogContext: context, catalogRead: catalogPort() })
    expect(result).toMatchObject({
      state: 'blocked',
      issues: [expect.objectContaining({ phase: 'encoding', code: 'encoding.package_material_quantity_not_authorized' })],
    })
    expect(result.payload).toBeUndefined()
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
})
