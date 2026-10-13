import { expect, test } from '@playwright/test'

// Production-only route in the real main App. DEV synthetic data cannot
// claim an official Order identity or signer authority.
for (const width of [375, 390]) {
  test('M1 real App signing-read route denies fabricated Order at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const external: string[] = []
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== 'http://localhost:5174') {
        external.push(route.request().method() + ' ' + url.origin + url.pathname)
        await route.abort('blockedbyclient')
      } else await route.continue()
    })
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.home-page')).toBeVisible()
    await page.goto('/#/pages/work-orders/signing-order-read?workOrderId=MOCK-018&orderId=forged-order', {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByTestId('signing-order-read-blocked')).toBeVisible()
    await expect(page.getByTestId('signing-order-read-verified')).toHaveCount(0)
    await expect(page.getByTestId('signing-order-read-no-write')).toBeVisible()
    await expect(page.getByTestId('signing-order-read-contract-disabled')).toHaveCount(0)
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toHaveCount(0)
    expect(external).toEqual([])
  })
}
