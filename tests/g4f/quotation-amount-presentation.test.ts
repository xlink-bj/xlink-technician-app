import { describe, expect, it } from 'vitest'

import { quotationAmountPresentation } from '@features/work-orders/quotation/amount-presentation'
import type { QuotationEngineResult } from '@features/work-orders/quotation/engine'

function engineResult(overrides: Partial<QuotationEngineResult> = {}): QuotationEngineResult {
  return {
    state: 'blocked',
    draftVersion: 4,
    validation: { state: 'blocked', issues: [] },
    issues: [],
    ...overrides,
  }
}

describe('quotationAmountPresentation', () => {
  it('does not show a stale engine result for a newer draft', () => {
    expect(quotationAmountPresentation({
      result: engineResult(),
      draftVersion: 5,
      isLoading: false,
    })).toEqual({ label: '金额状态', value: '待核验' })
  })

  it('distinguishes active verification and blocked calculation without inventing a price', () => {
    expect(quotationAmountPresentation({ result: null, draftVersion: 4, isLoading: true }))
      .toEqual({ label: '金额核验', value: '核验中…' })
    expect(quotationAmountPresentation({ result: engineResult(), draftVersion: 4, isLoading: false }))
      .toEqual({ label: '金额状态', value: '暂不可计算' })
  })

  it('shows only the current draft-version-matched engine projection', () => {
    expect(quotationAmountPresentation({
      result: engineResult({
        state: 'ready',
        validation: { state: 'ready', issues: [] },
        pricing: {
          calcTotalPrice: { originPrice: 123.4, totalPrice: 123.4 },
          fillOrder: { groups: [], orderListTotalAmount: 123.4 },
          rounding: 'r1_calcTotalPrice_and_fillOrder',
        },
      }),
      draftVersion: 4,
      isLoading: false,
    })).toEqual({ label: '本机金额预览', value: '¥123.40' })
  })
})
