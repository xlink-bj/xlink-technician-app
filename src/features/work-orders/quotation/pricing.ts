import type { QuotationLineKind } from './model'
import type { HydratedQuotationDraft, HydratedQuotationSelection } from './hydration'

export interface QuotationPricingIssue {
  readonly code: string
  readonly message: string
  readonly groupId?: string
  readonly selectionId?: string
}

export interface QuotationPricedSelection {
  readonly selectionId: string
  readonly kind: QuotationLineKind
  /** Raw contribution accumulated by R1 calcTotalPrice() before its final top-level rounding. */
  readonly calcTotalPriceContribution: number
  /** Row total emitted by R1 fillOrder(); quantity-derived value is rounded per row except an applied minimum. */
  readonly fillOrderTotalAmount: number
  /** Source catalogue unit price for commercial display, when trustworthy. A package's composed or minimum price is deliberately excluded. */
  readonly catalogUnitPrice?: number
}

export interface QuotationGroupPricing {
  readonly groupId: string
  readonly selectionAmounts: readonly QuotationPricedSelection[]
  readonly categoryTotals: Readonly<Record<QuotationLineKind, number>>
  readonly subtotal: number
}

export interface QuotationPricingResult {
  /** calcTotalPrice() projection used by top-level Order originPrice/totalPrice. */
  readonly calcTotalPrice: {
    readonly originPrice: number
    readonly totalPrice: number
  }
  /** fillOrder() projection used exclusively to encode bjProducts rows and aggregates. */
  readonly fillOrder: {
    readonly groups: readonly QuotationGroupPricing[]
    readonly orderListTotalAmount: number
  }
  readonly rounding: 'r1_calcTotalPrice_and_fillOrder'
}

export type QuotationPricingOutcome =
  | { readonly state: 'succeeded'; readonly data: QuotationPricingResult }
  | { readonly state: 'blocked'; readonly issues: readonly QuotationPricingIssue[] }

function safeMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e21
}

/** Mirrors R1 amountToFixed(money): Number((+money).toFixed(2)), then zero fallback. */
export function r1AmountToFixed(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21 || value === 0) return 0
  const rounded = Number(value.toFixed(2))
  return Number.isFinite(rounded) ? rounded : 0
}

function issue(
  code: string,
  message: string,
  groupId: string,
  selectionId: string,
): QuotationPricingIssue {
  return { code, message, groupId, selectionId }
}

function selectionAmount(selection: HydratedQuotationSelection, groupId: string):
  | { readonly state: 'succeeded'; readonly calcTotalPriceContribution: number; readonly fillOrderTotalAmount: number }
  | { readonly state: 'blocked'; readonly issue: QuotationPricingIssue } {
  const { quantity } = selection.selection
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { state: 'blocked', issue: issue('pricing.quantity_invalid', '数量无效，无法计算金额。', groupId, selection.selection.selectionId) }
  }
  switch (selection.kind) {
    case 'package': {
      if (!safeMoney(selection.item.price)) {
        return { state: 'blocked', issue: issue('pricing.package_price_missing', '套餐基础价格缺失或无效。', groupId, selection.selection.selectionId) }
      }
      if (selection.item.minimumPrice !== undefined && !safeMoney(selection.item.minimumPrice)) {
        return { state: 'blocked', issue: issue('pricing.package_minimum_invalid', '套餐最低起算价无效。', groupId, selection.selection.selectionId) }
      }
      let markup = 0
      for (const row of selection.materials) {
        // R1 only adds package-material exts.price when it is > 0.
        if (row.price !== undefined && row.price > 0) markup += row.price
      }
      const unrounded = (selection.item.price + markup) * quantity
      if (!Number.isFinite(unrounded)) {
        return { state: 'blocked', issue: issue('pricing.package_total_invalid', '套餐金额超出可计算范围。', groupId, selection.selection.selectionId) }
      }
      const minimum = selection.item.minimumPrice ?? 0
      return {
        state: 'succeeded',
        calcTotalPriceContribution: unrounded < minimum ? minimum : unrounded,
        fillOrderTotalAmount: unrounded < minimum ? minimum : r1AmountToFixed(unrounded),
      }
    }
    case 'procedure': {
      const price = selection.item.guideUnitPrice
      const minimum = selection.item.minimumGuideTotalPrice
      if (!safeMoney(price)) {
        return { state: 'blocked', issue: issue('pricing.procedure_price_missing', '工序指导单价缺失或无效。', groupId, selection.selection.selectionId) }
      }
      if (minimum !== undefined && !safeMoney(minimum)) {
        return { state: 'blocked', issue: issue('pricing.procedure_minimum_invalid', '工序最低收费无效。', groupId, selection.selection.selectionId) }
      }
      const unrounded = price * quantity
      if (!Number.isFinite(unrounded)) {
        return { state: 'blocked', issue: issue('pricing.procedure_total_invalid', '工序金额超出可计算范围。', groupId, selection.selection.selectionId) }
      }
      return {
        state: 'succeeded',
        calcTotalPriceContribution: unrounded < (minimum ?? 0) ? minimum! : unrounded,
        fillOrderTotalAmount: unrounded < (minimum ?? 0) ? minimum! : r1AmountToFixed(unrounded),
      }
    }
    case 'material': {
      if (selection.selection.skuChoices?.length) {
        const variants = selection.skuVariants ?? []
        let contribution = 0
        let fillOrderTotalAmount = 0
        for (const choice of selection.selection.skuChoices) {
          const matches = variants.filter(variant => variant.id === choice.skuId
            && variant.spuId === selection.item.id)
          const price = matches[0]?.price
          if (matches.length !== 1 || typeof price !== 'number' || !safeMoney(price) || price <= 0
            || !Number.isSafeInteger(choice.quantity) || choice.quantity <= 0) {
            return { state: 'blocked', issue: issue('pricing.material_sku_price_unverified',
              '已选 SKU 身份、单价或数量未能从当前 R1 目录唯一核验。', groupId, selection.selection.selectionId) }
          }
          const rowTotal = price * choice.quantity
          if (!Number.isFinite(rowTotal)) {
            return { state: 'blocked', issue: issue('pricing.material_sku_total_invalid',
              'SKU 金额超出可计算范围。', groupId, selection.selection.selectionId) }
          }
          // R1 calcTotalPrice sums unrounded SKU price × quantity then rounds
          // the top-level origin; fillOrder rounds each SKU row independently.
          contribution += rowTotal
          fillOrderTotalAmount += r1AmountToFixed(rowTotal)
        }
        return Number.isFinite(contribution) && Number.isFinite(fillOrderTotalAmount)
          ? { state: 'succeeded', calcTotalPriceContribution: contribution, fillOrderTotalAmount }
          : { state: 'blocked', issue: issue('pricing.material_sku_total_invalid',
            'SKU 汇总金额超出可计算范围。', groupId, selection.selection.selectionId) }
      }
      if (selection.item.spuId || Object.keys(selection.item.saleOptionCandidates ?? {}).length > 0) {
        return { state: 'blocked', issue: issue('pricing.material_sku_selection_required',
          '此材料使用 SKU 规格计价；请先完成精确规格与数量选择。', groupId, selection.selection.selectionId) }
      }
      if (!safeMoney(selection.item.price)) {
        return { state: 'blocked', issue: issue('pricing.material_price_missing', '材料单价缺失或无效，不能按零价处理。', groupId, selection.selection.selectionId) }
      }
      const total = selection.item.price * quantity
      return Number.isFinite(total)
        ? { state: 'succeeded', calcTotalPriceContribution: total, fillOrderTotalAmount: r1AmountToFixed(total) }
        : { state: 'blocked', issue: issue('pricing.material_total_invalid', '材料金额超出可计算范围。', groupId, selection.selection.selectionId) }
    }
    case 'measure': {
      if (!safeMoney(selection.item.guideUnitPrice)) {
        return { state: 'blocked', issue: issue('pricing.measure_price_missing', '机措指导单价缺失或无效。', groupId, selection.selection.selectionId) }
      }
      const total = selection.item.guideUnitPrice * quantity
      return Number.isFinite(total)
        ? { state: 'succeeded', calcTotalPriceContribution: total, fillOrderTotalAmount: r1AmountToFixed(total) }
        : { state: 'blocked', issue: issue('pricing.measure_total_invalid', '机措金额超出可计算范围。', groupId, selection.selection.selectionId) }
    }
  }
}

