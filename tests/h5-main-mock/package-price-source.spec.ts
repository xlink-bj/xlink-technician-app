import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

test('default missing package price stays blocked across refresh without a quote or Order', async ({ page, baseURL }) => {
  test.skip(process.env.VITE_XLINK_R1_CATALOG_SCALE === 'true', 'Separate default missing-price fixture')
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === baseURL
    ? route.continue() : (external.push(route.request().method()), route.abort('blockedbyclient')))
  await page.goto('/#/pages/index/index')
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })).click()
  await page.getByTestId('task-focus-action').click()
  await page.getByTestId('quotation-hub-create-unverified').click()
  await page.getByTestId('quotation-add-group').click()
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByTestId('quotation-repair-part-picker').locator('.app-cascade-selector__parent').filter({ hasText: '屋面' }).click()
  await page.getByTestId('quotation-repair-part-picker-done').click()
  await page.getByTestId('quotation-first-step-description').locator('textarea').fill('屋面维修范围已核对')
  await page.getByTestId('quotation-first-step-quantity').locator('input').fill('2')
  await page.getByTestId('quotation-first-step-select-products').click()
  await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
  const layers = page.locator('[data-testid^="quotation-material-layer-"]')
  await expect(layers).toHaveCount(2)
  for (const layer of await layers.all()) {
    await layer.locator('[data-testid^="quotation-package-material-choice-"]').first().click()
  }
  await expect(page.getByTestId('quotation-package-selection-summary')).toContainText('2/2')
  await page.getByTestId('quotation-package-configure-commit').click()
  const outcome = () => page.evaluate(async () => {
    const path = '/src/features/work-orders/quotation/engine-store.ts'
    const engine = (await import(path)).useQuotationEngineStore()
    return { state: engine.state, issues: engine.result?.issues, payload: engine.result?.payload }
  })
  const check = async () => {
    await expect.poll(outcome).toMatchObject({ state: 'blocked', issues: expect.arrayContaining([
      expect.objectContaining({ code: 'pricing.package_price_missing' }),
    ]) })
    expect((await outcome()).payload).toBeUndefined()
    await expect(page.getByTestId('quotation-submit-disabled-preview')).toHaveAttribute('aria-disabled', 'true')
    for (const key of ['xlink.dev.mock.journey.019.quotation.v1', 'xlink.dev.mock.journey.019.official-order.v1']) {
      expect(await page.evaluate(key => (window as any).uni.getStorageSync(key), key)).toBeFalsy()
    }
  }
  await check()
  await page.reload()
  await page.getByTestId('quotation-hub-create-unverified').click()
  await check()
  const review = process.env.XLINK_PACKAGE_ORDER_REVIEW_DIR
  if (review) {
    await mkdir(review + '/missing-price', { recursive: true })
    await page.getByTestId('quotation-review-readiness').evaluate(el => el.scrollIntoView({ block: 'center' }))
    await page.screenshot({ path: review + '/missing-price/01-缺有效价-刷新后仍阻断.png', animations: 'disabled', caret: 'hide' })
  }
  expect(external).toEqual([]); expect(errors).toEqual([])
})
