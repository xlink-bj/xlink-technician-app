import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const text = (path: string): string =>
  readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

describe('P1 SKU readiness: hard architecture and runtime boundary', () => {
  it('has no HTTP / production read transport in the synthetic app review module', () => {
    const review = text('src/app/p1-sku-readiness-review.ts')
    expect(review).not.toMatch(/@adapters\/api\/(?!mock\/)/)
    expect(review).not.toMatch(/uni\.request|fetch\(|axios|ApiReadTransport|submitQuotationOrder|createOrder/)
    expect(review).toContain('if (!import.meta.env.DEV) return null')
    expect(review).toContain("realSkuAuthorized: false")
    expect(review).toContain("officialOrderAllowed: false")
  })

  it('main app passes readiness only inside DEV + synthetic-quotation review', () => {
    const page = text('src/pages/work-orders/action-workspace.vue')
    expect(page).toContain('import.meta.env.DEV && isMockQuotationPreview.value')
    expect(page).toContain(':synthetic-sku-readiness="syntheticSkuReadinessPreview"')
    expect(page).toContain('reviewP1SyntheticSkuReadiness(quotationComposition.draft)')
  })

  it('quotation submission and order commands remain independent of the mock review', () => {
    const workspace = text('src/features/work-orders/quotation/QuotationActionWorkspace.vue')
    expect(workspace).toContain('modeBlocked: productionReadOnly || productReviewOnly.value || syntheticReviewEnabled.value')
    expect(workspace).toContain('if (!quotationConfirmOpen.value || !canOpenSubmit.value) return')
    expect(workspace).toContain(':synthetic-sku-readiness="props.syntheticSkuReadiness"')
    const content = text('src/features/work-orders/quotation/QuotationActionContent.vue')
    expect(content).not.toContain('quotation-p1-sku-server-auth-blocked')
    expect(content).not.toContain('仅合成字典')
    expect(content).toContain('正式报价提交暂未开放')
  })

  it('production composition has no import from the DEV SKU readiness review', () => {
    const composition = text('src/app/composition.ts')
    const transport = text('src/adapters/api/quotation-catalog-api.ts')
    expect(composition).not.toContain('p1-sku-readiness-review')
    expect(transport).not.toContain('p1-sku-readiness-review')
    expect(transport).not.toContain('synthetic-sku-readiness')
  })
})
