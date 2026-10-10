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
  await expect(page.locator('.uni-page-head__title')).toContainText('报价工作台')
  // Screenshots must capture an EDITABLE workbench, not its transient spinner.
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  await expect(page.getByTestId('quotation-footer-summary')).toBeVisible()
  await expect(page.getByTestId('quotation-product-demo-read-only')).toBeVisible()
  await expect(page.getByTestId('quotation-product-demo-read-only')).toContainText('演示，不提交订单')
  await expect(page.locator('.quotation-production-read-only')).toHaveCount(0)
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
    const descriptionBox = await page.getByTestId('quotation-group-description-quotation-group-2').boundingBox()
    expect(descriptionBox, 'Mock group description must not consume ~150px of mobile viewport').not.toBeNull()
    if (descriptionBox) expect(descriptionBox.height).toBeLessThanOrEqual(105)
    await page.getByTestId('quotation-group-quantity-quotation-group-2').locator('input').fill('5')
    await page.getByTestId('quotation-browse-quotation-group-2').click()
    await expect(page.getByTestId('quotation-catalog-target')).toContainText('第二组：独立增项')
    await page.getByTestId('quotation-catalog-kind-material').click()
    await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-sealant').click()
    await expect(page.getByTestId('quotation-group-section-quotation-group-2-material'))
      .toContainText('弹性密封材料（示例）')
    await page.getByTestId('quotation-browse-quotation-group-2').click()
    await page.getByTestId('quotation-catalog-kind-procedure').click()
    await page.getByTestId('quotation-catalog-add-procedure-mock-catalog-procedure-seal').click()
    await expect(page.getByTestId('quotation-group-section-quotation-group-2-procedure'))
      .toContainText('檐口密封处理（示例）')
    await page.getByTestId('quotation-browse-quotation-group-2').click()
    await page.getByTestId('quotation-catalog-kind-measure').click()
    await page.getByTestId('quotation-catalog-add-measure-mock-catalog-measure-inspection').click()
    // Three selected lines may initially appear in compact presentation.
    const detailsToggle = page.getByTestId('quotation-group-details-toggle-quotation-group-2')
    if (await page.getByTestId('quotation-group-collapsed-summary-quotation-group-2').isVisible()) {
      await detailsToggle.click()
    }
    await expect(page.getByTestId('quotation-group-section-quotation-group-2-material')).toBeVisible()
    await expect(page.getByTestId('quotation-group-section-quotation-group-2-procedure'))
      .toContainText('檐口密封处理（示例）')
    await expect(page.getByTestId('quotation-group-section-quotation-group-2-measure'))
      .toContainText('高处作业防护（示例）')
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
    if (await page.getByTestId('quotation-group-collapsed-summary-quotation-group-2').isVisible()) {
      await page.getByTestId('quotation-group-details-toggle-quotation-group-2').click()
    }
    await expect(page.getByTestId('quotation-group-section-quotation-group-2-material'))
      .toContainText('弹性密封材料（示例）')
    await expect(page.getByTestId('quotation-group-section-quotation-group-2-procedure'))
      .toContainText('檐口密封处理（示例）')
    await expect(page.getByTestId('quotation-group-section-quotation-group-2-measure'))
      .toContainText('高处作业防护（示例）')
    await expect(page.getByTestId('quotation-workbench-summary')).toBeVisible()
    await expect(page.getByTestId('quotation-workbench-summary')).toContainText('维修部位报价')
    await expect(page.getByTestId('quotation-workbench-amount')).toHaveCount(0)
    const footerBox = await page.getByTestId('quotation-footer-summary').boundingBox()
    expect(footerBox, 'persistent draft footer must remain visible').not.toBeNull()
    if (footerBox) {
      expect(footerBox.y).toBeGreaterThanOrEqual(0)
      expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(viewport.height + 1)
    }
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
  // The list intentionally renders an abbreviated numeric card number;
  // verify full MOCK-018 identity in Detail, not in its summary card.
  const row = page.locator('.work-order-card').filter({ hasText: '演示报价工单' })
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

test('shared Action Workspace displays its actual operation title for appointment and survey', async ({ page }) => {
  for (const scenario of [
    { label: '全新预约', title: '预约上门' },
    { label: '现场勘查', title: '现场勘查' },
  ]) {
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.home-page')).toBeVisible()
    const entry = page.locator('.mock-action-scenario').filter({ hasText: scenario.label })
    await expect(entry).toBeVisible()
    await entry.click()
    await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
    await expect(page.locator('.uni-page-head__title')).toContainText(scenario.title)
  }
  expect(evidence.externalIntents).toEqual([])
  expect(evidence.pageErrors).toBe(0)
  expect(evidence.consoleErrors).toBe(0)
})


