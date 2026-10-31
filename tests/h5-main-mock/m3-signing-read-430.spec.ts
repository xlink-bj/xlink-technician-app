import { expect, test } from '@playwright/test'

test('M3-P0-C: verified Order → C01 read-only → exact Order hub return, 430×932', async ({ page }, info) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  const exceptions: string[] = []
  page.on('pageerror', error => exceptions.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('qa-console')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await page.locator('.search-input input').fill('04009')
  await page.locator('.search-button').click()
  await page.locator('.work-order-card').filter({ hasText: '陈女士' }).click()
  await expect(page.locator('.summary-number')).toContainText('04009')
  await page.locator('.primary-task-action').click()
  await expect(page.getByTestId('quotation-hub-order-mock-official-order-001')).toBeVisible()
  await page.getByTestId('quotation-hub-signing-mock-official-order-001').click()

  await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
  await expect(page.getByTestId('signing-order-read-display-number')).toContainText('BJ202610260001')
  await expect(page.getByTestId('signing-contract-prod-blocked')).toHaveCount(0)
  await expect(page.getByTestId('signing-contract-read-request')).toBeVisible()
  await page.getByTestId('signing-contract-read-request').click()
  await expect(page.getByTestId('signing-contract-matched')).toContainText('HT202610260001')
  await expect(page.getByTestId('signing-read-stage-title')).toContainText('签约处理中')
  await expect(page.getByTestId('signing-order-read-no-write')).toContainText('全程只读')
  await page.getByTestId('signing-read-operations-toggle').click()
  await expect(page.getByTestId('signing-order-read-contract-disabled')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('signing-order-read-sign-disabled')).toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('signing-read-operations-toggle').click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await info.attach('m3-p0c-signing-read-430x932', {
    body: await page.screenshot({ animations: 'disabled', fullPage: true }),
    contentType: 'image/png',
  })

  await page.getByTestId('signing-order-read-return').click()
  await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
  await expect(page.getByTestId('quotation-hub-order-mock-official-order-001')).toBeVisible()
  await expect(page.getByTestId('quotation-hub-signing-mock-official-order-001')).toBeVisible()
  expect(external, 'no external request').toEqual([])
  expect(exceptions, 'no browser exception').toEqual([])
})
