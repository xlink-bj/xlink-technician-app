import type { CodeOptionRead, QuotationCatalogContext } from '@shared/ports'

import type { HydratedQuotationDraft, HydratedQuotationSelection } from './hydration'
import { calculateQuotationPricing, type QuotationPricingResult } from './pricing'
import { validateQuotationDraft } from './validation'

export interface R1OfficialOrderType1Payload {
  readonly type: 1
  readonly serviceAppointmentId: string
  readonly productIds: '[]'
  readonly bjProducts: string
  readonly originPrice: number
  readonly totalPrice: number
  readonly discount: 1
  readonly otherAmount: 0
  readonly preferentialAmount: 0
  readonly exts: {
    readonly serviceAppointmentNum?: string
    readonly serviceType: string
    readonly sourceType?: string
    readonly coupons: ''
    readonly couponsVal: 0
    readonly couponsName: ''
  }
}

export interface QuotationEncodingIssue {
  readonly code: string
  readonly message: string
  readonly groupId?: string
  readonly selectionId?: string
}

export type QuotationEncodingResult =
  | { readonly state: 'ready'; readonly payload: R1OfficialOrderType1Payload }
  | { readonly state: 'blocked'; readonly issues: readonly QuotationEncodingIssue[] }

function labelPath(options: readonly CodeOptionRead[], path: readonly string[]): string | undefined {
  let level = options
  const labels: string[] = []
  for (const value of path) {
    const option = level.find((candidate) => candidate.value === value)
    if (!option) return undefined
    labels.push(option.label)
    level = option.children ?? []
  }
  return labels.length === path.length && labels.length > 0 ? labels.join(' / ') : undefined
}

function pricedAmount(pricing: QuotationPricingResult, selectionId: string): number | undefined {
  for (const group of pricing.groups) {
    const row = group.selectionAmounts.find((selection) => selection.selectionId === selectionId)
    if (row) return row.amount
  }
  return undefined
}

function packageMaterialQuantityIssue(selection: Extract<HydratedQuotationSelection, { kind: 'package' }>, groupId: string): QuotationEncodingIssue | null {
  if (selection.materials.length === 0) return null
  // R1's active fillOrder derives these quantities from package quantity,
  // coefficient and material.spec. Phase 1H explicitly does not authorize
  // implementing that calculation, so a complete Order payload cannot be emitted.
  return {
    code: 'encoding.package_material_quantity_not_authorized',
    message: '套餐材料用量依赖 R1 的系数/规格推导；该计算未获本阶段授权，不能生成完整订单载荷。',
    groupId,
    selectionId: selection.selection.selectionId,
  }
}

function componentProcedureFor(
  row: Extract<HydratedQuotationSelection, { kind: 'package' }>['procedures'][number],
) {
  const item = row.item!
  return {
    ...(row.id ? { _id: row.id } : {}),
    procedure: {
      _id: item.id,
      name: item.name,
      content: item.name,
      ...(item.description ? { desc: item.description } : {}),
      ...(row.unit || item.unit ? { unit: row.unit || item.unit } : {}),
    },
  }
}

function componentMeasureFor(
  row: Extract<HydratedQuotationSelection, { kind: 'package' }>['measures'][number],
) {
  const item = row.item!
  return {
    ...(row.id ? { _id: row.id } : {}),
    measure: {
      _id: item.id,
      name: item.name,
      content: item.name,
      ...(item.description ? { desc: item.description } : {}),
      ...(row.unit || item.unit ? { unit: row.unit || item.unit } : {}),
      ...(item.guideUnitPrice === undefined ? {} : { guideUnitPrice: item.guideUnitPrice }),
    },
  }
}

