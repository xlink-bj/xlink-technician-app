export const QUOTATION_LINE_KINDS = ['package', 'procedure', 'material', 'measure'] as const

export type QuotationLineKind = typeof QUOTATION_LINE_KINDS[number]

/** Direct catalog selections authorized for the Phase 1F local composition bridge. */
export const QUOTATION_DIRECT_CATALOG_KINDS = ['procedure', 'material', 'measure'] as const
export type QuotationDirectCatalogKind = typeof QUOTATION_DIRECT_CATALOG_KINDS[number]

export function isDirectQuotationCatalogKind(kind: string): kind is QuotationDirectCatalogKind {
  return (QUOTATION_DIRECT_CATALOG_KINDS as readonly string[]).includes(kind)
}

/** SKU evidence is LOCAL DRAFT ONLY. R1 records per-SKU number under a material
 * SPU; SKU 金额、Order 编码和工作流写入均不在本阶段范围。
 */
export interface QuotationMaterialSkuChoice {
  readonly skuId: string
  readonly quantity: number
  readonly attributes: Readonly<Record<string, string>>
}

/** Local selection only; it is not a persisted/backend quotation row. */
export interface QuotationSelection<K extends QuotationLineKind = QuotationLineKind> {
  readonly selectionId: string
  readonly kind: K
  readonly catalogId: string
  readonly label: string
  readonly unit?: string
  readonly quantity: number
  /** Local per-SKU intent, excluded from official Order and monetary calculation. */
  readonly skuChoices?: K extends 'material' ? readonly QuotationMaterialSkuChoice[] : never
  readonly configuration?: K extends 'package' ? QuotationPackageConfiguration : never
}

export interface QuotationConfiguredPackageComponent {
  /** Package-detail child-body identity, preserved only when supplied. */
  readonly providerComponentId?: string
  /** Package-detail referenced provider identity, preserved only when supplied. */
  readonly providerReferenceId?: string
  readonly catalogId: string
  readonly label: string
  readonly unit?: string
}

export interface QuotationConfiguredPackageMaterial extends QuotationConfiguredPackageComponent {
  /** Raw provider layer is kept unchanged; Package choice grouping follows R1 Number(layer). */
  readonly layer: string | number
}

export interface QuotationPackageConfiguration {
  readonly procedures: readonly QuotationConfiguredPackageComponent[]
  readonly materials: readonly QuotationConfiguredPackageMaterial[]
  readonly measures: readonly QuotationConfiguredPackageComponent[]
}

/** Missing configuration is reserved for losslessly restored schema-v2 rows. */
export type QuotationPackageSelection = QuotationSelection<'package'>
export type QuotationProcedureSelection = QuotationSelection<'procedure'>
export type QuotationMaterialSelection = QuotationSelection<'material'>
export type QuotationMeasureSelection = QuotationSelection<'measure'>

/** R1-shaped local repair/service-part context, without monetary totals or write semantics. */
export interface QuotationGroup {
  readonly groupId: string
  /** Raw cascade value path; it is independent of Survey form values. */
  readonly repairParts: readonly string[]
  readonly partDescription: string
  /** R1 stores maintainAreaNum as text; keep it textual and do not calculate with it. */
  readonly maintainAreaNum: string
  readonly projPackages: readonly QuotationPackageSelection[]
  readonly procedures: readonly QuotationProcedureSelection[]
  readonly materials: readonly QuotationMaterialSelection[]
  readonly measures: readonly QuotationMeasureSelection[]
}

/** Local recovery state scoped to a single place_order workflow node. */
export interface QuotationDraft {
  readonly workOrderId: string
  readonly workflowNodeId: string
  /** Monotonic client-local edit generation; never a server revision. */
  readonly draftVersion: number
  readonly groups: readonly QuotationGroup[]
}

export interface QuotationCatalogItem {
  readonly catalogId: string
  readonly kind: QuotationLineKind
  readonly label: string
  readonly unit?: string
}

export interface QuotationGroupContext {
  readonly repairParts?: readonly string[]
  readonly partDescription?: string
  readonly maintainAreaNum?: string
}

export type QuotationQuantityResult =
  | { readonly valid: true; readonly value: number }
  | { readonly valid: false; readonly message: string }