test('one MOCK-019 WorkOrder progresses Appointment → Survey → Quotation without business commands', async ({ page }, info) => {
  await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.home-page')).toBeVisible()
  const journey = page.getByTestId('mock-continuous-journey-entry')
  await expect(journey).toContainText('MOCK-019')
  await journey.click()
  await expect(page).toHaveURL(/pages\/work-orders\/action-workspace/)
  await expect(page).toHaveURL(/mock-work-order-019-continuous-journey/)
  await expect(page.locator('.uni-page-head__title')).toContainText('预约上门')
  await expect(page.locator('.action-content-title')).toContainText('预约信息')
  await expect(page.getByTestId('mock-journey-progress')).toContainText('不提交业务表单或订单')
  await page.locator('.action-content-field--note textarea').fill('P1B预约备注：现场先确认屋面渗漏')
  await info.attach('019-appointment', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })

  await page.getByTestId('mock-journey-advance').click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
  await expect(page.locator('.summary-number')).toContainText('MOCK-019')
  await expect(page.locator('.current-task-card')).toContainText('现场勘察')
  await page.locator('.primary-task-action').click()
  await expect(page).toHaveURL(/mock-work-order-019-continuous-journey/)
  await expect(page.locator('.uni-page-head__title')).toContainText('现场勘查')
  await expect(page.getByTestId('dynamic-form-action-content')).toBeVisible()
  await expect(page.getByTestId('mock-journey-context-appointment')).toContainText('P1B预约备注：现场先确认屋面渗漏')
  await expect(page.getByTestId('mock-journey-progress')).toContainText('模拟进入报价')
  // Capture all R1-shaped visible/hidden field identities on failure; do not
  // silently manufacture Survey values when an actual UI control is absent.
  const surveyFieldEvidence = await page.locator('[data-testid^="dynamic-field-"]').evaluateAll(
    (nodes) => nodes.map((node) => ({ id: node.getAttribute('data-testid'), text: node.textContent?.slice(0, 90) })),
  )
  await info.attach('019-survey-fields', {
    body: Buffer.from(JSON.stringify(surveyFieldEvidence, null, 2)),
    contentType: 'application/json',
  })
  const partSelector = page.getByTestId('survey-repair-part-selector')
  if (await partSelector.isVisible()) {
    // Captured R1 'parts' provider puts 屋面 first. Native uni-button
    // renders an additional chevron, so exact innerText does not equal 屋面.
    await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click({ timeout: 8000 })
    await expect(page.getByTestId('survey-repair-part-children')).toBeVisible({ timeout: 8000 })
    await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click({ timeout: 8000 })
  }
  await expect(page.getByTestId('dynamic-field-squareMeter'), 'captured Survey field must be editable in the real main App').toBeVisible({ timeout: 8000 })
  await page.getByTestId('dynamic-field-squareMeter').locator('input').fill('14.5')
  await info.attach('019-survey', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })

  await page.getByTestId('mock-journey-advance').click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
  await expect(page.locator('.summary-number')).toContainText('MOCK-019')
  await expect(page.locator('.current-task-card')).toContainText('报价')
  await page.locator('.primary-task-action').click()
  await expect(page).toHaveURL(/mock-work-order-019-continuous-journey/)
  await expect(page.locator('.uni-page-head__title')).toContainText('报价工作台')
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  await expect(page.getByTestId('mock-journey-context-appointment')).toContainText('P1B预约备注：现场先确认屋面渗漏')
  await expect(page.getByTestId('mock-journey-context-survey')).toContainText('14.5')
  await expect(page.getByTestId('mock-journey-context-survey')).toContainText('防水施工面积')
  await expect(page.getByTestId('mock-journey-context')).toContainText('未提交后台')
  // P1C: explicit, synthetic-only first-level part suggestion. It never copies
  // Survey's numeric area, creates priced items or runs Order/Workflow writes.
  await expect(page.getByTestId('mock-survey-quote-suggestion')).toContainText('屋面 / 有保护平屋面')
  await page.getByTestId('mock-survey-quote-adopt').click()
  await expect(page.getByTestId('quotation-first-step-selected-path')).toContainText('屋面')
  await expect(page.getByTestId('mock-survey-quote-adopt')).toHaveCount(0)
  await expect(page.getByTestId('quotation-first-step-quantity').locator('input')).toHaveValue('')

  await expect(page.getByTestId('quotation-product-demo-read-only')).toContainText('演示，不提交订单')
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  await info.attach('019-quotation', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })

  // Reload must not reset the simulated stage to appointment or switch ids.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
  await expect(page).toHaveURL(/mock-work-order-019-continuous-journey/)
  await expect(page.getByTestId('mock-journey-context-appointment')).toContainText('P1B预约备注：现场先确认屋面渗漏')
  await expect(page.getByTestId('mock-journey-context-survey')).toContainText('14.5')
  await expect(page.getByTestId('quotation-product-demo-read-only')).toBeVisible()
  expect(evidence.externalIntents).toEqual([])
  expect(evidence.localFailures).toEqual([])
  expect(evidence.pageErrors).toBe(0)
  expect(evidence.consoleErrors).toBe(0)
})