export function calculateQuotationPricing(draft: HydratedQuotationDraft): QuotationPricingOutcome {
  const issues: QuotationPricingIssue[] = []
  const groups: QuotationGroupPricing[] = []
  let calcTotalPriceContribution = 0
  for (const hydratedGroup of draft.groups) {
    const selectionAmounts: QuotationPricedSelection[] = []
    const categoryValues: Record<QuotationLineKind, number[]> = {
      package: [], procedure: [], material: [], measure: [],
    }
    for (const selection of hydratedGroup.selections) {
      const priced = selectionAmount(selection, hydratedGroup.group.groupId)
      if (priced.state === 'blocked') {
        issues.push(priced.issue)
        continue
      }
      calcTotalPriceContribution += priced.calcTotalPriceContribution
      const sourceUnitPrice = selection.kind === 'material'
        ? selection.item.price
        : selection.kind === 'procedure' || selection.kind === 'measure'
          ? selection.item.guideUnitPrice
          : undefined
      selectionAmounts.push({
        selectionId: selection.selection.selectionId,
        kind: selection.kind,
        calcTotalPriceContribution: priced.calcTotalPriceContribution,
        fillOrderTotalAmount: priced.fillOrderTotalAmount,
        ...(typeof sourceUnitPrice === 'number' && Number.isFinite(sourceUnitPrice)
          ? { catalogUnitPrice: sourceUnitPrice } : {}),
      })
      categoryValues[selection.kind].push(priced.fillOrderTotalAmount)
    }
    const packageSum = categoryValues.package.reduce((sum, value) => sum + value, 0)
    const procedureSum = categoryValues.procedure.reduce((sum, value) => sum + value, 0)
    const categoryTotals: Record<QuotationLineKind, number> = {
      package: r1AmountToFixed(packageSum),
      procedure: r1AmountToFixed(procedureSum),
      // R1's fillOrder accumulates row-rounded totals here without another category rounding pass.
      material: categoryValues.material.reduce((sum, value) => sum + value, 0),
      measure: categoryValues.measure.reduce((sum, value) => sum + value, 0),
    }
    // R1 sums category totals for a group without an additional group rounding pass.
    const subtotal = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0)
    groups.push({ groupId: hydratedGroup.group.groupId, selectionAmounts, categoryTotals, subtotal })
  }
  if (issues.length > 0) return { state: 'blocked', issues }
  const originPrice = r1AmountToFixed(calcTotalPriceContribution)
  // With no discount/coupon/preferential inputs in this phase, R1's subsequent neutral
  // totalPrice steps preserve the already-rounded originPrice.
  const totalPrice = originPrice
  const orderListTotalAmount = groups.reduce((sum, group) => sum + group.subtotal, 0)
  return {
    state: 'succeeded',
    data: {
      calcTotalPrice: { originPrice, totalPrice },
      fillOrder: { groups, orderListTotalAmount },
      rounding: 'r1_calcTotalPrice_and_fillOrder',
    },
  }
}
