import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)
const source = (path: string) => readFile(new URL(path, root), 'utf8')

describe('G4-F isolated product-review entry: source boundary', () => {
  it('keeps developer QA and product routes separate', async () => {
    const pages = JSON.parse(await source('tools/review/quotation-demo/pages.json')) as {
      pages: readonly { readonly path: string }[]
    }
    expect(pages.pages.map((item) => item.path)).toEqual(expect.arrayContaining([
      'pages/quotation/index',
      'pages/product/orders',
      'pages/product/detail',
      'pages/product/quotation',
    ]))
    const orders = await source('tools/review/quotation-demo/pages/product/orders.vue')
    expect(orders).not.toMatch(/H5_VISUAL_PROXY|MOCK_PRODUCT_REVIEW|g4f-review-scenario-selector/)
    expect(orders).toContain('url="/pages/product/detail"')
    const detail = await source('tools/review/quotation-demo/pages/product/detail.vue')
    expect(detail).toContain("uni.navigateTo({ url: '/pages/product/quotation' })")
    const quote = await source('tools/review/quotation-demo/pages/product/quotation.vue')
    expect(quote).toContain(':product-review-only="true"')
    expect(quote).toContain('<QuotationActionWorkspace')
  })

  it('requires explicit DEV-only submit lock and failing command injection', async () => {
    const shell = await source('src/features/work-orders/quotation/QuotationActionWorkspace.vue')
    const bootstrap = await source('tools/review/quotation-demo/main.ts')
    expect(shell).toContain("import.meta.env.DEV && props.productReviewOnly === true")
    expect(shell).toContain('modeBlocked: productionReadOnly || productReviewOnly.value || syntheticReviewEnabled.value')
    expect(shell).toContain('if (!canOpenSubmit.value) return')
    expect(bootstrap).toContain("scenario === 'dynamic-fields' || scenario === 'product'")
    expect(bootstrap).toContain('const productCommand: TechnicianApiCommandPort | undefined')
    expect(bootstrap).toContain("state: 'failed_terminal'")
    expect(bootstrap).toContain('reviewBlockedCommandCalls += 1')
  })
})