export function createEmptyQuotationDraft(workOrderId: string, workflowNodeId: string): QuotationDraft {
  return { workOrderId, workflowNodeId, draftVersion: 1, groups: [] }
}

export function createQuotationGroup(groupId: string, context: QuotationGroupContext = {}): QuotationGroup {
  return {
    groupId,
    repairParts: [...(context.repairParts ?? [])],
    partDescription: context.partDescription ?? '',
    maintainAreaNum: context.maintainAreaNum ?? '',
    projPackages: [],
    procedures: [],
    materials: [],
    measures: [],
  }
}

export function quotationSelectionsFor(group: QuotationGroup, kind: QuotationLineKind): readonly QuotationSelection[] {
  switch (kind) {
    case 'package': return group.projPackages
    case 'procedure': return group.procedures
    case 'material': return group.materials
    case 'measure': return group.measures
  }
}

function selectionsForKind<K extends QuotationLineKind>(group: QuotationGroup, kind: K): readonly QuotationSelection<K>[] {
  return quotationSelectionsFor(group, kind) as readonly QuotationSelection<K>[]
}

function withSelections(
  group: QuotationGroup,
  kind: QuotationLineKind,
  selections: readonly QuotationSelection[],
): QuotationGroup {
  switch (kind) {
    case 'package': return { ...group, projPackages: selections as readonly QuotationPackageSelection[] }
    case 'procedure': return { ...group, procedures: selections as readonly QuotationProcedureSelection[] }
    case 'material': return { ...group, materials: selections as readonly QuotationMaterialSelection[] }
    case 'measure': return { ...group, measures: selections as readonly QuotationMeasureSelection[] }
  }
}

function updateGroup(draft: QuotationDraft, groupId: string, update: (group: QuotationGroup) => QuotationGroup): QuotationDraft {
  let changed = false
  const groups = draft.groups.map((group) => {
    if (group.groupId !== groupId) return group
    const next = update(group)
    if (next !== group) changed = true
    return next
  })
  return changed ? { ...draft, draftVersion: draft.draftVersion + 1, groups } : draft
}

export function appendQuotationGroup(draft: QuotationDraft, group: QuotationGroup): QuotationDraft {
  if (draft.groups.some((existing) => existing.groupId === group.groupId)) return draft
  return { ...draft, draftVersion: draft.draftVersion + 1, groups: [...draft.groups, group] }
}

export function updateQuotationGroupContext(
  draft: QuotationDraft,
  groupId: string,
  context: QuotationGroupContext,
): QuotationDraft {
  return updateGroup(draft, groupId, (group) => {
    const repairParts = context.repairParts === undefined ? group.repairParts : [...context.repairParts]
    const sameRepairParts = repairParts.length === group.repairParts.length
      && repairParts.every((value, index) => value === group.repairParts[index])
    const next = {
      ...group,
      repairParts,
      ...(context.partDescription === undefined ? {} : { partDescription: context.partDescription }),
      ...(context.maintainAreaNum === undefined ? {} : { maintainAreaNum: context.maintainAreaNum }),
    }
    return sameRepairParts
      && next.partDescription === group.partDescription
      && next.maintainAreaNum === group.maintainAreaNum
      ? group
      : next
  })
}

export function parseQuotationQuantity(input: string): QuotationQuantityResult {
  const normalized = input.trim()
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return { valid: false, message: '请输入大于 0 的数量' }
  }
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0
    ? { valid: true, value }
    : { valid: false, message: '请输入大于 0 的数量' }
}

export function appendQuotationSelection(
  draft: QuotationDraft,
  groupId: string,
  item: QuotationCatalogItem,
  selectionId: string,
): QuotationDraft {
  return updateGroup(draft, groupId, (group) => {
    const selection: QuotationSelection = {
      selectionId,
      kind: item.kind,
      catalogId: item.catalogId,
      label: item.label,
      ...(item.unit ? { unit: item.unit } : {}),
      quantity: 1,
    }
    return withSelections(group, item.kind, [...selectionsForKind(group, item.kind), selection])
  })
}