for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test('real main App R1 SKU Mock is read-only and blocks incomplete/ambiguous/cross-SPU at ' + viewport.width, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('sku-mock-entry')).toBeVisible()
    await page.getByTestId('sku-mock-entry').click()
    await expect(page).toHaveURL(/material-sku-mock-review/)
    await expect(page.getByTestId('sku-mock-mode-package')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('sku-mock-source')).toHaveCount(0)
    await page.getByTestId('sku-mock-mode-direct').click()
    await expect(page.getByTestId('sku-mock-incomplete')).toBeVisible()
    await expect(page.getByTestId('sku-mock-read-accepted')).toBeVisible()
    await info.attach('sku-01-overview-' + viewport.width, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    await page.getByTestId('sku-mock-choice-thickness-2').click()
    await expect(page.getByTestId('sku-mock-incomplete')).toBeVisible()
    await page.getByTestId('sku-mock-choice-color-grey').click()
    await expect(page.getByTestId('sku-mock-matched')).toContainText('synthetic-sku-2-grey')
    await expect(page.getByTestId('sku-mock-existing-quantity')).toContainText('3')
    await page.getByTestId('sku-mock-mode-package').click()
    await expect(page.getByTestId('sku-mock-matched')).toHaveCount(0)
    await page.getByTestId('sku-mock-mode-direct').click()
    await expect(page.getByTestId('sku-mock-matched')).toContainText('synthetic-sku-2-grey')
    await info.attach('sku-02-matched-' + viewport.width, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    await page.getByTestId('sku-mock-choice-color-black').click()
    await expect(page.getByTestId('sku-mock-unavailable')).toBeVisible()
    await page.getByTestId('sku-mock-scenario-ambiguous').click()
    await page.getByTestId('sku-mock-choice-thickness-2').click()
    await page.getByTestId('sku-mock-choice-color-grey').click()
    await expect(page.getByTestId('sku-mock-ambiguous')).toBeVisible()
    await info.attach('sku-03-ambiguous-' + viewport.width, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    await page.getByTestId('sku-mock-scenario-foreign').click()
    await expect(page.getByTestId('sku-mock-read-blocked')).toContainText('foreign_sku')
    await expect(page.getByTestId('sku-mock-matched')).toHaveCount(0)
    await page.getByTestId('sku-mock-scenario-no_skus').click()
    await expect(page.getByTestId('sku-mock-no-skus')).toBeVisible()
    await page.getByTestId('sku-mock-scenario-malformed').click()
    await expect(page.getByTestId('sku-mock-source-blocked')).toBeVisible()
    await expect(page.getByTestId('sku-mock-footer')).toContainText('不支持提交')
    await info.attach('sku-04-blocked-' + viewport.width, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    expect(evidence.externalIntents).toEqual([])
    expect(evidence.localFailures).toEqual([])
    expect(evidence.pageErrors).toBe(0)
    expect(evidence.consoleErrors).toBe(0)
  })
}


// R1 package material SKU is NOT the standalone Material SKU read contract.
// Actual uni-app main App, isolated DEV Mock, two mobile viewports and no network.
for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test('R1 package material layer SKU choices stay isolated by group at ' + viewport.width, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await page.getByTestId('sku-mock-entry').click()
    await expect(page.getByTestId('sku-mock-mode-package')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('sku-mock-source')).toHaveCount(0)
    await expect(page.getByTestId('package-mock-failure-options')).toHaveCount(0)
    await expect(page.getByTestId('package-sku-mock-workbench')).toBeVisible()
    await expect(page.getByTestId('package-mock-read-accepted')).toBeVisible()
    await expect(page.getByTestId('package-mock-layer-1')).toBeVisible()
    await expect(page.getByTestId('package-mock-layer-2')).toBeVisible()
    await expect(page.getByTestId('package-mock-incomplete')).toBeVisible()
    await info.attach('package-01-layers-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })

    await page.getByTestId('package-mock-material-synthetic-link-l1-roof').click()
    await page.getByTestId('package-mock-choice-1-thickness-2').click()
    await page.getByTestId('package-mock-choice-1-color-grey').click()
    await expect(page.getByTestId('package-mock-incomplete')).toBeVisible()
    await page.getByTestId('package-mock-material-synthetic-link-l2-coating').click()
    await page.getByTestId('package-mock-choice-2-thickness-3').click()
    await page.getByTestId('package-mock-choice-2-color-black').click()
    await expect(page.getByTestId('package-mock-ready')).toBeVisible()
    await expect(page.getByTestId('package-mock-selected-1')).toContainText('synthetic-sku-2-grey')
    await expect(page.getByTestId('package-mock-selected-1')).toContainText('历史数量 3')
    await expect(page.getByTestId('package-mock-selected-2')).toContainText('synthetic-sku-coat-3-black')
    await info.attach('package-02-all-ready-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })

    await page.getByTestId('package-mock-group-B').click()
    await expect(page.getByTestId('package-mock-incomplete')).toBeVisible()
    await page.getByTestId('package-mock-material-synthetic-link-l1-alternative').click()
    await page.getByTestId('package-mock-choice-1-thickness-2').click()
    await page.getByTestId('package-mock-choice-1-color-grey').click()
    await page.getByTestId('package-mock-material-synthetic-link-l2-coating').click()
    await page.getByTestId('package-mock-choice-2-thickness-3').click()
    await page.getByTestId('package-mock-choice-2-color-black').click()
    await expect(page.getByTestId('package-mock-ready')).toBeVisible()
    await expect(page.getByTestId('package-mock-selected-1')).toContainText('synthetic-sku-alt-2-grey')
    await info.attach('package-03-group-B-alternative-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })
    await page.getByTestId('package-mock-group-A').click()
    await expect(page.getByTestId('package-mock-selected-1')).toContainText('synthetic-sku-2-grey')
    await page.getByTestId('package-mock-group-B').click()
    await expect(page.getByTestId('package-mock-selected-1')).toContainText('synthetic-sku-alt-2-grey')

    await page.getByTestId('package-mock-toggle-errors').click()
    await expect(page.getByTestId('package-mock-failure-options')).toBeVisible()
    await page.getByTestId('package-mock-scenario-ambiguous').click()
    await expect(page.getByTestId('package-mock-incomplete')).toBeVisible()
    await page.getByTestId('package-mock-material-synthetic-link-l1-roof').click()
    await page.getByTestId('package-mock-choice-1-thickness-2').click()
    await page.getByTestId('package-mock-choice-1-color-grey').click()
    await page.getByTestId('package-mock-material-synthetic-link-l2-coating').click()
    await page.getByTestId('package-mock-choice-2-thickness-3').click()
    await page.getByTestId('package-mock-choice-2-color-black').click()
    await expect(page.getByTestId('package-mock-ambiguous')).toBeVisible()
    await expect(page.getByTestId('package-mock-ready')).toHaveCount(0)
    await info.attach('package-04-ambiguous-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })
    await page.getByTestId('package-mock-scenario-orphan').click()
    await expect(page.getByTestId('package-mock-read-blocked')).toContainText('foreign_sku')
    await expect(page.getByTestId('package-mock-ready')).toHaveCount(0)
    await page.getByTestId('package-mock-scenario-duplicate').click()
    await expect(page.getByTestId('package-mock-read-blocked')).toContainText('duplicate_sku')
    await page.getByTestId('package-mock-scenario-pricing_other').click()
    await expect(page.getByTestId('package-mock-not-applicable')).toBeVisible()
    await expect(page.getByTestId('sku-mock-footer')).toContainText('不支持提交')
    expect(evidence.externalIntents).toEqual([])
    expect(evidence.localFailures).toEqual([])
    expect(evidence.pageErrors).toBe(0)
    expect(evidence.consoleErrors).toBe(0)
  })
}