function directSelectionFor(
  selection: Exclude<HydratedQuotationSelection, { kind: 'package' }>,
  amount: number,
) {
  const common = {
    _id: selection.item.id,
    name: selection.item.name,
    ...(selection.item.unit ? { unit: selection.item.unit } : {}),
    number: selection.selection.quantity,
    amount: selection.kind === 'material' ? selection.item.price : selection.kind === 'procedure' || selection.kind === 'measure'
      ? selection.item.guideUnitPrice
      : amount,
    totalAmount: amount,
  }
  switch (selection.kind) {
    case 'procedure':
      return {
        ...common,
        content: selection.item.name,
        ...(selection.item.description ? { describe: selection.item.description, desc: selection.item.description } : {}),
        guideUnitPrice: selection.item.guideUnitPrice,
        ...(selection.item.minimumGuideTotalPrice === undefined ? {} : { minimumGuideTotalPrice: selection.item.minimumGuideTotalPrice }),
      }
    case 'material':
      return {
        ...common,
        price: selection.item.price,
        ...(selection.item.code ? { code: selection.item.code } : {}),
        ...(selection.item.materialUnit ? { materialUnit: selection.item.materialUnit } : {}),
        ...(selection.item.specification ? { spec: selection.item.specification } : {}),
        ...(selection.item.specUnit ? { specUnit: selection.item.specUnit } : {}),
      }
    case 'measure':
      return {
        ...common,
        content: selection.item.name,
        ...(selection.item.description ? { describe: selection.item.description, desc: selection.item.description } : {}),
        guideUnitPrice: selection.item.guideUnitPrice,
      }
  }
}

function validateHydratedDraft(draft: HydratedQuotationDraft) {
  return validateQuotationDraft({
    workOrderId: draft.workOrderId,
    workflowNodeId: draft.workflowNodeId,
    draftVersion: draft.draftVersion,
    groups: draft.groups.map((hydratedGroup) => ({
      ...hydratedGroup.group,
      projPackages: hydratedGroup.selections.flatMap((selection) =>
        selection.kind === 'package' ? [selection.selection] : []),
      procedures: hydratedGroup.selections.flatMap((selection) =>
        selection.kind === 'procedure' ? [selection.selection] : []),
      materials: hydratedGroup.selections.flatMap((selection) =>
        selection.kind === 'material' ? [selection.selection] : []),
      measures: hydratedGroup.selections.flatMap((selection) =>
        selection.kind === 'measure' ? [selection.selection] : []),
    })),
  })
}

function validatePricingCompleteness(draft: HydratedQuotationDraft, pricing: QuotationPricingResult): boolean {
  if (!Number.isFinite(pricing.grossTotal) || pricing.grossTotal < 0) return false
  const recomputed = calculateQuotationPricing(draft)
  if (recomputed.state !== 'succeeded') return false
  return JSON.stringify(recomputed.data) === JSON.stringify(pricing)
}

