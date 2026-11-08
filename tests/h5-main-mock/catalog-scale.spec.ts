import { expect, test, type Page } from '@playwright/test'

// Only an explicit DEV Mock server may run this fixture. Counts follow retained
// scoped observations; every ID, label and amount is deliberately synthetic.
test.skip(process.env.VITE_XLINK_R1_CATALOG_SCALE !== 'true', 'M08 opt-in synthetic catalog required')

async function open019Quotation(page: Page) {
    await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
    await page.getByTestId('mock-continuous-journey-entry').click()
    await page.locator('.action-content-field--note textarea').fill('阶段 A 移动端：平屋顶预约')
    await page.getByTestId('mock-journey-advance').click()
    await expect(page).toHaveURL(/work-orders\/detail/)
    await page.locator('.primary-task-action').click()
    const repairPart = page.getByTestId('survey-part-picker-trigger')
    await expect(repairPart).toBeVisible()
    await repairPart.click()
    await expect(page.getByTestId('survey-part-picker-panel')).toBeVisible()
    await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
    await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
    await page.getByTestId('survey-part-picker-confirm').click()
    await expect(page.getByTestId('dynamic-field-squareMeter')).toBeVisible()
    await page.getByTestId('dynamic-field-squareMeter').locator('input').fill('12')
    await page.getByTestId('mock-journey-advance').click()
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await page.getByTestId('quotation-hub-create-unverified').click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page.getByTestId('a-stage-mock-order-panel')).toBeVisible()
  }


test('430: large catalogs paginate through the real App and preserve a composed quotation', async ({ page }) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(15_000)
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  await page.context().route('**/*', async route => {
    if (new URL(route.request().url()).origin === 'http://localhost:5174') return route.continue()
    external.push(route.request().url()); await route.abort()
  })
  await open019Quotation(page)
  await page.getByTestId('quotation-add-group').click()
  await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
  await page.getByTestId('quotation-repair-part-picker').locator('.app-cascade-selector__parent').filter({ hasText: '屋面' }).click()
  await page.getByTestId('quotation-repair-part-picker-done').click()
  await page.getByTestId('quotation-first-step-description').locator('textarea').fill('合成规模目录组合')
  await page.getByTestId('quotation-first-step-quantity').locator('input').fill('1')
  await page.getByTestId('order-field-mock-order-mode').getByText('否', { exact: true }).click()
  await page.getByTestId('quotation-first-step-select-products').click()

  for (const [kind, total] of [['package', 27], ['procedure', 66], ['material', 89], ['measure', 4]] as const) {
    await page.getByTestId(`quotation-catalog-kind-${kind}`).click()
    const items = page.locator(`[data-testid^="quotation-catalog-item-${kind}-"]`)
    await expect(items).toHaveCount(Math.min(total, 20))
    for (let loaded = 20; loaded < total; loaded += 20) {
      await page.getByTestId('quotation-catalog-load-more').click()
      await expect(items).toHaveCount(Math.min(total, loaded + 20))
    }
    await expect(page.getByTestId('quotation-catalog-load-more')).toHaveCount(0)
    const ids = await items.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')))
    expect(new Set(ids).size).toBe(total)
  }
  // Pick across last pages, not just a larger first-page fixture.
  for (const [kind, suffix] of [['procedure', '066'], ['material', '089'], ['measure', '004']] as const) {
    if (!(await page.getByTestId('quotation-catalog-page').isVisible())) await page.getByTestId('quotation-browse-quotation-group-1').click()
    await page.getByTestId(`quotation-catalog-kind-${kind}`).click()
    await page.getByTestId(`quotation-catalog-add-${kind}-mock-scale-standard-${kind}-${suffix}`).click()
  }
  if (!(await page.getByTestId('quotation-catalog-page').isVisible())) await page.getByTestId('quotation-browse-quotation-group-1').click()
  await page.getByTestId('quotation-catalog-kind-package').click()
  await page.getByTestId('quotation-package-detail-mock-scale-standard-package-027').click()
  const layers = page.locator('[data-testid^="quotation-material-layer-"]')
  await expect(layers).toHaveCount(2)
  for (const layer of await layers.all()) await layer.locator('[data-testid^="quotation-package-material-choice-"]').first().click()
  await expect(page.getByTestId('quotation-package-selection-summary')).toContainText('2/2')
  await page.getByTestId('quotation-package-configure-commit').click()
  await expect(page.getByTestId('quotation-footer-summary')).toBeVisible()
  // The exact synthetic amount is also checked through the production pricing
  // runtime in the companion router/adapter test; never a tenant price claim.
  await page.getByTestId('quotation-group-details-toggle-quotation-group-1').click()
  const packageSection = page.getByTestId('quotation-group-section-quotation-group-1-package')
  await packageSection.locator('[data-testid^="quotation-selection-quantity-"] input').fill('2')
  await expect(page.getByTestId('quotation-footer-summary')).toContainText('459.00')
  const firstTotal = await page.getByTestId('quotation-footer-summary').innerText()
  await page.getByTestId('quotation-package-edit-quotation-group-1-mock-scale-standard-package-027').click()
  await layers.first().locator('[data-testid^="quotation-package-material-choice-"]').nth(1).click()
  await page.getByTestId('quotation-package-configure-commit').click()
  await expect(page.getByTestId('quotation-footer-summary')).toContainText('473.00')
  const alternativeTotal = await page.getByTestId('quotation-footer-summary').innerText()
  expect(alternativeTotal).not.toBe(firstTotal)
  await page.reload()
  await page.getByTestId('quotation-hub-create-unverified').click()
  await expect(page.getByTestId('quotation-footer-summary')).toContainText('473.00')
  await page.getByTestId('quotation-group-details-toggle-quotation-group-1').click()
  await expect(page.locator('[data-testid^="quotation-configured-package-"]')).toHaveCount(1)
  await page.getByTestId('a-stage-order-create').click()
  await page.getByTestId('a-stage-order-confirm').click()
  await expect(page.getByTestId('a-stage-quote-readback')).toBeVisible()
  const saved = await page.evaluate(() => {
    const runtime = (window as unknown as { uni: { getStorageSync(key: string): string } }).uni
    return JSON.parse(runtime.getStorageSync('xlink.dev.mock.journey.019.quotation.v1'))
  })
  expect(saved).toMatchObject({ type: 0, totalPrice: 473, originPrice: 473,
    serviceAppointmentId: 'mock-work-order-019-continuous-journey' })
  expect(typeof saved.bjProducts).toBe('string')
  for (const id of ['package-027', 'procedure-066', 'material-089', 'measure-004']) {
    expect(saved.bjProducts).toContain(`mock-scale-standard-${id}`)
  }
  await page.screenshot({ path: 'test-results/main-h5-mock/evidence/m08-scale-composed-quote-430.png', fullPage: true })
  expect(external).toEqual([])
})
