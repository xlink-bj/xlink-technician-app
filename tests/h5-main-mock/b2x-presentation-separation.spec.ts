import { expect, test, type Page, type TestInfo } from '@playwright/test'

/** Keep human-readable PNGs in the downloaded artifact, not only HTML's hashed assets. */
async function captureEvidence(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await info.attach(name, { path, contentType: 'image/png' })
}

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
  test(`B2-X2 commercial mode contains only business information (${width})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 844 })
    const assertSafe = await forbidExternalRequests(page)
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.home-page')).toBeVisible()
    await expect(page.getByTestId('dev-review-tools')).toHaveCount(0)
    await expect(page.getByTestId('business-mode-provenance')).toHaveCount(0)
    await expect(page.locator('.local-draft-panel')).toHaveCount(0)
    await expect(page.locator('.home-page')).not.toContainText(/开发验收|测试数据|体验数据|Mock|DEV|未提交后台/)
    await captureEvidence(page, info, `commercial-home-${width}`)

    await page.locator('.work-orders-entry').click()
    await page.locator('.search-input input').fill('04009')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '陈女士' }).click()
    // The signing read store checks the currently verified work-order list/detail.
    // Wait for the real detail to load before navigating to its scoped Order.
    await expect(page.locator('.summary-number')).toContainText('04009')
    await page.evaluate(() => {
      const uni = (window as Window & {
        uni?: { navigateTo: (options: { url: string }) => void }
      }).uni
      if (!uni) throw new Error('uni-app navigation unavailable')
      uni.navigateTo({ url: '/pages/work-orders/signing-order-read?workOrderId=mock-work-order-002&orderId=mock-official-order-001' })
    })
    await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
    await expect(page.getByTestId('signing-order-read-display-number')).toContainText('BJ202610260001')
    await expect(page.getByTestId('signing-order-read-verified')).not.toContainText(/示例|Mock|DEV|未提交后台/)
    await expect(page.getByTestId('signing-read-amount-unverified')).toContainText('金额待核验')
    await expect(page.getByTestId('signing-read-order-amount')).toHaveCount(0)
    await page.getByTestId('signing-order-audit-toggle').click()
    await expect(page.getByTestId('signing-order-read-r1-stage')).not.toContainText('R1')
    await expect(page.getByTestId('signing-command-preflight')).toHaveCount(0)
    await page.getByTestId('signing-contract-read-request').click()
    await expect(page.getByTestId('signing-contract-matched')).toContainText('HT202610260001')
    await expect(page.locator('.signing-read-page')).not.toContainText('DEV-SYNTHETIC')
    await expect(page.locator('.signing-read-page')).not.toContainText(/开发核验|演示|测试数据|Mock|体验数据/)
    await expect(page.getByTestId('signing-contract-matched')).not.toContainText('R1')
    await expect(page.getByTestId('signing-contract-matched')).not.toContainText('状态 2')
    // uni-app renders <uni-button>, not a native HTML <button>.
    // Assert its actual disabled and ARIA-disabled guard attributes.
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toHaveAttribute('disabled', 'true')
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toHaveAttribute('aria-disabled', 'true')
    await captureEvidence(page, info, `commercial-c01-${width}`)
    assertSafe()
  })
}

test('B2-X2 technical inspection stays in its own DEV-only route', async ({ page }, info) => {
  const assertSafe = await forbidExternalRequests(page)
  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('qa-console')).toBeVisible()
  await expect(page.locator('.home-page')).toHaveCount(0)
  await expect(page.getByTestId('dev-review-tools')).toBeVisible()
  await expect(page.getByTestId('mock-continuous-journey-entry')).toBeVisible()
  await expect(page.getByTestId('business-mode-provenance')).toHaveCount(0)
  await captureEvidence(page, info, 'isolated-qa-console')
  // Technical controls are located by route, not injected into Home after opt-in.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dev-review-tools')).toBeVisible()
  await page.getByTestId('qa-return-to-app').click()
  await expect(page.locator('.home-page')).toBeVisible()
  await expect(page.getByTestId('dev-review-tools')).toHaveCount(0)
  await expect(page.getByTestId('business-mode-provenance')).toHaveCount(0)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dev-review-tools')).toHaveCount(0)
  await expect(page.locator('.home-page')).not.toContainText(/开发验收|测试数据|体验数据|Mock|DEV|未提交后台/)
  assertSafe()
})