export function encodeR1OfficialOrderType1(input: {
  readonly draft: HydratedQuotationDraft
  readonly pricing: QuotationPricingResult
  readonly catalogContext: QuotationCatalogContext
  readonly serviceAppointmentNum?: string
  readonly repairPartOptions?: readonly CodeOptionRead[]
}): QuotationEncodingResult {
  const issues: QuotationEncodingIssue[] = []
  if (!input.catalogContext.serviceType.trim()) {
    issues.push({ code: 'encoding.catalog_context_missing', message: '缺少当前工单目录适用范围，不能生成订单结构。' })
  }
  const validation = validateHydratedDraft(input.draft)
  for (const problem of validation.issues) {
    issues.push({
      code: `encoding.${problem.code}`,
      message: problem.message,
      ...(problem.groupId ? { groupId: problem.groupId } : {}),
      ...(problem.selectionId ? { selectionId: problem.selectionId } : {}),
    })
  }
  if (!validatePricingCompleteness(input.draft, input.pricing)) {
    issues.push({ code: 'encoding.pricing_incomplete', message: '报价金额与当前分组明细不完整或不一致，不能生成订单结构。' })
  }
  if (issues.length > 0) return { state: 'blocked', issues }

  const groupPricingById = new Map(input.pricing.groups.map((group) => [group.groupId, group]))
  const orderList = [] as Array<Record<string, unknown>>

  for (const hydratedGroup of input.draft.groups) {
    const { group } = hydratedGroup
    const groupPricing = groupPricingById.get(group.groupId)
    if (!groupPricing) {
      issues.push({ code: 'encoding.group_price_missing', message: '维修部位组缺少已核对的金额。', groupId: group.groupId })
      continue
    }
    for (const selection of hydratedGroup.selections) {
      if (selection.kind === 'package') {
        const blocker = packageMaterialQuantityIssue(selection, group.groupId)
        if (blocker) issues.push(blocker)
      }
    }
    const categoryData = {
      package: [] as unknown[],
      procedure: [] as unknown[],
      material: [] as unknown[],
      measure: [] as unknown[],
    }
    for (const selection of hydratedGroup.selections) {
      const amount = pricedAmount(input.pricing, selection.selection.selectionId)
      if (amount === undefined) {
        issues.push({ code: 'encoding.selection_price_missing', message: '目录项缺少已核对金额。', groupId: group.groupId, selectionId: selection.selection.selectionId })
        continue
      }
      if (selection.kind === 'package') {
        const configuration = selection.selection.configuration
        if (!configuration) {
          issues.push({ code: 'encoding.package_configuration_missing', message: '套餐配置未完成。', groupId: group.groupId, selectionId: selection.selection.selectionId })
          continue
        }
        if (selection.item.price === undefined) {
          issues.push({ code: 'encoding.package_price_missing', message: '套餐基础价格缺失，不能生成订单结构。', groupId: group.groupId, selectionId: selection.selection.selectionId })
          continue
        }
        const markup = selection.materials.reduce((sum, row) =>
          row.price !== undefined && row.price > 0 ? sum + row.price : sum, 0)
        const unitAmount = selection.item.price + markup
        categoryData.package.push({
          _id: selection.item.id,
          name: selection.item.name,
          type: selection.item.type,
          price: selection.item.price,
          amount: unitAmount,
          markup,
          unit: selection.item.unit,
          minimumPrice: selection.item.minimumPrice,
          number: selection.selection.quantity,
          totalAmount: amount,
          procedureList: selection.procedures.map(componentProcedureFor),
          measureList: selection.measures.map(componentMeasureFor),
          materialList: selection.materials.map((row) => ({
            ...(row.id ? { _id: row.id } : {}),
            materialId: row.item!.id,
            coefficient: row.coefficient,
            coefficientUnit: row.coefficientUnit,
            material: {
              _id: row.item!.id,
              name: row.item!.name,
              code: row.item!.code,
              spec: row.item!.specification,
              materialUnit: row.item!.materialUnit,
              unit: row.item!.unit,
              specUnit: row.item!.specUnit,
              price: row.item!.price,
            },
            exts: {
              ...(row.price === undefined ? {} : { price: row.price }),
              layer: row.layer,
            },
            checked: true,
          })),
          exts: {
            ...(selection.item.pricingMethod ? { pricingMethod: selection.item.pricingMethod } : {}),
          },
        })
      } else {
        categoryData[selection.kind].push(directSelectionFor(selection, amount))
      }
    }
    const categoryTotals = groupPricing.categoryTotals
    const constructionLocation = input.repairPartOptions
      ? labelPath(input.repairPartOptions, group.repairParts)
      : undefined
    orderList.push({
      repairParts: [...group.repairParts],
      ...(constructionLocation ? { constructionLocation } : {}),
      partDescription: group.partDescription,
      maintainAreaNum: group.maintainAreaNum,
      projPackages: { totalAmount: categoryTotals.package, data: categoryData.package },
      procedures: { totalAmount: categoryTotals.procedure, data: categoryData.procedure },
      materials: { totalAmount: categoryTotals.material, data: categoryData.material },
      measures: { totalAmount: categoryTotals.measure, data: categoryData.measure },
      totalAmount: groupPricing.subtotal,
    })
  }
  if (issues.length > 0) return { state: 'blocked', issues }

  const bjProducts = {
    orderList,
    addItems: { totalAmount: 0, data: [] },
    deleteItems: { totalAmount: 0, data: [] },
    otherItemsAmount: 0,
    preferentialAmount: 0,
  }
  const total = input.pricing.grossTotal
  return {
    state: 'ready',
    payload: {
      type: 1,
      serviceAppointmentId: input.draft.workOrderId,
      productIds: '[]',
      bjProducts: JSON.stringify(bjProducts),
      originPrice: total,
      totalPrice: total,
      discount: 1,
      otherAmount: 0,
      preferentialAmount: 0,
      exts: {
        ...(input.serviceAppointmentNum?.trim() ? { serviceAppointmentNum: input.serviceAppointmentNum.trim() } : {}),
        serviceType: input.catalogContext.serviceType,
        ...(input.catalogContext.sourceType ? { sourceType: input.catalogContext.sourceType } : {}),
        coupons: '',
        couponsVal: 0,
        couponsName: '',
      },
    },
  }
}
