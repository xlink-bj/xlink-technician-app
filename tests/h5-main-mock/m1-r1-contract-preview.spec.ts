import { expect, test } from '@playwright/test'

/**
 * Real main uni-app shell with an isolated DEV-only synthetic Order/Contract.
 * No live Order creation, signer entitlement, external API or customer action.
 */
for (const width of [375, 390]) {
  test('I6 real main App guarded Contract status read with synthetic evidence at ' + width, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    const external: string[] = []
    let exceptions = 0
    page.on('pageerror', () => { exceptions += 1 })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== 'http://localhost:5174') {
        external.push(route.request().method() + ' ' + url.origin + url.pathname)
        await route.abort('blockedbyclient')
      } else await route.continue()
    })
    await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('qa-console')).toBeVisible()
    await page.locator('.work-orders-entry').click()
    await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
    await page.locator('.search-input input').fill('04009')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '陈女士' }).click()
    await expect(page.locator('.summary-number')).toContainText('04009')

    // Navigating within uni-app retains the live role-scoped list/detail.
    await page.evaluate(() => {
      const runtime = (window as Window & {
        uni?: { navigateTo: (arg: { url: string }) => void }
      }).uni
      if (!runtime) throw new Error('uni-app navigation unavailable')
      runtime.navigateTo({
        url: '/pages/work-orders/signing-order-read?workOrderId=mock-work-order-002&orderId=mock-official-order-001',
      })
    })
    await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
    await expect(page.getByTestId('signing-order-read-display-number'))
      .toContainText('BJ202610260001')
    await expect(page.getByTestId('signing-contract-fixture-label')).toHaveCount(0)
    await expect(page.getByTestId('signing-contract-read-request')).toBeVisible()
    await expect(page.getByTestId('signing-review-progress')).toContainText('步骤 2/3')
    await page.getByTestId('signing-contract-read-request').click()
    await expect(page.getByTestId('signing-contract-matched')).toContainText('HT202610260001')
    await expect(page.getByTestId('signing-read-stage-title')).toContainText('签约处理中')
    await expect(page.getByTestId('signing-review-progress')).toContainText('等待外部签署')
    await expect(page.getByTestId('signing-command-preflight')).toHaveCount(0)
    await expect(page.locator('.signing-read-page')).not.toContainText(/Mock|DEV|测试订单|验收资料/)
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toHaveAttribute('disabled', 'true')
    await expect(page.getByTestId('signing-order-read-contract-disabled')).toHaveAttribute('disabled', 'true')
    await expect(page.getByTestId('signing-order-read-no-write')).toBeVisible()
    expect(external).toEqual([])
    expect(exceptions).toBe(0)
    await info.attach('i6-main-contract-fixture-' + width, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
}
