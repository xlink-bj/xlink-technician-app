import { test, expect } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
for (const width of [430, 375]) test(`build-selected ${brand} signing read only at ${width}`, async ({ page, baseURL }) => {
  const height = width === 430 ? 932 : 667
  await page.setViewportSize({ width, height })
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(route.request().method() + ' ' + new URL(route.request().url()).pathname)
    return route.abort('blockedbyclient')
  })
  const screenshot = async (state: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    expect(await page.locator('.signing-read-page').innerText()).not.toMatch(/SYNTHETIC|DEV-Q00|Mock|测试数据|演示数据/)
    await page.screenshot({ path: `.review/yuhong-signing-read/${brand}-after/${state}-${width}x${height}.png`, animations: 'disabled', caret: 'hide' })
  }
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '04009', customer: '陈女士' })).click()
  await page.getByTestId('task-focus-action').click()
  await page.getByTestId('quotation-hub-signing-mock-official-order-001').click()
  await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
  await expect(page.getByTestId('signing-order-read-display-number')).toHaveText('BJ202610260001')
  await expect(page.getByTestId('signing-read-amount-unverified')).toBeVisible()
  await expect(page.getByTestId('signing-read-order-amount')).toHaveCount(0)
  const contractRead = page.getByTestId('signing-contract-read-request')
  if (brand === 'yuhong') {
    await expect(contractRead).toHaveCSS('background-color', 'rgb(200, 32, 43)')
    await expect(page.getByTestId('signing-read-stage-title')).toHaveCSS('font-size', '20px')
    await expect(page.getByTestId('signing-read-stage-title')).toHaveCSS('line-height', '28px')
    await expect(page.locator('.signing-read-hero-title')).toHaveCSS('font-size', '18px')
    await expect(page.locator('.signing-read-body').first()).toHaveCSS('font-size', '16px')
    await expect(page.locator('.signing-read-stage-index')).toHaveCSS('font-size', '14px')
    await expect(page.locator('.signing-read-stage')).toHaveCSS('border-radius', '8px')
    await expect(page.locator('.xl-craft__progress-track > .is-active').first()).toHaveCSS('background-color', 'rgb(200, 32, 43)')
  }
  await screenshot('01-pending-contract')
  await contractRead.click()
  await expect(page.getByTestId('signing-contract-matched')).toContainText('HT202610260001')
  await expect(page.getByTestId('signing-read-stage-title')).toContainText('签约处理中')
  await page.evaluate(() => window.scrollTo(0, 0))
  await screenshot('02-contract-read')
  const operations = page.getByTestId('signing-read-operations-toggle')
  await expect(operations).toHaveAttribute('aria-expanded', 'false')
  await operations.click()
  for (const id of ['signing-order-read-contract-disabled', 'signing-order-read-sign-disabled']) {
    const button = page.getByTestId(id)
    await expect(button).toHaveAttribute('disabled', 'true')
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    if (brand === 'yuhong') await expect(button).toHaveCSS('background-color', 'rgb(229, 231, 232)')
    await button.click({ force: true })
    await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
  }
  await page.getByTestId('signing-order-read-sign-disabled').scrollIntoViewIfNeeded()
  await screenshot('03-disabled-operations')
  await operations.click()
  await expect(page.getByTestId('signing-order-read-sign-disabled')).toBeHidden()
  await page.locator('.signing-read-context-toggle').click()
  await expect(page.getByTestId('signing-read-stage-detail')).toBeVisible()
  await page.locator('.signing-read-context-toggle').click()
  await expect(page.getByTestId('signing-read-stage-detail')).toBeHidden()
  await page.getByTestId('signing-order-audit-toggle').click()
  await expect(page.getByTestId('signing-order-read-r1-stage')).toBeVisible()
  await page.getByTestId('signing-order-audit-toggle').click()
  if (brand === 'yuhong') {
    for (const selector of ['.signing-read-context-toggle', '.signing-read-detail-toggle', '.signing-read-operations-toggle']) {
      expect((await page.locator(selector).boundingBox())?.height).toBeGreaterThanOrEqual(44)
    }
  }
  await page.getByTestId('signing-order-read-return').click()
  await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
  await expect(page.getByTestId('quotation-hub-signing-mock-official-order-001')).toBeVisible()
  const hubUrl = page.url()

  await page.goto('/#/pages/work-orders/signing-order-read?workOrderId=mock-work-order-002&orderId=forged-order')
  await expect(page.getByTestId('signing-order-read-blocked')).toBeVisible()
  await expect(page.getByTestId('signing-order-read-verified')).toHaveCount(0)
  await expect(page.getByTestId('signing-contract-read-request')).toHaveCount(0)
  await screenshot('04-forged-order-blocked')
  // View-only loading/retry states after a real refused read. No ready data,
  // port, identity or authorization is fabricated; retry uses the original guard.
  for (const state of ['loading', 'failed_retryable'] as const) {
    await page.evaluate(async state => {
      const path = '/src/features/work-orders/signing/signing-review-read-store.ts'
      const { useSigningReviewReadStore } = await import(path)
      const review = useSigningReviewReadStore()
      review.clear()
      review.snapshot = { state }
    }, state)
    if (state === 'loading') await expect(page.getByTestId('signing-order-read-loading')).toBeVisible()
    else await expect(page.getByTestId('signing-order-read-retry')).toBeVisible()
    await screenshot(`05-${state}-view-fixture`)
  }
  await page.getByTestId('signing-order-read-retry').click()
  await expect(page.getByTestId('signing-order-read-retry')).toHaveCount(0)
  await expect(page.getByTestId('signing-order-read-verified')).toHaveCount(0)
  await page.getByTestId('signing-order-read-return').click()
  await expect(page).toHaveURL(hubUrl)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test(`build-selected ${brand} cold refused signing read returns to its WorkOrder`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(route.request().method())
    return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/work-orders/signing-order-read?workOrderId=mock-work-order-002&orderId=forged-order')
  await expect(page.getByTestId('signing-order-read-blocked')).toBeVisible()
  await expect(page.getByTestId('signing-order-read-verified')).toHaveCount(0)
  await page.screenshot({ path: `.review/yuhong-signing-read/${brand}-after/06-cold-entry-blocked-430x932.png`, animations: 'disabled', caret: 'hide' })
  await page.getByTestId('signing-order-read-return').click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail\?id=mock-work-order-002/)
  expect(external).toEqual([])
})
