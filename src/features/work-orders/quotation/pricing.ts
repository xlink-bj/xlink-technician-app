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
  /** R1-compatible row total; minimum-price values retain source precision. */
  readonly amount: number
  /** Two-decimal display amount, matching R1 amountToFixed(). */
  readonly displayAmount: number
}

export interface QuotationGroupPricing {
  readonly groupId: string
  readonly selectionAmounts: readonly QuotationPricedSelection[]
  readonly categoryTotals: Readonly<Record<QuotationLineKind, number>>
  readonly subtotal: number
}

export interface QuotationPricingResult {
  readonly groups: readonly QuotationGroupPricing[]
  readonly grossTotal: number
  readonly displayGrossTotal: number
  readonly rounding: 'r1_toFixed_2'
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
  | { readonly state: 'succeeded'; readonly amount: number }
  | { readonly state: 'blocked'; readonly issue: QuotationPricingIssue } {
  const { quantity } = selection.selection
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { state: 'blocked', issue: issue('pricing.quantity_invalid', '数量无效，无法计算金额。', groupId, selection.selection.selectionId) }
  }
  switch (selection.kind) {
    case 'package': {
      if (!selection.item.pricingMethod) {
        return { state: 'blocked', issue: issue('pricing.package_method_unknown', '套餐计价方式未提供，无法确定适用的 R1 计价路径。', groupId, selection.selection.selectionId) }
      }
      if (selection.item.pricingMethod === '1') {
        return { state: 'blocked', issue: issue('pricing.package_sku_deferred', '此套餐使用 SKU 计价；SKU/SPU 能力尚未纳入本阶段。', groupId, selection.selection.selectionId) }
      }
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
      return { state: 'succeeded', amount: unrounded < minimum ? minimum : r1AmountToFixed(unrounded) }
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
      return { state: 'succeeded', amount: unrounded < (minimum ?? 0) ? minimum! : r1AmountToFixed(unrounded) }
    }
    case 'material': {
      if (selection.item.spuId) {
        return { state: 'blocked', issue: issue('pricing.material_sku_deferred', '此材料引用 SKU/SPU；SKU/SPU 能力尚未纳入本阶段。', groupId, selection.selection.selectionId) }
      }
      if (!safeMoney(selection.item.price)) {
        return { state: 'blocked', issue: issue('pricing.material_price_missing', '材料单价缺失或无效，不能按零价处理。', groupId, selection.selection.selectionId) }
      }
      const total = selection.item.price * quantity
      return Number.isFinite(total)
        ? { state: 'succeeded', amount: r1AmountToFixed(total) }
        : { state: 'blocked', issue: issue('pricing.material_total_invalid', '材料金额超出可计算范围。', groupId, selection.selection.selectionId) }
    }
    case 'measure': {
      if (!safeMoney(selection.item.guideUnitPrice)) {
        return { state: 'blocked', issue: issue('pricing.measure_price_missing', '机措指导单价缺失或无效。', groupId, selection.selection.selectionId) }
      }
      const total = selection.item.guideUnitPrice * quantity
      return Number.isFinite(total)
        ? { state: 'succeeded', amount: r1AmountToFixed(total) }
        : { state: 'blocked', issue: issue('pricing.measure_total_invalid', '机措金额超出可计算范围。', groupId, selection.selection.selectionId) }
    }
  }
}

function sumR1Category(values: readonly number[]): number {
  return r1AmountToFixed(values.reduce((sum, value) => sum + value, 0))
}

export function calculateQuotationPricing(draft: HydratedQuotationDraft): QuotationPricingOutcome {
  const issues: QuotationPricingIssue[] = []
  const groups: QuotationGroupPricing[] = []
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
      selectionAmounts.push({
        selectionId: selection.selection.selectionId,
        kind: selection.kind,
        amount: priced.amount,
        displayAmount: r1AmountToFixed(priced.amount),
      })
      categoryValues[selection.kind].push(priced.amount)
    }
    const categoryTotals: Record<QuotationLineKind, number> = {
      package: sumR1Category(categoryValues.package),
      procedure: sumR1Category(categoryValues.procedure),
      material: sumR1Category(categoryValues.material),
      measure: sumR1Category(categoryValues.measure),
    }
    const subtotal = r1AmountToFixed(Object.values(categoryTotals).reduce((sum, value) => sum + value, 0))
    groups.push({ groupId: hydratedGroup.group.groupId, selectionAmounts, categoryTotals, subtotal })
  }
  if (issues.length > 0) return { state: 'blocked', issues }
  const grossTotal = r1AmountToFixed(groups.reduce((sum, group) => sum + group.subtotal, 0))
  return {
    state: 'succeeded',
    data: { groups, grossTotal, displayGrossTotal: r1AmountToFixed(grossTotal), rounding: 'r1_toFixed_2' },
  }
}
