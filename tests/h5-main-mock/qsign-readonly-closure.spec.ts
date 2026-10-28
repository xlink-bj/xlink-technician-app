import { expect, test, type Page } from '@playwright/test'

// Actual uni-app H5 pages. Every business response is a bounded, source-shaped
// local Mock; the browser may never contact a tenant backend or issue a write.
async function localOnly(page: Page): Promise<() => void> {
  const external: string[] = []
  const exceptions: string[] = []
  page.on('pageerror', error => exceptions.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  return () => {
    expect(external, 'no real business API or other network').toEqual([])
    expect(exceptions, 'no browser exceptions').toEqual([])
  }
}

async function openListedWorkOrder(page: Page, number: string, customer: string): Promise<void> {
  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('qa-console')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await page.locator('.search-input input').fill(number)
  await page.locator('.search-button').click()
  await page.locator('.work-order-card').filter({ hasText: customer }).click()
  // MOCK-018 is the search token; the business-facing WorkOrder number is 26018.
  await expect(page.locator('.summary-number')).toContainText(number === 'MOCK-018' ? '26018' : number)
}

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test(`Quote draft → official Order → pre-signing read-only, ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    const assertLocal = await localOnly(page)
    await openListedWorkOrder(page, '04009', '陈女士')
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-order-mock-official-order-001')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-signing-mock-official-order-001')).toBeVisible()

    // A separate local quote can coexist with a previously listed official
    // type-1 Order. Neither ID nor signing state is inferred from the draft.
    await page.getByTestId('quotation-hub-start-new').click()
    await expect(page.getByTestId('quotation-hub-mode')).toBeVisible()
    await page.getByTestId('quotation-hub-mode-next').click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await page.getByTestId('quotation-add-group').click()
    await expect(page.getByTestId('quotation-first-repair-part-step')).toBeVisible()
    await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
    await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
    await page.getByTestId('quotation-first-step-description').locator('textarea').fill('屋面防水修补')
    await page.getByTestId('quotation-first-step-quantity').locator('input').fill('18.6')
    await page.getByTestId('quotation-first-step-select-products').click()
    await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
    await page.getByTestId('quotation-catalog-kind-material').click()
    await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-butyl-tape').click()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
    await expect(page.getByTestId('quotation-repair-group-quotation-group-1')).toContainText('丁基防水密封胶带')

    await page.getByTestId('quotation-review-orders').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-local-draft')).toContainText('1 个维修部位组')
    await expect(page.getByTestId('quotation-hub-local-draft')).toContainText('非正式订单')
    await expect(page.getByTestId('quotation-hub-local-draft')).toContainText('本机已保存')
    await expect(page.getByTestId('quotation-hub-order-mock-official-order-001')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-amount-unverified')).toContainText('金额待核验')
    await expect(page.getByTestId('quotation-hub-order-mock-official-order-001')).not.toContainText('¥ 0.00')
    await expect(page.getByTestId('quotation-hub-edit-mock-official-order-001')).toHaveCount(0)
    await expect(page.getByTestId('quotation-hub-signing-boundary')).toBeVisible()
    await info.attach(`qsign-quote-order-${viewport.width}`, {
      body: await page.screenshot({ animations: 'disabled', fullPage: true }), contentType: 'image/png',
    })

    await page.getByTestId('quotation-hub-signing-mock-official-order-001').click()
    await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
    await expect(page.getByTestId('signing-order-read-display-number')).toContainText('BJ202610260001')
    await expect(page.getByTestId('signing-contract-read-request')).toBeVisible()
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toHaveAttribute('disabled', 'true')
    await expect(page.getByTestId('signing-order-read-contract-disabled')).toHaveAttribute('disabled', 'true')
    await page.getByTestId('signing-contract-read-request').click()
    await expect(page.getByTestId('signing-contract-matched')).toContainText('HT202610260001')
    await expect(page.getByTestId('signing-read-stage-title')).toContainText('签约处理中')
    await expect(page.getByTestId('signing-read-reconciled-status')).toBeVisible()
    await expect(page.getByTestId('signing-review-progress').getByTestId('signing-read-reconciled-status')).toBeVisible()
    await expect(page.getByTestId('signing-read-operations-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toBeHidden()
    await page.getByTestId('signing-read-operations-toggle').click()
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toBeVisible()
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toBeDisabled()
    await page.getByTestId('signing-read-operations-toggle').click()
    await info.attach(`qsign-signing-status-${viewport.width}`, {
      body: await page.screenshot({ animations: 'disabled', fullPage: true }), contentType: 'image/png',
    })
    await page.getByTestId('signing-order-read-return').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-local-draft')).toContainText('1 个维修部位组')
    expect(await page.getByTestId('quotation-order-hub').innerText()).not.toMatch(/DEV|Mock|测试订单|验收资料/)
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    assertLocal()
  })

  test(`No verified Order stays inconclusive; forged signing identity is blocked, ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const assertLocal = await localOnly(page)
    await openListedWorkOrder(page, 'MOCK-018', '吴先生')
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('quotation-hub-read-error')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-records')).toHaveCount(0)
    await page.getByTestId('quotation-hub-create-unverified').click()
    await expect(page.getByTestId('quotation-readonly-handoff')).toBeVisible()
    await page.getByTestId('quotation-review-orders').click()
    await expect(page.getByTestId('quotation-hub-read-error')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-signing-mock-official-order-001')).toHaveCount(0)
    await page.goto('/#/pages/work-orders/signing-order-read?workOrderId=MOCK-018&orderId=forged-order', {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByTestId('signing-order-read-blocked')).toBeVisible()
    await expect(page.getByTestId('signing-order-read-verified')).toHaveCount(0)
    await expect(page.getByTestId('signing-contract-read-request')).toHaveCount(0)
    await expect(page.getByTestId('signing-order-read-no-write')).toBeVisible()
    assertLocal()
  })
}
