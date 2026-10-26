import { expect, test, type Page } from '@playwright/test'

async function forbidExternalRequests(page: Page) {
  const violations: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    violations.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  return () => {
    expect(violations, 'no Production/Beta network intents').toEqual([])
    expect(errors, 'no page exceptions').toEqual([])
  }
}

for (const width of [375, 390]) {
  test(`B2-X commercial mode hides QA details without hiding provenance (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 844 })
    const assertSafe = await forbidExternalRequests(page)
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.home-page')).toBeVisible()
    await expect(page.getByTestId('dev-review-tools')).toHaveCount(0)
    await expect(page.getByTestId('business-mode-provenance')).toContainText('体验数据')
    await expect(page.locator('.local-draft-panel')).toHaveCount(0)

    await page.locator('.work-orders-entry').click()
    await page.locator('.search-input input').fill('04009')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '演示客户乙' }).click()
    await page.evaluate(() => {
      const uni = (window as Window & {
        uni?: { navigateTo: (options: { url: string }) => void }
      }).uni
      if (!uni) throw new Error('uni-app navigation unavailable')
      uni.navigateTo({ url: '/pages/work-orders/signing-order-read?workOrderId=mock-work-order-002&orderId=mock-official-order-001' })
    })
    await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
    await expect(page.getByTestId('signing-order-read-display-number')).toContainText('本机订单示例')
    await expect(page.getByTestId('signing-order-read-verified')).toContainText('未提交后台')
    await expect(page.getByTestId('signing-command-preflight')).toHaveCount(0)
    await page.getByTestId('signing-contract-read-request').click()
    await expect(page.getByTestId('signing-contract-matched')).toContainText('本机合同示例')
    await expect(page.locator('.signing-read-page')).not.toContainText('DEV-SYNTHETIC')
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toBeDisabled()
    assertSafe()
  })
}

test('B2-X developer inspection is explicit, DEV-only and reversible', async ({ page }) => {
  const assertSafe = await forbidExternalRequests(page)
  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dev-review-tools')).toBeVisible()
  await expect(page.getByTestId('mock-continuous-journey-entry')).toBeVisible()
  await expect(page.getByTestId('business-mode-provenance')).toHaveCount(0)
  // The opt-in persists across local page reloads, never across browser tabs.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dev-review-tools')).toBeVisible()
  await page.goto('/#/pages/index/index?devReview=0', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dev-review-tools')).toHaveCount(0)
  await expect(page.getByTestId('business-mode-provenance')).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dev-review-tools')).toHaveCount(0)
  assertSafe()
})
