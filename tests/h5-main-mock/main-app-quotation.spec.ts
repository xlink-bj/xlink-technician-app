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



for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test('S1 ordinary Material joins real App quote without SKU at ' + viewport.width, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' }).click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await page.getByTestId('quotation-add-group').click()
    await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
    await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
    await page.getByTestId('quotation-first-step-description').locator('textarea').fill('普通材料独立选品验证')
    await page.getByTestId('quotation-first-step-quantity').locator('input').fill('1')
    await page.getByTestId('quotation-first-step-select-products').click()
    await page.getByTestId('quotation-catalog-kind-material').click()
    const id = 'mock-catalog-material-ordinary-1'
    await expect(page.getByTestId('quotation-catalog-item-material-' + id)).toBeVisible()
    await expect(page.getByTestId('quotation-material-options-' + id)).toHaveCount(0)
    const add = page.getByTestId('quotation-catalog-add-material-' + id)
    await expect(add).toBeEnabled()
    await add.click()
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-material'))
      .toContainText('普通防水辅材（结构示例）')
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    expect(evidence.externalIntents).toEqual([])
    expect(evidence.pageErrors).toBe(0)
    expect(evidence.consoleErrors).toBe(0)
    expect(evidence.localFailures).toEqual([])
    await info.attach('s1-ordinary-material-no-sku-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })
  })
}

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test('M1 integrated signing Mock: two official Orders, per-Order contract and safe states at ' + viewport.width, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('signing-mock-entry')).toBeVisible()
    await page.getByTestId('signing-mock-entry').click()
    await expect(page).toHaveURL(/pages\/work-orders\/signing-mock-review/)
    await expect(page.getByTestId('signing-mock-workbench')).toContainText('独立正式订单样本')
    await expect(page.getByTestId('signing-mock-orders')).toContainText('模拟正式订单 A')
    await expect(page.getByTestId('signing-mock-orders')).toContainText('模拟正式订单 B')
    await expect(page.getByTestId('signing-mock-no-contract')).toBeVisible()
    await page.getByTestId('signing-mock-order-mock-official-order-019-b').click()
    await expect(page.getByTestId('signing-mock-state')).toContainText('签署中')
    await page.getByTestId('signing-mock-scenario-signed').click()
    await expect(page.getByTestId('signing-mock-state')).toContainText('已签署')
    await page.getByTestId('signing-mock-scenario-failed').click()
    await expect(page.getByTestId('signing-mock-state')).toContainText('失败')
    await page.getByTestId('signing-mock-scenario-expired').click()
    await expect(page.getByTestId('signing-mock-state')).toContainText('过期')
    await page.getByTestId('signing-mock-scenario-no_orders').click()
    await expect(page.getByTestId('signing-mock-empty')).toBeVisible()
    await page.getByTestId('signing-mock-scenario-read_error').click()
    await expect(page.getByTestId('signing-mock-error')).toBeVisible()
    await page.getByTestId('signing-mock-scenario-normal').click()
    await page.getByTestId('signing-mock-order-mock-official-order-019-b').click()
    for (const id of ['signing-mock-preview-disabled', 'signing-mock-apply-disabled']) {
      await expect(page.getByTestId(id)).toHaveAttribute('disabled', 'true')
      await expect(page.getByTestId(id)).toHaveClass(/app-button--disabled/)
    }
    await expect(page.getByTestId('signing-mock-footer')).toContainText('无业务写入')
    await info.attach('m1-integrated-signing-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })
    expect(evidence.externalIntents).toEqual([])
    expect(evidence.localFailures).toEqual([])
    expect(evidence.pageErrors).toBe(0)
    expect(evidence.consoleErrors).toBe(0)
  })
}

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
    // The current-role Production structural sample has ordinary materials
    // but no active SKU. The actual App Mock path must not depend on SKU.
    await expect(page.getByTestId('quotation-catalog-item-material-mock-catalog-material-ordinary-1')).toBeVisible()
    await expect(page.getByTestId('quotation-material-options-mock-catalog-material-ordinary-1')).toHaveCount(0)
    await expect(page.getByTestId('quotation-catalog-add-material-mock-catalog-material-ordinary-1')).toBeEnabled()
    // Ordinary product can be selected without SKU; the legacy all-SKU
    // golden path remains focused on the separate synthetic option-bearing SPU.
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

    // P1: review actual grouped quotation in the same Action, not the
    // standalone SKU demo. The result is LOCAL, never official Order approval.
    await expect(page.getByTestId('quotation-p1-local-review')).toBeVisible()
    await expect(page.getByTestId('quotation-p1-review-details')).toHaveCount(0)
    await page.getByTestId('quotation-p1-review-toggle').click()
    await expect(page.getByTestId('quotation-p1-review-group-quotation-group-1'))
      .toContainText('1 项')
    await expect(page.getByTestId('quotation-p1-review-group-quotation-group-1'))
      .toContainText('本机结构已填写')
    await expect(page.getByTestId('quotation-p1-review-group-quotation-group-2'))
      .toContainText('3 项')
    await expect(page.getByTestId('quotation-p1-review-unverified'))
      .toContainText('SKU/规格来源')
    await expect(page.getByTestId('quotation-p1-sku-identity-audit')).toBeVisible()
    await expect(page.getByTestId('quotation-p1-sku-identity-count'))
      .toContainText('4 条来源关系 · 4 条身份未对应')
    await expect(page.getByTestId('quotation-p1-same-catalog-count'))
      .toContainText('同目录 ID 仿真：4/4 条关联可对应 · 仅合成 SKU')
    await expect(page.getByTestId('quotation-p1-sku-sale-options-ready'))
      .toContainText('2 个 SPU · 4 项属性 · 4 个选项 · 仅合成字典')
    await expect(page.getByTestId('quotation-p1-sku-server-auth-blocked'))
      .toContainText('租户/工单级 SKU 授权尚未验证')
    await expect(page.getByTestId('quotation-p1-sku-sale-options-blocked')).toHaveCount(0)
    await expect(page.getByTestId('quotation-p1-sku-identity-warning'))
      .toContainText('不按名称或层级自动关联')

    await expect(page.getByTestId('quotation-p1-review-order-blocked'))
      .toContainText('正式报价提交：未开放')
    await page.getByTestId('quotation-p1-review-group-quotation-group-2').scrollIntoViewIfNeeded()
    await info.attach(`p1-quotation-local-review-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    // Editing only group 2 must produce an actionable local issue without
    // changing group 1, then clear as soon as the required field is restored.
    if (!await page.getByTestId('quotation-group-context-quotation-group-2').isVisible()) {
      await page.getByTestId('quotation-group-context-toggle-quotation-group-2').click()
    }
    await page.getByTestId('quotation-group-description-quotation-group-2').locator('textarea').fill('')
    await expect(page.getByTestId('quotation-p1-review-group-quotation-group-2'))
      .toContainText('请填写维修部位描述')
    await expect(page.getByTestId('quotation-p1-review-group-quotation-group-1'))
      .toContainText('本机结构已填写')
    await page.getByTestId('quotation-group-description-quotation-group-2').locator('textarea').fill('第二组：独立增项')
    await expect(page.getByTestId('quotation-p1-review-group-quotation-group-2'))
      .toContainText('本机结构已填写')
    await page.getByTestId('quotation-p1-review-toggle').click()
    await expect(page.getByTestId('quotation-p1-review-details')).toHaveCount(0)

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
    await expect(page.getByTestId('quotation-p1-local-review')).toBeVisible()
    await page.getByTestId('quotation-p1-review-toggle').click()
    await expect(page.getByTestId('quotation-p1-review-group-quotation-group-1'))
      .toContainText('本机结构已填写')
    await expect(page.getByTestId('quotation-p1-review-group-quotation-group-2'))
      .toContainText('3 项')
    await expect(page.getByTestId('quotation-p1-sku-identity-count'))
      .toContainText('4 条来源关系 · 4 条身份未对应')
    await expect(page.getByTestId('quotation-p1-same-catalog-count'))
      .toContainText('同目录 ID 仿真：4/4 条关联可对应 · 仅合成 SKU')
    await expect(page.getByTestId('quotation-p1-sku-sale-options-ready'))
      .toContainText('2 个 SPU · 4 项属性 · 4 个选项 · 仅合成字典')
    await expect(page.getByTestId('quotation-p1-sku-server-auth-blocked'))
      .toContainText('租户/工单级 SKU 授权尚未验证')
    await expect(page.getByTestId('quotation-p1-sku-sale-options-blocked')).toHaveCount(0)
    await expect(page.getByTestId('quotation-p1-review-order-blocked')).toBeVisible()
    await page.getByTestId('quotation-p1-review-order-blocked').scrollIntoViewIfNeeded()
    await info.attach(`p1-quotation-review-restored-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
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
    if (scenario.title === '现场勘查') {
      // An independent Survey has no continuous-journey context. It must not
      // duplicate the generic form or fall through to the Appointment UI.
      await expect(page.getByTestId('dynamic-form-action-content')).toHaveCount(1)
      await expect(page.locator('.dynamic-action-title')).toContainText('勘查记录')
      await expect(page.locator('.action-content-heading')).toHaveCount(0)
    } else {
      await expect(page.locator('.action-content-heading')).toHaveCount(1)
      await expect(page.getByTestId('dynamic-form-action-content')).toHaveCount(0)
    }
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
  const partSelector = page.getByTestId('survey-part-picker-trigger')
  if (await partSelector.isVisible()) {
    // S02: use the approved bottom-sheet picker, but preserve the R1
    // provider value path and dependent Survey field assertion.
    await partSelector.click({ timeout: 8000 })
    await expect(page.getByTestId('survey-part-picker-panel')).toBeVisible()
    await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click({ timeout: 8000 })
    await expect(page.getByTestId('survey-repair-part-children')).toBeVisible({ timeout: 8000 })
    await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click({ timeout: 8000 })
    await page.getByTestId('survey-part-picker-confirm').click()
    await expect(page.getByTestId('survey-part-picker-panel')).toHaveCount(0)
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
  // The local quotation draft is not an Order.type=1. The next stage is
  // explicitly isolated synthetic signing review, never a workflow mutation.
  const signingLink = page.getByTestId('mock-journey-signing-review')
  await expect(signingLink).toContainText('本机报价未提交')
  await signingLink.click()
  await expect(page).toHaveURL(/pages\/work-orders\/signing-mock-review/)
  await expect(page.getByTestId('signing-mock-orders')).toContainText('模拟正式订单 A')
  await expect(page.getByTestId('signing-mock-no-contract')).toBeVisible()
  await expect(page.getByTestId('signing-mock-footer')).toContainText('无业务写入')
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
    await page.getByTestId('sku-mock-matched').scrollIntoViewIfNeeded()
    await info.attach('sku-02-matched-' + viewport.width, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    await page.getByTestId('sku-mock-choice-color-black').click()
    await expect(page.getByTestId('sku-mock-unavailable')).toBeVisible()
    await page.getByTestId('sku-mock-scenario-ambiguous').click()
    await page.getByTestId('sku-mock-choice-thickness-2').click()
    await page.getByTestId('sku-mock-choice-color-grey').click()
    await expect(page.getByTestId('sku-mock-ambiguous')).toBeVisible()
    await page.getByTestId('sku-mock-ambiguous').scrollIntoViewIfNeeded()
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
    await page.getByTestId('package-mock-ready').scrollIntoViewIfNeeded()
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
    await page.getByTestId('package-mock-selected-1').scrollIntoViewIfNeeded()
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
    await page.getByTestId('package-mock-ambiguous').scrollIntoViewIfNeeded()
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


// M1-I2 actual main App SKU workflow: synthetic R1-shaped ExtField/Code/SKU
// reads go through the ordinary adapter, never through the standalone SKU demo.
for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test('M1-I2 full SKU local draft on REAL quotation Vue at ' + viewport.width, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto('/#/pages/index/index', { waitUntil: 'domcontentloaded' })
    await page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' }).click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()

    await page.getByTestId('quotation-add-group').click()
    await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
    await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
    await page.getByTestId('quotation-first-step-description').locator('textarea').fill('第1组：规格选择回归')
    await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
    await page.getByTestId('quotation-first-step-select-products').click()
    await page.getByTestId('quotation-catalog-kind-material').click()
    const materialId = 'mock-catalog-material-sealant'
    const addMaterial = page.getByTestId('quotation-catalog-add-material-' + materialId)
    await expect(addMaterial).toBeVisible()
    await addMaterial.click()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)

    const group1 = page.getByTestId('quotation-repair-group-quotation-group-1')
    const skuQty = page.locator('input[data-testid="quotation-sku-quantity-input"], [data-testid="quotation-sku-quantity-input"] input').first()
    const summary1 = group1.locator('[data-testid^="quotation-material-skus-"]')
    async function openSpecs() {
      await page.getByTestId('quotation-browse-quotation-group-1').click()
      await page.getByTestId('quotation-catalog-kind-material').click()
      await page.getByTestId('quotation-material-options-' + materialId).click()
      await expect(page.getByTestId('quotation-sku-field-thickness')).toBeVisible()
      await expect(page.getByTestId('quotation-sku-field-color')).toBeVisible()
    }
    async function chooseAndSave(thickness: string, color: string, quantity: string) {
      await page.getByTestId('quotation-sku-option-thickness-' + thickness).click()
      await page.getByTestId('quotation-sku-option-color-' + color).click()
      await expect(page.getByTestId('quotation-sku-match-exact')).toBeVisible()
      await skuQty.fill(quantity)
      await page.getByTestId('quotation-sku-save-local').click()
      await expect(page.getByTestId('quotation-sku-preview-back')).toHaveCount(0)
      await page.getByTestId('quotation-catalog-close').click()
      await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
    }

    await openSpecs()
    // Code dictionary alone is never enough: a non-existent combination is blocked.
    await page.getByTestId('quotation-sku-option-thickness-2').click()
    await page.getByTestId('quotation-sku-option-color-grey').click()
    await expect(page.getByTestId('quotation-sku-match-unavailable')).toBeVisible()
    await expect(page.getByTestId('quotation-sku-save-local')).toHaveCount(0)
    await page.getByTestId('quotation-sku-option-color-black').click()
    await expect(page.getByTestId('quotation-sku-match-exact')).toBeVisible()
    await skuQty.fill('3')
    await page.getByTestId('quotation-sku-save-local').click()
    await expect(page.getByTestId('quotation-sku-preview-back')).toHaveCount(0)
    await page.getByTestId('quotation-catalog-close').click()
    await expect(summary1).toContainText('3 件')
    await info.attach('i2-sku-1-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })

    await openSpecs()
    await chooseAndSave('3', 'grey', '2')
    await expect(summary1).toContainText('3 件')
    await expect(summary1).toContainText('2 件')
    // Both SKU rows are visible; total is stored on the parent material but
    // the current product UI intentionally does not render a separate sum.
    await expect(summary1.locator('.quotation-content__package-summary-row')).toHaveCount(2)
    await info.attach('i2-sku-multiple-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })

    // The same SPU in a second repair group owns a distinct SKU count.
    await page.getByTestId('quotation-add-group').click()
    const group2 = page.getByTestId('quotation-repair-group-quotation-group-2')
    await group2.getByTestId('quotation-repair-part-selector-quotation-group-2')
      .getByText('屋面', { exact: true }).click()
    await page.getByTestId('quotation-group-description-quotation-group-2').locator('textarea').fill('第2组：独立 SKU')
    await page.getByTestId('quotation-group-quantity-quotation-group-2').locator('input').fill('5')
    await page.getByTestId('quotation-browse-quotation-group-2').click()
    await page.getByTestId('quotation-catalog-kind-material').click()
    await page.getByTestId('quotation-catalog-add-material-' + materialId).click()
    await page.getByTestId('quotation-browse-quotation-group-2').click()
    await page.getByTestId('quotation-catalog-kind-material').click()
    await page.getByTestId('quotation-material-options-' + materialId).click()
    await page.getByTestId('quotation-sku-option-thickness-2').click()
    await page.getByTestId('quotation-sku-option-color-black').click()
    await skuQty.fill('6')
    await page.getByTestId('quotation-sku-save-local').click()
    await page.getByTestId('quotation-catalog-close').click()
    const summary2 = group2.locator('[data-testid^="quotation-material-skus-"]')
    await expect(summary2).toContainText('6 件')
    await expect(summary1).toContainText('3 件')
    await expect(summary1).toContainText('2 件')
    await info.attach('i2-sku-two-groups-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })

    // Re-entry opens the actual Material SKU editor with selected identity,
    // not a duplicate synthetic demo or a fabricated commercial Order.
    await page.getByTestId('quotation-material-sku-edit-quotation-group-1-' + materialId).click()
    await page.getByTestId('quotation-sku-option-thickness-2').click()
    await page.getByTestId('quotation-sku-option-color-black').click()
    await expect(skuQty).toHaveValue('3')
    await skuQty.fill('4')
    await page.getByTestId('quotation-sku-save-local').click()
    await page.getByTestId('quotation-catalog-close').click()
    await expect(summary1).toContainText('4 件')
    await expect(summary1).toContainText('2 件')

    // Remove one SKU and persist; other SKU remains after full page reload.
    await page.getByTestId('quotation-material-sku-remove-quotation-group-1-mock-material-sku-black-2').click()
    await expect(summary1).not.toContainText('4 件')
    await expect(summary1).toContainText('2 件')
    await expect(summary2).toContainText('6 件')
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await expect(page.getByText(/报价草稿已保存在本机|报价分组草稿已保存在本机/)).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    const restored = page.getByTestId('quotation-repair-group-quotation-group-1')
    await expect(restored.locator('[data-testid^="quotation-material-skus-"]')).toContainText('2 件')
    await expect(page.getByTestId('quotation-material-sku-remove-quotation-group-1-mock-material-sku-black-2')).toHaveCount(0)
    const restoredGroup2 = page.getByTestId('quotation-repair-group-quotation-group-2')
    await expect(restoredGroup2.locator('[data-testid^="quotation-material-skus-"]')).toContainText('6 件')
    await info.attach('i2-sku-reentered-' + viewport.width, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })

    // Last SKU removal removes its Material SPU rather than leaving a
    // zero-quantity material or allowing an Order write.
    await page.getByTestId('quotation-material-sku-remove-quotation-group-1-mock-material-sku-grey-3').click()
    await expect(restored.locator('[data-testid^="quotation-material-skus-"]')).toHaveCount(0)
    await expect(restored.getByText('弹性密封材料（示例）')).toHaveCount(0)
    await expect(restoredGroup2.locator('[data-testid^="quotation-material-skus-"]')).toContainText('6 件')
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    expect(evidence.externalIntents, 'DEV synthetic SKU must NEVER attempt an external read').toEqual([])
    expect(evidence.localFailures).toEqual([])
    expect(evidence.pageErrors).toBe(0)
    expect(evidence.consoleErrors).toBe(0)
  })
}
