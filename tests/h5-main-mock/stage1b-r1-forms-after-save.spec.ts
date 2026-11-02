import { expect, test } from '@playwright/test'

/** Stage 1B: real uni-app H5 composition, Mock 020 only. Browser traffic to
 * anything other than the local dev server is an immediate failure. */
test.describe('Stage 1B forms Save→EXTS→Process / durable readback', () => {
  test.skip(process.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true',
    'The isolated 020/021 synthetic fixtures must be explicitly enabled.')

  test('430×932: confirmed Save and Process survives reload without replay', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 })
    const external: string[] = []
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:5174') return route.continue()
      external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
      await route.abort('blockedbyclient')
    })

    await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.work-orders-entry').click()
    await page.getByTestId('app-search-bar').locator('input').fill('MOCK-020')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '韩先生' }).click()

    const panel = page.getByTestId('a-stage-special-panel')
    await expect(panel).toBeVisible()
    await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('Stage1B 430 宽度下现场情况和节点完成')
    await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({ hasText: '需要跟进' }).click()
    await page.getByTestId('a-special-save-finish-request').click()
    await expect(page.getByTestId('a-special-save-finish-confirm')).toBeVisible()
    await page.getByTestId('a-special-save-finish-confirm').click()
    await expect(page.getByTestId('a-special-complete')).toBeVisible()
    // The detail projection intentionally switches to the completed-node
    // summary and unmounts the editor. Exact saved payload is independently
    // checked by the controller's fresh-record readback tests.
    await expect(panel).toHaveCount(0)
    await expect(page.getByTestId('a-special-receipt-pending')).toHaveCount(0)
    await expect(page.getByTestId('a-special-save')).toHaveCount(0)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('a-special-complete')).toBeVisible()
    await expect(panel).toHaveCount(0)
    await expect(page.getByTestId('a-special-receipt-pending')).toHaveCount(0)
    await expect(page.getByTestId('a-special-save-finish-request')).toHaveCount(0)
    expect(external, 'Zero attempted external requests').toEqual([])
    expect(errors, 'No uncaught browser errors').toEqual([])
  })
})