export function upsertQuotationPackageSelection(
  draft: QuotationDraft,
  groupId: string,
  input: {
    readonly catalogId: string
    readonly label: string
    readonly unit?: string
    readonly configuration: QuotationPackageConfiguration
    readonly selectionId: string
    readonly initialQuantity: number
  },
): QuotationDraft {
  return updateGroup(draft, groupId, (group) => {
    const existingIndex = group.projPackages.findIndex((selection) => selection.catalogId === input.catalogId)
    const existing = existingIndex < 0 ? undefined : group.projPackages[existingIndex]
    const next: QuotationPackageSelection = {
      selectionId: existing?.selectionId ?? input.selectionId,
      kind: 'package',
      catalogId: input.catalogId,
      label: input.label,
      ...(input.unit ? { unit: input.unit } : {}),
      quantity: existing?.quantity ?? input.initialQuantity,
      configuration: input.configuration,
    }
    if (existing && JSON.stringify(existing) === JSON.stringify(next)) return group
    const projPackages = existingIndex < 0
      ? [...group.projPackages, next]
      : group.projPackages.map((selection, index) => index === existingIndex ? next : selection)
    return { ...group, projPackages }
  })
}

/** Updates one SKU amount for one already-added SPU in one local repair group.
 * R1 aggregates SPU.number = sum(sku.number). This does NOT establish commercial Order authority.
 * Returning the same object means the caller must report a validation failure.
 */
export function upsertLocalQuotationMaterialSkuChoice(
  draft: QuotationDraft,
  groupId: string,
  materialId: string,
  input: QuotationMaterialSkuChoice,
): QuotationDraft {
  if (!materialId.trim() || !input.skuId.trim() || !Number.isSafeInteger(input.quantity)
    || input.quantity < 1 || input.quantity > 9999
    || !input.attributes || !Object.keys(input.attributes).length
    || Object.keys(input.attributes).length > 30
    || Object.entries(input.attributes).some(([key, value]) =>
      !key.trim() || ['__proto__', 'constructor', 'prototype'].includes(key)
      || typeof value !== 'string' || !value.trim())) return draft
  return updateGroup(draft, groupId, group => {
    const materialMatches = group.materials.filter(selection => selection.catalogId === materialId)
    if (materialMatches.length !== 1) return group
    const existing = materialMatches[0]!
    const choices = existing.skuChoices ?? []
    const prior = choices.find(choice => choice.skuId === input.skuId)
    if (prior && JSON.stringify(prior.attributes) !== JSON.stringify(input.attributes)) return group
    if (choices.some(choice => choice.skuId !== input.skuId
      && Object.keys(choice.attributes).length === Object.keys(input.attributes).length
      && Object.entries(input.attributes).every(([k, v]) => choice.attributes[k] === v))) return group
    const nextChoices = prior
      ? choices.map(choice => choice.skuId === input.skuId ? { ...input, attributes: { ...input.attributes } } : choice)
      : [...choices, { ...input, attributes: { ...input.attributes } }]
    if (nextChoices.length > 50) return group
    const total = nextChoices.reduce((sum, choice) => sum + choice.quantity, 0)
    if (!Number.isSafeInteger(total) || total > 99999) return group
    if (prior && JSON.stringify(prior) === JSON.stringify(input)) return group
    return { ...group, materials: group.materials.map(selection => selection.catalogId === materialId
      ? { ...selection, skuChoices: nextChoices, quantity: total }
      : selection) }
  })
}

export function changeQuotationSelectionQuantity(
  draft: QuotationDraft,
  groupId: string,
  selectionId: string,
  quantity: number,
): QuotationDraft {
  return updateGroup(draft, groupId, (group) => {
    for (const kind of QUOTATION_LINE_KINDS) {
      const current = selectionsForKind(group, kind)
      const selections = current.map((selection) => selection.selectionId === selectionId
        ? { ...selection, quantity }
        : selection)
      if (selections.some((selection, index) => selection !== current[index])) {
        return withSelections(group, kind, selections)
      }
    }
    return group
  })
}

export function removeQuotationSelection(draft: QuotationDraft, groupId: string, selectionId: string): QuotationDraft {
  return updateGroup(draft, groupId, (group) => {
    for (const kind of QUOTATION_LINE_KINDS) {
      const current = selectionsForKind(group, kind)
      const selections = current.filter((selection) => selection.selectionId !== selectionId)
      if (selections.length !== current.length) return withSelections(group, kind, selections)
    }
    return group
  })
}
