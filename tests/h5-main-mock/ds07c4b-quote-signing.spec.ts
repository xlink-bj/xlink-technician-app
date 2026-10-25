import { expect, test, type Page } from '@playwright/test'

const widths = [320, 375, 390] as const

async function preventExternal(page: Page): Promise<() => void> {
  const attempts: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', async (route) => {
    const address = new URL(route.request().url())
    if (address.origin === 'http://localhost:5174') {
      await route.continue()
      return
    }
    attempts.push(route.request().method() + ' ' + address.origin + address.pathname)
    await route.abort('blockedbyclient')
  })
  return () => {
    expect(attempts, 'no external/business requests').toEqual([])
    expect(errors, 'no browser exceptions').toEqual([])
  }
}

for (const width of widths) {
  test(`DS-07.C4.B actual Quote and blocked Signing H5 at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    const assertSafe = await preventExternal(page)
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.work-orders-entry').click()
    await expect(page.locator('.work-order-card').first()).toBeVisible()
    await page.locator('.search-input input').fill('MOCK-018')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '演示报价工单' }).click()
    await expect(page.locator('.summary-number')).toContainText('MOCK-018')
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    const scope = page.getByTestId('ds07c4b-quotation-scope-note')
    // A failed remote read does not establish a bounded successful result.
    await expect(page.getByTestId('quotation-hub-read-error')).toBeVisible()
    await expect(scope).toContainText('本次读取未完成，不能判断有无订单')
    await expect(scope).toHaveClass(/app-status--strip/)
    await info.attach(`ds07c4b-q00-${width}`, {
      body: await page.screenshot({ animations: 'disabled', fullPage: true }),
      contentType: 'image/png',
    })

    await page.getByTestId('quotation-hub-create-unverified').click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await page.getByTestId('quotation-add-group').click()
    await expect(page.getByTestId('quotation-first-repair-part-step')).toBeVisible()
    await expect(page.getByTestId('ds07c4b-q01-amount-display')).toContainText('·')
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await info.attach(`ds07c4b-q01-${width}`, {
      body: await page.screenshot({ animations: 'disabled', fullPage: true }),
      contentType: 'image/png',
    })

    // Explicitly forged Order identity must not grant a signed-order view.
    await page.goto('/#/pages/work-orders/signing-order-read?workOrderId=MOCK-018&orderId=forged-order', {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByTestId('signing-order-read-blocked')).toBeVisible()
    await expect(page.getByTestId('signing-order-read-verified')).toHaveCount(0)
    await expect(page.getByTestId('ds07c4b-signing-authority-note')).toHaveCount(0)
    await expect(page.getByTestId('signing-order-read-no-write')).toContainText('全程只读')
    const overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)
    expect(overflow, 'no horizontal overflow').toBeLessThanOrEqual(0)
    assertSafe()
    await info.attach(`ds07c4b-signing-blocked-${width}`, {
      body: await page.screenshot({ animations: 'disabled', fullPage: true }),
      contentType: 'image/png',
    })
  })
}
