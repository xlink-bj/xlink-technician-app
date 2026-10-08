import type { QuotationEngineResult } from './engine'

export interface QuotationAmountPresentation {
  readonly label: string
  readonly value: string
}

/** A display-only projection of the current engine state; it never estimates an amount. */
export function quotationAmountPresentation(input: {
  readonly result: QuotationEngineResult | null
  readonly draftVersion: number | undefined
  readonly isLoading: boolean
}): QuotationAmountPresentation {
  const matchesDraft = input.result !== null
    && input.draftVersion !== undefined
    && input.result.draftVersion === input.draftVersion

  if (input.isLoading) return { label: '金额核验', value: '核验中…' }
  if (!matchesDraft || !input.result) return { label: '金额状态', value: '待核验' }
  if (input.result.pricing) {
    return {
      label: '本机金额预览',
      value: `¥${input.result.pricing.calcTotalPrice.totalPrice.toFixed(2)}`,
    }
  }
  return { label: '金额状态', value: '暂不可计算' }
}
