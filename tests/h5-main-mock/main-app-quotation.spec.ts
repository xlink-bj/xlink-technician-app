import { expect, test } from '@playwright/test'

type NetworkEvidence = {
  externalIntents: string[]
  localFailures: string[]
  pageErrors: number
  consoleErrors: number
}

let evidence: NetworkEvidence

test.beforeEach(async ({ page }) => {
  evidence = { externalIntents: [], localFailures: [], pageErrors: 0, consoleErrors: 0 }
  page.on('pageerror', () => { evidence.pageErrors += 1 })
  page.on('console', (msg) => { if (msg.type() === 'error') evidence.consoleErrors += 1 })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url())
      if (url.origin === 'http://localhost:5174') {
        evidence.localFailures.push(`${response.status()} ${url.pathname}`)
      }
    }
  })
  // Install before navigation. An attempted external request is evidence of
  // a defect, even if blocked; NO external requests are ever sent.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') {
      await route.continue()
      return
    }
    evidence.externalIntents.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    await route.abort('blockedbyclient')
  })
})

test.afterEach(async ({ page }, info) => {
  // The report is always attached, including timeout, assertion failure and
  // early navigation errors. No phone, code, token, payload or headers.
  await info.attach('mock-network-evidence', {
    body: Buffer.from(JSON.stringify({
      ...evidence,
      result: info.status,
      expected: info.expectedStatus,
      stage: new URL(page.url()).hash.split('?')[0],
    }, null, 2)),
    contentType: 'application/json',
  })
})

test('real authenticated shell uses local-only Mock quotation with zero external intent', async ({ page }, info) => {
  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  const home = page.locator('.home-page')
  await expect(home, 'DEV-only fixture must bootstrap the REAL App without phone login').toBeVisible()
  await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
  const quote = page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' })
  await expect(quote).toBeVisible()
  await info.attach('main-home-390', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })

  await quote.click()
  await expect(page, 'normal uni navigation must reach the real Action Workspace').toHaveURL(/pages\/work-orders\/action-workspace/)
  await expect(page.getByTestId('quotation-footer-summary')).toBeVisible()
  await expect(page.getByTestId('quotation-product-demo-read-only')).toBeVisible()
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  await info.attach('main-quotation-390', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  expect(evidence.externalIntents, 'an intercepted external request still FAILS the isolation Gate').toEqual([])
  expect(evidence.pageErrors, 'JS exceptions are not an accepted UX result').toBe(0)
  expect(evidence.consoleErrors, 'console errors are not an accepted UX result').toBe(0)
  expect(evidence.localFailures).toEqual([])
})


for (const viewport of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
]) {
  test(`two repair groups preserve independent selections and package layers at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.home-page')).toBeVisible()
    await page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' }).click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()

    // Genuine main App Action Workspace and the same product components as the
    // detached review tests, but no Production login or fake navigation shell.
    await page.getByTestId('quotation-add-group').click()
    await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
    await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
    await page.getByTestId('quotation-first-step-description').locator('textarea').fill('第一组：屋面维修')
    await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
    await page.getByTestId('quotation-first-step-select-products').click()
    await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()

    await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
    await expect(page.getByTestId('quotation-package-materials')).toBeVisible()
    const layers = page.locator('[data-testid^="quotation-material-layer-"]')
    await expect(layers).toHaveCount(2)
    for (const layer of await layers.all()) {
      const choice = layer.locator('[data-testid^="quotation-package-material-choice-"]').first()
      await expect(choice).toBeEnabled()
      await choice.click()
      await expect(layer).toContainText('已选择')
    }
    await expect(page.getByTestId('quotation-package-selection-summary')).toContainText('2/2')
    const commit = page.getByTestId('quotation-package-configure-commit')
    await expect(commit).toBeEnabled()
    await commit.click()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
    const first = page.getByTestId('quotation-repair-group-quotation-group-1')
    await expect(first).toContainText('第一组：屋面维修')
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-package')).toBeVisible()
    await expect(page.locator('[data-testid^="quotation-configured-package-"]')).toHaveCount(1)

    // Independent second group. It must not inherit or overwrite the package
    // selected for group 1; its direct material lives under group 2 only.
    await page.getByTestId('quotation-add-group').click()
    const second = page.getByTestId('quotation-repair-group-quotation-group-2')
    await expect(second).toBeVisible()
    await second.getByTestId('quotation-repair-part-selector-quotation-group-2')
      .getByText('屋面', { exact: true }).click()
    await page.getByTestId('quotation-group-description-quotation-group-2').locator('textarea')
      .fill('第二组：独立增项')
    await page.getByTestId('quotation-group-quantity-quotation-group-2').locator('input').fill('5')
    await page.getByTestId('quotation-browse-quotation-group-2').click()
    await expect(page.getByTestId('quotation-catalog-target')).toContainText('第二组：独立增项')
    await page.getByTestId('quotation-catalog-kind-material').click()
    await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-sealant').click()
    await expect(page.getByTestId('quotation-group-section-quotation-group-2-material'))
      .toContainText('弹性密封材料（示例）')
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-package')).toBeVisible()
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-material')).toBeHidden()

    await info.attach(`two-groups-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    // A hard reload destroys the in-memory Pinia state. Passing this assert
    // proves the normal main App restored both groups from on-device draft.
    await expect(page.getByText(/报价草稿已保存在本机|报价分组草稿已保存在本机/)).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page.getByTestId('quotation-repair-group-quotation-group-1'))
      .toContainText('第一组：屋面维修')
    await expect(page.getByTestId('quotation-repair-group-quotation-group-2'))
      .toContainText('第二组：独立增项')
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-package')).toBeVisible()
    await expect(page.getByTestId('quotation-group-section-quotation-group-2-material'))
      .toContainText('弹性密封材料（示例）')
    await expect(page.getByTestId('quotation-product-demo-read-only')).toBeVisible()
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await info.attach(`restored-two-groups-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    expect(evidence.externalIntents, 'blocked outbound attempt is itself a FAIL').toEqual([])
    expect(evidence.localFailures).toEqual([])
    expect(evidence.pageErrors).toBe(0)
    expect(evidence.consoleErrors).toBe(0)
  })
}

test('same Mock-018 quotation is reachable from normal work order list and detail', async ({ page }, info) => {
  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
  await expect(page.locator('.work-orders-page')).toBeVisible()
  await page.locator('.search-input input').fill('MOCK-018')
  await page.locator('.search-button').click()
  const row = page.locator('.work-order-card').filter({ hasText: 'MOCK-018' })
  await expect(row, 'quotation fixture must exist in the normal role-scoped list').toBeVisible()
  await expect(row).toContainText('演示报价工单')
  await info.attach('normal-work-order-list-390', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  await row.click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
  await expect(page.locator('.summary-number')).toContainText('MOCK-018')
  const task = page.locator('.current-task-card')
  await expect(task).toContainText('报价')
  const openQuotation = page.locator('.primary-task-action')
  await expect(openQuotation).toBeEnabled()
  await openQuotation.click()
  await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  await expect(page.getByTestId('quotation-product-demo-read-only')).toBeVisible()
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  await info.attach('list-detail-quotation-390', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  expect(evidence.externalIntents).toEqual([])
  expect(evidence.localFailures).toEqual([])
  expect(evidence.pageErrors).toBe(0)
  expect(evidence.consoleErrors).toBe(0)
})
