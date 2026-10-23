import { expect, test, type Page } from '@playwright/test'

/**
 * DS-07.C4.B visual-only signed-state proxy.
 * These synthetic Contract labels are NOT backend contractStatus, signed
 * identity, eligibility to view a PDF, or production signing authority.
 */
async function enforceLocalOnly(page: Page): Promise<() => void> {
  const attemptedExternal: string[] = []
  const pageErrors: string[] = []
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    attemptedExternal.push(route.request().method() + ' ' + url.origin + url.pathname)
    await route.abort('blockedbyclient')
  })
  page.on('pageerror', error => pageErrors.push(error.message))
  return () => {
    expect(attemptedExternal, 'no external reads/writes, even attempted').toEqual([])
    expect(pageErrors, 'no browser errors').toEqual([])
  }
}

for (const width of [320, 375, 390] as const) {
  test(`DS-07.C4.B signing signed/pending/error visual proxy at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    const assertIsolated = await enforceLocalOnly(page)
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.getByTestId('signing-mock-entry').click()
    await expect(page.getByTestId('signing-mock-workbench')).toContainText('独立正式订单样本')
    await expect(page.getByTestId('signing-mock-orders')).toContainText('模拟正式订单 B')
    await page.getByTestId('signing-mock-order-mock-official-order-019-b').click()

    await expect(page.getByTestId('signing-mock-state')).toContainText('签署中')
    await expect(page.getByTestId('signing-mock-contract')).toContainText('不是后端')
    // The App uses an inner scrollable workspace: fullPage does NOT imply
    // that a below-the-fold contract state is actually in the PNG.
    await page.getByTestId('signing-mock-state').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('signing-mock-state')).toBeInViewport()
    await info.attach(`signing-pending-${width}`, {
      body: await page.screenshot({ animations: 'disabled', fullPage: true }),
      contentType: 'image/png',
    })

    await page.getByTestId('signing-mock-scenario-signed').click()
    await expect(page.getByTestId('signing-mock-state')).toContainText('已签署')
    await expect(page.getByTestId('signing-mock-contract')).toContainText('UI 演示概念')
    for (const testid of ['signing-mock-preview-disabled', 'signing-mock-apply-disabled']) {
      const action = page.getByTestId(testid)
      await expect(action).toHaveAttribute('disabled', 'true')
      await expect(action).toHaveAttribute('aria-disabled', 'true')
      await expect(action).toHaveClass(/app-button--disabled/)
    }
    await expect(page.getByTestId('signing-mock-footer')).toContainText('无业务写入')
    await page.getByTestId('signing-mock-state').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('signing-mock-state')).toBeInViewport()
    await info.attach(`signing-signed-${width}`, {
      body: await page.screenshot({ animations: 'disabled', fullPage: true }),
      contentType: 'image/png',
    })

    await page.getByTestId('signing-mock-scenario-failed').click()
    await expect(page.getByTestId('signing-mock-state')).toContainText('失败')
    await page.getByTestId('signing-mock-scenario-expired').click()
    await expect(page.getByTestId('signing-mock-state')).toContainText('过期')
    await page.getByTestId('signing-mock-scenario-no_orders').click()
    await expect(page.getByTestId('signing-mock-empty')).toBeVisible()
    await page.getByTestId('signing-mock-scenario-read_error').click()
    await expect(page.getByTestId('signing-mock-error')).toBeVisible()

    const horizontalOverflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)
    expect(horizontalOverflow, 'no horizontal page overflow').toBeLessThanOrEqual(0)
    assertIsolated()
  })
}
